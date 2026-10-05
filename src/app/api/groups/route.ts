import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { verifyAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  const auth = verifyAuth(req);
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const groups = store.getGroups();
  return NextResponse.json({ success: true, data: groups });
}

export async function POST(req: Request) {
  try {
    // RBAC: Only Admin can add Facebook groups
    const auth = verifyAuth(req, ['admin']);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    if (!body.name || !body.url) {
      return NextResponse.json({ success: false, error: 'Tên nhóm và Link Facebook là bắt buộc' }, { status: 400 });
    }

    // Clean group URL
    let cleanUrl = body.url.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    const newGroup = store.addGroup({
      name: body.name.trim(),
      url: cleanUrl,
      check_interval_seconds: Number(body.check_interval_seconds) || 150,
      lookback_hours: Number(body.lookback_hours) || 24,
      status: 'active',
      can_page_comment: body.can_page_comment !== false,
    });

    return NextResponse.json({ success: true, data: newGroup });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
