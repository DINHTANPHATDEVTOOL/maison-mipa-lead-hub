import { NextResponse } from 'next/server';
import { revokeTokenAsync } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return await handleLogout(req);
}

export async function GET(req: Request) {
  return await handleLogout(req);
}

async function handleLogout(req: Request) {
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
    await revokeTokenAsync(match[1]);
  }

  if (token) {
    await revokeTokenAsync(token);
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
