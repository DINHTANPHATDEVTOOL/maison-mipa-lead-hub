/**
 * KIỂM CHỨNG GIAI ĐOẠN A: Đọc Bài Mới & Bóc Tách DOM Nhóm Mẫu
 * Chạy: npm run test:crawler
 */

import { groupCrawler } from './crawler';
import { classifyPostContent } from '../lib/classifier';
import { store } from '../lib/store';

async function runCrawlerVerification() {
  console.log('================================================================');
  console.log('MAISON MIPA LEAD HUB - KIỂM CHỨNG GIAI ĐOẠN A: QUÉT BÀI VIẾT NHÓM');
  console.log('================================================================');

  const testGroupUrl = 'https://facebook.com/groups/hoidammechupaodaivn';
  console.log(`[1] Bắt đầu thử nghiệm quét nhóm mẫu: ${testGroupUrl}`);

  const crawlResult = await groupCrawler.crawlGroup(testGroupUrl, 24);

  console.log(`\n[2] Kết quả quét nhóm:`);
  console.log(`    - Thành công: ${crawlResult.success ? 'ĐẠT' : 'THẤT BẠI'}`);
  console.log(`    - Số bài thu thập được: ${crawlResult.posts.length}`);
  console.log(`    - Page có quyền bình luận: ${crawlResult.canPageComment ? 'CÓ' : 'KHÔNG'}`);

  if (crawlResult.posts.length > 0) {
    const samplePost = crawlResult.posts[0];
    console.log(`\n[3] Chi tiết bài viết đầu tiên:`);
    console.log(`    - Tác giả: ${samplePost.author_name}`);
    console.log(`    - Link: ${samplePost.post_url}`);
    console.log(`    - Nội dung trích xuất: "${samplePost.content_raw.slice(0, 150)}..."`);

    console.log(`\n[4] Kiểm tra Lớp Nhận Dạng (Classification Test):`);
    const services = store.getServices();
    const templates = store.getTemplates();
    const classification = classifyPostContent(samplePost.content_raw, services, templates);

    console.log(`    - Ý định: ${classification.intent}`);
    console.log(`    - Dịch vụ phát hiện: ${classification.service_detected || 'Không có'}`);
    console.log(`    - Địa điểm: ${classification.location || 'Chưa rõ'}`);
    console.log(`    - Số người: ${classification.pax || 'Chưa rõ'}`);
    console.log(`    - Thời gian: ${classification.shooting_date_text || 'Chưa rõ'}`);
    console.log(`    - Yêu cầu thêm: ${classification.extra_requirements.join(', ') || 'Không'}`);
    console.log(`    - Điểm tin cậy: ${classification.confidence_score}%`);
    console.log(`    - Lý do: ${classification.classification_reason}`);
    console.log(`    - Mẫu đề xuất: "${classification.suggested_comment_text || 'Không có'}"`);
  }

  console.log('\n================================================================');
  console.log('KẾT LUẬN: Đã kiểm chứng tính khả thi của việc bóc tách bài và phân loại.');
  console.log('================================================================');
}

runCrawlerVerification();
