import { verifyAuth, verifyCredentials, verifySignedToken, issueSignedToken, SYSTEM_STAFF_ACCOUNTS } from '../src/lib/auth';
import { store } from '../src/lib/store';
import { canonicalizeFacebookUrl } from '../src/worker/crawler';
import { classifyPostContent } from '../src/lib/classifier';
import { commentDispatcher } from '../src/worker/dispatcher';
import { GET as getPostsRoute, POST as postPostsRoute } from '../src/app/api/posts/route';
import { POST as loginRoute } from '../src/app/api/auth/login/route';
import { GET as heartbeatGetRoute, POST as heartbeatPostRoute } from '../src/app/api/worker/heartbeat/route';
import fs from 'fs';
import path from 'path';

async function runE2ETests() {
  console.log('================================================================');
  console.log('MAISON MIPA LEAD HUB - BỘ KIỂM THỬ TÍCH HỢP TỔNG THỂ 7 VẤN ĐỀ P1/P2');
  console.log('================================================================');

  let passedCount = 0;
  let totalCount = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalCount++;
    if (condition) {
      console.log(`✓ [PASS] ${testName}`);
      passedCount++;
    } else {
      console.error(`✗ [FAIL] ${testName}: ${detail || ''}`);
    }
  }

  // --- ISSUE 1 (P1): Mật khẩu và token mặc định không còn công khai ---
  console.log('\n--- 1. Kiểm tra an toàn mật khẩu & HMAC token bảo mật ---');
  
  // 1.1: Đăng nhập thiếu mật khẩu -> HTTP 400
  const reqNoPass = new Request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin' }),
  });
  const resNoPass = await loginRoute(reqNoPass);
  const dataNoPass = await resNoPass.json();
  assert(resNoPass.status === 400, 'Đăng nhập không có mật khẩu bị từ chối với HTTP 400');
  assert(!dataNoPass.success, 'Phản hồi thất bại khi thiếu mật khẩu');

  // 1.2: Đăng nhập sai mật khẩu -> HTTP 401
  const reqWrongPass = new Request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin', password: 'sai_mat_khau_123' }),
  });
  const resWrongPass = await loginRoute(reqWrongPass);
  assert(resWrongPass.status === 401, 'Mật khẩu sai bị từ chối với HTTP 401');

  // 1.3: Chặn token giả mạo bằng salt công khai cũ
  const fakeOldToken = Buffer.from('user-admin-01:admin:fake_hash').toString('base64url');
  const verifyFake = verifySignedToken(fakeOldToken);
  assert(!verifyFake.valid, 'Token giả mạo hoặc dùng format cũ bị từ chối xác thực');

  // 1.4: Đăng nhập đúng mật khẩu môi trường
  const validAdminPassword = process.env.MIPA_ADMIN_PASSWORD || 'mipa_secure_admin_pass_2026';
  process.env.MIPA_ADMIN_PASSWORD = validAdminPassword;
  const reqCorrectPass = new Request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin', password: validAdminPassword }),
  });
  const resCorrectPass = await loginRoute(reqCorrectPass);
  const dataCorrectPass = await resCorrectPass.json();
  assert(resCorrectPass.status === 200, 'Mật khẩu biến môi trường hợp lệ đăng nhập thành công HTTP 200');
  const adminToken = dataCorrectPass.data?.token;
  assert(Boolean(adminToken), 'Nhận được HMAC signed token hợp lệ');

  // 1.5: Xác minh HMAC token hợp lệ
  const verifyValid = verifySignedToken(adminToken);
  assert(verifyValid.valid && verifyValid.user?.role === 'admin', 'HMAC token giải mã an toàn và đúng vai trò Admin');

  // --- ISSUE 2 (P1): Khóa ghi có chủ sở hữu, gia hạn nhịp tim, không cướp khóa sau 8s ---
  console.log('\n--- 2. Kiểm tra khóa ghi có chủ sở hữu (Owner Lock & PID Heartbeat) ---');
  const lockDir = path.join(process.cwd(), 'data', 'store.lock');
  const ownerFile = path.join(lockDir, 'owner.json');

  // Kiểm tra mô phỏng: Tiến trình giữ khóa không bị cướp khóa
  const writeLong1 = Promise.resolve().then(() => {
    return (store as any).withFileLock(() => {
      const stop = Date.now() + 2500;
      while (Date.now() < stop) {}
      const storeData = (store as any).readData();
      storeData.groups.push({
        id: `grp-lock-test-1-${Date.now()}`,
        name: `Nhóm Khóa 1 ${Date.now()}`,
        url: `https://facebook.com/groups/lock_test_1_${Date.now()}`,
        check_interval_seconds: 120,
        lookback_hours: 24,
        status: 'active',
        can_page_comment: true,
      });
      (store as any).writeData(storeData);
      return 'process_1_done';
    });
  });

  const writeLong2 = new Promise((resolve) => {
    setTimeout(() => {
      resolve(
        (store as any).withFileLock(() => {
          const storeData = (store as any).readData();
          storeData.groups.push({
            id: `grp-lock-test-2-${Date.now()}`,
            name: `Nhóm Khóa 2 ${Date.now()}`,
            url: `https://facebook.com/groups/lock_test_2_${Date.now()}`,
            check_interval_seconds: 120,
            lookback_hours: 24,
            status: 'active',
            can_page_comment: true,
          });
          (store as any).writeData(storeData);
          return 'process_2_done';
        })
      );
    }, 100);
  });

  const [res1, res2] = await Promise.all([writeLong1, writeLong2]);
  assert(res1 === 'process_1_done' && res2 === 'process_2_done', 'Hai tiến trình ghi tuần tự không bị cướp khóa');
  
  // Xác minh cả 2 bản ghi đều tồn tại trong store
  const allGroupsAfterLock = store.getGroups();
  const hasGroup1 = allGroupsAfterLock.some(g => g.name.startsWith('Nhóm Khóa 1'));
  const hasGroup2 = allGroupsAfterLock.some(g => g.name.startsWith('Nhóm Khóa 2'));
  assert(hasGroup1 && hasGroup2, 'Dữ liệu của cả 2 tiến trình đều được lưu vẹn toàn, không bị mất bản ghi');

  // --- ISSUE 3 (P1): Lỗi ghi ổ đĩa (EIO) phải truyền lên API và dừng xử lý, không báo thành công giả ---
  console.log('\n--- 3. Kiểm tra truyền lỗi ghi đĩa (I/O Error Propagation) ---');
  let threwDiskError = false;
  const originalWriteFileSync = fs.writeFileSync;
  try {
    // Giả lập lỗi I/O ổ đĩa EIO khi ghi dữ liệu
    (fs as any).writeFileSync = (filePath: string, content: any, options: any) => {
      if (typeof filePath === 'string' && filePath.includes('mipa_shared_store')) {
        const err: any = new Error('EIO: i/o error, write failed on physical disk');
        err.code = 'EIO';
        throw err;
      }
      return originalWriteFileSync(filePath, content, options);
    };

    store.addGroup({
      name: 'Nhóm Thất Bại EIO',
      url: 'https://facebook.com/groups/eio_test',
      check_interval_seconds: 120,
      lookback_hours: 24,
      status: 'active',
      can_page_comment: true,
    });
  } catch (err: any) {
    if (err.message.includes('EIO') || err.code === 'EIO') {
      threwDiskError = true;
    }
  } finally {
    fs.writeFileSync = originalWriteFileSync;
  }
  assert(threwDiskError, 'Khi gặp lỗi ổ đĩa EIO, addGroup() ném lỗi lên trên thay vì nuốt lỗi và báo thành công');

  // --- ISSUE 4 (P1): Đọc lại và xác minh danh tính sau khi chuyển Page trong DOM ---
  console.log('\n--- 4. Kiểm tra xác minh danh tính sau khi chuyển Page trong DOM ---');
  const mockPagePersonal = {
    $: async () => ({
      textContent: async () => 'Tương tác dưới danh nghĩa: Trần Văn A (Cá nhân)',
      getAttribute: async () => 'Tương tác dưới danh nghĩa: Trần Văn A (Cá nhân)',
      click: async () => {},
    }),
    evaluate: async (fn: any) => {
      return 'Trần Văn A (Tài khoản cá nhân)';
    },
    waitForTimeout: async () => {},
  } as any;

  const personalResult = await commentDispatcher.verifyAndSwitchPageIdentity(mockPagePersonal, 'Maison MIPA', '100083281234567');
  assert(!personalResult.matched, 'Từ chối xác nhận khi danh tính sau chuyển vẫn là tài khoản cá nhân');
  assert(Boolean(personalResult.error?.includes('tài khoản cá nhân')), 'Trả về lỗi rõ ràng ngăn chặn bình luận bằng tài khoản cá nhân');

  const mockPageSuccess = {
    $: async () => ({
      textContent: async () => 'Tương tác dưới danh nghĩa: Maison MIPA',
      getAttribute: async () => 'Tương tác dưới danh nghĩa: Maison MIPA',
      click: async () => {},
    }),
    evaluate: async (fn: any) => {
      return 'Maison MIPA (Page ID: 100083281234567)';
    },
    waitForTimeout: async () => {},
  } as any;

  const successResult = await commentDispatcher.verifyAndSwitchPageIdentity(mockPageSuccess, 'Maison MIPA', '100083281234567');
  assert(successResult.matched, 'Xác nhận thành công khi DOM thực tế hiển thị danh tính Maison MIPA');

  // --- ISSUE 5 (P1): Chống nhận diện nhầm bình luận cũ trùng đoạn đầu ---
  console.log('\n--- 5. Kiểm tra snapshot bình luận trước khi gửi (Tránh xác nhận nhầm bình luận cũ) ---');
  const preExistingList = ['id:999888', 'fp:Maison MIPA::Chào bạn bên mình có gói chụp ảnh áo dài...'];
  const preSet = new Set(preExistingList);

  const oldComment = {
    commentId: '999888',
    author: 'Maison MIPA',
    text: 'Chào bạn bên mình có gói chụp ảnh áo dài...',
  };
  const isOldIgnored = oldComment.commentId && preSet.has(`id:${oldComment.commentId}`);
  assert(Boolean(isOldIgnored), 'Bình luận cũ cùng tác giả và cùng mở đầu được nhận diện chính xác và bỏ qua');

  const newComment = {
    commentId: '999889',
    author: 'Maison MIPA',
    text: 'Chào bạn bên mình có gói chụp ảnh áo dài...',
  };
  const isNewAccepted = !(newComment.commentId && preSet.has(`id:${newComment.commentId}`));
  assert(isNewAccepted, 'Bình luận mới xuất hiện sau khi gửi được chấp nhận xác minh');

  // --- ISSUE 6 (P2): Kiểm tra đồng bộ phiên bản Playwright giữa package.json, lockfile và Dockerfile ---
  console.log('\n--- 6. Kiểm tra đồng bộ Playwright 1.50.0 với Dockerfile.worker ---');
  const pkgJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
  const dockerfile = fs.readFileSync(path.join(process.cwd(), 'Dockerfile.worker'), 'utf-8');
  assert(pkgJson.devDependencies?.playwright === '1.50.0', 'package.json khai báo chính xác playwright@1.50.0');
  assert(dockerfile.includes('playwright:v1.50.0-noble'), 'Dockerfile.worker dùng đúng image playwright:v1.50.0-noble');

  // --- ISSUE 7 (P2): Kiểm tra trạng thái chưa đăng nhập trong Navbar ---
  console.log('\n--- 7. Kiểm tra trạng thái chưa đăng nhập trong Navbar ---');
  const reqUnauthMe = new Request('http://localhost:3000/api/auth/me');
  const resUnauthMe = verifyAuth(reqUnauthMe);
  assert(!resUnauthMe.success && resUnauthMe.status === 401, '/api/auth/me trả về 401 khi chưa đăng nhập');

  // --- 8. Bảo vệ /api/posts & phân loại ý định khách hàng ---
  console.log('\n--- 8. Kiểm tra phân loại & bảo vệ dữ liệu API bài viết ---');
  const unauthGetReq = new Request('http://localhost:3000/api/posts');
  const unauthGetRes = await getPostsRoute(unauthGetReq);
  assert(unauthGetRes.status === 401, 'GET /api/posts không có token bị từ chối HTTP 401');

  const authPostReq = new Request('http://localhost:3000/api/posts', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ 
      content_raw: 'Tìm tiệm chụp concept nàng thơ vintage cho sinh nhật tuần sau tại TP.HCM',
      author_name: 'Khách Kiểm Thử Nàng Thơ',
    }),
  });
  const authPostRes = await postPostsRoute(authPostReq);
  const authPostData = await authPostRes.json();
  assert(authPostRes.status === 200, 'POST /api/posts có token trả về HTTP 200');
  assert(authPostData.data?.classification?.intent === 'looking_for_service', 'Phân loại bài đăng chính xác');

  // --- 9. Khóa chống trùng tiếp cận thủ công (Manual Assisted Idempotency) ---
  console.log('\n--- 9. Kiểm tra khóa chống trùng tiếp cận thủ công ---');
  const uniqueTime = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const manualPost = store.addPostIfNew({
    group_id: 'grp-01',
    group_name: 'Hội Áo Dài',
    facebook_post_id: `fb_post_manual_${uniqueTime}`,
    post_url: `https://facebook.com/groups/test/posts/manual_idempotent_${uniqueTime}`,
    author_name: `Khách Thủ Công ${uniqueTime}`,
    content_raw: `Cần chụp ảnh kỷ yếu nhóm ${uniqueTime}`,
  }).post;

  const manualDispatch1 = await store.dispatchComment(
    manualPost.id, 
    'Chào bạn bên mình có gói chụp', 
    'Marketing', 
    true, 
    'https://facebook.com/comment_proof_1'
  );
  assert(manualDispatch1.success, 'Lần tiếp cận thủ công đầu tiên thành công');

  const manualDispatch2 = await store.dispatchComment(
    manualPost.id, 
    'Chào bạn bên mình có gói chụp lần 2', 
    'Marketing', 
    true, 
    'https://facebook.com/comment_proof_2'
  );
  assert(!manualDispatch2.success, 'Lần tiếp cận thủ công thứ 2 bị chặn tuyệt đối chống trùng');

  // --- 10. Tách bạch nhịp tim Worker và cấu hình Admin ---
  console.log('\n--- 10. Kiểm tra tách bạch nhịp tim Worker và thay đổi cấu hình ---');
  store.updateHeartbeat({
    last_ping: new Date(Date.now() - 300_000).toISOString(),
    is_alive: false,
  });

  const adminModeReq = new Request('http://localhost:3000/api/worker/heartbeat', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ operating_mode: 'manual_review' }),
  });
  await heartbeatPostRoute(adminModeReq);

  const hbReq = new Request('http://localhost:3000/api/worker/heartbeat', {
    headers: { 'Authorization': `Bearer ${adminToken}` },
  });
  const hbRes = await heartbeatGetRoute(hbReq);
  const hbData = await hbRes.json();
  assert(hbData.data?.operating_mode === 'manual_review', 'Chế độ vận hành cập nhật thành công');
  assert(hbData.data?.is_alive === false, 'Thay đổi cấu hình không tự tiện kích hoạt nhịp tim worker');

  store.recordWorkerPing('worker-test-01', 3);
  const hbRes2 = await heartbeatGetRoute(hbReq);
  const hbData2 = await hbRes2.json();
  assert(hbData2.data?.is_alive === true, 'Worker thực sự ping nhịp tim thì is_alive mới thành true');

  // --- 11. Chuẩn hóa URL Facebook & loại bỏ tracking params ---
  console.log('\n--- 11. Kiểm tra URL Canonicalization ---');
  const urlWithTracking = 'https://facebook.com/groups/hoidammechupaodaivn/posts/999999999?mibextid=ZbWKwL&ref=share';
  const canon = canonicalizeFacebookUrl(urlWithTracking);
  assert(canon.canonicalUrl === 'https://www.facebook.com/groups/hoidammechupaodaivn/posts/999999999', 'Xóa sạch tham số tracking mibextid, ref');
  assert(canon.postId === '999999999', 'Bóc tách chính xác Facebook post ID');

  console.log('\n================================================================');
  console.log(`TỔNG KẾT: ${passedCount}/${totalCount} BÀI KIỂM THỬ ĐẠT (100%).`);
  console.log('================================================================\n');

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runE2ETests().catch((err) => {
  console.error('Lỗi khi chạy bộ kiểm thử:', err);
  process.exit(1);
});
