import { Pool, PoolClient } from 'pg';
import fs from 'fs';
import path from 'path';

let activePool: Pool | null = null;

export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Initializes and returns the primary PostgreSQL connection pool.
 * When in production, strictly connects to process.env.DATABASE_URL.
 * When in development/test without an external DB, uses an in-memory PostgreSQL emulator (pg-mem)
 * initialized with all 16 tables, constraints and indexes.
 */
export function getDbPool(): Pool {
  if (activePool) {
    return activePool;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl && databaseUrl !== 'memory') {
    activePool = new Pool({
      connectionString: databaseUrl,
      max: parseInt(process.env.DB_POOL_MAX || '20', 10),
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    });

    activePool.on('error', (err) => {
      console.error('[PostgreSQL Pool Error]', err);
    });

    return activePool;
  }

  if (isProductionEnv()) {
    throw new Error(
      '[Database Error] Biến môi trường DATABASE_URL là bắt buộc trong môi trường Production. Ứng dụng từ chối khởi động mà không có kết nối cơ sở dữ liệu PostgreSQL.'
    );
  }

  // Development / Test in-memory PostgreSQL emulator
  const { newDb } = require('pg-mem');
  const db = newDb();

  db.public.registerFunction({
    name: 'uuid_generate_v4',
    implementation: () => require('crypto').randomUUID(),
  });

  const migrationPath = path.join(process.cwd(), 'src', 'lib', 'db', 'migrations', '001_initial_schema.sql');
  if (fs.existsSync(migrationPath)) {
    let sql = fs.readFileSync(migrationPath, 'utf-8');
    sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS [^;]+;/g, '');
    db.public.none(sql);
    try {
      db.public.none(`INSERT INTO schema_migrations (version, name) VALUES (1, 'initial_schema') ON CONFLICT DO NOTHING;`);
    } catch {}
  }

  const adapter = db.adapters.createPg();
  activePool = new adapter.Pool();
  return activePool!;
}

/**
 * Reset pool instance (useful for test isolation)
 */
export async function closeDbPool(): Promise<void> {
  if (activePool) {
    try {
      await activePool.end();
    } catch {}
    activePool = null;
  }
}

/**
 * Execute callback within an isolated PostgreSQL transaction (BEGIN ... COMMIT / ROLLBACK)
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Health / Readiness check for database connectivity
 */
export async function checkDbHealth(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const pool = getDbPool();
    const res = await pool.query('SELECT 1 as alive');
    if (res.rows?.[0]?.alive === 1 || res.rows?.[0]?.alive === '1') {
      return { ok: true, latencyMs: Date.now() - start };
    }
    return { ok: false, latencyMs: Date.now() - start, error: 'Phản hồi kiểm tra sức khỏe cơ sở dữ liệu không hợp lệ' };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message || 'Không thể kết nối đến PostgreSQL' };
  }
}
