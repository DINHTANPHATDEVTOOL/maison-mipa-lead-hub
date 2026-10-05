import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { verifyAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  // Allow all authenticated staff to read services
  const auth = verifyAuth(req);
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  return NextResponse.json({ success: true, data: store.getServices() });
}

export async function PUT(req: Request) {
  try {
    // RBAC: Only Admin can update services and pricing
    const auth = verifyAuth(req, ['admin']);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
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

    const updated = store.updateService(body.id, cleanUpdates);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy dịch vụ' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
