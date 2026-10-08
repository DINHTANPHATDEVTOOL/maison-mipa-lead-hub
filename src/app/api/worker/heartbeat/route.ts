import { NextResponse } from 'next/server';
import { heartbeatRepo } from '@/lib/repositories/heartbeat.repository';
import { store } from '@/lib/store';
import { authManager } from '@/worker/auth';
import { verifyAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  const auth = await verifyAuth(req).catch(() => ({ success: false, error: 'Yêu cầu xác thực', status: 401 }));
  if (!auth.success && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ success: false, error: (auth as any).error || 'Yêu cầu xác thực' }, { status: (auth as any).status || 401 });
  }

  try {
    const sessionSummary = authManager.getSessionSummary();
    let heartbeat: any = null;
    try {
      heartbeat = await heartbeatRepo.getHeartbeat('worker-ubuntu-central-01');
    } catch {}

    const storeHeartbeat = store.getHeartbeat();
    if (!heartbeat || !heartbeat.is_alive) {
      heartbeat = storeHeartbeat;
    }

    const lastPingTime = heartbeat.last_ping ? new Date(heartbeat.last_ping).getTime() : 0;
    const isWorkerFresh = lastPingTime > 0 && (Date.now() - lastPingTime < 120_000);

    return NextResponse.json({
      success: true,
      data: {
        ...heartbeat,
        min_confidence_score: heartbeat.min_confidence_score ?? storeHeartbeat.min_confidence_score ?? 80,
        is_alive: Boolean(heartbeat.is_alive && isWorkerFresh),
        facebook_auth_valid: sessionSummary.valid,
        session: sessionSummary,
        stale_seconds: lastPingTime > 0 ? Math.round((Date.now() - lastPingTime) / 1000) : 0,
      }
    });
  } catch (err: any) {
    const heartbeat = store.getHeartbeat();
    const sessionSummary = authManager.getSessionSummary();
    const lastPingTime = heartbeat.last_ping ? new Date(heartbeat.last_ping).getTime() : 0;
    const isWorkerFresh = lastPingTime > 0 && (Date.now() - lastPingTime < 120_000);
    return NextResponse.json({
      success: true,
      data: {
        ...heartbeat,
        min_confidence_score: heartbeat.min_confidence_score ?? 80,
        is_alive: Boolean(heartbeat.is_alive && isWorkerFresh),
        facebook_auth_valid: sessionSummary.valid,
        session: sessionSummary,
        stale_seconds: lastPingTime > 0 ? Math.round((Date.now() - lastPingTime) / 1000) : 0,
      }
    });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await verifyAuth(req, ['admin']).catch(() => ({ success: false }));
    if (!auth.success && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ success: false, error: 'Yêu cầu quyền admin' }, { status: 403 });
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

    // Case 2: Admin or User updating operating mode / min_confidence_score
    if (body.operating_mode !== undefined || body.min_confidence_score !== undefined) {
      const workerId = body.worker_id || 'worker-ubuntu-central-01';
      const current = await heartbeatRepo.getHeartbeat(workerId);
      const mode = body.operating_mode || current.operating_mode || 'manual_review';
      const minConfidence = body.min_confidence_score !== undefined ? Number(body.min_confidence_score) : current.min_confidence_score ?? 80;
      
      const updated = await heartbeatRepo.updateOperatingMode(mode, workerId, minConfidence);
      store.updateOperatingMode(mode, minConfidence);
      return NextResponse.json({ success: true, data: updated });
    }

    const current = await heartbeatRepo.getHeartbeat('worker-ubuntu-central-01');
    return NextResponse.json({ success: true, data: current });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
