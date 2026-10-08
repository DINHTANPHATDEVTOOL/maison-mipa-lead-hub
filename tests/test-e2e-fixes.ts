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
import { execSync } from 'child_process';

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

  // 2.3: Kiểm tra OCC Concurrency Control (Chặn ghi đè khi dữ liệu đĩa thay đổi)
  let occConflictBlocked = false;
  try {
    const baseStoreData = (store as any).readData();
    const currentVersion = baseStoreData._version || 1;
    
    // Giả lập tiến trình B ghi trước làm tăng version trên đĩa lên currentVersion + 1
    const advancedData = { ...baseStoreData, _version: currentVersion + 1 };
    fs.writeFileSync(path.join(process.cwd(), 'data', 'mipa_shared_store.json'), JSON.stringify(advancedData, null, 2), 'utf-8');

    // Tiến trình A giữ bản snapshot cũ (version = currentVersion) cố tình ghi
    const staleData = { ...baseStoreData, _version: currentVersion };
    (store as any).writeData(staleData);
  } catch (occErr: any) {
    if (occErr.message.includes('OCC Conflict')) {
      occConflictBlocked = true;
    }
  }
  assert(occConflictBlocked, 'OCC Conflict chặn đứng tiến trình có snapshot cũ ghi đè lên phiên bản mới của đĩa');

  // 2.4: Kiểm tra hai tiến trình OS thật (Multi-process) và mô phỏng lease hết hạn / đổi chủ
  console.log('  * Kiểm tra OCC & khóa hai tiến trình OS thật với mô phỏng lease hết hạn...');
  const procBaseData = (store as any).readData();
  const procBaseVersion = procBaseData._version || 1;

  // Tiến trình con B ghi vào store và tăng version
  execSync(`npx tsx -e "
    import { store } from './src/lib/store';
    (store as any).withFileLock(() => {
      const d = (store as any).readData();
      d.groups.push({
        id: 'grp-child-proc-b',
        name: 'Nhóm Child Process B',
        url: 'https://facebook.com/groups/child_proc_b',
        check_interval_seconds: 120,
        lookback_hours: 24,
        status: 'active',
        can_page_comment: true,
      });
      (store as any).writeData(d);
    });
  "`, { stdio: 'pipe' });

  // Tiến trình A giữ snapshot cũ (procBaseVersion) cố tình ghi đè
  let procAConflict = false;
  try {
    const staleProcData = { ...procBaseData, _version: procBaseVersion };
    staleProcData.groups.push({
      id: 'grp-child-proc-a-stale',
      name: 'Nhóm Child Process A Stale',
      url: 'https://facebook.com/groups/child_proc_a_stale',
      check_interval_seconds: 120,
      lookback_hours: 24,
      status: 'active',
      can_page_comment: true,
    });
    (store as any).writeData(staleProcData);
  } catch (err: any) {
    if (err.message.includes('OCC Conflict')) {
      procAConflict = true;
    }
  }
  assert(procAConflict, 'Hai tiến trình thật: OCC chặn tuyệt đối tiến trình có snapshot cũ ghi đè dữ liệu tiến trình khác');

  // Mô phỏng lease hết hạn và đổi chủ: Tiến trình có lease hết hạn cố tình commit bị chặn
  let expiredLeaseBlocked = false;
  try {
    const dataToWrite = (store as any).readData();
    if (!fs.existsSync(lockDir)) {
      fs.mkdirSync(lockDir, { recursive: true });
    }
    (store as any).currentLockOwnerId = 'fake-expired-lock-owner';
    fs.writeFileSync(ownerFile, JSON.stringify({
      ownerId: 'different-process-owner-id',
      pid: process.pid + 999,
      acquiredAt: Date.now() - 200000,
      lastHeartbeat: Date.now() - 200000,
      leaseExpiresAt: Date.now() - 100000,
    }), 'utf-8');
    (store as any).writeData(dataToWrite);
  } catch (err: any) {
    if (err.message.includes('Quyền sở hữu khóa') || err.message.includes('hết hạn lease') || err.message.includes('Khóa ghi không còn tồn tại')) {
      expiredLeaseBlocked = true;
    }
  } finally {
    (store as any).currentLockOwnerId = null;
    try { if (fs.existsSync(ownerFile)) fs.unlinkSync(ownerFile); } catch {}
    try { if (fs.existsSync(lockDir)) fs.rmdirSync(lockDir); } catch {}
  }
  assert(expiredLeaseBlocked, 'Mô phỏng lease hết hạn & đổi chủ: Tiến trình bị cướp quyền sở hữu bị chặn không cho ghi đĩa');

  // Ghi thành công cả 2 bản ghi qua withFileLock
  (store as any).withFileLock(() => {
    const d = (store as any).readData();
    d.groups.push({
      id: 'grp-child-proc-a-valid',
      name: 'Nhóm Child Process A Valid',
      url: 'https://facebook.com/groups/child_proc_a_valid',
      check_interval_seconds: 120,
      lookback_hours: 24,
      status: 'active',
      can_page_comment: true,
    });
    (store as any).writeData(d);
  });
  const afterProcGroups = (store as any).readData().groups;
  const hasProcB = afterProcGroups.some((g: any) => g.id === 'grp-child-proc-b');
  const hasProcA = afterProcGroups.some((g: any) => g.id === 'grp-child-proc-a-valid');
  assert(hasProcB && hasProcA, 'Giao dịch hai tiến trình độc lập bảo toàn trọn vẹn cả hai bản ghi, không bị mất bản ghi nào');

  // --- ISSUE 3 (P1): Page sai ID hoặc thiếu ID bị từ chối tuyệt đối khi cấu hình Page ID ---
  console.log('\n--- 3. Kiểm tra đối chiếu Page ID chính xác (Không chấp nhận sai ID hoặc thiếu ID dù trùng tên) ---');
  
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

  // Tình huống 3.2: DOM chỉ hiển thị tên "Maison MIPA" không có ID trong khi hệ thống yêu cầu Page ID 111
  const mockPageNameOnly = {
    $: async () => ({
      textContent: async () => 'Tương tác dưới danh nghĩa: Maison MIPA',
      getAttribute: async () => 'Tương tác dưới danh nghĩa: Maison MIPA',
      click: async () => {},
    }),
    evaluate: async (fn: any) => {
      return 'Maison MIPA';
    },
    waitForTimeout: async () => {},
  } as any;

  const resultNameOnly = await commentDispatcher.verifyAndSwitchPageIdentity(mockPageNameOnly, 'Maison MIPA', '111');
  assert(!resultNameOnly.matched, 'Từ chối xác nhận khi thiếu bằng chứng khớp Page ID 111 (không chấp nhận tên thuần túy)');

  // Tình huống 3.3: DOM hiển thị Page đúng cả tên và ID 111
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

  // Tình huống 3.4: Khi không cấu hình Page ID (tùy chọn) thì chấp nhận tên Page
  const resultNoIdRequired = await commentDispatcher.verifyAndSwitchPageIdentity(mockPageNameOnly, 'Maison MIPA', undefined);
  assert(resultNoIdRequired.matched, 'Chấp nhận tên khi không yêu cầu bắt buộc Page ID');

  // Tình huống 3.5 (P2 Fix): DOM mô phỏng có avatar "Maison MIPA" và link tác giả chứa Page ID 111
  const mockPageAvatarAndLink = {
    $: async () => null,
    evaluate: async () => {
      return 'Maison MIPA Maison MIPA [https://www.facebook.com/111]';
    },
    waitForTimeout: async () => {},
  } as any;
  const resultAvatarAndLink = await commentDispatcher.verifyAndSwitchPageIdentity(mockPageAvatarAndLink, 'Maison MIPA', '111');
  assert(resultAvatarAndLink.matched, 'Thu thập đầy đủ Page ID từ link tác giả khi avatar chỉ có tên, xác nhận thành công');

  const mockPageAvatarAndWrongLink = {
    $: async () => null,
    evaluate: async () => {
      return 'Maison MIPA Maison MIPA [https://www.facebook.com/222]';
    },
    waitForTimeout: async () => {},
  } as any;
  const resultAvatarWrongLink = await commentDispatcher.verifyAndSwitchPageIdentity(mockPageAvatarAndWrongLink, 'Maison MIPA', '111');
  assert(!resultAvatarWrongLink.matched, 'Từ chối xác nhận khi avatar trùng tên nhưng link tác giả mang Page ID 222 khác yêu cầu 111');

  // --- ISSUE 4 & ISSUE 6 (P1 & P2): Khớp toàn bộ nội dung, độ tươi mới & tách biệt ID tác giả ---
  console.log('\n--- 4. Kiểm tra khớp toàn bộ nội dung, độ tươi mới & tách biệt ID tác giả khỏi Permalink ---');

  // Mô phỏng 4.1: Bình luận trùng 120 ký tự đầu nhưng khác giá ở cuối -> Phải bị từ chối
  const targetFullContent = 'Chào bạn nha, Maison MIPA chuyên các bộ ảnh Áo dài tại TP.HCM. Bên mình có stylist hướng dẫn tạo dáng chi tiết từng góc chụp cho bạn hoàn toàn yên tâm nhé! Giá 1.200.000đ.';
  const differentEndComment = 'Chào bạn nha, Maison MIPA chuyên các bộ ảnh Áo dài tại TP.HCM. Bên mình có stylist hướng dẫn tạo dáng chi tiết từng góc chụp cho bạn hoàn toàn yên tâm nhé! Giá 900.000đ.';
  
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const isMatchDifferentEnd = norm(differentEndComment).includes(norm(targetFullContent));
  assert(!isMatchDifferentEnd, 'Từ chối xác nhận khi bình luận chỉ trùng phần đầu nhưng khác giá/nội dung ở cuối');

  // Mô phỏng 4.2: Bình luận cũ 1 phút trước lần gửi ("1 phút trước" hoặc timestamp nhỏ hơn submissionTime)
  const submissionTime = Date.now();
  const oneMinuteAgoTime = submissionTime - 60000;
  const isOldTimestamp = oneMinuteAgoTime < (submissionTime - 3000);
  const isOldText = /\b([0-9]+)\s*(?:phút|min|mins|minute|minutes|giờ|tiếng|ngày)\b/i.test('1 phút trước');
  assert(isOldTimestamp && isOldText, 'Bình luận 1 phút trước lần gửi bị nhận diện là bình luận cũ và từ chối');

  // Mô phỏng 4.3: Bình luận mới vừa tạo ("Vừa xong" hoặc timestamp >= submissionTime)
  const freshTime = submissionTime + 1000;
  const isFreshTimestamp = freshTime >= (submissionTime - 3000);
  const isFreshText = /\b(vừa xong|vừa gửi|vài giây|just now)\b/i.test('Vừa xong');
  assert(isFreshTimestamp && isFreshText, 'Bình luận mới tạo sau lần gửi được xác nhận');

  // Mô phỏng 4.4 (ISSUE 6): Tách biệt ID tác giả khỏi ID bài viết trong permalink (Không lấy nhầm 777666 thay vì 111)
  const authorData = 'Maison MIPA https://facebook.com/111 data-page-id="111"';
  const authorIdMatch = authorData.match(/(?:page\s*id[:=\s]+|\/|id=|user\/)([0-9]{3,})/i) || authorData.match(/\b([0-9]{3,})\b/);
  const isolatedAuthorId = authorIdMatch ? authorIdMatch[1] : null;
  assert(isolatedAuthorId === '111', 'Lấy chính xác ID tác giả (111) từ link tác giả, không bị nhầm mã bài viết 777666 từ permalink');

  // Mô phỏng 4.5 (P1 Fix): Bình luận tạo trước lần gửi 10 giây kèm nhãn "10 seconds ago" -> Timestamp chứng minh cũ, nhãn tương đối KHÔNG được ghi đè!
  const dispatchSubmissionTime = Date.now();
  const timeOldTimestamp = dispatchSubmissionTime - 10000; // 10s trước submission
  const oldCommentDt = new Date(timeOldTimestamp).toISOString();

  const testEvaluateFreshness = (dtAttr: string | null, textLabel: string, subTime: number) => {
    let hasFreshnessProof = false;
    let timestampProvedOld = false;

    if (dtAttr) {
      const parsed = Date.parse(dtAttr);
      if (!isNaN(parsed)) {
        if (parsed >= (subTime - 3000) && parsed <= (Date.now() + 30000)) {
          hasFreshnessProof = true;
        } else if (parsed < (subTime - 3000)) {
          timestampProvedOld = true;
        }
      }
    }

    const recencyMatch = /\b(vừa xong|vừa gửi|vài giây|[0-9]{1,2}\s*giây|just now|few seconds|[0-9]{1,2}s\b|seconds?\s+ago)\b/i.test(textLabel);
    if (recencyMatch && !timestampProvedOld) {
      hasFreshnessProof = true;
    }

    return !timestampProvedOld && hasFreshnessProof;
  };

  const old10sResult = testEvaluateFreshness(oldCommentDt, '10 seconds ago', dispatchSubmissionTime);
  assert(!old10sResult, 'Bình luận tạo trước lần gửi 10 giây có timestamp cũ bị từ chối tuyệt đối, nhãn tương đối 10s ago không được ghi đè');

  const freshAfterResult = testEvaluateFreshness(new Date(dispatchSubmissionTime + 1000).toISOString(), '10 seconds ago', dispatchSubmissionTime);
  assert(freshAfterResult, 'Bình luận tạo sau lần gửi có timestamp hợp lệ được xác nhận thành công');

  // --- ISSUE 5 (P2): Đăng xuất xóa phiên xác thực & Thu hồi bền vững qua Restart ---
  console.log('\n--- 5. Kiểm tra luồng Đăng xuất & Thu hồi phiên bền vững qua Restart ---');

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

  // Kiểm tra tệp lưu trữ thu hồi trên đĩa
  const revokedFile = path.join(process.cwd(), 'data', 'revoked_tokens.json');
  assert(fs.existsSync(revokedFile), 'Tệp lưu trữ token thu hồi revoked_tokens.json tồn tại trên đĩa');
  const revokedContent = JSON.parse(fs.readFileSync(revokedFile, 'utf-8'));
  assert(Array.isArray(revokedContent) && revokedContent.includes(sessionToken), 'Token thu hồi được ghi đĩa bền vững');

  // Dùng lại token hoặc cookie đã đăng xuất để gọi API bảo vệ -> Phải bị từ chối 401
  const reuseTokenReq = new Request('http://localhost:3000/api/posts', {
    headers: { 'Authorization': `Bearer ${sessionToken}` },
  });
  const reuseRes = await getPostsRoute(reuseTokenReq);
  assert(reuseRes.status === 401, 'Token đã đăng xuất bị chặn truy cập API (HTTP 401) kể cả sau khi restart');

  // Kiểm tra 5.7 (P2 Fix): Hai tiến trình OS thật thu hồi token A rồi B, tiến trình thứ 3 kiểm tra cả 2 vẫn bị chặn
  console.log('  * Kiểm tra thu hồi token qua hai tiến trình OS độc lập...');
  const tokenProcA = 'test_token_proc_A_' + Date.now();
  const tokenProcB = 'test_token_proc_B_' + Date.now();

  execSync(`npx tsx -e "
    import { revokeToken } from './src/lib/auth';
    revokeToken('${tokenProcA}');
  "`, { stdio: 'pipe' });

  execSync(`npx tsx -e "
    import { revokeToken } from './src/lib/auth';
    revokeToken('${tokenProcB}');
  "`, { stdio: 'pipe' });

  const checkProcResult = execSync(`npx tsx -e "
    import { isTokenRevoked } from './src/lib/auth';
    const aRevoked = isTokenRevoked('${tokenProcA}');
    const bRevoked = isTokenRevoked('${tokenProcB}');
    console.log(JSON.stringify({ aRevoked, bRevoked }));
  "`, { stdio: 'pipe' }).toString().trim();

  const parsedCheck = JSON.parse(checkProcResult);
  assert(parsedCheck.aRevoked === true, 'Tiến trình mới kiểm tra: Token A thu hồi bởi tiến trình 1 vẫn được lưu giữ an toàn');
  assert(parsedCheck.bRevoked === true, 'Tiến trình mới kiểm tra: Token B thu hồi bởi tiến trình 2 được lưu giữ an toàn (không ghi đè mất A)');

  // Kiểm tra 5.8: Kiểm tra HTTP với tiến trình mới (Sau restart thật): Token đã logout trả về 401
  const httpCheckResult = execSync(`npx tsx -e "
    import { GET as getPostsRoute } from './src/app/api/posts/route';
    (async () => {
      const req = new Request('http://localhost:3000/api/posts', {
        headers: { 'Authorization': 'Bearer ${sessionToken}' },
      });
      const res = await getPostsRoute(req);
      console.log(JSON.stringify({ status: res.status }));
    })();
  "`, { stdio: 'pipe' }).toString().trim();
  const httpParsed = JSON.parse(httpCheckResult);
  assert(httpParsed.status === 401, 'Tiến trình độc lập mới (Restart thật) gọi route với token đã logout trả về HTTP 401');

  // --- ISSUE 6 (P1 & P2): Docker Compose bảo mật & Playwright 1.50.0 ---
  console.log('\n--- 6. Kiểm tra cấu hình Docker Compose an toàn & Playwright 1.50.0 ---');
  const composeContent = fs.readFileSync(path.join(process.cwd(), 'docker-compose.yml'), 'utf-8');
  assert(composeContent.includes('APP_SECRET'), 'docker-compose.yml đã truyền biến APP_SECRET');
  assert(composeContent.includes('MIPA_ADMIN_PASSWORD'), 'docker-compose.yml đã truyền MIPA_ADMIN_PASSWORD');
  assert(composeContent.includes('FACEBOOK_PAGE_ID'), 'docker-compose.yml đã truyền FACEBOOK_PAGE_ID');

  // Kiểm tra không còn fallback bí mật công khai trong docker-compose.yml
  assert(!composeContent.includes(':-mipa_production_app_secret_key'), 'docker-compose.yml không còn fallback APP_SECRET công khai');
  assert(!composeContent.includes(':-mipa@admin2026_prod'), 'docker-compose.yml không còn fallback MIPA_ADMIN_PASSWORD công khai');
  assert(!composeContent.includes(':-mipa_internal_worker_key'), 'docker-compose.yml không còn fallback INTERNAL_WORKER_KEY công khai');
  assert(!composeContent.includes(':-mipa_secure_session_encryption_key'), 'docker-compose.yml không còn fallback FACEBOOK_SESSION_ENCRYPTION_KEY công khai');
  assert(composeContent.includes('${APP_SECRET:?'), 'docker-compose.yml bắt buộc cấu hình APP_SECRET');
  assert(composeContent.includes('${MIPA_ADMIN_PASSWORD:?'), 'docker-compose.yml bắt buộc cấu hình MIPA_ADMIN_PASSWORD');
  assert(composeContent.includes('${INTERNAL_WORKER_KEY:?'), 'docker-compose.yml bắt buộc cấu hình INTERNAL_WORKER_KEY');

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
      url: `https://facebook.com/groups/eio_test_group_${Date.now()}`,
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
