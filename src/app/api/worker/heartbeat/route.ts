import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { authManager } from '@/worker/auth';
import { verifyAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  // Allow authenticated staff to view system heartbeat
  const auth = verifyAuth(req);
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const heartbeat = store.getHeartbeat();
  const sessionSummary = authManager.getSessionSummary();

  // Freshness check: worker must have pinged within the last 120 seconds to be considered alive
  const lastPingTime = heartbeat.last_ping ? new Date(heartbeat.last_ping).getTime() : 0;
  const isWorkerFresh = Date.now() - lastPingTime < 120_000;
  const isReallyAlive = heartbeat.is_alive && isWorkerFresh;

  return NextResponse.json({
    success: true,
    data: {
      ...heartbeat,
      is_alive: isReallyAlive,
      facebook_auth_valid: sessionSummary.valid,
      session: sessionSummary,
      stale_seconds: Math.round((Date.now() - lastPingTime) / 1000),
    }
  });
}

export async function POST(req: Request) {
  try {
    // RBAC: Only Admin can reconfigure worker operating mode
    const auth = verifyAuth(req, ['admin']);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

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
