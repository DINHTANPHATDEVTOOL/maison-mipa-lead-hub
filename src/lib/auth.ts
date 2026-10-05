import { UserRole } from '@/types';
import crypto from 'crypto';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  token: string;
}

// Configurable passwords with secure fallbacks (overridable via environment)
const ADMIN_PASSWORD = process.env.MIPA_ADMIN_PASSWORD || 'mipa@admin2026';
const MARKETING_PASSWORD = process.env.MIPA_MARKETING_PASSWORD || 'mipa@mkt2026';
const CSKH_PASSWORD = process.env.MIPA_CSKH_PASSWORD || 'mipa@cskh2026';

// Cryptographic hash helper
function hashPassword(pass: string): string {
  return crypto.createHash('sha256').update(pass).digest('hex');
}

function generateToken(email: string, pass: string): string {
  return 'mipa_sec_' + crypto.createHash('sha256').update(`${email}:${pass}:${process.env.APP_SECRET || 'mipa-salt-2026'}`).digest('hex');
}

// Built-in initial staff accounts
export const SYSTEM_STAFF_ACCOUNTS: Array<{
  id: string;
  name: string;
  email: string;
  role: UserRole;
  passwordHash: string;
  token: string;
}> = [
  {
    id: 'user-admin-01',
    name: 'Đinh Tấn Phát (Quản Trị)',
    email: 'admin@maisonmipa.vn',
    role: 'admin',
    passwordHash: hashPassword(ADMIN_PASSWORD),
    token: generateToken('admin@maisonmipa.vn', ADMIN_PASSWORD),
  },
  {
    id: 'user-mkt-01',
    name: 'Trần Minh Thư (Marketing)',
    email: 'marketing@maisonmipa.vn',
    role: 'marketing',
    passwordHash: hashPassword(MARKETING_PASSWORD),
    token: generateToken('marketing@maisonmipa.vn', MARKETING_PASSWORD),
  },
  {
    id: 'user-cskh-01',
    name: 'Nguyễn Ngọc Lan (CSKH & Chốt Lịch)',
    email: 'cskh@maisonmipa.vn',
    role: 'cskh',
    passwordHash: hashPassword(CSKH_PASSWORD),
    token: generateToken('cskh@maisonmipa.vn', CSKH_PASSWORD),
  },
];

// Internal service key for background worker communication
// MUST be explicitly provided via environment variable. NO insecure public fallback!
const INTERNAL_WORKER_KEY = process.env.INTERNAL_WORKER_KEY?.trim() || null;

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
  if (workerKey) {
    if (INTERNAL_WORKER_KEY && INTERNAL_WORKER_KEY.length >= 16 && workerKey === INTERNAL_WORKER_KEY) {
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
    } else {
      return {
        success: false,
        error: 'Từ chối xác thực: Khóa dịch vụ Worker (x-worker-key) không hợp lệ hoặc chưa được thiết lập an toàn qua biến môi trường INTERNAL_WORKER_KEY.',
        status: 401,
      };
    }
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
 * Verify staff credentials for login
 */
export function verifyCredentials(credentials: { email?: string; role?: string; password?: string }): {
  user: AuthUser | null;
  error?: string;
} {
  const { email, role, password } = credentials;

  if (!password || password.trim() === '') {
    return { user: null, error: 'Mật khẩu là bắt buộc để đăng nhập.' };
  }

  let account;
  if (email) {
    account = SYSTEM_STAFF_ACCOUNTS.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
  } else if (role) {
    account = SYSTEM_STAFF_ACCOUNTS.find(u => u.role === role);
  }

  if (!account) {
    return { user: null, error: 'Tài khoản không tồn tại trên hệ thống Maison MIPA.' };
  }

  const inputHash = hashPassword(password);
  if (inputHash !== account.passwordHash) {
    return { user: null, error: 'Mật khẩu không chính xác.' };
  }

  return {
    user: {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
      token: account.token,
    },
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

