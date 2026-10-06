import { jobRepo } from '../src/lib/repositories/job.repository';
import { groupRepo } from '../src/lib/repositories/group.repository';
import { postRepo } from '../src/lib/repositories/post.repository';
import { templateRepo } from '../src/lib/repositories/template.repository';
import { outreachRepo } from '../src/lib/repositories/outreach.repository';
import { outreachDispatchService } from '../src/lib/services/outreach-dispatch.service';
import { commentDispatcher } from '../src/worker/dispatcher';
import { getDbPool } from '../src/lib/db';
import assert from 'assert';

async function runTests() {
  console.log('================================================================');
  console.log('  KIỂM THỬ N02, N03, N04, N05: LEASE OWNERSHIP, DISPATCH & ROLES');
  console.log('================================================================');

  process.env.DATABASE_URL = 'memory';
  const pool = getDbPool();

  // -------------------------------------------------------------
  // 1. N02: Kiểm tra nhận diện danh tính Page & xung đột Avatar / Switcher
  // -------------------------------------------------------------
  console.log('\n--- 1. Kiểm tra N02: Bác bỏ hoàn toàn xung đột Avatar & Switcher ---');
  
  // Fixture: Avatar mang ID 222 nhưng Switcher mang ID 111 (xung đột)
  const mockPageConflict: any = {
    evaluate: async (fn: any, args: any) => {
      return 'Nguyễn Văn A [https://facebook.com/222] [data-page-id=222] Tương tác dưới danh nghĩa Maison MIPA [Page ID: 111]';
    },
    $: async () => null,
  };

  const resConflict = await commentDispatcher.verifyAndSwitchPageIdentity(mockPageConflict, 'Maison MIPA', '111');
  assert.strictEqual(resConflict.matched, false, 'Xung đột giữa Avatar 222 và Switcher 111 phải bị từ chối');
  assert(resConflict.error?.includes('Xung đột danh tính'), 'Thông báo lỗi phải nêu rõ xung đột danh tính');
  console.log('✓ [PASS] Đã chặn đứng xung đột danh tính giữa Avatar và Switcher (222 != 111)');

  // Fixture: Avatar 111 thống nhất không có xung đột
  const mockPageValid: any = {
    evaluate: async (fn: any, args: any) => {
      return 'Maison MIPA [https://facebook.com/111] [data-page-id=111] Tương tác dưới danh nghĩa Maison MIPA [Page ID: 111]';
    },
    $: async () => null,
  };
  const resValid = await commentDispatcher.verifyAndSwitchPageIdentity(mockPageValid, 'Maison MIPA', '111');
  assert.strictEqual(resValid.matched, true, 'Danh tính hợp nhất 111 phải được chấp nhận');
  console.log('✓ [PASS] Danh tính hợp nhất 111 được xác nhận chuẩn xác');

  // -------------------------------------------------------------
  // 2. N03: Kiểm tra Quyền sở hữu Job & Claim Token (Worker cũ mất lease không được commit)
  // -------------------------------------------------------------
  console.log('\n--- 2. Kiểm tra N03: Worker mất lease không được sửa trạng thái Job ---');
  
  const testJob = await jobRepo.createJob({
    job_type: 'crawl_group',
    target_id: 'grp_lease_test_01',
    payload: { test: true },
  });

  // Worker 2 claim job
  const claimedW2 = await jobRepo.claimNextJob('worker-2', ['crawl_group']);
  assert(claimedW2 !== null && claimedW2.id === testJob.id, 'Worker 2 phải claim được job');
  const tokenW2 = claimedW2.claim_token!;
  assert(tokenW2, 'Phải có claim_token được sinh ra');

  // Mô phỏng lease timeout: worker 2 bị treo, locked_at quá hạn và recoverStuckJobs giải phóng
  await pool.query("UPDATE scheduled_jobs SET locked_at = NOW() - INTERVAL '10 minutes' WHERE id = $1", [testJob.id]);
  const recovered = await jobRepo.recoverStuckJobs(5);
  assert.strictEqual(recovered, 1, 'Job phải được thu hồi do quá hạn lease');

  // Worker 3 claim lại job
  const claimedW3 = await jobRepo.claimNextJob('worker-3', ['crawl_group']);
  assert(claimedW3 !== null && claimedW3.id === testJob.id, 'Worker 3 phải claim lại job');
  const tokenW3 = claimedW3.claim_token!;
  assert.notStrictEqual(tokenW2, tokenW3, 'Token mới của Worker 3 phải khác token cũ của Worker 2');

  // Worker 2 cũ hoàn thành muộn -> cố commit completeJob với token cũ của mình
  const w2CommitRes = await jobRepo.completeJob(testJob.id, { posts: 10 }, {
    claimToken: tokenW2,
    workerId: 'worker-2',
  });
  assert.strictEqual(w2CommitRes, false, 'Worker 2 mất lease phải bị từ chối completeJob');

  // Kiểm tra job vẫn đang chạy thuộc về Worker 3
  const currentJob = await jobRepo.getJobById(testJob.id);
  assert.strictEqual(currentJob?.status, 'running');
  assert.strictEqual(currentJob?.locked_by, 'worker-3');

  // Worker 3 gia hạn lease (heartbeat)
  const renewOk = await jobRepo.renewJobLease(testJob.id, tokenW3, 'worker-3');
  assert.strictEqual(renewOk, true, 'Worker 3 phải gia hạn lease thành công');

  // Worker 3 hoàn tất job
  const w3CommitRes = await jobRepo.completeJob(testJob.id, { posts: 10 }, {
    claimToken: tokenW3,
    workerId: 'worker-3',
  });
  assert.strictEqual(w3CommitRes, true, 'Worker 3 hợp lệ phải hoàn tất job thành công');

  const completedJob = await jobRepo.getJobById(testJob.id);
  assert.strictEqual(completedJob?.status, 'completed');
  console.log('✓ [PASS] Worker cũ mất quyền sở hữu lease bị chặn tuyệt đối không cho ghi đè kết quả');

  // -------------------------------------------------------------
  // 3. N04 & N05: Quyền nhóm, Khóa Page & Phục hồi lỗi trước submit
  // -------------------------------------------------------------
  console.log('\n--- 3. Kiểm tra N04 & N05: Quyền nhóm & Lỗi trước submit không khóa bài vĩnh viễn ---');

  // Nhóm cấm Page bình luận (can_page_comment = false)
  const restrictedGroup = await groupRepo.create({
    name: 'Nhóm Cấm Page Bình Luận',
    url: 'https://facebook.com/groups/restricted_group_123',
    can_page_comment: false,
  });

  const postInRestricted = await postRepo.createIfNew({
    group_id: restrictedGroup.id,
    content_raw: 'Cần thuê áo dài chụp ảnh tết',
    post_url: 'https://facebook.com/groups/restricted_group_123/posts/111',
  });

  const dispatchToRestricted = await outreachDispatchService.dispatchOutreach({
    postId: postInRestricted.post.id,
    commentContent: 'Chào bạn Maison MIPA có sẵn mẫu',
    operatorName: 'CSKH 1',
  });

  assert.strictEqual(dispatchToRestricted.success, false);
  assert(dispatchToRestricted.error?.includes('can_page_comment = false'), 'Phải từ chối nhóm cấm Page');
  console.log('✓ [PASS] Đã từ chối gửi bình luận vào nhóm cấm Page (can_page_comment = false)');

  // Kiểm tra lỗi trước submit (Pre-submit failure) cho phép retry:
  const openGroup = await groupRepo.create({
    name: 'Nhóm Mở Bình Luận',
    url: 'https://facebook.com/groups/open_group_123',
    can_page_comment: true,
  });

  const normalPost = await postRepo.createIfNew({
    group_id: openGroup.id,
    content_raw: 'Cần tư vấn gói chụp kỷ yếu trọn gói',
    post_url: 'https://facebook.com/groups/open_group_123/posts/222',
  });

  // Giả lập tương tác thất bại trước submit bằng cách ghi status failed_before_submit
  await outreachRepo.claimFirstTouch({
    post_id: normalPost.post.id,
    page_identity: 'Maison MIPA',
    operator_name: 'Worker 1',
    comment_content: 'Chào bạn',
    initialStatus: 'failed_before_submit',
  });

  // Yêu cầu tiếp cận lại trên bài viết này
  const retryClaim = await outreachRepo.claimFirstTouch({
    post_id: normalPost.post.id,
    page_identity: 'Maison MIPA',
    operator_name: 'Worker 2',
    comment_content: 'Chào bạn (thử lại sau khi có session)',
    initialStatus: 'sending',
  });

  assert.strictEqual(retryClaim.success, true, 'Lỗi trước submit phải cho phép CAS claim lại để thử lại');
  assert.strictEqual(retryClaim.interaction?.status, 'sending');
  console.log('✓ [PASS] Bài viết gặp lỗi trước submit được phép thu hồi claim và thử lại an toàn (State Machine)');

  console.log('\n================================================================');
  console.log('✓ TẤT CẢ KIỂM THỬ N02, N03, N04, N05 ĐẠT 100%!');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
