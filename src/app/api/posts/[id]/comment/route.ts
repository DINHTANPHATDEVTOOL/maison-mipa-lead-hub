import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { verifyAuth } from '@/lib/auth';
import { outreachRepo } from '@/lib/repositories/outreach.repository';
import { postRepo } from '@/lib/repositories/post.repository';
import { leadRepo } from '@/lib/repositories/lead.repository';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 1. RBAC Server Check: Only Admin and Marketing can approve & send comments!
    const auth = verifyAuth(req, ['admin', 'marketing']);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const commentContent = body.comment_content;
    const operatorName = body.operator_name || auth.user?.name || 'Marketing Maison MIPA';
    const isManualAssisted = body.is_manual_assisted === true;
    const manualProofUrl = body.manual_proof_url;

    if (!commentContent || typeof commentContent !== 'string' || !commentContent.trim()) {
      return NextResponse.json({ success: false, error: 'Nội dung bình luận không được để trống' }, { status: 400 });
    }

    // 2. Database First-Touch Check & Claim via OutreachRepository
    const existingOutreach = await outreachRepo.getByPostId(params.id).catch(() => null);
    if (existingOutreach && (existingOutreach.status === 'sent_confirmed' || existingOutreach.status === 'manual_assisted')) {
      const method = existingOutreach.status === 'manual_assisted' ? 'Tiếp cận thủ công' : 'Đã gửi qua Page';
      return NextResponse.json({
        success: false,
        error: `Bài viết này đã được tiếp cận trước đó (${method}). Khóa an toàn chống gửi trùng lặp!`,
        interaction: existingOutreach,
      }, { status: 400 });
    }

    // 3. CASE A: Manual Assisted Mode
    if (isManualAssisted) {
      const claimResult = await outreachRepo.claimFirstTouch({
        post_id: params.id,
        page_identity: 'Maison MIPA Photography',
        operator_name: `${operatorName} (Thủ công)`,
        comment_content: commentContent.trim(),
        initialStatus: 'manual_assisted',
      });

      if (!claimResult.success) {
        const method = claimResult.interaction?.status === 'manual_assisted' ? 'Tiếp cận thủ công' : 'Đã gửi qua Page';
        return NextResponse.json({
          success: false,
          error: `Bài viết này đã được tiếp cận trước đó (${method}). Khóa an toàn chống gửi trùng lặp!`,
          interaction: claimResult.interaction,
        }, { status: 400 });
      }

      if (manualProofUrl) {
        await outreachRepo.updateStatus(params.id, 'manual_assisted', {
          comment_permalink: manualProofUrl,
        }).catch(() => {});
      }

      // Ensure CRM lead is created or linked
      const post = await postRepo.getById(params.id).catch(() => null);
      let lead = await leadRepo.getByPostId(params.id).catch(() => null);
      if (!lead && post) {
        try {
          lead = await leadRepo.create({
            post_id: params.id,
            customer_name: post.author_name || 'Khách Hàng Facebook',
            customer_facebook_url: post.post_url,
            service_interest: post.classification?.service_detected || 'Chụp Ảnh Concept',
            stage: 'uncontacted',
            assigned_cskh_name: 'Ngọc Lan (CSKH)',
            notes: `Tiếp cận thủ công bởi ${operatorName}`,
          });
        } catch {}
      }

      // Sync in-memory store for test/backward compatibility
      try {
        store.dispatchComment(params.id, commentContent.trim(), operatorName, true, manualProofUrl);
      } catch {}

      return NextResponse.json({
        success: true,
        message: 'Đã ghi nhận tiếp cận thủ công và chuyển hồ sơ khách hàng vào Pipeline CSKH.',
        interaction: claimResult.interaction,
        lead,
      });
    }

    // 4. CASE B: Playwright Automated Mode
    const result = await store.dispatchComment(
      params.id, 
      commentContent.trim(), 
      operatorName, 
      false, 
      manualProofUrl
    );

    if (!result.success) {
      return NextResponse.json({ 
        success: false, 
        error: result.error, 
        needsAuth: result.needsAuth,
        interaction: result.interaction 
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Bình luận tiếp cận đã được gửi và xác nhận thành công trên Facebook DOM.',
      interaction: result.interaction,
      lead: result.lead,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
