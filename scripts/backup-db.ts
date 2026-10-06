import '../src/lib/env';
import fs from 'fs';
import path from 'path';
import { getDbPool } from '../src/lib/db';

export async function backupDatabase(targetFilePath?: string): Promise<{ backupFile: string; totalRecords: number; tableCounts: Record<string, number> }> {
  console.log('========================================================');
  console.log('  MAISON MIPA LEAD HUB - SAO LƯU DỮ LIỆU CSDL POSTGRESQL');
  console.log('========================================================\n');

  const pool = getDbPool();
  const backupDir = path.join(process.cwd(), 'data', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const tables = [
    'schema_migrations',
    'facebook_groups',
    'facebook_pages',
    'facebook_sessions',
    'services',
    'outreach_templates',
    'facebook_posts',
    'lead_classifications',
    'outreach_interactions',
    'outreach_attempts',
    'crm_leads',
    'system_heartbeats',
    'app_settings',
    'scheduled_jobs',
    'audit_events',
    'revoked_tokens',
    'user_accounts'
  ];

  const backupData: Record<string, any[]> = {};
  const tableCounts: Record<string, number> = {};
  let totalRecords = 0;

  const client = await pool.connect();
  try {
    // Consistent snapshot transaction isolation (REPEATABLE READ)
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    } catch {
      await client.query('BEGIN');
    }

    for (const table of tables) {
      try {
        const res = await client.query(`SELECT * FROM ${table}`);
        backupData[table] = res.rows;
        tableCounts[table] = res.rows.length;
        totalRecords += res.rows.length;
        console.log(`[+] Bảng "${table}": ${res.rows.length} bản ghi`);
      } catch (err: any) {
        // Strict error propagation: fail backup if existing table fails
        if (err.code === '42P01') {
          // Relation does not exist - record empty
          backupData[table] = [];
          tableCounts[table] = 0;
        } else {
          console.error(`[-] Lỗi đọc bảng "${table}":`, err.message);
          throw new Error(`Sao lưu bảng "${table}" thất bại: ${err.message}`);
        }
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const rawJson = JSON.stringify(backupData);
  const crypto = require('crypto');
  const checksum = crypto.createHash('sha256').update(rawJson).digest('hex');

  const exportPayload = {
    metadata: {
      timestamp: new Date().toISOString(),
      schema_version: 3,
      checksum,
      total_records: totalRecords,
    },
    tables: backupData,
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = targetFilePath || path.join(backupDir, `backup_${timestamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(exportPayload, null, 2), 'utf-8');

  console.log('\n========================================================');
  console.log(`  SAO LƯU THÀNH CÔNG!`);
  console.log(`  - Tổng bản ghi: ${totalRecords}`);
  console.log(`  - Đường dẫn tệp: ${backupFile}`);
  console.log('========================================================');

  return { backupFile, totalRecords, tableCounts };
}

if (require.main === module) {
  backupDatabase().then(() => process.exit(0)).catch(err => {
    console.error('[-] Lỗi sao lưu CSDL:', err);
    process.exit(1);
  });
}
