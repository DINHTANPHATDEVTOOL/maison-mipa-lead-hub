import fs from 'fs';
import path from 'path';
import { getDbPool } from './index';

export async function runMigrations(): Promise<{ applied: string[]; skipped: string[] }> {
  const pool = getDbPool();
  const client = await pool.connect();
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    // 1. Ensure migrations tracker table exists
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          applied_at TIMESTAMPTZ
        );
      `);
    } catch (createErr: any) {
      // In pg-mem emulator or existing schema, verify if table already exists
      try {
        await client.query('SELECT version FROM schema_migrations LIMIT 1');
      } catch {
        throw createErr;
      }
    }

    // 2. Query already applied versions
    const existing = await client.query('SELECT version FROM schema_migrations ORDER BY version ASC');
    const appliedVersions = new Set<number>(existing.rows.map((r: any) => r.version));

    // 3. Read migration files
    const migrationsDir = path.join(process.cwd(), 'src', 'lib', 'db', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      return { applied, skipped };
    }

    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
      const match = file.match(/^(\d+)_(.+)\.sql$/);
      if (!match) continue;

      const version = parseInt(match[1], 10);
      const name = match[2];

      if (appliedVersions.has(version)) {
        skipped.push(file);
        continue;
      }

      console.log(`[Migrations] Đang thực thi migration ${file}...`);
      let sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

      await client.query('BEGIN');
      try {
        const statements = sql
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && !s.startsWith('--'));

        for (const stmt of statements) {
          if (stmt.toLowerCase().startsWith('create extension')) continue;
          await client.query(stmt);
        }

        await client.query(
          'INSERT INTO schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING',
          [version, name]
        );
        await client.query('COMMIT');
        applied.push(file);
        console.log(`[Migrations] ✓ Đã hoàn thành migration ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[Migrations] ✗ Thất bại khi thực thi migration ${file}:`, err);
        throw err;
      }
    }

    return { applied, skipped };
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then((res) => {
      console.log('[Migrations] Tổng kết:', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Migrations] Lỗi:', err);
      process.exit(1);
    });
}
