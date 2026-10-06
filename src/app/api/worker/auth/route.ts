import { NextResponse } from 'next/server';
import { authManager } from '@/worker/auth';
import { verifyAuth } from '@/lib/auth';
import { spawn } from 'child_process';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await verifyAuth(req);
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const summary = authManager.getSessionSummary();
    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await verifyAuth(req, ['admin', 'marketing']);
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();

    // Action 1: Lưu trực tiếp chuỗi storageState JSON
    if (body.action === 'save_session') {
      if (!body.storageStateJson) {
        return NextResponse.json({ success: false, error: 'Thiếu dữ liệu storageStateJson.' }, { status: 400 });
      }

      const result = authManager.saveSession(body.storageStateJson);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }

      const summary = authManager.getSessionSummary();
      return NextResponse.json({
        success: true,
        message: 'Đã lưu và mã hóa phiên đăng nhập Facebook thành công.',
        data: summary,
      });
    }

    // Action 2: Khởi động cửa sổ trình duyệt Chrome để người dùng đăng nhập trực tiếp trên máy
    if (body.action === 'launch_browser_login') {
      const scriptPath = path.join(process.cwd(), 'scripts', 'facebook-login.ts');
      const child = spawn('npx', ['tsx', scriptPath], {
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          DISPLAY: process.env.DISPLAY || ':0',
        },
      });
      child.unref();

      return NextResponse.json({
        success: true,
        message: 'Đã mở cửa sổ trình duyệt Chrome trên màn hình. Hãy đăng nhập tài khoản Facebook của bạn.',
      });
    }

    // Action 3: Xóa phiên hiện tại
    if (body.action === 'delete_session') {
      authManager.deleteSession();
      return NextResponse.json({
        success: true,
        message: 'Đã xóa phiên đăng nhập Facebook.',
        data: authManager.getSessionSummary(),
      });
    }

    return NextResponse.json({ success: false, error: 'Hành động không hợp lệ.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
