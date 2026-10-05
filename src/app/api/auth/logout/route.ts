import { NextResponse } from 'next/server';
import { revokeToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handleLogout(req);
}

export async function GET(req: Request) {
  return handleLogout(req);
}

function handleLogout(req: Request) {
  // Extract token from Authorization header or cookie
  const authHeader = req.headers.get('authorization');
  let token: string | null = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader.match(/mipa_auth_token=([^;]+)/);
  if (match) {
    if (!token) token = match[1];
    revokeToken(match[1]);
  }

  if (token) {
    revokeToken(token);
  }

  const response = NextResponse.json({
    success: true,
    message: 'Đăng xuất thành công. Phiên làm việc đã bị thu hồi.',
  });

  // Clear cookie completely
  response.cookies.set('mipa_auth_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });

  return response;
}
