import { NextResponse } from 'next/server';
import { store } from '@/lib/store';

export async function GET() {
  const groups = store.getGroups();
  return NextResponse.json({ success: true, data: groups });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.name || !body.url) {
      return NextResponse.json({ success: false, error: 'Tên nhóm và Link Facebook là bắt buộc' }, { status: 400 });
    }

    const newGroup = store.addGroup({
      name: body.name,
      url: body.url,
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
