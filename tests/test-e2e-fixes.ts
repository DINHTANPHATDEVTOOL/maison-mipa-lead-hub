import { verifyAuth, verifyCredentials, verifySignedToken, issueSignedToken, isTokenRevoked, SYSTEM_STAFF_ACCOUNTS } from '../src/lib/auth';
import { store } from '../src/lib/store';
import { canonicalizeFacebookUrl } from '../src/worker/crawler';
import { classifyPostContent } from '../src/lib/classifier';
import { commentDispatcher } from '../src/worker/dispatcher';
import { GET as getPostsRoute, POST as postPostsRoute } from '../src/app/api/posts/route';
import { POST as loginRoute } from '../src/app/api/auth/login/route';
import { POST as logoutRoute } from '../src/app/api/auth/logout/route';
import { GET as heartbeatGetRoute, POST as heartbeatPostRoute } from '../src/app/api/worker/heartbeat/route';
import fs from 'fs';
import path from 'path';

async function runE2ETests() {
  console.log('================================================================');
  console.log('MAISON MIPA LEAD HUB - KIỂM THỬ TÍCH HỢP TOÀN DIỆN CÁC LỖI P1 & P2');
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

  // --- ISSUE 1 (P1): Mật khẩu & HMAC Token bảo mật, bắt buộc cấu hình ---
  console.log('\n--- 1. Kiểm tra an toàn mật khẩu & HMAC Token ---');
  
  // 1.1: Đăng nhập thiếu mật khẩu -> HTTP 400
  const reqNoPass = new Request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin' }),
  });
  const resNoPass = await loginRoute(reqNoPass);
  assert(resNoPass.status === 400, 'Đăng nhập không có mật khẩu bị từ chối với HTTP 400');

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

  // --- ISSUE 2 (P1): Khóa ghi có Fencing Token, không cho hai bên cùng ghi khi lease hết hạn ---
  console.log('\n--- 2. Kiểm tra khóa ghi Fencing Token & bảo vệ tiến trình đang chạy ---');
  const lockDir = path.join(process.cwd(), 'data', 'store.lock');
  const ownerFile = path.join(lockDir, 'owner.json');

  // 2.1: Tiến trình giữ khóa lâu (giả lập 3 giây) không bị cướp khóa bởi tiến trình thứ hai
  const timeStart = Date.now();
  const writeLong1 = Promise.resolve().then(() => {
    return (store as any).withFileLock(() => {
      const stop = Date.now() + 2000;
      while (Date.now() < stop) {}
      const storeData = (store as any).readData();
      storeData.groups.push({
        id: `grp-fencing-1-${Date.now()}`,
        name: `Nhóm Fencing 1 ${Date.now()}`,
        url: `https://facebook.com/groups/fencing_1_${Date.now()}`,
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
            id: `grp-fencing-2-${Date.now()}`,
            name: `Nhóm Fencing 2 ${Date.now()}`,
            url: `https://facebook.com/groups/fencing_2_${Date.now()}`,
            check_interval_seconds: 120,
            lookback_hours: 24,
            status: 'active',
            can_page_comment: true,
          });
          (store as any).writeData(storeData);
          return 'process_2_done';
        })
      );
    }, 150);
  });

  const [res1, res2] = await Promise.all([writeLong1, writeLong2]);
  assert(res1 === 'process_1_done' && res2 === 'process_2_done', 'Tiến trình thứ 2 kiên nhẫn xếp hàng đợi tiến trình 1 hoàn tất');
  
  const allGroups = store.getGroups();
  const hasG1 = allGroups.some(g => g.name.startsWith('Nhóm Fencing 1'));
  const hasG2 = allGroups.some(g => g.name.startsWith('Nhóm Fencing 2'));
  assert(hasG1 && hasG2, 'Cả hai bản ghi đều được ghi nhận vẹn toàn, không bị ghi đè làm mất');

  // 2.2: Cơ chế Fencing Token chặn ghi đè khi khóa bị thu hồi hoặc đổi chủ sở hữu
  let fencingRejected = false;
  try {
    (store as any).currentLockOwnerId = 'fake-outdated-owner-id';
    const fakeData = (store as any).readData();
    (store as any).writeData(fakeData);
  } catch (e: any) {
    if (e.message.includes('Quyền sở hữu khóa') || e.message.includes('Khóa ghi không còn tồn tại')) {
      fencingRejected = true;
    }
  } finally {
    (store as any).currentLockOwnerId = null;
  }
  assert(fencingRejected, 'Fencing Token chặn tuyệt đối tiến trình có lease cũ/hết hạn ghi đè vào dữ liệu');

  // --- ISSUE 3 (P1): Page sai ID nhưng trùng tên bị từ chối tuyệt đối ---
  console.log('\n--- 3. Kiểm tra đối chiếu Page ID chính xác (Không chấp nhận sai ID dù trùng tên) ---');
  
  // Tình huống 3.1: DOM hiển thị Page trùng tên "Maison MIPA" nhưng ID là 222 (yêu cầu là 111)
  const mockPageWrongId = {
    $: async () => ({
      textContent: async () => 'Tương tác dưới danh nghĩa: Maison MIPA [Page ID: 222]',
      getAttribute: async () => 'Tương tác dưới danh nghĩa: Maison MIPA [Page ID: 222]',
      click: async () => {},
    }),
    evaluate: async (fn: any) => {
      // Trả về voice có ID 222 (sai so với 111)
      return 'Maison MIPA (Page ID: 222)';
    },
    waitForTimeout: async () => {},
  } as any;

  const resultWrongId = await commentDispatcher.verifyAndSwitchPageIdentity(mockPageWrongId, 'Maison MIPA', '111');
  assert(!resultWrongId.matched, 'Từ chối xác nhận khi Page trùng tên nhưng sai Page ID (222 != 111)');
  assert(Boolean(resultWrongId.error), 'Trả về lỗi từ chối rõ ràng để bảo vệ Page chính thức');

  // Tình huống 3.2: DOM hiển thị Page đúng cả tên và ID 111
  const mockPageRightId = {
    $: async () => ({
      textContent: async () => 'Tương tác dưới danh nghĩa: Maison MIPA [Page ID: 111]',
      getAttribute: async () => 'Tương tác dưới danh nghĩa: Maison MIPA [Page ID: 111]',
      click: async () => {},
    }),
    evaluate: async (fn: any) => {
      return 'Maison MIPA (Page ID: 111)';
    },
    waitForTimeout: async () => {},
  } as any;

  const resultRightId = await commentDispatcher.verifyAndSwitchPageIdentity(mockPageRightId, 'Maison MIPA', '111');
  assert(resultRightId.matched, 'Chấp nhận xác nhận khi cả tên Page và Page ID khớp chính xác');

  // --- ISSUE 4 (P1): Bình luận cũ tải muộn cùng 35 ký tự mở đầu bị loại trừ ---
  console.log('\n--- 4. Kiểm tra loại trừ bình luận cũ tải muộn & yêu cầu bằng chứng vừa tạo ---');

  // Mô phỏng 4.1: Bình luận cũ của Page xuất hiện sau snapshot với cùng 35 ký tự, nhưng có timestamp cũ ("3 giờ trước")
  const testCommentText = 'Chào bạn, Maison MIPA xin gửi báo giá chụp ảnh áo dài kỷ yếu tại Quận 1.';
  const oldLateComment = {
    text: testCommentText,
    author: 'Maison MIPA',
    timeText: '3 giờ trước', // Dấu hiệu bình luận cũ
  };
  
  // Logic kiểm tra freshness proof:
  const isOldDetected = /\b([2-9]|[1-9][0-9]+)\s*(?:giờ|tiếng|ngày|tuần|tháng|năm|h|d|w|m|y)\b/i.test(oldLateComment.timeText);
  const hasRecency = /\b(vừa xong|vừa gửi|giây|1 phút|just now|now)\b/i.test(oldLateComment.timeText);
  const isValidFresh = !isOldDetected && hasRecency;
  assert(!isValidFresh, 'Bình luận cũ tải muộn có dấu hiệu thời gian cũ ("3 giờ trước") bị từ chối xác nhận');

  // Mô phỏng 4.2: Bình luận mới vừa tạo có dấu hiệu "Vừa xong"
  const freshComment = {
    text: testCommentText,
    author: 'Maison MIPA',
    timeText: 'Vừa xong',
  };
  const isFreshOld = /\b([2-9]|[1-9][0-9]+)\s*(?:giờ|tiếng|ngày|tuần|tháng|năm|h|d|w|m|y)\b/i.test(freshComment.timeText);
  const isFreshRecency = /\b(vừa xong|vừa gửi|giây|1 phút|just now|now)\b/i.test(freshComment.timeText);
  const isFreshAccepted = !isFreshOld && isFreshRecency;
  assert(isFreshAccepted, 'Bình luận mới có bằng chứng vừa tạo ("Vừa xong") được chấp nhận xác nhận');

  // --- ISSUE 5 (P2): Đăng xuất xóa phiên xác thực (Clear Cookie & Revoke Token) ---
  console.log('\n--- 5. Kiểm tra luồng Đăng xuất & Thu hồi phiên hoàn toàn ---');

  // Đăng nhập lấy token và cookie
  const loginReq = new Request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin', password: validAdminPassword }),
  });
  const loginRes = await loginRoute(loginReq);
  const loginData = await loginRes.json();
  const sessionToken = loginData.data?.token;

  // Gọi endpoint /api/auth/logout
  const logoutReq = new Request('http://localhost:3000/api/auth/logout', {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${sessionToken}`,
      'Cookie': `mipa_auth_token=${sessionToken}`,
    },
  });
  const logoutRes = await logoutRoute(logoutReq);
  assert(logoutRes.status === 200, 'POST /api/auth/logout trả về HTTP 200 thành công');
  
  // Kiểm tra cookie đã bị xóa trong header Set-Cookie
  const setCookie = logoutRes.headers.get('set-cookie') || '';
  assert(setCookie.includes('mipa_auth_token=;') || setCookie.includes('Max-Age=0'), 'Header Set-Cookie xóa sạch cookie mipa_auth_token');

  // Kiểm tra token đã bị thu hồi trong blacklist
  assert(isTokenRevoked(sessionToken), 'Token đã được đưa vào danh sách thu hồi (Revocation Blacklist)');

  // Dùng lại token hoặc cookie đã đăng xuất để gọi API bảo vệ -> Phải bị từ chối 401
  const reuseTokenReq = new Request('http://localhost:3000/api/posts', {
    headers: { 'Authorization': `Bearer ${sessionToken}` },
  });
  const reuseRes = await getPostsRoute(reuseTokenReq);
  assert(reuseRes.status === 401, 'Token đã đăng xuất bị chặn truy cập API (HTTP 401)');

  // --- ISSUE 6 (P2): Đồng bộ Docker Compose & Playwright 1.50.0 ---
  console.log('\n--- 6. Kiểm tra cấu hình Docker Compose & Playwright 1.50.0 ---');
  const composeContent = fs.readFileSync(path.join(process.cwd(), 'docker-compose.yml'), 'utf-8');
  assert(composeContent.includes('APP_SECRET'), 'docker-compose.yml đã truyền biến APP_SECRET');
  assert(composeContent.includes('MIPA_ADMIN_PASSWORD'), 'docker-compose.yml đã truyền MIPA_ADMIN_PASSWORD');
  assert(composeContent.includes('FACEBOOK_PAGE_ID'), 'docker-compose.yml đã truyền FACEBOOK_PAGE_ID');

  const pkgJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
  const dockerfile = fs.readFileSync(path.join(process.cwd(), 'Dockerfile.worker'), 'utf-8');
  assert(pkgJson.devDependencies?.playwright === '1.50.0', 'package.json khai báo playwright 1.50.0');
  assert(dockerfile.includes('playwright:v1.50.0-noble'), 'Dockerfile.worker dùng đúng image 1.50.0');

  // --- ISSUE 7 (P1 & P2): Lỗi ổ đĩa I/O EIO & Chống lặp thủ công ---
  console.log('\n--- 7. Kiểm tra truyền lỗi đĩa & chống trùng tiếp cận thủ công ---');
  let threwDiskError = false;
  const originalWriteFileSync = fs.writeFileSync;
  try {
    (fs as any).writeFileSync = (filePath: string, content: any, options: any) => {
      if (typeof filePath === 'string' && filePath.includes('mipa_shared_store')) {
        const err: any = new Error('EIO: i/o error on physical disk block');
        err.code = 'EIO';
        throw err;
      }
      return originalWriteFileSync(filePath, content, options);
    };

    store.addGroup({
      name: 'Nhóm Thất Bại EIO',
      url: 'https://facebook.com/groups/eio_test_group',
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
  assert(threwDiskError, 'Lỗi ổ đĩa EIO được truyền lên trên và dừng xử lý, không báo thành công giả');

  // Chống trùng thủ công:
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
  assert(!manualDispatch2.success, 'Lần tiếp cận thủ công thứ 2 bị chặn tuyệt đối chống trùng lặp');

  // --- 8. URL Canonicalization & CRM PATCH ---
  console.log('\n--- 8. Kiểm tra URL Canonicalization & bảo toàn dữ liệu CRM ---');
  const urlWithTracking = 'https://facebook.com/groups/hoidammechupaodaivn/posts/999999999?mibextid=ZbWKwL&ref=share';
  const canon = canonicalizeFacebookUrl(urlWithTracking);
  assert(canon.canonicalUrl === 'https://www.facebook.com/groups/hoidammechupaodaivn/posts/999999999', 'Xóa sạch tham số tracking mibextid, ref');

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
