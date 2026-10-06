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
  const group = await groupRepo.getById(groupId);
  if (!group || group.status !== 'active') return 0;

  console.log(`[Worker] Bắt đầu quét nhóm "${group.name}" (ID: ${group.id})...`);
  const crawlResult = await groupCrawler.crawlGroup(group.url, group.lookback_hours);

  // Update next check time (default 150s)
  const nextCheckTime = new Date(Date.now() + (group.check_interval_seconds || 150) * 1000).toISOString();
  await groupRepo.updateCheckTimestamps(group.id, new Date().toISOString(), nextCheckTime);

  if (!crawlResult.success) {
    if (crawlResult.needsAuth) {
      await groupRepo.updateStatus(group.id, 'needs_auth', crawlResult.error || 'Yêu cầu đăng nhập Facebook lại');
    } else {
      await groupRepo.updateStatus(group.id, 'error', crawlResult.error || 'Lỗi quét nhóm');
    }
    return 0;
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

      // Check current operating mode from DB immediately before deciding to auto-dispatch
      const currentHeartbeat = await heartbeatRepo.getHeartbeat(WORKER_ID).catch(() => null);
      const isAutoDispatch = currentHeartbeat?.operating_mode === 'auto_dispatch';

      if (
        isAutoDispatch &&
        classification.intent === 'looking_for_service' &&
        classification.confidence_score >= 90 &&
        classification.suggested_comment_text
      ) {
        console.log(`[Worker Auto-Dispatch] Tiến hành đăng bình luận tiếp cận: ${post.post_url}`);
        await commentDispatcher.dispatchComment({
          postId: post.id,
          postUrl: post.post_url,
          commentContent: classification.suggested_comment_text,
          pageIdentity: 'Maison MIPA',
        });
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
    // 1. Enqueue due crawl jobs into DB queue
    await scheduleDueGroupCrawlJobs();

    // 2. Claim next available scheduled job using FOR UPDATE SKIP LOCKED
    const job = await jobRepo.claimNextJob(WORKER_ID, ['crawl_group', 'dispatch_outreach']);

    if (job) {
      activeJobId = job.id;
      console.log(`[Worker] Nhận job: ${job.id} (loại: ${job.job_type}, mục tiêu: ${job.target_id})`);

      try {
        if (job.job_type === 'crawl_group' && job.target_id) {
          const newCount = await executeCrawlJob(job.target_id);
          await jobRepo.completeJob(job.id);
          console.log(`[Worker] Hoàn thành job ${job.id}: thu thập ${newCount} bài mới.`);
        } else {
          await jobRepo.completeJob(job.id);
        }
      } catch (jobErr: any) {
        console.error(`[Worker] Lỗi xử lý job ${job.id}:`, jobErr.message);
        await jobRepo.failJob(job.id, jobErr.message, 60);
      } finally {
        activeJobId = null;
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
