import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { verifyAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  // Enforce authentication: staff with cskh or admin role can view leads
  const auth = verifyAuth(req, ['admin', 'cskh']);
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const leads = store.getLeads();
  return NextResponse.json({ success: true, count: leads.length, data: leads });
}

export async function PATCH(req: Request) {
  try {
    // Enforce authentication: cskh or admin can update lead stage and CRM info
    const auth = verifyAuth(req, ['admin', 'cskh']);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ success: false, error: 'Thiếu ID khách hàng' }, { status: 400 });
    }

    // CRITICAL BUG FIX: Only include keys that are EXPLICITLY provided!
    // Do NOT pass undefined fields which wipe out notes, quoted_amount, booking_date, or assigned_cskh_name!
    const updates: Record<string, any> = {};
    if (body.stage !== undefined) updates.stage = body.stage;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.quoted_amount !== undefined) {
      updates.quoted_amount = body.quoted_amount === null || body.quoted_amount === '' ? null : Number(body.quoted_amount);
    }
    if (body.booking_date !== undefined) updates.booking_date = body.booking_date;
    if (body.assigned_cskh_name !== undefined) updates.assigned_cskh_name = body.assigned_cskh_name;
    if (body.service_interest !== undefined) updates.service_interest = body.service_interest;

    const updated = store.updateLead(body.id, updates);

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy hồ sơ khách hàng' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
