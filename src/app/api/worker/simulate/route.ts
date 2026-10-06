import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { classifyPostContent } from '@/lib/classifier';
import { verifyAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const auth = await verifyAuth(req, ['admin']);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const allowSimulation = searchParams.get('allow_simulation') === 'true' || process.env.DEMO_MODE === 'true';

    if (!allowSimulation) {
      return NextResponse.json({
        success: false,
        error: 'Chế độ mô phỏng (Demo Simulation) đang bị khóa trong môi trường vận hành thực tế. Thêm ?allow_simulation=true hoặc cấu hình DEMO_MODE=true để bật thử nghiệm.',
      }, { status: 403 });
    }

    const groups = store.getGroups();
    const services = store.getServices();
    const templates = store.getTemplates();
    const targetGroup = groups[0] || { id: 'grp-01', name: 'Hội Chụp Ảnh Áo Dài Sài Gòn' };

    const sampleSimulatedData = [
      {
        author: '[MÔ PHỎNG] Nguyễn Bích Ngọc',
        text: 'Cần tìm thợ chụp áo dài ở quận 1, chủ nhật này, hai người. Muốn có người hỗ trợ tạo dáng vì hai chị em mình ít khi chụp ảnh truyền thống.',
        intent: 'Áo dài Q1 kèm hỗ trợ tạo dáng',
      },
      {
        author: '[MÔ PHỎNG] Phạm Minh Trí',
        text: 'Em cần thanh lý combo body Canon R6 fullbox 10k shot + bán lens 24-70 f2.8 ii, bác nào cần gdtt trực tiếp tại Q10 nhé.',
        intent: 'Rao bán máy ảnh (sẽ bị lọc tự động)',
      },
      {
        author: '[MÔ PHỎNG] Thanh Thư',
        text: 'Thứ 7 tuần này mình muốn book lịch chụp 1 bộ concept nàng thơ vintage hoa cỏ trong studio ở Bình Thạnh, đã có sẵn đồ chỉ cần thợ có tâm và makeup nhẹ nhàng ạ!',
        intent: 'Concept Nàng thơ Studio',
      }
    ];

    const results = [];
    for (const item of sampleSimulatedData) {
      const { post, isNew } = store.addPostIfNew({
        group_id: targetGroup.id,
        group_name: targetGroup.name,
        facebook_post_id: `sim_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        post_url: `https://facebook.com/groups/mipa-demo/posts/${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        author_name: item.author,
        content_raw: item.text,
      });

      if (isNew) {
        const classification = classifyPostContent(post.content_raw, services, templates);
        store.updatePostClassification(post.id, {
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
        });
        results.push(post);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Đã nạp ${results.length} bài viết mô phỏng kiểm thử vào hệ thống (Được đánh dấu [MÔ PHỎNG]).`,
      data: results,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
