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
  const isWorkerFresh = lastPingTime > 0 && (Date.now() - lastPingTime < 120_000);
  const isReallyAlive = heartbeat.is_alive && isWorkerFresh;

  return NextResponse.json({
    success: true,
    data: {
      ...heartbeat,
      is_alive: isReallyAlive,
      facebook_auth_valid: sessionSummary.valid,
      session: sessionSummary,
      stale_seconds: lastPingTime > 0 ? Math.round((Date.now() - lastPingTime) / 1000) : null,
    }
  });
}

export async function POST(req: Request) {
  try {
    const auth = verifyAuth(req, ['admin']);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();

    // Case 1: Actual Worker Daemon Ping
    if (body.action === 'ping' || body.is_worker_ping) {
      const updated = store.recordWorkerPing(body.worker_id, body.active_jobs_count || 0);
      return NextResponse.json({ success: true, data: updated });
    }

    // Case 2: Admin updating operating mode (does NOT update worker last_ping!)
    if (body.operating_mode) {
      const updated = store.updateOperatingMode(body.operating_mode);
      return NextResponse.json({ success: true, data: updated });
    }

    return NextResponse.json({ success: true, data: store.getHeartbeat() });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
