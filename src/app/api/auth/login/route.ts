import { NextResponse } from 'next/server';
import { verifyCredentials } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, role } = body;

    // Password is strictly mandatory
    if (!password || typeof password !== 'string' || password.trim() === '') {
      return NextResponse.json({ 
        success: false, 
        error: 'Mật khẩu là bắt buộc. Hệ thống từ chối đăng nhập khi thiếu mật khẩu.' 
      }, { status: 400 });
    }

    if (!email && !role) {
      return NextResponse.json({ 
        success: false, 
        error: 'Vui lòng cung cấp email hoặc vai trò để đăng nhập.' 
      }, { status: 400 });
    }

    const { user, error } = verifyCredentials({ email, role, password });

    if (!user) {
      return NextResponse.json({ 
        success: false, 
        error: error || 'Xác thực không thành công. Thông tin tài khoản hoặc mật khẩu sai.' 
      }, { status: 401 });
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
      httpOnly: true,
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
