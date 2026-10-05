import { NextResponse } from 'next/server';
import { store } from '@/lib/store';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const commentContent = body.comment_content;
    const operatorName = body.operator_name || 'Marketing Maison MIPA';

    if (!commentContent) {
      return NextResponse.json({ success: false, error: 'Nội dung bình luận không được để trống' }, { status: 400 });
    }

    const result = store.dispatchComment(params.id, commentContent, operatorName);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Bình luận tiếp cận đã được gửi và xác nhận thành công. Hồ sơ khách hàng đã được đồng bộ sang CSKH.',
      interaction: result.interaction,
      lead: result.lead,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
