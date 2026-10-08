import '../lib/env';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const SESSION_DIR = path.join(process.cwd(), 'data', 'auth');
const SESSION_FILE = path.join(SESSION_DIR, 'facebook_storage_state.json');
const ENCRYPTED_SESSION_FILE = path.join(SESSION_DIR, 'facebook_storage_state.enc');

export function parseAnyCookieOrStorageState(raw: string): { cookies: any[]; origins?: any[] } | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();

  // 1. Check if JSON format
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return { cookies: parsed };
      }
      if (parsed && Array.isArray(parsed.cookies)) {
        return parsed;
      }
    } catch {}
  }

  // 2. Cookie string format (e.g. "c_user=1000123; xs=2:abc; sb=xyz;") or separated by semicolons/newlines
  const pairs = trimmed.split(/;|\n/).map((s) => s.trim()).filter(Boolean);
  const cookies: any[] = [];

  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx > 0) {
      const name = pair.substring(0, eqIdx).trim();
      const value = pair.substring(eqIdx + 1).trim();
      if (name) {
        cookies.push({
          name,
          value,
          domain: '.facebook.com',
          path: '/',
          httpOnly: false,
          secure: true,
          sameSite: 'None',
        });
      }
    }
  }

  if (cookies.length > 0) {
    return { cookies, origins: [] };
  }

  return null;
}

export class FacebookAuthManager {
  private encryptionKey: string;
  private sessionDir: string;
  private sessionFile: string;
  private encryptedSessionFile: string;

