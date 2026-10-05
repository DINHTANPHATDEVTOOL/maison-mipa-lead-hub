import { UserRole } from '@/types';
import crypto from 'crypto';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  token: string;
}

// Built-in initial staff accounts
export const SYSTEM_STAFF_ACCOUNTS: Array<{
  id: string;
  name: string;
  email: string;
  role: UserRole;
  passwordHash: string; // SHA-256
  token: string;
}> = [
  {
    id: 'user-admin-01',
    name: 'Đinh Tấn Phát (Quản Trị)',
    email: 'admin@maisonmipa.vn',
    role: 'admin',
    // Hash for 'mipa@2026'
    passwordHash: crypto.createHash('sha256').update('mipa@2026').digest('hex'),
    token: 'mipa_token_admin_sec_' + crypto.createHash('sha256').update('admin@maisonmipa.vn:mipa@2026').digest('hex').slice(0, 32),
  },
  {
    id: 'user-mkt-01',
    name: 'Trần Minh Thư (Marketing)',
    email: 'marketing@maisonmipa.vn',
    role: 'marketing',
    passwordHash: crypto.createHash('sha256').update('mipa@2026').digest('hex'),
    token: 'mipa_token_mkt_sec_' + crypto.createHash('sha256').update('marketing@maisonmipa.vn:mipa@2026').digest('hex').slice(0, 32),
  },
  {
    id: 'user-cskh-01',
    name: 'Nguyễn Ngọc Lan (CSKH & Chốt Lịch)',
    email: 'cskh@maisonmipa.vn',
    role: 'cskh',
    passwordHash: crypto.createHash('sha256').update('mipa@2026').digest('hex'),
    token: 'mipa_token_cskh_sec_' + crypto.createHash('sha256').update('cskh@maisonmipa.vn:mipa@2026').digest('hex').slice(0, 32),
  },
];

// Internal service key for background worker communication
const INTERNAL_WORKER_KEY = process.env.INTERNAL_WORKER_KEY || 'mipa_internal_worker_key_2026';

export interface VerifyAuthResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
  status: number;
}

/**
 * Verify authentication and enforce Role-Based Access Control (RBAC)
 */
export function verifyAuth(req: Request, allowedRoles?: UserRole[]): VerifyAuthResult {
  // 1. Check Internal Worker Service Key
  const workerKey = req.headers.get('x-worker-key');
  if (workerKey && workerKey === INTERNAL_WORKER_KEY) {
    return {
      success: true,
      user: {
        id: 'worker-internal-01',
        name: 'Maison MIPA Central Worker',
        email: 'worker@internal.maisonmipa.vn',
        role: 'admin',
        token: workerKey,
      },
      status: 200,
    };
  }

  // 2. Extract Bearer Token from Authorization Header or Cookie
  const authHeader = req.headers.get('authorization');
  let token: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  // Fallback: check cookie
  if (!token) {
    const cookieHeader = req.headers.get('cookie') || '';
    const match = cookieHeader.match(/mipa_auth_token=([^;]+)/);
    if (match) {
      token = match[1];
    }
  }

  // Fallback: development test token header
  if (!token) {
    token = req.headers.get('x-auth-token');
  }

  if (!token) {
    return {
      success: false,
      error: 'Yêu cầu xác thực: Vui lòng đăng nhập hoặc cung cấp Authorization Bearer Token hợp lệ.',
      status: 401,
    };
  }

  // 3. Find User by Token
  const matchedUser = SYSTEM_STAFF_ACCOUNTS.find(u => u.token === token);
  if (!matchedUser) {
    return {
      success: false,
      error: 'Mã xác thực (Token) không hợp lệ hoặc đã hết hạn.',
      status: 401,
    };
  }

  // 4. Role Authorization Check
  if (allowedRoles && allowedRoles.length > 0) {
    if (!allowedRoles.includes(matchedUser.role)) {
      return {
        success: false,
        error: `Từ chối truy cập (403 Forbidden): Vai trò "${matchedUser.role}" không có quyền thực hiện thao tác này. Thao tác yêu cầu: [${allowedRoles.join(', ')}].`,
        status: 403,
      };
    }
  }

  return {
    success: true,
    user: {
      id: matchedUser.id,
      name: matchedUser.name,
      email: matchedUser.email,
      role: matchedUser.role,
      token: matchedUser.token,
    },
    status: 200,
  };
}

/**
 * Legacy compatibility wrapper with strict enforcement
 */
export function checkRolePermission(req: Request, allowedRoles: UserRole[]): { allowed: boolean; role: UserRole; error?: string; status: number } {
  const result = verifyAuth(req, allowedRoles);
  if (!result.success) {
    return {
      allowed: false,
      role: (result.user?.role as UserRole) || 'cskh',
      error: result.error,
      status: result.status,
    };
  }
  return {
    allowed: true,
    role: result.user!.role,
    status: 200,
  };
}
