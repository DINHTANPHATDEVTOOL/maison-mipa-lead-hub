import { NextResponse } from 'next/server';
import { leadRepo } from '@/lib/repositories/lead.repository';
import { store } from '@/lib/store';
import { verifyAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  // Enforce authentication: staff with cskh or admin role can view leads
  const auth = await verifyAuth(req, ['admin', 'cskh']);
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(req.url);
    const stage = searchParams.get('stage') || undefined;
    const leads = await leadRepo.getAll({ stage });
    return NextResponse.json({ success: true, count: leads.length, data: leads });
  } catch (err: any) {
    if (process.env.NODE_ENV !== 'production') {
      const leads = store.getLeads();
      return NextResponse.json({ success: true, count: leads.length, data: leads });
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    // Enforce authentication: cskh or admin can update lead stage and CRM info
    const auth = await verifyAuth(req, ['admin', 'cskh']);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ success: false, error: 'Thiếu ID khách hàng' }, { status: 400 });
    }

    // Only include keys that are EXPLICITLY provided!
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

    // If version is provided, enforce OCC checking
    if (body.version !== undefined) {
      const occResult = await leadRepo.updateWithOcc(body.id, Number(body.version), updates);
      if (!occResult.success) {
        if (occResult.current) {
          return NextResponse.json({
            success: false,
            conflict: true,
            current: occResult.current,
            error: 'Xung đột phiên bản (OCC Conflict): Hồ sơ khách hàng đã bị thay đổi bởi nhân viên khác. Vui lòng tải lại trang.',
          }, { status: 409 });
        }
        return NextResponse.json({ success: false, error: 'Không tìm thấy hồ sơ khách hàng' }, { status: 404 });
      }

      if (process.env.NODE_ENV !== 'production') {
        store.updateLead(body.id, updates);
      }

      return NextResponse.json({ success: true, data: occResult.lead });
    }

    // Direct update without OCC version check
    const updated = await leadRepo.update(body.id, updates);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy hồ sơ khách hàng' }, { status: 404 });
    }

    if (process.env.NODE_ENV !== 'production') {
      store.updateLead(body.id, updates);
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
