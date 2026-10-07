import { NextResponse } from 'next/server';
import { serviceRepo } from '@/lib/repositories/service.repository';
import { store } from '@/lib/store';
import { verifyAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  const auth = await verifyAuth(req).catch(() => ({ success: false }));
  if (!auth.success && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ success: false, error: 'Yêu cầu đăng nhập' }, { status: 401 });
  }

  try {
    let services = await serviceRepo.getAll();
    if (services.length === 0) {
      services = store.getServices();
    }
    return NextResponse.json({ success: true, data: services });
  } catch (err: any) {
    return NextResponse.json({ success: true, data: store.getServices() });
  }
}

export async function PUT(req: Request) {
  try {
    // RBAC: Only Admin/Marketing can update services and pricing (bypassed in dev for direct UI editing)
    const auth = await verifyAuth(req, ['admin', 'marketing']).catch(() => ({ success: false }));
    if (!auth.success && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ success: false, error: 'Yêu cầu quyền quản trị viên' }, { status: 403 });
    }

    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ success: false, error: 'Thiếu ID dịch vụ' }, { status: 400 });
    }

    const cleanUpdates: Record<string, any> = {};
    if (body.name !== undefined) cleanUpdates.name = body.name;
    if (body.base_price !== undefined) cleanUpdates.base_price = Number(body.base_price);
    if (body.price_note !== undefined) cleanUpdates.price_note = body.price_note;
    if (body.service_area !== undefined) cleanUpdates.service_area = body.service_area;
    if (body.includes_posing_support !== undefined) cleanUpdates.includes_posing_support = Boolean(body.includes_posing_support);
    if (body.is_active !== undefined) cleanUpdates.is_active = Boolean(body.is_active);

    const updated = await serviceRepo.update(body.id, cleanUpdates);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy dịch vụ' }, { status: 404 });
    }

    // Keep store synced in dev
    if (process.env.NODE_ENV !== 'production') {
      store.updateService(body.id, cleanUpdates);
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
