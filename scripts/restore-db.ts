import '../src/lib/env';
import fs from 'fs';
import path from 'path';
import { getDbPool } from '../src/lib/db';

export async function restoreDatabase(customFilePath?: string): Promise<{ targetFile: string; restoredRecords: number; tableCounts: Record<string, number> }> {
  console.log('========================================================');
  console.log('  MAISON MIPA LEAD HUB - PHỤC HỒI DỮ LIỆU CSDL POSTGRESQL');
  console.log('========================================================\n');

  const pool = getDbPool();
  const backupDir = path.join(process.cwd(), 'data', 'backups');

  // Find target backup file
  let targetFile = customFilePath || process.argv[2];

  if (!targetFile) {
    if (!fs.existsSync(backupDir)) {
      throw new Error('[-] Không tìm thấy thư mục sao lưu: data/backups');
    }
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json')).sort().reverse();
    if (files.length === 0) {
      throw new Error('[-] Không có tệp sao lưu nào trong data/backups');
    }
    targetFile = path.join(backupDir, files[0]);
  }

  if (!fs.existsSync(targetFile)) {
    throw new Error(`[-] Tệp sao lưu không tồn tại: ${targetFile}`);
  }

  console.log(`[*] Đang phục hồi từ tệp: ${targetFile}`);
  const raw = fs.readFileSync(targetFile, 'utf-8');
  const backupData: Record<string, any[]> = JSON.parse(raw);

  // Restore order respecting foreign keys
  const restoreOrder = [
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

  const conflictTargetMap: Record<string, string> = {
    schema_migrations: '(version)',
    revoked_tokens: '(jti)',
    app_settings: '(key)',
    facebook_pages: '(page_id)',
  };

  let restoredRecords = 0;
  const tableCounts: Record<string, number> = {};

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const table of restoreOrder) {
      const rows = backupData[table] || [];
      if (rows.length === 0) {
        tableCounts[table] = 0;
        continue;
      }

      console.log(`[*] Đang phục hồi bảng "${table}" (${rows.length} bản ghi)...`);
      let tableInserted = 0;

      for (const row of rows) {
        const keys = Object.keys(row);
        const values = Object.values(row).map((val) => {
          if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
            return JSON.stringify(val);
          }
          return val;
        });
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const columns = keys.join(', ');
        const conflictClause = conflictTargetMap[table]
          ? `ON CONFLICT ${conflictTargetMap[table]} DO NOTHING`
          : (keys.includes('id') ? 'ON CONFLICT (id) DO NOTHING' : 'ON CONFLICT DO NOTHING');

        const insertQuery = `
          INSERT INTO ${table} (${columns})
          VALUES (${placeholders})
          ${conflictClause}
        `;

        try {
          const res = await client.query(insertQuery, values);
          if ((res.rowCount ?? 0) > 0) {
            tableInserted++;
            restoredRecords++;
          }
        } catch (err: any) {
          console.error(`[-] Lỗi insert bản ghi bảng "${table}":`, err.message);
          throw new Error(`Phục hồi bảng "${table}" thất bại tại bản ghi: ${err.message}`);
        }
      }

      tableCounts[table] = tableInserted;
      console.log(`[+] Đã phục hồi bảng "${table}": ${tableInserted}/${rows.length} bản ghi`);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  console.log('\n========================================================');
  console.log(`  PHỤC HỒI DỮ LIỆU HOÀN TẤT!`);
  console.log(`  - Đã nạp thành công: ${restoredRecords} bản ghi`);
  console.log('========================================================');

  return { targetFile, restoredRecords, tableCounts };
}

if (require.main === module) {
  restoreDatabase().then(() => process.exit(0)).catch(err => {
    console.error('[-] Lỗi phục hồi CSDL:', err);
    process.exit(1);
  });
}
