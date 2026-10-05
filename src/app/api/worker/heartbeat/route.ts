import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { authManager } from '@/worker/auth';

export async function GET() {
  const heartbeat = store.getHeartbeat();
  const sessionSummary = authManager.getSessionSummary();

  return NextResponse.json({
    success: true,
    data: {
      ...heartbeat,
      session: sessionSummary,
    }
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const updates: any = {};

    if (body.operating_mode) {
      updates.operating_mode = body.operating_mode;
    }
    if (typeof body.is_alive === 'boolean') {
      updates.is_alive = body.is_alive;
    }

    const updated = store.updateHeartbeat(updates);
    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
