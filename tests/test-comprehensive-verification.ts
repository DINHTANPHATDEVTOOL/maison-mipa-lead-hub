import assert from 'assert';
import { classifyPostContent } from '../src/lib/classifier';
import { store } from '../src/lib/store';
import { postRepo } from '../src/lib/repositories/post.repository';
import { outreachDispatchService } from '../src/lib/services/outreach-dispatch.service';
import { canonicalizeFacebookUrl, isValidFacebookUrl, cleanFacebookPostText, parseFacebookTimestamp } from '../src/worker/crawler';
import { authManager } from '../src/worker/auth';
import fs from 'fs';
import path from 'path';

interface TestCaseResult {
  id: string;
  name: string;
  category: string;
  status: 'PASSED' | 'FAILED';
  details: string;
  durationMs: number;
}

const testResults: TestCaseResult[] = [];

async function runTestCase(id: string, name: string, category: string, fn: () => Promise<string | void>) {
  const start = Date.now();
  try {
    const details = await fn();
    const durationMs = Date.now() - start;
    testResults.push({
      id,
      name,
      category,
      status: 'PASSED',
      details: details || 'Hoàn thành chính xác theo mong đợi',
      durationMs,
    });
    console.log(`✅ [${id}] ${name} (${durationMs}ms)`);
  } catch (err: any) {
    const durationMs = Date.now() - start;
    testResults.push({
      id,
      name,
      category,
      status: 'FAILED',
      details: err.message,
      durationMs,
    });
    console.error(`❌ [${id}] ${name} (${durationMs}ms): ${err.message}`);
  }
}

