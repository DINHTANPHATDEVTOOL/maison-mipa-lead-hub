import '../lib/env';
import { store } from '../lib/store';
import { groupCrawler } from './crawler';
import { commentDispatcher } from './dispatcher';
import { classifyPostContent } from '../lib/classifier';
import { groupRepo } from '../lib/repositories/group.repository';
import { serviceRepo } from '../lib/repositories/service.repository';
import { templateRepo } from '../lib/repositories/template.repository';
import { postRepo } from '../lib/repositories/post.repository';
import { heartbeatRepo } from '../lib/repositories/heartbeat.repository';
import { jobRepo } from '../lib/repositories/job.repository';
import { outreachRepo } from '../lib/repositories/outreach.repository';
import { outreachDispatchService } from '../lib/services/outreach-dispatch.service';
import { getDbPool } from '../lib/db';

const WORKER_ID = process.env.WORKER_ID || 'worker-ubuntu-central-01';
let isRunning = false;
let isShuttingDown = false;
let activeJobId: string | null = null;

/**
 * Enqueue scheduled crawl jobs into PostgreSQL scheduled_jobs table for groups that are due
 */
async function scheduleDueGroupCrawlJobs() {
  try {
    const groups = await groupRepo.getAll();
    const activeGroups = groups.filter(g => g.status === 'active');
    const now = Date.now();

    for (const group of activeGroups) {
      const nextCheck = group.next_check_at ? new Date(group.next_check_at).getTime() : 0;
      if (now >= nextCheck) {
        // Enqueue or update job in scheduled_jobs
        await jobRepo.createJob({
          id: `crawl_${group.id}`,
          job_type: 'crawl_group',
          target_id: group.id,
          payload: {
            group_id: group.id,
            group_url: group.url,
            lookback_hours: group.lookback_hours,
          },
          run_at: new Date(nextCheck || now),
        });
      }
    }
  } catch (err: any) {
    // If DB is offline in non-production dev, fallback to store
    if (process.env.NODE_ENV !== 'production') {
      const groups = store.getGroups().filter(g => g.status === 'active');
      for (const g of groups) {
        const nextCheck = g.next_check_at ? new Date(g.next_check_at).getTime() : 0;
        if (Date.now() >= nextCheck) {
          // handled sequentially
        }
      }
    }
  }
}

/**
 * Execute a single crawl job for a specific Facebook group
 */
