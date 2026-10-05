import { NextResponse } from 'next/server';
import { store } from '@/lib/store';

export async function GET() {
  const leads = store.getLeads();
  return NextResponse.json({ success: true, count: leads.length, data: leads });
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ success: false, error: 'Thiếu ID khách hàng' }, { status: 400 });
    }

    const updated = store.updateLead(body.id, {
      stage: body.stage,
      notes: body.notes,
      quoted_amount: body.quoted_amount !== undefined ? Number(body.quoted_amount) : undefined,
      booking_date: body.booking_date,
      assigned_cskh_name: body.assigned_cskh_name,
      service_interest: body.service_interest,
    });

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy hồ sơ khách hàng' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
