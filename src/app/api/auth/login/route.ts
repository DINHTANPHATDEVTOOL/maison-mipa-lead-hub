import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { SYSTEM_STAFF_ACCOUNTS } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, role } = body;

    let user;
    if (email) {
      user = SYSTEM_STAFF_ACCOUNTS.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
    } else if (role) {
      user = SYSTEM_STAFF_ACCOUNTS.find(u => u.role === role);
    }

    if (!user) {
      return NextResponse.json({ success: false, error: 'Tài khoản không tồn tại trên hệ thống Maison MIPA.' }, { status: 401 });
    }

    // Check password if provided, or verify default dev password
    if (password) {
      const inputHash = crypto.createHash('sha256').update(password).digest('hex');
      if (inputHash !== user.passwordHash) {
        return NextResponse.json({ success: false, error: 'Mật khẩu không chính xác.' }, { status: 401 });
      }
    }

    // Set secure auth cookie
    const response = NextResponse.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: user.token,
      },
    });

    response.cookies.set('mipa_auth_token', user.token, {
      httpOnly: false, // Accessible to client for headers
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 86400 * 7, // 7 days
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
