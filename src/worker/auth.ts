import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const SESSION_DIR = path.join(process.cwd(), 'data', 'auth');
const SESSION_FILE = path.join(SESSION_DIR, 'facebook_storage_state.json');
const ENCRYPTED_SESSION_FILE = path.join(SESSION_DIR, 'facebook_storage_state.enc');

export class FacebookAuthManager {
  private encryptionKey: string;

  constructor(encryptionKey?: string) {
    this.encryptionKey = encryptionKey || process.env.FACEBOOK_SESSION_ENCRYPTION_KEY || 'mipa-default-fallback-key-32chars!';
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }
  }

  public hasStoredSession(): boolean {
    return fs.existsSync(SESSION_FILE) || fs.existsSync(ENCRYPTED_SESSION_FILE);
  }

  public getSessionPath(): string | null {
    if (fs.existsSync(SESSION_FILE)) {
      return SESSION_FILE;
    }
    if (fs.existsSync(ENCRYPTED_SESSION_FILE)) {
      this.decryptSession();
      return SESSION_FILE;
    }
    return null;
  }

  public saveSession(storageStateJson: string): void {
    // Write plain state for immediate Playwright use
    fs.writeFileSync(SESSION_FILE, storageStateJson, 'utf-8');

    // Encrypt for safe persistent storage
    const cipher = crypto.createCipheriv('aes-256-cbc', this.getKeyBuffer(), this.getIvBuffer());
    let encrypted = cipher.update(storageStateJson, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    fs.writeFileSync(ENCRYPTED_SESSION_FILE, encrypted, 'utf-8');
  }

  private decryptSession(): void {
    if (!fs.existsSync(ENCRYPTED_SESSION_FILE)) return;
    try {
      const encrypted = fs.readFileSync(ENCRYPTED_SESSION_FILE, 'utf-8');
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.getKeyBuffer(), this.getIvBuffer());
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      fs.writeFileSync(SESSION_FILE, decrypted, 'utf-8');
    } catch (err) {
      console.error('[AuthManager] Lỗi giải mã phiên đăng nhập:', err);
    }
  }

  private getKeyBuffer(): Buffer {
    return crypto.createHash('sha256').update(this.encryptionKey).digest();
  }

  private getIvBuffer(): Buffer {
    return Buffer.alloc(16, 0); // 16-byte fixed IV for local workspace sandbox
  }

  public getSessionSummary(): {
    exists: boolean;
    valid: boolean;
    lastUpdated: string | null;
    filePath: string | null;
  } {
    const exists = this.hasStoredSession();
    let mtime: string | null = null;
    if (fs.existsSync(SESSION_FILE)) {
      mtime = fs.statSync(SESSION_FILE).mtime.toISOString();
    } else if (fs.existsSync(ENCRYPTED_SESSION_FILE)) {
      mtime = fs.statSync(ENCRYPTED_SESSION_FILE).mtime.toISOString();
    }

    return {
      exists,
      valid: exists, // When present, session is ready for testing
      lastUpdated: mtime,
      filePath: exists ? (fs.existsSync(SESSION_FILE) ? SESSION_FILE : ENCRYPTED_SESSION_FILE) : null,
    };
  }
}

export const authManager = new FacebookAuthManager();
