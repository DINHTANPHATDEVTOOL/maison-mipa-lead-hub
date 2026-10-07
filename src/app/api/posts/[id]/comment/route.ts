import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { outreachDispatchService } from '@/lib/services/outreach-dispatch.service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 1. RBAC Server Check: Only Admin and Marketing can approve & send comments!
    const auth = await verifyAuth(req, ['admin', 'marketing']);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const commentContent = body.comment_content;
    const operatorName = body.operator_name || auth.user?.name || 'Marketing Maison MIPA';
    const isManualAssisted = body.is_manual_assisted === true;
    const manualProofUrl = body.manual_proof_url;
    const templateId = body.template_id;
    const { getAllProfiles } = await import('@/lib/profiles');
    const profiles = getAllProfiles();
    let profileId = body.profile_id;
    let accountType = body.account_type;

    if (!profileId) {
      const activeProf = profiles.find(p => p.hasSession && p.status === 'online') || profiles.find(p => p.hasSession);
      if (activeProf) {
        profileId = activeProf.id;
        if (!accountType) {
          accountType = activeProf.type || 'personal';
        }
      }
    }
    if (!accountType) {
      accountType = 'personal';
    }

    if (!commentContent || typeof commentContent !== 'string' || !commentContent.trim()) {
      return NextResponse.json({ success: false, error: 'Nội dung bình luận không được để trống' }, { status: 400 });
    }

    const postUrl = body.post_url;
    const authorName = body.author_name;
    const contentRaw = body.content_raw;
    const groupId = body.group_id;
    const groupName = body.group_name;

    // 2. Dispatch via unified PostgreSQL outreach service
    const result = await outreachDispatchService.dispatchOutreach({
      postId: params.id,
      commentContent: commentContent.trim(),
      operatorName,
      accountType,
      profileId,
      isManual: isManualAssisted,
      manualProofUrl,
      templateId,
      postUrl,
      authorName,
      contentRaw,
      groupId,
      groupName,
    });

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
        needsAuth: result.needsAuth,
        interaction: result.interaction,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: result.message || 'Bình luận tiếp cận đã được xử lý thành công.',
      interaction: result.interaction,
      lead: result.lead,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
