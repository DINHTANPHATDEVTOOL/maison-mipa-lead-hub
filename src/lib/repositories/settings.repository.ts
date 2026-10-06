import { getDbPool } from '../db';

export class SettingsRepository {
  async getSetting<T = unknown>(key: string, defaultValue?: T): Promise<T> {
    const pool = getDbPool();
    const res = await pool.query('SELECT value FROM app_settings WHERE key = $1', [key]);
    if (!res.rows[0]) {
      return defaultValue as T;
    }
    return res.rows[0].value as T;
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    const pool = getDbPool();
    const query = `
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW();
    `;
    await pool.query(query, [key, JSON.stringify(value)]);
  }

  async getAllSettings(): Promise<Record<string, unknown>> {
    const pool = getDbPool();
    const res = await pool.query('SELECT key, value FROM app_settings');
    const result: Record<string, unknown> = {};
    for (const row of res.rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  async deleteSetting(key: string): Promise<boolean> {
    const pool = getDbPool();
    const res = await pool.query('DELETE FROM app_settings WHERE key = $1 RETURNING key', [key]);
    return (res.rowCount || 0) > 0;
  }
}

export const settingsRepo = new SettingsRepository();
