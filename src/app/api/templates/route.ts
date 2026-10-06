import { NextResponse } from 'next/server';
import { templateRepo } from '@/lib/repositories/template.repository';
import { store } from '@/lib/store';
import { verifyAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  // Allow authenticated staff to read templates
  const auth = await verifyAuth(req);
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const templates = await templateRepo.getAll();
    return NextResponse.json({ success: true, data: templates });
  } catch (err: any) {
    if (process.env.NODE_ENV !== 'production') {
      return NextResponse.json({ success: true, data: store.getTemplates() });
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    // RBAC: Admin and Marketing can update outreach templates
    const auth = await verifyAuth(req, ['admin', 'marketing']);
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

    // If version is provided, enforce OCC checking
    if (body.version !== undefined) {
      const occResult = await templateRepo.updateWithOcc(body.id, Number(body.version), cleanUpdates);
      if (!occResult.success) {
        if (occResult.current) {
          return NextResponse.json({
            success: false,
            conflict: true,
            current: occResult.current,
            error: 'Xung đột phiên bản (OCC Conflict): Mẫu đã bị thay đổi bởi người khác. Vui lòng tải lại dữ liệu mới nhất.',
          }, { status: 409 });
        }
        return NextResponse.json({ success: false, error: 'Không tìm thấy mẫu tiếp cận' }, { status: 404 });
      }

      if (process.env.NODE_ENV !== 'production') {
        store.updateTemplate(body.id, cleanUpdates);
      }

      return NextResponse.json({ success: true, data: occResult.template });
    }

    // Direct update without OCC version check
    const updated = await templateRepo.update(body.id, cleanUpdates);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy mẫu tiếp cận' }, { status: 404 });
    }

    if (process.env.NODE_ENV !== 'production') {
      store.updateTemplate(body.id, cleanUpdates);
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
