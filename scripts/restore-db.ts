import fs from 'fs';
import path from 'path';
import { getDbPool } from '../src/lib/db';

async function restoreDatabase() {
  console.log('========================================================');
  console.log('  MAISON MIPA LEAD HUB - PHỤC HỒI DỮ LIỆU CSDL POSTGRESQL');
  console.log('========================================================\n');

  const pool = getDbPool();
  const backupDir = path.join(process.cwd(), 'data', 'backups');

  // Find target backup file
  const customFile = process.argv[2];
  let targetFile = customFile;

  if (!targetFile) {
    if (!fs.existsSync(backupDir)) {
      console.error('[-] Không tìm thấy thư mục sao lưu: data/backups');
      process.exit(1);
    }
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json')).sort().reverse();
    if (files.length === 0) {
      console.error('[-] Không có tệp sao lưu nào trong data/backups');
      process.exit(1);
    }
    targetFile = path.join(backupDir, files[0]);
  }

  if (!fs.existsSync(targetFile)) {
    console.error(`[-] Tệp sao lưu không tồn tại: ${targetFile}`);
    process.exit(1);
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

  let restoredRecords = 0;

  for (const table of restoreOrder) {
    const rows = backupData[table] || [];
    if (rows.length === 0) continue;

    console.log(`[*] Đang phục hồi bảng "${table}" (${rows.length} bản ghi)...`);

    for (const row of rows) {
      const keys = Object.keys(row);
      const values = Object.values(row);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const columns = keys.join(', ');

      try {
        await pool.query(`
          INSERT INTO ${table} (${columns})
          VALUES (${placeholders})
          ON CONFLICT (id) DO NOTHING
        `, values);
        restoredRecords++;
      } catch (err: any) {
        // Fallback for tables without id PK or specific unique constraints
        try {
          await pool.query(`
            INSERT INTO ${table} (${columns})
            VALUES (${placeholders})
            ON CONFLICT DO NOTHING
          `, values);
          restoredRecords++;
        } catch (innerErr: any) {
          console.warn(`    [!] Bỏ qua bản ghi trong ${table}: ${innerErr.message}`);
        }
      }
    }
    console.log(`[+] Đã phục hồi bảng "${table}"`);
  }

  console.log('\n========================================================');
  console.log(`  PHỤC HỒI DỮ LIỆU HOÀN TẤT!`);
  console.log(`  - Đã nạp thành công: ${restoredRecords} bản ghi`);
  console.log('========================================================');
}

restoreDatabase().then(() => process.exit(0)).catch(err => {
  console.error('[-] Lỗi phục hồi CSDL:', err);
  process.exit(1);
});
