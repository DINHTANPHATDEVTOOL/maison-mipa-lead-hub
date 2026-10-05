import { store } from '../lib/store';
import { groupCrawler } from './crawler';
import { commentDispatcher } from './dispatcher';
import { classifyPostContent } from '../lib/classifier';

async function runWorkerCycle() {
  console.log(`\n[${new Date().toLocaleTimeString('vi-VN')}] === BẮT ĐẦU CHU KỲ QUÉT BỘ CHẠY NỀN ===`);

  const groups = store.getGroups().filter(g => g.status === 'active');
  const services = store.getServices();
  const templates = store.getTemplates();
  const heartbeat = store.getHeartbeat();

  console.log(`[Worker] Số nhóm đang theo dõi: ${groups.length} | Chế độ: ${heartbeat.operating_mode === 'auto_dispatch' ? 'Tự Động Đăng' : 'Duyệt Thủ Công (Human-in-the-loop)'}`);

  for (const group of groups) {
    const now = Date.now();
    const nextCheck = group.next_check_at ? new Date(group.next_check_at).getTime() : 0;

    // Check if interval has elapsed
    if (now < nextCheck) {
      const waitSeconds = Math.round((nextCheck - now) / 1000);
      console.log(`[Worker] Nhóm "${group.name}": Chưa tới hạn (còn ${waitSeconds}s).`);
      continue;
    }

    console.log(`[Worker] Đang quét nhóm "${group.name}" (Chu kỳ ${group.check_interval_seconds}s)...`);

    try {
      const crawlResult = await groupCrawler.crawlGroup(group.url, group.lookback_hours);

      // Update group check timestamp & permission
      store.updateGroup(group.id, {
        last_checked_at: new Date().toISOString(),
        next_check_at: new Date(Date.now() + group.check_interval_seconds * 1000).toISOString(),
        can_page_comment: crawlResult.canPageComment ?? group.can_page_comment,
      });

      if (!crawlResult.success) {
        if (crawlResult.needsAuth) {
          store.updateGroup(group.id, { 
            status: 'needs_auth',
            last_error_message: crawlResult.error || 'Yêu cầu đăng nhập Facebook lại'
          });
        }
        continue;
      }

      // Process and classify posts
      let newPostsCount = 0;
      for (const rawPost of crawlResult.posts) {
        const { post, isNew } = store.addPostIfNew({
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
          // Classify with Vietnam timezone accuracy
          const classification = classifyPostContent(post.content_raw, services, templates, post.posted_at);
          const classificationData = {
            id: `cls-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            post_id: post.id,
            intent: classification.intent,
            service_detected: classification.service_detected,
            location: classification.location,
            pax: classification.pax,
            shooting_date_text: classification.shooting_date_text,
            shooting_date_suggested: classification.shooting_date_suggested,
            budget_raw: classification.budget_raw,
            extra_requirements: classification.extra_requirements,
            confidence_score: classification.confidence_score,
            classification_reason: classification.classification_reason,
            suggested_template_id: classification.suggested_template_id,
            suggested_comment_text: classification.suggested_comment_text,
            review_status: (classification.intent === 'looking_for_service' ? 'pending_review' : 'dismissed') as any,
          };

          // CRITICAL FIX: Persist classification directly to shared store!
          store.updatePostClassification(post.id, classificationData);

          console.log(`[Worker] Bài mới từ ${post.author_name}: Ý định = ${classification.intent} (${classification.confidence_score}%)`);

          // Auto-dispatch if configured and high confidence
          if (
            heartbeat.operating_mode === 'auto_dispatch' &&
            classification.intent === 'looking_for_service' &&
            classification.confidence_score >= 90 &&
            classification.suggested_comment_text
          ) {
            console.log(`[Worker] Tự động đăng bình luận tiếp cận cho bài: ${post.post_url}`);
            await store.dispatchComment(post.id, classification.suggested_comment_text, 'Worker Auto-Bot');
          }
        }
      }

      console.log(`[Worker] Nhóm "${group.name}": Thu thập thêm ${newPostsCount} bài mới.`);

    } catch (err: any) {
      console.error(`[Worker] Lỗi xử lý nhóm ${group.name}:`, err.message);
      store.updateGroup(group.id, {
        status: 'error',
        last_error_message: err.message,
      });
    }
  }

  // Ping heartbeat
  store.recordWorkerPing('worker-ubuntu-central-01', groups.length);
}

// Main execution loop
async function startWorker() {
  console.log('================================================================');
  console.log('MAISON MIPA LEAD HUB - KHỞI ĐỘNG BỘ CHẠY NỀN TRUNG TÂM (WORKER)');
  console.log('================================================================');

  // Run first cycle immediately
  await runWorkerCycle();

  // Run periodic loop every 30 seconds to evaluate scheduled groups
  setInterval(async () => {
    try {
      await runWorkerCycle();
    } catch (e) {
      console.error('[Worker Fatal]', e);
    }
  }, 30000);
}

if (require.main === module) {
  startWorker();
}
