import { NextResponse } from 'next/server';
import { getAllProfiles, updateProfile, addProfile, deleteProfile, cleanMockProfiles } from '@/lib/profiles';
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

    if (body.action === 'clean_mock_profiles') {
      const remaining = cleanMockProfiles();
      return NextResponse.json({
        success: true,
        message: 'Đã xóa toàn bộ nick mẫu, chỉ giữ lại tài khoản thật đã đăng nhập thành công.',
        data: remaining,
      });
    }

    // Launch Chrome login for a specific profile
    if (body.action === 'launch_login' && body.id) {
      const { spawn } = await import('child_process');
      const path = await import('path');
      const fs = await import('fs');

      const authDir = path.join(process.cwd(), 'data', 'auth');
      if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });

      const logFile = path.join(authDir, `login_${body.id}.log`);
      const logFd = fs.openSync(logFile, 'w');

      // Initialize status
      const statusFile = path.join(authDir, `login_status_${body.id}.json`);
      fs.writeFileSync(
        statusFile,
        JSON.stringify(
          {
            profileId: body.id,
            status: 'launching',
            message: 'Đang mở cửa sổ trình duyệt Google Chrome...',
            updatedAt: Date.now(),
          },
          null,
          2
        )
      );

      const scriptPath = path.join(process.cwd(), 'scripts', 'facebook-login.ts');
      const display = process.env.DISPLAY || ':0';
      const xauth =
        process.env.XAUTHORITY ||
        (process.env.HOME ? path.join(process.env.HOME, '.Xauthority') : '/run/user/1000/gdm/Xauthority');

      const child = spawn('npx', ['tsx', scriptPath, body.id], {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env: {
          ...process.env,
          DISPLAY: display,
          XAUTHORITY: xauth,
        },
      });
      child.unref();

      return NextResponse.json({
        success: true,
        message: `Đã mở cửa sổ Chrome đăng nhập cho thiết bị [${body.id}]. Hãy nhập tài khoản Facebook trên trình duyệt.`,
      });
    }

    // Check login status for a specific profile
    if (body.action === 'check_login_status' && body.id) {
      const path = await import('path');
      const fs = await import('fs');
      const statusFile = path.join(process.cwd(), 'data', 'auth', `login_status_${body.id}.json`);
      if (fs.existsSync(statusFile)) {
        try {
          const raw = fs.readFileSync(statusFile, 'utf-8');
          const data = JSON.parse(raw);
          return NextResponse.json({ success: true, data });
        } catch {}
      }
      return NextResponse.json({
        success: true,
        data: { profileId: body.id, status: 'idle', message: 'Chưa có phiên mở trình duyệt' },
      });
    }

    // Cancel login process for a specific profile
    if (body.action === 'cancel_login' && body.id) {
      const path = await import('path');
      const fs = await import('fs');
      const pidFile = path.join(process.cwd(), 'data', 'auth', `login_pid_${body.id}.txt`);
      if (fs.existsSync(pidFile)) {
        try {
          const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
          if (pid && !isNaN(pid)) {
            process.kill(pid, 'SIGTERM');
          }
          fs.unlinkSync(pidFile);
        } catch {}
      }
      const statusFile = path.join(process.cwd(), 'data', 'auth', `login_status_${body.id}.json`);
      if (fs.existsSync(statusFile)) {
        try {
          fs.writeFileSync(
            statusFile,
            JSON.stringify({
              profileId: body.id,
              status: 'closed',
              message: 'Đã hủy phiên đăng nhập bởi người dùng.',
              updatedAt: Date.now(),
            })
          );
        } catch {}
      }
      return NextResponse.json({ success: true, message: 'Đã dừng tiến trình đăng nhập.' });
    }

    // Save session storageState JSON for a specific profile
    if (body.action === 'save_session' && body.id && body.storageStateJson) {
      const { authManager } = await import('@/worker/auth');
      const saveRes = authManager.saveProfileSession(body.id, body.storageStateJson);
      if (!saveRes.success) {
        return NextResponse.json({ success: false, error: saveRes.error }, { status: 400 });
      }

      const updated = updateProfile(body.id, {
        hasSession: true,
        fbUserId: saveRes.userId,
        status: 'online',
        lastAction: `Đã nạp phiên đăng nhập lúc ${new Date().toLocaleTimeString('vi-VN')}`,
      });

      return NextResponse.json({
        success: true,
        message: `Đã lưu và mã hóa phiên đăng nhập cho thiết bị [${body.id}] thành công.`,
        data: updated,
      });
    }

    // Delete session for a specific profile
    if (body.action === 'delete_session' && body.id) {
      const { authManager } = await import('@/worker/auth');
      authManager.deleteProfileSession(body.id);
      const updated = updateProfile(body.id, {
        hasSession: false,
        status: 'offline',
        lastAction: 'Đã xóa phiên đăng nhập',
      });
      return NextResponse.json({
        success: true,
        message: `Đã xóa phiên đăng nhập của thiết bị [${body.id}].`,
        data: updated,
      });
    }

    return NextResponse.json({ success: false, error: 'Hành động không hợp lệ' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