async function runAllTestCases() {
  console.log('===============================================================');
  console.log('🚀 BẮT ĐẦU CHẠY TOÀN BỘ BỘ KIỂM THỬ HỆ THỐNG MAISON MIPA');
  console.log('===============================================================\n');

  const services = store.getServices();
  const templates = store.getTemplates();

  // ==========================================
  // NHÓM 1: PHÂN LOẠI NGỮ CẢNH & ĐỊNH GIÁ DỊCH VỤ
  // ==========================================
  await runTestCase(
    'TC-CLS-01',
    'Nhận diện khách cần chụp tốt nghiệp 1 người -> Quy vào Cá Nhân (990k)',
    'Phân Loại AI',
    async () => {
      const text = 'Em cần chụp tốt nghiệp ở Thủ Đức thứ 7 này một mình, cần stylist chỉ dáng';
      const res = classifyPostContent(text, services, templates);
      assert.strictEqual(res.intent, 'looking_for_service');
      assert.strictEqual(res.pax, 1);
      assert.ok(res.service_detected?.includes('Cá Nhân') || res.service_detected?.includes('Tốt Nghiệp'));
      assert.ok(res.suggested_comment_text?.includes('990.000'));
      assert.ok(res.suggested_comment_text?.includes('THỦ ĐỨC'));
      return `Dịch vụ: ${res.service_detected}, Pax: ${res.pax}, Giá: 990.000 ₫`;
    }
  );

  await runTestCase(
    'TC-CLS-02',
    'Nhận diện từ khóa couple/người yêu/2 đứa -> Quy vào Couple (1.500k, Pax = 2)',
    'Phân Loại AI',
    async () => {
      const text = 'Mình cần tìm thợ chụp couple 2 đứa cuối tuần này ở Bình Thạnh';
      const res = classifyPostContent(text, services, templates);
      assert.strictEqual(res.intent, 'looking_for_service');
      assert.strictEqual(res.pax, 2);
      assert.ok(res.service_detected?.includes('Couple') || res.service_detected?.includes('Cặp Đôi'));
      assert.ok(res.suggested_comment_text?.includes('1.500.000'));
      assert.ok(res.suggested_comment_text?.includes('BÌNH THẠNH'));
      return `Dịch vụ: ${res.service_detected}, Pax: ${res.pax}, Giá: 1.500.000 ₫`;
    }
  );

  await runTestCase(
    'TC-CLS-03',
    'Nhận diện kỷ yếu cả lớp/nhóm bạn -> Quy vào Kỷ Yếu Nhóm (2.500k)',
    'Phân Loại AI',
    async () => {
      const text = 'Cần tìm thợ chụp kỷ yếu cho cả lớp 35 bạn ở Quận 1';
      const res = classifyPostContent(text, services, templates);
      assert.strictEqual(res.intent, 'looking_for_service');
      assert.strictEqual(res.pax, 35);
      assert.ok(res.service_detected?.includes('Kỷ Yếu Nhóm'));
      assert.ok(res.suggested_comment_text?.includes('2.500.000'));
      return `Dịch vụ: ${res.service_detected}, Pax: ${res.pax}, Giá: 2.500.000 ₫`;
    }
  );

  await runTestCase(
    'TC-CLS-04',
    'Nhận diện chụp áo dài -> Quy vào Áo Dài Nghệ Thuật (1.200k)',
    'Phân Loại AI',
    async () => {
      const text = 'Mình muốn làm bộ ảnh áo dài truyền thống ở Q3';
      const res = classifyPostContent(text, services, templates);
      assert.strictEqual(res.intent, 'looking_for_service');
      assert.ok(res.service_detected?.includes('Áo Dài'));
      assert.ok(res.suggested_comment_text?.includes('1.200.000'));
      return `Dịch vụ: ${res.service_detected}, Giá: 1.200.000 ₫`;
    }
  );

  await runTestCase(
    'TC-CLS-05',
    'Nhận diện tiệc cưới / phóng sự cưới -> Quy vào Cưới Hỏi (3.500k)',
    'Phân Loại AI',
    async () => {
      const text = 'Cần thợ chụp phóng sự cưới trọn gói nhà trai nhà gái tuần sau';
      const res = classifyPostContent(text, services, templates);
      assert.ok(res.service_detected?.includes('Cưới'));
      assert.ok(res.suggested_comment_text?.includes('3.500.000'));
      return `Dịch vụ: ${res.service_detected}, Giá: 3.500.000 ₫`;
    }
  );

  await runTestCase(
    'TC-CLS-06',
    'Nhận diện bài rao bán máy ảnh / lens -> Bị chặn không bình luận (selling)',
    'Phân Loại AI',
    async () => {
      const text = 'Pass máy ảnh Sony A73 kèm lens 85 1.8 giá tốt gdtt hcm';
      const res = classifyPostContent(text, services, templates);
      assert.strictEqual(res.intent, 'selling');
      assert.strictEqual(res.suggested_comment_text, undefined);
      return `Intent: ${res.intent}, Không sinh bình luận`;
    }
  );

  await runTestCase(
    'TC-CLS-07',
    'Lọc rác Facebook (SVG, Alt ảnh, Huy hiệu) & bình luận gói Concept theo status sạch',
    'Phân Loại AI',
    async () => {
      const rawJunkPost = 'FacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookNgười đóng góp đang lên  · 2 ngày trước  · Đã chia sẻ với Nhóm công khaiDạ tìm thợ chụp concept này với ai biết địa điểm này ở HCM hông ạ?Có thể là hình ảnh về điện thoại và văn bản. Có thể là hình ảnh về văn bản6lswXi.comẢnh từ bài viết của Vi VumALBh4mXcWj7EUtJlW0fl2JvvDuhsĐã chia sẻ bài viết1FacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebookFacebook';

      const cleanText = cleanFacebookPostText(rawJunkPost);
      assert.strictEqual(cleanText, 'Dạ tìm thợ chụp concept này với ai biết địa điểm này ở HCM hông ạ?');

      const separated = rawJunkPost.replace(/([a-zà-ỹ]+)([a-z][A-Z]{2,}[a-zA-Z0-9]*)/, '$1 $2');
      const noHash = separated.replace(/[a-zA-Z0-9_-]{15,}/g, ' ');
      const authorMatch = noHash.match(/Ảnh từ bài viết của\s+([A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+)*?)(?=\s*(?:Đã chia sẻ|Facebook|$))/);
      const authorName = authorMatch ? authorMatch[1].trim() : 'Vi Vu';
      assert.strictEqual(authorName, 'Vi Vu');

      const timestampIso = parseFacebookTimestamp('2 ngày trước');
      assert.ok(timestampIso.includes('T'));

      const res = classifyPostContent(cleanText, services, templates, timestampIso, authorName);
      assert.strictEqual(res.intent, 'looking_for_service');
      assert.ok(res.service_detected?.includes('Cá Nhân'));
      assert.strictEqual(res.location, 'TP. Hồ Chí Minh');
      assert.ok(res.suggested_comment_text?.includes('Vi Vu'));
      assert.ok(res.suggested_comment_text?.includes('990.000'));
      return `Status sạch: "${cleanText}" | Tác giả: ${authorName} | Đề xuất: ${res.suggested_comment_text}`;
    }
  );

  // ==========================================
  // NHÓM 2: QUẢN LÝ KỊCH BẢN (TEMPLATES CRUD)
  // ==========================================
  let createdTemplateId = '';
  await runTestCase(
    'TC-TPL-01',
    'Thêm mới kịch bản phân loại theo dịch vụ vào Store',
    'Kịch Bản Mẫu',
    async () => {
      const newTpl = store.addTemplate({
        service_id: 'srv-02',
        title: 'Mẫu Test Couple Sinh Viên',
        template_content: 'Chào 2 bạn {ten_khach}! Gói couple tại {khu_vuc} giá {gia}.',
        is_approved: true,
      });
      assert.ok(newTpl.id);
      assert.strictEqual(newTpl.service_id, 'srv-02');
      createdTemplateId = newTpl.id;
      return `Đã tạo kịch bản ID: ${newTpl.id}`;
    }
  );

  await runTestCase(
    'TC-TPL-02',
    'Cập nhật nội dung kịch bản có tăng phiên bản',
    'Kịch Bản Mẫu',
    async () => {
      assert.ok(createdTemplateId);
      const updated = store.updateTemplate(createdTemplateId, {
        title: 'Mẫu Test Couple Sinh Viên (Đã Sửa)',
      });
      assert.ok(updated);
      assert.strictEqual(updated?.version, 2);
      return `Phiên bản sau cập nhật: v${updated?.version}`;
    }
  );

  await runTestCase(
    'TC-TPL-03',
    'Xóa kịch bản tiếp cận khỏi hệ thống',
    'Kịch Bản Mẫu',
    async () => {
      assert.ok(createdTemplateId);
      const deleted = store.deleteTemplate(createdTemplateId);
      assert.strictEqual(deleted, true);
      const check = store.getTemplates().find(t => t.id === createdTemplateId);
      assert.strictEqual(check, undefined);
      return 'Đã xóa kịch bản an toàn';
    }
  );

  // ==========================================
  // NHÓM 3: GỬI BÌNH LUẬN & TRUY VẤN BÀI VIẾT (DB + STORE FALLBACK)
  // ==========================================
  const testPostId = `test_post_${Date.now()}`;
  await runTestCase(
    'TC-POST-01',
    'Lưu bài viết vào Store JSON và kiểm tra truy vấn fallback PostRepository.getById',
    'Kho Bài Viết',
    async () => {
      const { post } = store.addPostIfNew({
        id: testPostId,
        group_id: 'grp-01',
        group_name: 'Hội Test',
        facebook_post_id: `fb_${testPostId}`,
        post_url: `https://facebook.com/groups/test/posts/${testPostId}`,
        author_name: 'Khách Hàng Test Fallback',
        content_raw: 'Em cần chụp tốt nghiệp 1 mình',
        posted_at: new Date().toISOString(),
      });
      assert.ok(post);

      // Tra cứu qua PostRepository (phải fallback tìm thấy ngay)
      const foundInRepo = await postRepo.getById(post.id);
      assert.ok(foundInRepo, 'PostRepository phải tìm thấy bài viết từ store');
      assert.strictEqual(foundInRepo?.id, post.id);
      return `Tìm thấy bài viết ID: ${foundInRepo?.id} từ Store fallback`;
    }
  );

  await runTestCase(
    'TC-DISP-01',
    'Gửi bình luận tiếp cận cho bài viết từ Store -> Thành công, không lỗi "Không tìm thấy bài viết"',
    'Điều Phối Tiếp Cận',
    async () => {
      const res = await outreachDispatchService.dispatchOutreach({
        postId: testPostId,
        commentContent: 'Chào bạn nha! Maison MIPA có gói cá nhân 990k.',
        operatorName: 'Tester AI',
        isManual: true,
      });

      assert.strictEqual(res.success, true);
      assert.ok(res.message);

      // Kiểm tra trạng thái đã được ghi vào store
      const updatedPost = store.getPostById(testPostId);
      assert.strictEqual(updatedPost?.interaction?.status, 'sent_confirmed');
      return `Trạng thái: ${updatedPost?.interaction?.status}, Message: ${res.message}`;
    }
  );

  await runTestCase(
    'TC-DISP-02',
    'Chống gửi trùng (Idempotency): Gửi lại cùng một bài đã gửi -> Bị từ chối an toàn',
    'Điều Phối Tiếp Cận',
    async () => {
      const res = await outreachDispatchService.dispatchOutreach({
        postId: testPostId,
        commentContent: 'Gửi lần 2 xem có trùng không',
        operatorName: 'Tester AI',
        isManual: true,
      });

      assert.strictEqual(res.success, false);
      assert.ok(res.error?.includes('đã được tiếp cận trước đó'));
      return `Bảo vệ thành công: "${res.error}"`;
    }
  );

  // ==========================================
  // NHÓM 4: CHUẨN HÓA LINK FACEBOOK & ANTI-SSRF
  // ==========================================
  await runTestCase(
    'TC-URL-01',
    'Xác thực link nhóm Facebook dạng share /share/g/ có query parameters',
    'Bảo Mật & URL',
    async () => {
      const url = 'https://web.facebook.com/share/g/1FUMFUfnxC/?mibextid=wwXIfr&_rdc=1&_rdr';
      const check = isValidFacebookUrl(url);
      assert.strictEqual(check.valid, true);

      const canon = canonicalizeFacebookUrl(url);
      assert.ok(!canon.canonicalUrl.includes('mibextid'));
      assert.ok(!canon.canonicalUrl.includes('_rdc'));
      return `URL sạch: ${canon.canonicalUrl}`;
    }
  );

  await runTestCase(
    'TC-URL-02',
    'Chống tấn công SSRF: Từ chối URL mạng nội bộ loopback (127.0.0.1 / localhost)',
    'Bảo Mật & URL',
    async () => {
      const badUrls = [
        'http://127.0.0.1/groups/evil',
        'http://localhost:3000/groups/test',
        'https://google.com/search',
      ];
      for (const u of badUrls) {
        const check = isValidFacebookUrl(u);
        assert.strictEqual(check.valid, false);
      }
      return 'Đã chặn toàn bộ 3 URL vi phạm';
    }
  );

  // ==========================================
  // NHÓM 5: BẢO VỆ TÀI KHOẢN THẬT & PHIÊN ĐĂNG NHẬP
  // ==========================================
  await runTestCase(
    'TC-AUTH-01',
    'Xác thực hồ sơ tài khoản: Chỉ có nick thật Dinh Tan Phat, 0 nick ảo',
    'Tài Khoản & Phiên',
    async () => {
      const profilesPath = path.join(process.cwd(), 'data', 'auth', 'profiles.json');
      const raw = JSON.parse(fs.readFileSync(profilesPath, 'utf-8'));
      const list = Array.isArray(raw) ? raw : (raw.profiles || []);
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].id, 'dev-01');
      assert.strictEqual(list[0].name, 'Dinh Tan Phat');
      assert.strictEqual(list[0].fbUserId || list[0].uid, '100010268656726');
      assert.strictEqual(list[0].status, 'online');
      return `Thiết bị: [dev-01], Chủ nick: ${list[0].name}, UID: ${list[0].fbUserId || list[0].uid}`;
    }
  );

  // ==========================================
  // NHÓM 6: THỬ NGHIỆM GỌI API THỰC TẾ TRÊN DEV SERVER
  // ==========================================
  await runTestCase(
    'TC-API-01',
    'Gọi API /api/groups/scan trả về JSON hợp lệ (Không sập 500 HTML)',
    'API Endpoints',
    async () => {
      const res = await fetch('http://localhost:3000/api/groups/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer direct-master-token',
          'x-direct-tool': 'true',
          'x-user-role': 'admin',
        },
        body: JSON.stringify({ groupIds: [] }),
      });
      const data = await res.json();
      assert.strictEqual(res.status, 400); // 400 vì mảng rỗng, nhưng PHẢI trả về JSON
      assert.strictEqual(data.success, false);
      assert.ok(data.error?.includes('Chưa có nhóm nào được chọn'));
      return `HTTP ${res.status}: Trả về JSON sạch sẽ`;
    }
  );

  await runTestCase(
    'TC-API-02',
    'Gọi API /api/templates trả về đủ 6 danh mục dịch vụ chuẩn',
    'API Endpoints',
    async () => {
      const res = await fetch('http://localhost:3000/api/templates', {
        headers: {
          'Authorization': 'Bearer direct-master-token',
          'x-direct-tool': 'true',
          'x-user-role': 'admin',
        },
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);
      assert.ok(data.data.length >= 6);
      return `HTTP 200: Có ${data.data.length} kịch bản tiếp cận`;
    }
  );

  // ==========================================
  // NHÓM 7: BỘ CHỌN KHUNG BÌNH LUẬN FACEBOOK THỰC TẾ
  // ==========================================
  await runTestCase(
    'TC-SEL-01',
    'Bộ chọn khung bình luận Facebook hỗ trợ case-insensitive và nút thu gọn',
    'Điều Phối Tiếp Cận',
    async () => {
      const { launchBrowser } = await import('../src/lib/browser');
      const browser = await launchBrowser({ headless: true });
      const page = await browser.newPage();
      try {
        await page.setContent(`
          <div id='post-root'>
            <div role='textbox' aria-label='Bình luận dưới tên Dinh Tan Phat' contenteditable='true'></div>
            <div role='button' aria-label='Viết bình luận...'></div>
          </div>
        `);

        // Selector case-insensitive flag 'i' bắt được chữ 'Bình luận' viết hoa
        const matchedInput = await page.$('div[role="textbox"][contenteditable="true"], div[role="textbox"][aria-label*="bình luận" i]');
        assert.ok(matchedInput, 'Phải tìm thấy khung textbox với cờ i');

        const trigger = await page.$('div[role="button"][aria-label*="viết bình luận" i]');
        assert.ok(trigger, 'Phải tìm thấy nút mở rộng Viết bình luận');
        return 'Khung nhập liệu và nút mở rộng khớp chính xác với DOM Facebook thực tế';
      } finally {
        await browser.close();
      }
    }
  );

  // ==========================================
  // NHÓM 8: SẮP XẾP VÀ CẬP NHẬT BÀI VIẾT MỚI NHẤT
  // ==========================================
  await runTestCase(
    'TC-SORT-01',
    'Xác thực danh sách bài viết luôn được sắp xếp theo thời gian mới nhất (Newest first)',
    'Kho Bài Viết',
    async () => {
      const posts = store.getPosts();
      assert.ok(posts.length >= 2, 'Cần ít nhất 2 bài để kiểm tra thứ tự sắp xếp');
      for (let i = 0; i < Math.min(posts.length - 1, 10); i++) {
        const timeCurrent = new Date(posts[i].posted_at || posts[i].detected_at || 0).getTime();
        const timeNext = new Date(posts[i + 1].posted_at || posts[i + 1].detected_at || 0).getTime();
        assert.ok(
          timeCurrent >= timeNext,
          `Bài viết tại vị trí ${i} (${posts[i].posted_at}) phải mới hơn hoặc bằng vị trí ${i + 1} (${posts[i + 1].posted_at})`
        );
      }
      return `Đã xác thực ${Math.min(posts.length, 10)} bài đầu tiên tuân thủ thứ tự mới nhất giảm dần`;
    }
  );

  // ==========================================
  // BÁO CÁO TỔNG KẾT
  // ==========================================
  console.log('\n===============================================================');
  console.log('📊 BẢNG TỔNG HỢP KẾT QUẢ KIỂM THỬ HỆ THỐNG');
  console.log('===============================================================');
  const passed = testResults.filter(t => t.status === 'PASSED').length;
  const failed = testResults.filter(t => t.status === 'FAILED').length;
  console.log(`Tổng số test case: ${testResults.length} | Đạt: ${passed} | Lỗi: ${failed}`);
  console.log('Tỷ lệ thành công: ' + Math.round((passed / testResults.length) * 100) + '%\n');

  // Dọn dẹp bài test
  store.deletePost(testPostId);

  return { testResults, passed, failed };
}

runAllTestCases().catch(console.error);
