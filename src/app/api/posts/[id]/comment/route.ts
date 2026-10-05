import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { checkRolePermission } from '@/lib/auth';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 1. RBAC Server Check: Only Admin and Marketing can approve & send comments!
    const roleCheck = checkRolePermission(req, ['admin', 'marketing']);
    if (!roleCheck.allowed) {
      return NextResponse.json({ success: false, error: roleCheck.error }, { status: 403 });
    }

    const body = await req.json();
    const commentContent = body.comment_content;
    const operatorName = body.operator_name || 'Marketing Maison MIPA';
    const isManualAssisted = body.is_manual_assisted === true;
    const manualProofUrl = body.manual_proof_url;

    if (!commentContent) {
      return NextResponse.json({ success: false, error: 'Nội dung bình luận không được để trống' }, { status: 400 });
    }

    // Call store dispatcher
    const result = await store.dispatchComment(
      params.id, 
      commentContent, 
      operatorName, 
      isManualAssisted, 
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
      message: isManualAssisted
        ? 'Đã ghi nhận tiếp cận thủ công và chuyển hồ sơ khách hàng vào Pipeline CSKH.'
        : 'Bình luận tiếp cận đã được gửi và xác nhận thành công trên Facebook DOM.',
      interaction: result.interaction,
      lead: result.lead,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
