import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { classifyPostContent } from '@/lib/classifier';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const groups = store.getGroups();
    const services = store.getServices();
    const templates = store.getTemplates();
    const targetGroup = groups[0] || { id: 'grp-01', name: 'Hội Chụp Ảnh Áo Dài Sài Gòn' };

    const sampleSimulatedData = [
      {
        author: 'Nguyễn Bích Ngọc',
        text: 'Cần tìm thợ chụp áo dài ở quận 1, chủ nhật này, hai người. Muốn có người hỗ trợ tạo dáng vì hai chị em mình ít khi chụp ảnh truyền thống.',
        intent: 'Áo dài Q1 kèm hỗ trợ tạo dáng',
      },
      {
        author: 'Phạm Minh Trí',
        text: 'Em cần thanh lý combo body Canon R6 fullbox 10k shot + lens 24-70 f2.8 ii, bác nào cần gdtt trực tiếp tại Q10 nhé.',
        intent: 'Rao bán máy ảnh (sẽ bị lọc tự động)',
      },
      {
        author: 'Thanh Thư',
        text: 'Thứ 7 tuần này mình muốn book lịch chụp 1 bộ concept nàng thơ vintage hoa cỏ trong studio ở Bình Thạnh, đã có sẵn đồ chỉ cần thợ có tâm và makeup nhẹ nhàng ạ!',
        intent: 'Concept Nàng thơ Studio',
      }
    ];

    const results = [];
    for (const item of sampleSimulatedData) {
      const { post, isNew } = store.addPostIfNew({
        group_id: targetGroup.id,
        group_name: targetGroup.name,
        post_url: `https://facebook.com/groups/mipa/posts/${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        author_name: item.author,
        content_raw: item.text,
      });

      if (isNew) {
        const classification = classifyPostContent(post.content_raw, services, templates);
        post.classification = {
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
          review_status: classification.intent === 'looking_for_service' ? 'pending_review' : 'dismissed',
        };
        results.push(post);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Đã mô phỏng quét thành công ${results.length} bài viết mới từ nhóm "${targetGroup.name}".`,
      data: results,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
