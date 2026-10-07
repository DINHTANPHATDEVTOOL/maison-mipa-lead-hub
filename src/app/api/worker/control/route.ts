import { NextResponse } from 'next/server';
import { 
  startWorkerProcess, 
  stopWorkerProcess, 
  getWorkerProcessStatus 
} from '@/lib/worker-process';
import { verifyAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await verifyAuth(req).catch(() => ({ success: false, error: 'Yêu cầu xác thực', status: 401 }));
  if (!auth.success && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ success: false, error: (auth as any).error || 'Yêu cầu xác thực' }, { status: (auth as any).status || 401 });
  }

  const status = getWorkerProcessStatus();
  return NextResponse.json({
    success: true,
    data: status,
  });
}

export async function POST(req: Request) {
  const auth = await verifyAuth(req, ['admin', 'marketing']).catch(() => ({ success: false, error: 'Yêu cầu xác thực', status: 401 }));
  if (!auth.success && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ success: false, error: (auth as any).error || 'Yêu cầu xác thực' }, { status: (auth as any).status || 403 });
  }

  try {
    const body = await req.json();
    const action = body.action;

    if (action === 'start') {
      const res = startWorkerProcess();
      return NextResponse.json({
        success: res.success,
        message: res.message,
        data: getWorkerProcessStatus(),
      });
    }

    if (action === 'stop') {
      const res = stopWorkerProcess();
      return NextResponse.json({
        success: res.success,
        message: res.message,
        data: getWorkerProcessStatus(),
      });
    }

    if (action === 'status') {
      return NextResponse.json({
        success: true,
        data: getWorkerProcessStatus(),
      });
    }

    return NextResponse.json({ success: false, error: 'Hành động không hợp lệ.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
