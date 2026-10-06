import { getDbPool } from '../db';
import crypto from 'crypto';

export interface UserAccount {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export class AuthRepository {
  async revokeToken(tokenOrJti: string, expiresAt?: Date): Promise<void> {
    const pool = getDbPool();
    // Normalize to SHA-256 jti if long token string
    const jti = tokenOrJti.length > 64
      ? crypto.createHash('sha256').update(tokenOrJti).digest('hex')
      : tokenOrJti;

    const exp = expiresAt || new Date(Date.now() + 7 * 86400 * 1000);

    const query = `
      INSERT INTO revoked_tokens (jti, revoked_at, expires_at)
      VALUES ($1, NOW(), $2)
      ON CONFLICT (jti) DO UPDATE SET
        revoked_at = NOW(),
        expires_at = EXCLUDED.expires_at;
    `;

    await pool.query(query, [jti, exp.toISOString()]);
  }

  async isTokenRevoked(tokenOrJti: string): Promise<boolean> {
    const pool = getDbPool();
    const jti = tokenOrJti.length > 64
      ? crypto.createHash('sha256').update(tokenOrJti).digest('hex')
      : tokenOrJti;

    const res = await pool.query(
      'SELECT jti FROM revoked_tokens WHERE jti = $1 AND expires_at > NOW()',
      [jti]
    );

    return res.rows.length > 0;
  }

  async cleanExpiredRevocations(): Promise<number> {
    const pool = getDbPool();
    const res = await pool.query('DELETE FROM revoked_tokens WHERE expires_at <= NOW()');
    return res.rowCount || 0;
  }

  async getUserByUsername(username: string): Promise<UserAccount | null> {
    const pool = getDbPool();
    const res = await pool.query(
      'SELECT * FROM user_accounts WHERE username = $1 AND is_active = TRUE',
      [username]
    );
    return res.rows[0] || null;
  }

  async getUserById(id: string): Promise<UserAccount | null> {
    const pool = getDbPool();
    const res = await pool.query(
      'SELECT * FROM user_accounts WHERE id = $1 AND is_active = TRUE',
      [id]
    );
    return res.rows[0] || null;
  }

  async upsertUser(user: {
    id: string;
    username: string;
    password_hash: string;
    role: string;
    is_active?: boolean;
  }): Promise<UserAccount> {
    const pool = getDbPool();
    const isActive = user.is_active !== undefined ? user.is_active : true;

    const query = `
      INSERT INTO user_accounts (id, username, password_hash, role, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (username) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING *;
    `;

    const res = await pool.query(query, [user.id, user.username, user.password_hash, user.role, isActive]);
    return res.rows[0];
  }
}

export const authRepo = new AuthRepository();