async function executeCrawlJob(groupId: string): Promise<number> {
  let group = await groupRepo.getById(groupId).catch(() => null);
  if (!group) {
    group = store.getGroups().find(g => g.id === groupId) || null;
  }
  if (!group || group.status !== 'active') return 0;

  console.log(`[Worker] Bắt đầu quét nhóm "${group.name}" (ID: ${group.id})...`);
  const crawlResult = await groupCrawler.crawlGroup(group.url, group.lookback_hours);

  // Update next check time (default 150s)
  const nextCheckTime = new Date(Date.now() + (group.check_interval_seconds || 150) * 1000).toISOString();
  await groupRepo.updateCheckTimestamps(group.id, new Date().toISOString(), nextCheckTime, crawlResult.posts.length);

  if (!crawlResult.success) {
    if (crawlResult.needsAuth) {
      await groupRepo.updateStatus(group.id, 'needs_auth', crawlResult.error || 'Yêu cầu đăng nhập Facebook lại');
      throw new Error(`needs_auth: ${crawlResult.error || 'Yêu cầu đăng nhập Facebook lại'}`);
    } else if (crawlResult.error?.includes('không tồn tại') || crawlResult.error?.includes('cấm truy cập') || crawlResult.error?.includes('permission')) {
      await groupRepo.updateStatus(group.id, 'error', crawlResult.error || 'Lỗi nhóm không thể truy cập');
      throw new Error(`permanent_error: ${crawlResult.error || 'Lỗi nhóm không thể truy cập'}`);
    } else {
      // Transient network or navigation error: keep group active so next cycle continues!
      console.warn(`[Worker] Lỗi mạng tạm thời khi quét nhóm ${group.id}: ${crawlResult.error}. Giữ nhóm active để quét tiếp.`);
      throw new Error(`transient_crawl_error: ${crawlResult.error || 'Lỗi mạng tạm thời khi quét'}`);
    }
  }

  let newPostsCount = 0;
  const services = await serviceRepo.getAll().catch(() => []);
  const templates = await templateRepo.getAll().catch(() => []);

  for (const rawPost of crawlResult.posts) {
    const { post, isNew } = await postRepo.createIfNew({
      group_id: group.id,
      group_name: group.name,
      facebook_post_id: rawPost.facebook_post_id,
      post_url: rawPost.post_url,
      author_name: rawPost.author_name,
      content_raw: rawPost.content_raw,
      posted_at: rawPost.posted_at,
    });

    if (isNew) {
      newPostsCount++;
      const classification = classifyPostContent(post.content_raw, services, templates, post.posted_at);

      console.log(`[Worker] Bài mới từ ${post.author_name}: Ý định = ${classification.intent} (${classification.confidence_score}%)`);

      // Check current operating mode and threshold from DB/Store immediately before deciding to auto-dispatch
      const currentHeartbeat = await heartbeatRepo.getHeartbeat(WORKER_ID).catch(() => null);
      const storeHeartbeat = store.getHeartbeat();
      const isAutoDispatch = (currentHeartbeat?.operating_mode || storeHeartbeat?.operating_mode) === 'auto_dispatch';
      const minConfidence = currentHeartbeat?.min_confidence_score ?? storeHeartbeat?.min_confidence_score ?? 80;

      if (
        isAutoDispatch &&
        classification.intent === 'looking_for_service' &&
        classification.suggested_comment_text
      ) {
        if (classification.confidence_score >= minConfidence) {
          console.log(`[Worker Auto-Dispatch] Đạt ngưỡng tin cậy (${classification.confidence_score}% >= ${minConfidence}%). Tiến hành đăng bình luận: ${post.post_url}`);
          await outreachDispatchService.dispatchOutreach({
            postId: post.id,
            commentContent: classification.suggested_comment_text,
            operatorName: 'Worker Tự Động',
            pageIdentity: process.env.FACEBOOK_PAGE_NAME || 'Maison MIPA',
            targetPageId: process.env.FACEBOOK_PAGE_ID,
            templateId: classification.suggested_template_id || undefined,
          });
        } else {
          console.log(`[Worker Auto-Dispatch] Bỏ qua đăng tự động do độ phù hợp ${classification.confidence_score}% < ${minConfidence}%. Chuyển sang hàng chờ duyệt thủ công: ${post.post_url}`);
        }
      }
    }
  }

  return newPostsCount;
}

/**
 * Main worker iteration with non-overlapping execution
 */
