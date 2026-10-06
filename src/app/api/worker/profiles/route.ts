import { NextResponse } from 'next/server';
import { getAllProfiles, updateProfile, addProfile, deleteProfile } from '@/lib/profiles';
import { verifyAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await verifyAuth(req);
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const profiles = getAllProfiles();
  return NextResponse.json({
    success: true,
    data: profiles,
  });
}

export async function POST(req: Request) {
  const auth = await verifyAuth(req, ['admin', 'marketing']);
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();

    if (body.action === 'add') {
      const created = addProfile({
        name: body.name || 'Thiết bị mới',
        type: body.type || 'personal',
        fbUserId: body.fbUserId,
        pageId: body.pageId,
        pageName: body.pageName,
        maxDailyComments: body.maxDailyComments || 40,
        hasSession: Boolean(body.hasSession),
        notes: body.notes,
      });
      return NextResponse.json({ success: true, data: created });
    }

    if (body.action === 'update' && body.id) {
      const updated = updateProfile(body.id, body.updates || {});
      return NextResponse.json({ success: true, data: updated });
    }

    if (body.action === 'delete' && body.id) {
      const deleted = deleteProfile(body.id);
      return NextResponse.json({ success: deleted });
    }

    // Toggle all accounts
    if (body.action === 'toggle_all') {
      const targetStatus = body.status || 'online';
      const profiles = getAllProfiles();
      const updatedList = profiles.map((p) => updateProfile(p.id, { status: targetStatus }));
      return NextResponse.json({ success: true, data: updatedList });
    }

    return NextResponse.json({ success: false, error: 'Hành động không hợp lệ' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
