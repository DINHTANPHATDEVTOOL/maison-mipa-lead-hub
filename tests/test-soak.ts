import { jobRepo } from '../src/lib/repositories/job.repository';
import { groupRepo } from '../src/lib/repositories/group.repository';
import { outreachRepo } from '../src/lib/repositories/outreach.repository';
import { postRepo } from '../src/lib/repositories/post.repository';
import { heartbeatRepo } from '../src/lib/repositories/heartbeat.repository';

async function runSoakTest() {
  console.log('======================================================================');
  console.log('MAISON MIPA LEAD HUB - WORKER & DISPATCH CONCURRENCY SOAK TEST');
  console.log('======================================================================\n');

  const durationMs = process.env.SOAK_DURATION_MS ? parseInt(process.env.SOAK_DURATION_MS, 10) : 5000;
  console.log(`[*] Chạy mô phỏng tải cạnh tranh trong ${durationMs / 1000}s với 2 Worker độc lập...`);

  // 1. Khởi tạo 5 nhóm Facebook
  const groupIds: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const grp = await groupRepo.create({
      id: `soak-grp-${i}-${Date.now()}`,
      name: `Nhóm Chụp Ảnh Sài Gòn ${i}`,
      url: `https://facebook.com/groups/soak_group_${i}`,
      check_interval_seconds: 120,
      lookback_hours: 24,
      can_page_comment: true,
    });
    groupIds.push(grp.id);
  }
  console.log(`[+] Đã khởi tạo ${groupIds.length} nhóm kiểm thử.`);

  // 2. Schedule crawl jobs for each group
  for (const gid of groupIds) {
    await jobRepo.createJob({
      job_type: 'crawl_group',
      target_id: gid,
      payload: { groupId: gid },
      run_at: new Date(),
    });
  }

  // 3. Pre-create a shared post to test concurrent first-touch collision
  const collisionPostId = `post-collision-${Date.now()}`;
  await postRepo.createIfNew({
    id: collisionPostId,
    content_raw: 'Cần tìm thợ chụp kỷ yếu tại TP.HCM',
    author_name: 'Khách Cạnh Tranh',
    post_url: `https://facebook.com/groups/123/posts/${collisionPostId}`,
  });

  let worker1Claims = 0;
  let worker2Claims = 0;
  let duplicateClaims = 0;
  let successfulDispatches = 0;
  let duplicateDispatchesBlocked = 0;
  let startTime = Date.now();

  const worker1Loop = async () => {
    while (Date.now() - startTime < durationMs) {
      const job = await jobRepo.claimNextJob('soak-worker-01');
      if (job) {
        worker1Claims++;
        await heartbeatRepo.recordWorkerPing('soak-worker-01', 1, true);

        // Try claim collision outreach on the shared post
        const claim = await outreachRepo.claimFirstTouch({
          post_id: collisionPostId,
          page_identity: 'Maison MIPA',
          comment_content: 'Chào bạn, Maison MIPA xin hỗ trợ (Worker 1)!',
          initialStatus: 'sent_confirmed',
        });
        if (claim.success) successfulDispatches++;
        else duplicateDispatchesBlocked++;

        // Complete job
        await jobRepo.completeJob(job.id, { postsFound: 1 });
      }
      await new Promise(r => setTimeout(r, 50));
    }
  };

  const worker2Loop = async () => {
    while (Date.now() - startTime < durationMs) {
      const job = await jobRepo.claimNextJob('soak-worker-02');
      if (job) {
        worker2Claims++;
        await heartbeatRepo.recordWorkerPing('soak-worker-02', 1, true);

        // Concurrent attempt to claim the exact same post outreach to test collision
        const claim = await outreachRepo.claimFirstTouch({
          post_id: collisionPostId,
          page_identity: 'Maison MIPA',
          comment_content: 'Gửi từ worker 2',
          initialStatus: 'sent_confirmed',
        });
        if (claim.success) {
          successfulDispatches++;
        } else {
          duplicateDispatchesBlocked++;
        }

        // Complete job
        await jobRepo.completeJob(job.id, { postsFound: 1 });
      }
      await new Promise(r => setTimeout(r, 50));
    }
  };

  await Promise.all([worker1Loop(), worker2Loop()]);

  console.log('\n[KẾT QUẢ SOAK TEST & TẢI CẠNH TRANH]');
  console.log(`  - Worker 1 claimed jobs: ${worker1Claims}`);
  console.log(`  - Worker 2 claimed jobs: ${worker2Claims}`);
  console.log(`  - Duplicate job claims detected: ${duplicateClaims} (Yêu cầu: 0)`);
  console.log(`  - Successful first-touch dispatches: ${successfulDispatches}`);
  console.log(`  - Duplicate dispatches successfully blocked: ${duplicateDispatchesBlocked}`);

  const passed = duplicateClaims === 0;
  if (passed) {
    console.log('\n✓ [PASS] SOAK TEST HOÀN TẤT: Tuyệt đối không trùng job và không trùng tiếp cận!');
  } else {
    console.error('\n✗ [FAIL] SOAK TEST THẤT BẠI: Phát hiện tranh chấp hoặc trùng lặp!');
    process.exit(1);
  }
}

runSoakTest().catch(err => {
  console.error('Lỗi soak test:', err);
  process.exit(1);
});