async function processWorkerTick() {
  if (isShuttingDown || isRunning) return;
  isRunning = true;

  try {
    // 0. Periodic recovery of stuck jobs (lease timeout after worker crash)
    await jobRepo.recoverStuckJobs(5).catch(() => 0);

    // 1. Enqueue due crawl jobs into DB queue
    await scheduleDueGroupCrawlJobs();

    // 2. Claim next available scheduled job using FOR UPDATE SKIP LOCKED
    let job: any = null;
    try {
      job = await jobRepo.claimNextJob(WORKER_ID, ['crawl_group', 'dispatch_outreach']);
    } catch {}

    if (job) {
      activeJobId = job.id;
      console.log(`[Worker] Nhận job: ${job.id} (loại: ${job.job_type}, mục tiêu: ${job.target_id})`);

      try {
        if (job.job_type === 'crawl_group' && job.target_id) {
          const newCount = await executeCrawlJob(job.target_id);
          await jobRepo.completeJob(job.id, { postsFound: newCount }, { claimToken: job.claim_token || undefined, workerId: WORKER_ID });
          console.log(`[Worker] Hoàn thành job ${job.id}: thu thập ${newCount} bài mới.`);
        } else if (job.job_type === 'dispatch_outreach' && job.payload) {
          const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
          const dispatchRes = await outreachDispatchService.dispatchOutreach({
            postId: payload.postId || job.target_id,
            commentContent: payload.commentContent,
            operatorName: payload.operatorName || 'Worker Dispatcher',
            pageIdentity: payload.pageIdentity || process.env.FACEBOOK_PAGE_NAME || 'Maison MIPA',
            targetPageId: payload.targetPageId || process.env.FACEBOOK_PAGE_ID,
            templateId: payload.templateId,
          });
          if (dispatchRes.success) {
            await jobRepo.completeJob(job.id, dispatchRes, { claimToken: job.claim_token || undefined, workerId: WORKER_ID });
            console.log(`[Worker] Hoàn thành job dispatch ${job.id}`);
          } else {
            throw new Error(dispatchRes.error || 'Thất bại khi dispatch');
          }
        } else {
          await jobRepo.completeJob(job.id, undefined, { claimToken: job.claim_token || undefined, workerId: WORKER_ID });
        }
      } catch (jobErr: any) {
        console.error(`[Worker] Lỗi xử lý job ${job.id}:`, jobErr.message);
        const isTransient = jobErr.message.includes('transient_crawl_error') || !jobErr.message.includes('permanent_error');
        const retryDelay = isTransient ? 30 : 300;
        await jobRepo.failJob(job.id, jobErr.message, {
          claimToken: job.claim_token || undefined,
          workerId: WORKER_ID,
          retryDelaySeconds: retryDelay,
        });
      } finally {
        activeJobId = null;
      }
    } else {
      // 2b. Standalone / File Store Automatic Scheduler:
      // Scan any active group whose next_check_at has arrived or passed
      const allGroups = (await groupRepo.getAll().catch(() => store.getGroups())).filter(g => g.status === 'active');
      const now = Date.now();
      const dueGroups = allGroups.filter(g => {
        const nextCheck = g.next_check_at ? new Date(g.next_check_at).getTime() : 0;
        return now >= nextCheck;
      });

      dueGroups.sort((a, b) => {
        const timeA = a.next_check_at ? new Date(a.next_check_at).getTime() : 0;
        const timeB = b.next_check_at ? new Date(b.next_check_at).getTime() : 0;
        return timeA - timeB;
      });

      const dueGroup = dueGroups[0];

      if (dueGroup) {
        console.log(`[Worker] Tự động quét nhóm theo chu kỳ: "${dueGroup.name}" (${dueGroup.id}). Hạn quét: ${dueGroup.next_check_at || 'Ngay bây giờ'}`);
        // Advance next_check_at immediately to prevent retry storms
        const nextCheckTime = new Date(Date.now() + (dueGroup.check_interval_seconds || 150) * 1000).toISOString();
        await groupRepo.updateCheckTimestamps(dueGroup.id, new Date().toISOString(), nextCheckTime).catch(() => {});
        try {
          const newCount = await executeCrawlJob(dueGroup.id);
          console.log(`[Worker] Quét hoàn tất nhóm "${dueGroup.name}": phát hiện ${newCount} bài viết.`);
        } catch (crawlErr: any) {
          console.error(`[Worker] Lỗi khi quét tự động nhóm ${dueGroup.id}:`, crawlErr.message);
        }
      }
    }

    // 3. Heartbeat ping
    await heartbeatRepo.recordPing(WORKER_ID, 1).catch(() => {});
    if (process.env.NODE_ENV !== 'production') {
      store.recordWorkerPing(WORKER_ID, 1);
    }
  } catch (err: any) {
    console.error('[Worker Tick Error]', err);
  } finally {
    isRunning = false;
  }
}

/**
 * Safe graceful shutdown handler
 */
async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[Worker] Nhận tín hiệu ${signal}. Đang dừng an toàn...`);

  if (activeJobId) {
    try {
      console.log(`[Worker] Đang giải phóng job ${activeJobId}...`);
      await jobRepo.releaseJob(activeJobId);
    } catch {}
  }

  try {
    const pool = getDbPool();
    await pool.end().catch(() => {});
  } catch {}

  console.log('[Worker] Đã hoàn tất đóng tài nguyên. Tạm biệt!');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

/**
 * Worker start entry point
 */
export async function startWorker() {
  console.log('================================================================');
  console.log(`MAISON MIPA LEAD HUB - BỘ CHẠY NỀN TRUNG TÂM (${WORKER_ID})`);
  console.log('================================================================');

  // Sequential async loop: NEVER overlaps!
  while (!isShuttingDown) {
    try {
      await processWorkerTick();
    } catch (e) {
      console.error('[Worker Main Loop Error]', e);
    }
    // Sleep 5 seconds before checking next job
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

if (require.main === module) {
  startWorker().catch(err => {
    console.error('[Worker Fatal]', err);
    process.exit(1);
  });
}
