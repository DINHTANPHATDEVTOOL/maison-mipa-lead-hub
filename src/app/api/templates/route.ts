import { NextResponse } from 'next/server';
import { templateRepo } from '@/lib/repositories/template.repository';
import { store } from '@/lib/store';
import { verifyAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  // Allow authenticated staff to read templates (relaxed in development)
  const auth = await verifyAuth(req).catch(() => ({ success: false }));
  if (!auth.success && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ success: false, error: 'Yêu cầu đăng nhập' }, { status: 401 });
  }

  try {
    let templates = await templateRepo.getAll();
    if (!templates || templates.length === 0) {
      templates = store.getTemplates();
    }
    return NextResponse.json({ success: true, data: templates });
  } catch (err: any) {
    return NextResponse.json({ success: true, data: store.getTemplates() });
  }
}

export async function PUT(req: Request) {
  try {
    // RBAC: Admin and Marketing can update outreach templates (relaxed in development)
    const auth = await verifyAuth(req, ['admin', 'marketing']).catch(() => ({ success: false, user: null }));
    if (!auth.success && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ success: false, error: 'Yêu cầu quyền quản trị viên' }, { status: 403 });
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
    cleanUpdates.updated_by_name = (auth as any)?.user?.name || 'Staff Maison MIPA';

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
        
        // Fallback to store if not in DB
        const fallback = store.updateTemplate(body.id, cleanUpdates);
        if (fallback) {
          return NextResponse.json({ success: true, data: fallback });
        }
        return NextResponse.json({ success: false, error: 'Không tìm thấy mẫu tiếp cận' }, { status: 404 });
      }

      store.updateTemplate(body.id, cleanUpdates);
      return NextResponse.json({ success: true, data: occResult.template });
    }

    // Direct update without OCC version check
    const updated = await templateRepo.update(body.id, cleanUpdates);
    if (!updated) {
      const fallback = store.updateTemplate(body.id, cleanUpdates);
      if (fallback) {
        return NextResponse.json({ success: true, data: fallback });
      }
      return NextResponse.json({ success: false, error: 'Không tìm thấy mẫu tiếp cận' }, { status: 404 });
    }

    store.updateTemplate(body.id, cleanUpdates);
    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await verifyAuth(req, ['admin', 'marketing']).catch(() => ({ success: false, user: null }));
    if (!auth.success && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ success: false, error: 'Yêu cầu quyền quản trị viên' }, { status: 403 });
    }

    const body = await req.json();
    if (!body.title || !body.template_content || !body.service_id) {
      return NextResponse.json({ 
        success: false, 
        error: 'Vui lòng nhập đầy đủ tiêu đề, nội dung kịch bản và phân loại dịch vụ' 
      }, { status: 400 });
    }

    const payload = {
      service_id: body.service_id,
      title: body.title.trim(),
      template_content: body.template_content.trim(),
      allowed_placeholders: body.allowed_placeholders || ['{gia}', '{khu_vuc}', '{ho_tro_tao_dang}', '{ten_dich_vu}', '{ten_khach}'],
      is_approved: body.is_approved !== undefined ? Boolean(body.is_approved) : true,
      updated_by_name: (auth as any)?.user?.name || 'Staff Maison MIPA',
    };

    let created;
    try {
      created = await templateRepo.create(payload);
    } catch {
      // Fallback local store if DB is unavailable
      created = store.addTemplate(payload);
    }

    store.addTemplate({ ...payload, ...(created?.id ? { id: created.id } : {}) });
    return NextResponse.json({ success: true, data: created });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await verifyAuth(req, ['admin', 'marketing']).catch(() => ({ success: false, user: null }));
    if (!auth.success && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ success: false, error: 'Yêu cầu quyền quản trị viên' }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get('id') || (await req.json().catch(() => ({})))?.id;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Thiếu ID kịch bản cần xóa' }, { status: 400 });
    }

    try {
      await templateRepo.delete(id);
    } catch {}

    store.deleteTemplate(id);
    return NextResponse.json({ success: true, message: 'Đã xóa kịch bản thành công' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
