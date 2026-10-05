import { UserRole } from '@/types';
import crypto from 'crypto';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  token: string;
}

// Built-in staff accounts directory
export const SYSTEM_STAFF_ACCOUNTS: Array<{
  id: string;
  name: string;
  email: string;
  role: UserRole;
}> = [
  {
    id: 'user-admin-01',
    name: 'Đinh Tấn Phát (Quản Trị)',
    email: 'admin@maisonmipa.vn',
    role: 'admin',
  },
  {
    id: 'user-mkt-01',
    name: 'Trần Minh Thư (Marketing)',
    email: 'marketing@maisonmipa.vn',
    role: 'marketing',
  },
  {
    id: 'user-cskh-01',
    name: 'Nguyễn Ngọc Lan (CSKH & Chốt Lịch)',
    email: 'cskh@maisonmipa.vn',
    role: 'cskh',
  },
];

// Ephemeral runtime secret if APP_SECRET environment variable is not provided.
// This guarantees that external attackers CANNOT forge tokens by reading source code.
const RUNTIME_APP_SECRET = process.env.APP_SECRET?.trim() || crypto.randomBytes(32).toString('hex');

// Internal service key for background worker communication
// MUST be explicitly configured with at least 16 characters. NO public fallback!
const INTERNAL_WORKER_KEY = process.env.INTERNAL_WORKER_KEY?.trim() || null;

/**
 * Generate a cryptographically signed HMAC token for an authenticated user.
 * Format: base64url(userId:role:issuedAt:hmacSignature)
 */
export function issueSignedToken(userId: string, role: UserRole): string {
  const issuedAt = Date.now();
  const payload = `${userId}:${role}:${issuedAt}`;
  const sig = crypto.createHmac('sha256', RUNTIME_APP_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

/**
 * Verify and decode an HMAC-signed token
 */
export function verifySignedToken(tokenString: string): { valid: boolean; user?: AuthUser; error?: string } {
  try {
    const decoded = Buffer.from(tokenString, 'base64url').toString('utf-8');
    const parts = decoded.split(':');
    if (parts.length !== 4) {
      return { valid: false, error: 'Mã xác thực không đúng định dạng.' };
    }

    const [userId, role, issuedAtStr, sig] = parts;
    const issuedAt = parseInt(issuedAtStr, 10);
    if (isNaN(issuedAt)) {
      return { valid: false, error: 'Thời gian khởi tạo token không hợp lệ.' };
    }

    // Check expiration (7 days)
    if (Date.now() - issuedAt > 7 * 86400 * 1000) {
      return { valid: false, error: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.' };
    }

    // Verify HMAC signature using timing-safe comparison
    const expectedPayload = `${userId}:${role}:${issuedAt}`;
    const expectedSig = crypto.createHmac('sha256', RUNTIME_APP_SECRET).update(expectedPayload).digest('hex');

    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return { valid: false, error: 'Chữ ký số của Token không hợp lệ. Từ chối xác thực.' };
    }

    const staff = SYSTEM_STAFF_ACCOUNTS.find(u => u.id === userId && u.role === role);
    if (!staff) {
      return { valid: false, error: 'Không tìm thấy người dùng khớp với mã xác thực.' };
    }

    return {
      valid: true,
      user: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        token: tokenString,
      },
    };
  } catch (err: any) {
    return { valid: false, error: 'Lỗi giải mã token: ' + err.message };
  }
}

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

  // Fallback: test token header
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

  // 3. Cryptographically verify signed token
  const tokenVerify = verifySignedToken(token);
  if (!tokenVerify.valid || !tokenVerify.user) {
    return {
      success: false,
      error: tokenVerify.error || 'Mã xác thực (Token) không hợp lệ hoặc đã hết hạn.',
      status: 401,
    };
  }

  const user = tokenVerify.user;

  // 4. Role Authorization Check
  if (allowedRoles && allowedRoles.length > 0) {
    if (!allowedRoles.includes(user.role)) {
      return {
        success: false,
        error: `Từ chối truy cập (403 Forbidden): Vai trò "${user.role}" không có quyền thực hiện thao tác này. Thao tác yêu cầu: [${allowedRoles.join(', ')}].`,
        status: 403,
      };
    }
  }

  return {
    success: true,
    user,
    status: 200,
  };
}

/**
 * Verify staff credentials for login.
 * Strictly requires environment variables (MIPA_ADMIN_PASSWORD, MIPA_MARKETING_PASSWORD, MIPA_CSKH_PASSWORD).
 * REJECTS login if password is not configured in environment. NO hardcoded public fallback!
 */
export function verifyCredentials(credentials: { email?: string; role?: string; password?: string }): {
  user: AuthUser | null;
  error?: string;
} {
  const { email, role, password } = credentials;

  if (!password || password.trim() === '') {
    return { user: null, error: 'Mật khẩu là bắt buộc để đăng nhập.' };
  }

  let staff;
  if (email) {
    staff = SYSTEM_STAFF_ACCOUNTS.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
  } else if (role) {
    staff = SYSTEM_STAFF_ACCOUNTS.find(u => u.role === role);
  }

  if (!staff) {
    return { user: null, error: 'Tài khoản không tồn tại trên hệ thống Maison MIPA.' };
  }

  // Read password strictly from environment variable
  let configuredPassword: string | undefined;
  if (staff.role === 'admin') configuredPassword = process.env.MIPA_ADMIN_PASSWORD;
  else if (staff.role === 'marketing') configuredPassword = process.env.MIPA_MARKETING_PASSWORD;
  else if (staff.role === 'cskh') configuredPassword = process.env.MIPA_CSKH_PASSWORD;

  if (!configuredPassword || configuredPassword.trim() === '') {
    return {
      user: null,
      error: `Hệ thống chưa được cấu hình mật khẩu biến môi trường MIPA_${staff.role.toUpperCase()}_PASSWORD. Vui lòng thiết lập biến môi trường trước khi đăng nhập.`,
    };
  }

  // Constant-time hash verification
  const inputHash = crypto.createHash('sha256').update(password).digest('hex');
  const targetHash = crypto.createHash('sha256').update(configuredPassword).digest('hex');

  const inputBuf = Buffer.from(inputHash);
  const targetBuf = Buffer.from(targetHash);

  if (inputBuf.length !== targetBuf.length || !crypto.timingSafeEqual(inputBuf, targetBuf)) {
    return { user: null, error: 'Mật khẩu không chính xác.' };
  }

  // Issue freshly signed HMAC token
  const token = issueSignedToken(staff.id, staff.role);

  return {
    user: {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
      token,
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
