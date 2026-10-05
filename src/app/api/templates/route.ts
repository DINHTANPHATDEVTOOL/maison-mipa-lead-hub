import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { verifyAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  // Allow authenticated staff to read templates
  const auth = verifyAuth(req);
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  return NextResponse.json({ success: true, data: store.getTemplates() });
}

export async function PUT(req: Request) {
  try {
    // RBAC: Admin and Marketing can update outreach templates
    const auth = verifyAuth(req, ['admin', 'marketing']);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ success: false, error: 'Thiếu ID mẫu' }, { status: 400 });
    }

    const cleanUpdates: Record<string, any> = {};
    if (body.title !== undefined) cleanUpdates.title = body.title;
    if (body.template_content !== undefined) cleanUpdates.template_content = body.template_content;
    if (body.is_approved !== undefined) cleanUpdates.is_approved = Boolean(body.is_approved);
    if (body.service_id !== undefined) cleanUpdates.service_id = body.service_id;
    cleanUpdates.updated_by_name = auth.user?.name || 'Staff';

    const updated = store.updateTemplate(body.id, cleanUpdates);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy mẫu tiếp cận' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
