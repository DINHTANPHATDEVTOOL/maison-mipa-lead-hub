import '../lib/env';
import { groupCrawler } from './crawler';
import { authManager } from './auth';
import { classifyPostContent } from '../lib/classifier';
import { store } from '../lib/store';

async function runCrawlerVerification() {
  console.log('================================================================');
  console.log('MAISON MIPA LEAD HUB - KIỂM CHỨNG GIAI ĐOẠN A: QUÉT BÀI VIẾT NHÓM');
  console.log('================================================================');

  const sessionSummary = authManager.getSessionSummary();
  if (!sessionSummary.exists || !sessionSummary.valid) {
    console.log('[KẾT QUẢ]: THẤT BẠI - CHƯA CÓ PHIÊN ĐĂNG NHẬP FACEBOOK THẬT');
    console.log(`Lý do: ${sessionSummary.reason || 'Thiếu file storageState'}`);
    console.log('Hệ thống từ chối tạo bài giả để báo khả thi ảo.');
    console.log('Vui lòng cung cấp storageState hợp lệ vào: data/auth/facebook_storage_state.json');
    console.log('================================================================');
    return;
  }

  const configuredGroups = store.getGroups();
  const testGroupUrl = configuredGroups.length > 0 ? configuredGroups[0].url : 'https://facebook.com/groups/thochupanhhochiminh';
  console.log(`[1] Bắt đầu thử nghiệm quét nhóm mẫu: ${testGroupUrl}`);

  const crawlResult = await groupCrawler.crawlGroup(testGroupUrl, 24);

  console.log(`\n[2] Kết quả quét nhóm:`);
  console.log(`    - Thành công: ${crawlResult.success ? 'ĐẠT' : 'THẤT BẠI'}`);
  console.log(`    - Số bài thu thập được: ${crawlResult.posts.length}`);
  console.log(`    - Page có quyền bình luận: ${crawlResult.canPageComment ? 'CÓ' : 'KHÔNG'}`);

  if (!crawlResult.success) {
    console.log(`    - Lỗi: ${crawlResult.error}`);
    console.log('\n================================================================');
    console.log('KẾT LUẬN: Chưa thể quét nhóm thực tế do lỗi mạng hoặc tài khoản.');
    console.log('================================================================');
    return;
  }

  if (crawlResult.posts.length > 0) {
    const samplePost = crawlResult.posts[0];
    console.log(`\n[3] Chi tiết bài viết đầu tiên:`);
    console.log(`    - Tác giả: ${samplePost.author_name}`);
    console.log(`    - Link: ${samplePost.post_url}`);
    console.log(`    - Thời gian: ${samplePost.posted_at}`);
    console.log(`    - Nội dung trích xuất: "${samplePost.content_raw.slice(0, 150)}..."`);

    console.log(`\n[4] Kiểm tra Lớp Nhận Dạng (Classification Test):`);
    const services = store.getServices();
    const templates = store.getTemplates();
    const classification = classifyPostContent(samplePost.content_raw, services, templates, samplePost.posted_at);

    console.log(`    - Ý định: ${classification.intent}`);
    console.log(`    - Dịch vụ phát hiện: ${classification.service_detected || 'Không có'}`);
    console.log(`    - Địa điểm: ${classification.location || 'Chưa rõ'}`);
    console.log(`    - Số người: ${classification.pax || 'Chưa rõ'}`);
    console.log(`    - Thời gian: ${classification.shooting_date_text || 'Chưa rõ'}`);
    console.log(`    - Yêu cầu thêm: ${classification.extra_requirements.join(', ') || 'Không'}`);
    console.log(`    - Điểm tin cậy: ${classification.confidence_score}%`);
    console.log(`    - Lý do: ${classification.classification_reason}`);
    console.log(`    - Mẫu đề xuất: "${classification.suggested_comment_text || 'Không có'}"`);

    console.log('\n================================================================');
    console.log('KẾT LUẬN: Đã bóc tách thành công từ Facebook thực tế.');
    console.log('================================================================');
  } else {
    console.log('\n================================================================');
    console.log('KẾT LUẬN: Quét thành công nhưng không tìm thấy bài viết mới trong khoảng thời gian quy định.');
    console.log('================================================================');
  }
}

runCrawlerVerification();
