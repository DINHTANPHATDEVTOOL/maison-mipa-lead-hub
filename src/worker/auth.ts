import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const SESSION_DIR = path.join(process.cwd(), 'data', 'auth');
const SESSION_FILE = path.join(SESSION_DIR, 'facebook_storage_state.json');
const ENCRYPTED_SESSION_FILE = path.join(SESSION_DIR, 'facebook_storage_state.enc');

export class FacebookAuthManager {
  private encryptionKey: string;

  constructor(encryptionKey?: string) {
    const envKey = process.env.FACEBOOK_SESSION_ENCRYPTION_KEY?.trim();
    const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build' || process.env.npm_lifecycle_event === 'build';
    if (process.env.NODE_ENV === 'production' && !isBuildPhase && !envKey && !encryptionKey) {
      throw new Error(
        '[AuthManager Error] Biến môi trường FACEBOOK_SESSION_ENCRYPTION_KEY là bắt buộc trong môi trường Production. Không được sử dụng khóa phái sinh công khai.'
      );
    }
    if (!envKey && !encryptionKey) {
      if (!isBuildPhase) {
        console.warn('[AuthManager WARNING] Chưa cấu hình FACEBOOK_SESSION_ENCRYPTION_KEY trong .env. Sử dụng khóa phái sinh từ môi trường máy.');
      }
    }
    this.encryptionKey = encryptionKey || envKey || this.deriveMachineKey();
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true, mode: 0o700 });
    }
  }

  public deleteSession(): void {
    try {
      if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
      if (fs.existsSync(ENCRYPTED_SESSION_FILE)) fs.unlinkSync(ENCRYPTED_SESSION_FILE);
    } catch (e) {
      console.error('[AuthManager] Lỗi khi xóa phiên đăng nhập:', e);
    }
  }

  public clearPlaintextSession(): void {
    try {
      if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
    } catch {}
  }

  private deriveMachineKey(): string {
    const salt = 'mipa-lead-hub-secure-auth-salt-v1';
    const machineId = process.env.HOSTNAME || process.env.USER || 'mipa-local-node';
    return crypto.createHash('sha256').update(`${machineId}:${salt}`).digest('hex');
  }

  public hasStoredSession(): boolean {
    return fs.existsSync(ENCRYPTED_SESSION_FILE) || fs.existsSync(SESSION_FILE);
  }

  public getSessionPath(): string | null {
    if (fs.existsSync(SESSION_FILE)) {
      const summary = this.validateStorageStateFile(SESSION_FILE);
      if (summary.valid) return SESSION_FILE;
    }
    if (fs.existsSync(ENCRYPTED_SESSION_FILE)) {
      const decrypted = this.decryptSession();
      if (decrypted) {
        fs.writeFileSync(SESSION_FILE, decrypted, { encoding: 'utf-8', mode: 0o600 });
        const summary = this.validateStorageStateFile(SESSION_FILE);
        if (summary.valid) return SESSION_FILE;
      }
    }
    return null;
  }

  public saveSession(storageStateJson: string): { success: boolean; error?: string } {
    try {
      const parsed = JSON.parse(storageStateJson);
      if (!parsed.cookies || !Array.isArray(parsed.cookies)) {
        return { success: false, error: 'Định dạng storageState không hợp lệ: thiếu mảng cookies.' };
      }

      // Check required Facebook cookies
      const hasCUser = parsed.cookies.some((c: any) => c.name === 'c_user');
      const hasXs = parsed.cookies.some((c: any) => c.name === 'xs');
      if (!hasCUser || !hasXs) {
        return { success: false, error: 'Thiếu cookie cốt lõi Facebook (c_user hoặc xs).' };
      }

      // Encrypt with AES-256-GCM + random 12-byte IV + 16-byte Auth Tag
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', this.getKeyBuffer(), iv);
      let encrypted = cipher.update(storageStateJson, 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      const tag = cipher.getAuthTag();

      // Combined payload: [12 bytes IV][16 bytes TAG][Ciphertext]
      const payload = Buffer.concat([iv, tag, encrypted]);
      fs.writeFileSync(ENCRYPTED_SESSION_FILE, payload, { mode: 0o600 });

      // Save plaintext copy with restricted permissions (0o600) for Playwright runner
      fs.writeFileSync(SESSION_FILE, storageStateJson, { encoding: 'utf-8', mode: 0o600 });

      return { success: true };
    } catch (err: any) {
      console.error('[AuthManager] Lỗi lưu phiên đăng nhập:', err);
      return { success: false, error: err.message };
    }
  }

  private decryptSession(): string | null {
    if (!fs.existsSync(ENCRYPTED_SESSION_FILE)) return null;
    try {
      const payload = fs.readFileSync(ENCRYPTED_SESSION_FILE);
      if (payload.length < 28) {
        // Fallback check if it was legacy hex format
        return this.decryptLegacyHex(payload.toString('utf-8'));
      }

      const iv = payload.subarray(0, 12);
      const tag = payload.subarray(12, 28);
      const ciphertext = payload.subarray(28);

      const decipher = crypto.createDecipheriv('aes-256-gcm', this.getKeyBuffer(), iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(ciphertext, undefined, 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      console.error('[AuthManager] Lỗi giải mã phiên đăng nhập AES-GCM:', err);
      // Try fallback to legacy hex if migration needed
      return null;
    }
  }

  private decryptLegacyHex(hexString: string): string | null {
    try {
      const fixedIv = Buffer.alloc(16, 0);
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.getKeyBuffer(), fixedIv);
      let decrypted = decipher.update(hexString, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      return null;
    }
  }

  private getKeyBuffer(): Buffer {
    return crypto.createHash('sha256').update(this.encryptionKey).digest();
  }

  private validateStorageStateFile(filePath: string): { valid: boolean; reason?: string; userId?: string } {
    try {
      if (!fs.existsSync(filePath)) return { valid: false, reason: 'File không tồn tại' };
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      if (!data.cookies || !Array.isArray(data.cookies)) {
        return { valid: false, reason: 'Thiếu mảng cookies' };
      }
      const cUserCookie = data.cookies.find((c: any) => c.name === 'c_user');
      const xsCookie = data.cookies.find((c: any) => c.name === 'xs');

      if (!cUserCookie || !xsCookie) {
        return { valid: false, reason: 'Thiếu cookie định danh Facebook (c_user, xs)' };
      }

      // Check cookie expiration
      const nowSec = Math.floor(Date.now() / 1000);
      if (cUserCookie.expires && cUserCookie.expires < nowSec) {
        return { valid: false, reason: 'Phiên đăng nhập c_user đã hết hạn', userId: cUserCookie.value };
      }

      return { valid: true, userId: cUserCookie.value };
    } catch (e: any) {
      return { valid: false, reason: e.message };
    }
  }

  public getSessionSummary(): {
    exists: boolean;
    valid: boolean;
    userId: string | null;
    lastUpdated: string | null;
    filePath: string | null;
    reason?: string;
  } {
    const hasEnc = fs.existsSync(ENCRYPTED_SESSION_FILE);
    const hasPlain = fs.existsSync(SESSION_FILE);

    if (!hasEnc && !hasPlain) {
      return {
        exists: false,
        valid: false,
        userId: null,
        lastUpdated: null,
        filePath: null,
        reason: 'Chưa có file phiên đăng nhập nào (facebook_storage_state.json hoặc .enc).',
      };
    }

    const targetFile = hasPlain ? SESSION_FILE : ENCRYPTED_SESSION_FILE;
    const stat = fs.statSync(targetFile);

    if (hasPlain) {
      const validation = this.validateStorageStateFile(SESSION_FILE);
      return {
        exists: true,
        valid: validation.valid,
        userId: validation.userId || null,
        lastUpdated: stat.mtime.toISOString(),
        filePath: SESSION_FILE,
        reason: validation.reason,
      };
    }

    // Try decrypting to validate
    const decrypted = this.decryptSession();
    if (!decrypted) {
      return {
        exists: true,
        valid: false,
        userId: null,
        lastUpdated: stat.mtime.toISOString(),
        filePath: ENCRYPTED_SESSION_FILE,
        reason: 'Không thể giải mã file phiên đăng nhập (khóa không đúng hoặc file hỏng).',
      };
    }

    try {
      const data = JSON.parse(decrypted);
      const cUser = data.cookies?.find((c: any) => c.name === 'c_user');
      const xs = data.cookies?.find((c: any) => c.name === 'xs');
      const valid = Boolean(cUser && xs);
      return {
        exists: true,
        valid,
        userId: cUser?.value || null,
        lastUpdated: stat.mtime.toISOString(),
        filePath: ENCRYPTED_SESSION_FILE,
        reason: valid ? 'Phiên đăng nhập hợp lệ và được mã hóa AES-256-GCM.' : 'Thiếu cookie Facebook cốt lõi.',
      };
    } catch {
      return {
        exists: true,
        valid: false,
        userId: null,
        lastUpdated: stat.mtime.toISOString(),
        filePath: ENCRYPTED_SESSION_FILE,
        reason: 'Nội dung giải mã không phải JSON hợp lệ.',
      };
    }
  }

  public getStorageStatePath(): string | undefined {
    const summary = this.getSessionSummary();
    return summary.filePath || undefined;
  }
}

export const authManager = new FacebookAuthManager();
