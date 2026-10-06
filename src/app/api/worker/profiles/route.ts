import { NextResponse } from 'next/server';
import { getAllProfiles, updateProfile, addProfile, deleteProfile } from '@/lib/profiles';
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

    // Launch Chrome login for a specific profile
    if (body.action === 'launch_login' && body.id) {
      const { spawn } = await import('child_process');
      const path = await import('path');
      const scriptPath = path.join(process.cwd(), 'scripts', 'facebook-login.ts');
      const child = spawn('npx', ['tsx', scriptPath, body.id], {
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
        message: `Đã mở cửa sổ Chrome đăng nhập cho thiết bị [${body.id}]. Hãy nhập tài khoản Facebook trên trình duyệt.`,
      });
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
