import { NextResponse } from 'next/server';
import { heartbeatRepo } from '@/lib/repositories/heartbeat.repository';
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

  try {
    const sessionSummary = authManager.getSessionSummary();
    const heartbeat = await heartbeatRepo.getHeartbeat('worker-ubuntu-central-01');

    return NextResponse.json({
      success: true,
      data: {
        ...heartbeat,
        facebook_auth_valid: sessionSummary.valid,
        session: sessionSummary,
      }
    });
  } catch (err: any) {
    if (process.env.NODE_ENV !== 'production') {
      const heartbeat = store.getHeartbeat();
      const sessionSummary = authManager.getSessionSummary();
      const lastPingTime = heartbeat.last_ping ? new Date(heartbeat.last_ping).getTime() : 0;
      const isWorkerFresh = lastPingTime > 0 && (Date.now() - lastPingTime < 120_000);
      return NextResponse.json({
        success: true,
        data: {
          ...heartbeat,
          is_alive: heartbeat.is_alive && isWorkerFresh,
          facebook_auth_valid: sessionSummary.valid,
          session: sessionSummary,
          stale_seconds: lastPingTime > 0 ? Math.round((Date.now() - lastPingTime) / 1000) : null,
        }
      });
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
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
      const workerId = body.worker_id || 'worker-ubuntu-central-01';
      const updated = await heartbeatRepo.recordPing(workerId, body.active_jobs_count || 0);
      if (process.env.NODE_ENV !== 'production') {
        store.recordWorkerPing(workerId, body.active_jobs_count || 0);
      }
      return NextResponse.json({ success: true, data: updated });
    }

    // Case 2: Admin updating operating mode (does NOT update worker last_ping!)
    if (body.operating_mode) {
      const workerId = body.worker_id || 'worker-ubuntu-central-01';
      const updated = await heartbeatRepo.updateOperatingMode(body.operating_mode, workerId);
      if (process.env.NODE_ENV !== 'production') {
        store.updateOperatingMode(body.operating_mode);
      }
      return NextResponse.json({ success: true, data: updated });
    }

    const current = await heartbeatRepo.getHeartbeat('worker-ubuntu-central-01');
    return NextResponse.json({ success: true, data: current });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