  constructor(encryptionKey?: string, customSessionDir?: string) {
    this.sessionDir = customSessionDir || SESSION_DIR;
    this.sessionFile = path.join(this.sessionDir, 'facebook_storage_state.json');
    this.encryptedSessionFile = path.join(this.sessionDir, 'facebook_storage_state.enc');

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
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true, mode: 0o700 });
    }
  }

  public deleteSession(): void {
    try {
      if (fs.existsSync(this.sessionFile)) fs.unlinkSync(this.sessionFile);
      if (fs.existsSync(this.encryptedSessionFile)) fs.unlinkSync(this.encryptedSessionFile);
      const tempFile = path.join(this.sessionDir, 'decrypted_temp_storage_state.json');
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch (e) {
      console.error('[AuthManager] Lỗi khi xóa phiên đăng nhập:', e);
    }
  }

  public clearPlaintextSession(): void {
    try {
      if (fs.existsSync(this.sessionFile)) fs.unlinkSync(this.sessionFile);
    } catch {}
  }

  private deriveMachineKey(): string {
    const salt = 'mipa-lead-hub-secure-auth-salt-v1';
    const machineId = process.env.HOSTNAME || process.env.USER || 'mipa-local-node';
    return crypto.createHash('sha256').update(`${machineId}:${salt}`).digest('hex');
  }

  public hasStoredSession(): boolean {
    if (fs.existsSync(this.encryptedSessionFile) || fs.existsSync(this.sessionFile)) return true;
    const profilesDir = path.join(this.sessionDir, 'profiles');
    if (fs.existsSync(profilesDir)) {
      const files = fs.readdirSync(profilesDir).filter((f) => f.endsWith('.enc'));
      if (files.length > 0) return true;
    }
    return false;
  }

  public getSessionPath(): string | null {
    if (fs.existsSync(this.sessionFile)) {
      const summary = this.validateStorageStateFile(this.sessionFile);
      if (summary.valid) return this.sessionFile;
    }
    if (fs.existsSync(this.encryptedSessionFile)) {
      const decrypted = this.decryptSession();
      if (decrypted) {
        fs.writeFileSync(this.sessionFile, decrypted, { encoding: 'utf-8', mode: 0o600 });
        const summary = this.validateStorageStateFile(this.sessionFile);
        if (summary.valid) return this.sessionFile;
      }
    }
    return null;
  }

  public getStorageState(): { cookies: any[]; origins?: any[] } | null {
    if (fs.existsSync(this.encryptedSessionFile)) {
      const decrypted = this.decryptSession();
      if (decrypted) {
        try {
          const parsed = JSON.parse(decrypted);
          if (parsed && Array.isArray(parsed.cookies)) {
            const hasCUser = parsed.cookies.some((c: any) => c.name === 'c_user');
            const hasXs = parsed.cookies.some((c: any) => c.name === 'xs');
            if (hasCUser && hasXs) return parsed;
          }
        } catch {}
      }
    }
    if (fs.existsSync(this.sessionFile)) {
      try {
        const raw = fs.readFileSync(this.sessionFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.cookies)) {
          const hasCUser = parsed.cookies.some((c: any) => c.name === 'c_user');
          const hasXs = parsed.cookies.some((c: any) => c.name === 'xs');
          if (hasCUser && hasXs) return parsed;
        }
      } catch {}
    }

    // Fallback: Check if any active profile session exists in profiles/*.enc
    const profilesDir = path.join(this.sessionDir, 'profiles');
    if (fs.existsSync(profilesDir)) {
      const files = fs.readdirSync(profilesDir).filter((f) => f.endsWith('.enc'));
      for (const file of files) {
        const pId = file.replace(/\.enc$/, '');
        const pState = this.getProfileStorageState(pId);
        if (pState) return pState;
      }
    }

    return null;
  }

  public getProfileSessionFile(profileId: string): string {
    const dir = path.join(this.sessionDir, 'profiles');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    return path.join(dir, `${profileId}.enc`);
  }

  public saveProfileSession(profileId: string, storageStateOrCookie: string): { success: boolean; userId?: string; error?: string } {
    try {
      const parsed = parseAnyCookieOrStorageState(storageStateOrCookie);
      if (!parsed || !parsed.cookies || !Array.isArray(parsed.cookies)) {
        return { success: false, error: 'Định dạng cookie không hợp lệ. Vui lòng dán chuỗi cookie (c_user=...; xs=...) hoặc JSON storageState.' };
      }
      const cUser = parsed.cookies.find((c: any) => c.name === 'c_user');
      const xs = parsed.cookies.find((c: any) => c.name === 'xs');
      if (!cUser || !xs) {
        return { success: false, error: 'Thiếu cookie cốt lõi Facebook (cần có ít nhất c_user và xs).' };
      }

      const normalizedJson = JSON.stringify(parsed);
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', this.getKeyBuffer(), iv);
      let encrypted = cipher.update(normalizedJson, 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      const tag = cipher.getAuthTag();

      const payload = Buffer.concat([iv, tag, encrypted]);
      const targetPath = this.getProfileSessionFile(profileId);
      fs.writeFileSync(targetPath, payload, { mode: 0o600 });

      return { success: true, userId: cUser.value };
    } catch (err: any) {
      console.error('[AuthManager] Lỗi lưu phiên profile:', err);
      return { success: false, error: err.message };
    }
  }

  public getProfileStorageState(profileId: string): { cookies: any[]; origins?: any[] } | null {
    const targetPath = this.getProfileSessionFile(profileId);
    if (fs.existsSync(targetPath)) {
      try {
        const payload = fs.readFileSync(targetPath);
        const iv = payload.subarray(0, 12);
        const tag = payload.subarray(12, 28);
        const ciphertext = payload.subarray(28);

        const candidateKeys = [
          this.getKeyBuffer(),
          crypto.createHash('sha256').update(this.deriveMachineKey()).digest(),
          crypto.createHash('sha256').update(`${process.env.USER || 'rd'}:mipa-lead-hub-secure-auth-salt-v1`).digest(),
        ];

        let decrypted: string | null = null;
        for (const key of candidateKeys) {
          try {
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(tag);
            let dec = decipher.update(ciphertext, undefined, 'utf8');
            dec += decipher.final('utf8');
            decrypted = dec;
            break;
          } catch {}
        }

        if (decrypted) {
          const parsed = JSON.parse(decrypted);
          if (parsed && Array.isArray(parsed.cookies)) {
            const hasCUser = parsed.cookies.some((c: any) => c.name === 'c_user');
            const hasXs = parsed.cookies.some((c: any) => c.name === 'xs');
            if (hasCUser && hasXs) return parsed;
          }
        }
      } catch (err) {
        console.error('[AuthManager] Lỗi giải mã phiên profile:', err);
      }
    }
    // Fallback to default single session
    return this.getStorageState();
  }

  public deleteProfileSession(profileId: string): void {
    const targetPath = this.getProfileSessionFile(profileId);
    if (fs.existsSync(targetPath)) {
      try { fs.unlinkSync(targetPath); } catch {}
    }
  }

  public hasProfileSession(profileId: string): boolean {
    const targetPath = this.getProfileSessionFile(profileId);
    if (fs.existsSync(targetPath)) return true;
    return this.hasStoredSession();
  }

  public getProfileSummary(profileId: string): { exists: boolean; valid: boolean; userId: string | null } {
    const state = this.getProfileStorageState(profileId);
    if (!state) return { exists: false, valid: false, userId: null };
    const cUser = state.cookies.find((c: any) => c.name === 'c_user');
    return {
      exists: true,
      valid: Boolean(cUser),
      userId: cUser?.value || null,
    };
  }

  public saveSession(storageStateOrCookie: string): { success: boolean; error?: string } {
    try {
      const parsed = parseAnyCookieOrStorageState(storageStateOrCookie);
      if (!parsed || !parsed.cookies || !Array.isArray(parsed.cookies)) {
        return { success: false, error: 'Định dạng cookie không hợp lệ: vui lòng dán c_user=...; xs=... hoặc JSON.' };
      }

      // Check required Facebook cookies
      const hasCUser = parsed.cookies.some((c: any) => c.name === 'c_user');
      const hasXs = parsed.cookies.some((c: any) => c.name === 'xs');
      if (!hasCUser || !hasXs) {
        return { success: false, error: 'Thiếu cookie cốt lõi Facebook (c_user hoặc xs).' };
      }

      const normalizedJson = JSON.stringify(parsed);
      // Encrypt with AES-256-GCM + random 12-byte IV + 16-byte Auth Tag
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', this.getKeyBuffer(), iv);
      let encrypted = cipher.update(normalizedJson, 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      const tag = cipher.getAuthTag();

      // Combined payload: [12 bytes IV][16 bytes TAG][Ciphertext]
      const payload = Buffer.concat([iv, tag, encrypted]);
      fs.writeFileSync(this.encryptedSessionFile, payload, { mode: 0o600 });

      // Clean up any plaintext session file on disk to prevent plaintext leakage
      if (fs.existsSync(this.sessionFile)) {
        try { fs.unlinkSync(this.sessionFile); } catch {}
      }

      return { success: true };
    } catch (err: any) {
      console.error('[AuthManager] Lỗi lưu phiên đăng nhập:', err);
      return { success: false, error: err.message };
    }
  }

  private decryptSession(): string | null {
    if (!fs.existsSync(this.encryptedSessionFile)) return null;
    try {
      const payload = fs.readFileSync(this.encryptedSessionFile);
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
    const hasEnc = fs.existsSync(this.encryptedSessionFile);
    const hasPlain = fs.existsSync(this.sessionFile);

    if (!hasEnc && !hasPlain) {
      const profilesDir = path.join(this.sessionDir, 'profiles');
      if (fs.existsSync(profilesDir)) {
        const profileFiles = fs.readdirSync(profilesDir).filter((f) => f.endsWith('.enc'));
        if (profileFiles.length > 0) {
          const firstProfileId = profileFiles[0].replace(/\.enc$/, '');
          const pSummary = this.getProfileSummary(firstProfileId);
          if (pSummary.exists) {
            const pPath = path.join(profilesDir, profileFiles[0]);
            const pStat = fs.statSync(pPath);
            return {
              exists: true,
              valid: pSummary.valid,
              userId: pSummary.userId,
              lastUpdated: pStat.mtime.toISOString(),
              filePath: pPath,
              reason: pSummary.valid ? `Phiên thiết bị [${firstProfileId}] hợp lệ.` : 'Phiên thiết bị không hợp lệ.',
            };
          }
        }
      }

      return {
        exists: false,
        valid: false,
        userId: null,
        lastUpdated: null,
        filePath: null,
        reason: 'Chưa có file phiên đăng nhập nào (facebook_storage_state.json hoặc .enc).',
      };
    }

    const targetFile = hasPlain ? this.sessionFile : this.encryptedSessionFile;
    const stat = fs.statSync(targetFile);

    if (hasPlain) {
      const validation = this.validateStorageStateFile(this.sessionFile);
      return {
        exists: true,
        valid: validation.valid,
        userId: validation.userId || null,
        lastUpdated: stat.mtime.toISOString(),
        filePath: this.sessionFile,
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
        filePath: this.encryptedSessionFile,
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
        filePath: this.encryptedSessionFile,
        reason: valid ? 'Phiên đăng nhập hợp lệ và được mã hóa AES-256-GCM.' : 'Thiếu cookie Facebook cốt lõi.',
      };
    } catch {
      return {
        exists: true,
        valid: false,
        userId: null,
        lastUpdated: stat.mtime.toISOString(),
        filePath: this.encryptedSessionFile,
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
