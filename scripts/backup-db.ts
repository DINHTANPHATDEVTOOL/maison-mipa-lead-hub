import fs from 'fs';
import path from 'path';
import { getDbPool } from '../src/lib/db';

async function backupDatabase() {
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
  let totalRecords = 0;

  for (const table of tables) {
    try {
      const res = await pool.query(`SELECT * FROM ${table}`);
      backupData[table] = res.rows;
      totalRecords += res.rows.length;
      console.log(`[+] Bảng "${table}": ${res.rows.length} bản ghi`);
    } catch (err: any) {
      console.warn(`[!] Bỏ qua bảng "${table}" (${err.message})`);
      backupData[table] = [];
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `backup_${timestamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf-8');

  console.log('\n========================================================');
  console.log(`  SAO LƯU THÀNH CÔNG!`);
  console.log(`  - Tổng bản ghi: ${totalRecords}`);
  console.log(`  - Đường dẫn tệp: ${backupFile}`);
  console.log('========================================================');
}

backupDatabase().then(() => process.exit(0)).catch(err => {
  console.error('[-] Lỗi sao lưu CSDL:', err);
  process.exit(1);
});
