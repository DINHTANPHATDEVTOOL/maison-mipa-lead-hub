import { newDb } from 'pg-mem';
import { runMigrations } from '../src/lib/db/migrate';
import { postRepo } from '../src/lib/repositories/post.repository';
import { getDbPool } from '../src/lib/db';
import assert from 'assert';
import fs from 'fs';
import path from 'path';

async function runTests() {
  console.log('================================================================');
  console.log('  KIỂM THỬ N01 & N10: SCHEMA UPGRADE & POST AUTO-HEAL / FK');
  console.log('================================================================');

  // Test 1: N01 - Test migration on fresh empty DB
  console.log('\n--- 1. Kiểm tra Migration 001 + 002 trên DB rỗng ---');
  const freshDb = newDb();
  freshDb.public.registerFunction({
    name: 'uuid_generate_v4',
    implementation: () => require('crypto').randomUUID(),
  });
  const freshAdapter = freshDb.adapters.createPg();
  const freshClient = new freshAdapter.Client();
  await freshClient.connect();

  // Execute migration 001
  const sql001 = fs.readFileSync(path.join(process.cwd(), 'src/lib/db/migrations/001_initial_schema.sql'), 'utf-8')
    .replace(/CREATE EXTENSION IF NOT EXISTS [^;]+;/g, '');
  freshDb.public.none(sql001);
  await freshClient.query(`INSERT INTO schema_migrations (version, name) VALUES (1, '001_initial_schema')`);

  // Execute migration 002
  const sql002 = fs.readFileSync(path.join(process.cwd(), 'src/lib/db/migrations/002_upgrade_confidence_score.sql'), 'utf-8');
  const stmts002 = sql002.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').split(';').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
  for (const stmt of stmts002) {
    await freshClient.query(stmt);
  }
  await freshClient.query(`INSERT INTO schema_migrations (version, name) VALUES (2, '002_upgrade_confidence_score')`);

  // Verify versions
  const versions = await freshClient.query('SELECT version FROM schema_migrations ORDER BY version ASC');
  assert.strictEqual(versions.rows.length, 2, 'Cả hai version 1 và 2 phải được lưu trong schema_migrations');
  console.log('✓ [PASS] Cả migration 001 và 002 đều được áp dụng thành công trên DB rỗng');

  // Test 2: N01 - Test upgrading legacy DB where migration 001 was already applied with scale 4
  console.log('\n--- 2. Kiểm tra Nâng Cấp Schema từ DB cũ (Đã chạy 001, NUMERIC(5,4)) ---');
  const dbLegacy = newDb();
  const adapter = dbLegacy.adapters.createPg();
  const legacyClient = new adapter.Client();
  await legacyClient.connect();

  // Create schema_migrations with version 1
  await legacyClient.query(`
    CREATE TABLE schema_migrations (
      version INT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
    INSERT INTO schema_migrations (version, name) VALUES (1, '001_initial_schema');
  `);

  // Create legacy table with NUMERIC(5, 4) and sample row with 0.8500
  await legacyClient.query(`
    CREATE TABLE lead_classifications (
      id VARCHAR(64) PRIMARY KEY,
      post_id VARCHAR(64) NOT NULL,
      intent VARCHAR(50) NOT NULL,
      service_detected VARCHAR(100),
      location VARCHAR(100),
      pax INT,
      shooting_date_text TEXT,
      shooting_date_suggested DATE,
      budget_raw TEXT,
      extra_requirements TEXT,
      confidence_score NUMERIC(5, 4) NOT NULL DEFAULT 1.0,
      classification_reason TEXT,
      suggested_template_id VARCHAR(64),
      suggested_comment_text TEXT,
      review_status VARCHAR(50) NOT NULL DEFAULT 'pending',
      reviewed_by VARCHAR(100),
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    INSERT INTO lead_classifications (id, post_id, intent, confidence_score)
    VALUES ('cls_old_1', 'post_old_1', 'looking_for_service', 0.8500);
  `);

  // Execute migration 002 SQL statements on legacy DB
  for (const stmt of stmts002) {
    await legacyClient.query(stmt);
  }
  await legacyClient.query(`INSERT INTO schema_migrations (version, name) VALUES (2, '002_upgrade_confidence_score')`);

  // Verify row was scaled to 85.00 and column accepts > 1.0
  const checkRow = await legacyClient.query('SELECT confidence_score FROM lead_classifications WHERE id = $1', ['cls_old_1']);
  const val = Number(checkRow.rows[0].confidence_score);
  assert.strictEqual(val, 85, `Dữ liệu cũ 0.85 phải được nhân lên thành 85.00 (thực tế: ${val})`);

  // Verify inserting 100.0 score succeeds without overflow
  await legacyClient.query(`
    INSERT INTO lead_classifications (id, post_id, intent, confidence_score)
    VALUES ('cls_new_1', 'post_new_1', 'looking_for_service', 100.00);
  `);
  const checkNew = await legacyClient.query('SELECT confidence_score FROM lead_classifications WHERE id = $1', ['cls_new_1']);
  assert.strictEqual(Number(checkNew.rows[0].confidence_score), 100, 'Điểm 100.00 phải lưu thành công');
  console.log('✓ [PASS] Nâng cấp migration 002 bảo toàn và chuyển đổi dữ liệu cũ chính xác (0.85 -> 85.00)');

  // Test 3: N10 - Create post without group_id (NULL FK)
  console.log('\n--- 3. Kiểm tra Nhập Bài Viết Không Chọn Nhóm (group_id = NULL) ---');
  process.env.DATABASE_URL = 'memory';
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    const postNoGroup = await postRepo.createIfNew({
      content_raw: 'Cần tìm studio chụp ảnh cưới phong cách Hàn Quốc tại Hà Nội',
      author_name: 'Lan Hương',
      post_url: 'https://facebook.com/groups/wedding/posts/10000000001',
    });
    assert(postNoGroup.isNew, 'Bài viết phải được tạo mới');
    assert.strictEqual(postNoGroup.post.group_id, null, 'group_id phải là null khi không chọn nhóm');
    assert(postNoGroup.classification, 'Bài viết phải có classification');
    console.log('✓ [PASS] Nhập bài viết không chọn nhóm thành công, group_id = NULL không gây lỗi FK');

    // Test 4: N10 - Auto-heal classification for legacy incomplete post
    console.log('\n--- 4. Kiểm tra Auto-Heal Phân Loại Cho Bài Viết Dở Dang ---');
    // Simulate legacy post with missing classification by deleting its classification row
    await client.query('DELETE FROM lead_classifications WHERE post_id = $1', [postNoGroup.post.id]);
    const countBefore = await client.query('SELECT count(*) FROM lead_classifications WHERE post_id = $1', [postNoGroup.post.id]);
    assert.strictEqual(Number(countBefore.rows[0].count), 0, 'Classification phải đã bị xóa');

    // Re-import the exact same post URL
    const healedResult = await postRepo.createIfNew({
      content_raw: 'Cần tìm studio chụp ảnh cưới phong cách Hàn Quốc tại Hà Nội',
      author_name: 'Lan Hương',
      post_url: 'https://facebook.com/groups/wedding/posts/10000000001',
    });

    assert.strictEqual(healedResult.isNew, false, 'Bài viết cũ phải nhận diện isNew = false');
    assert(healedResult.classification, 'Phải tự động phục hồi classification');
    assert.strictEqual(healedResult.classification.intent, 'looking_for_service');

    const countAfter = await client.query('SELECT count(*) FROM lead_classifications WHERE post_id = $1', [postNoGroup.post.id]);
    assert.strictEqual(Number(countAfter.rows[0].count), 1, 'Hệ thống phải tự động phục hồi 1 bản ghi classification');
    console.log('✓ [PASS] Tự động phục hồi (Auto-heal) classification cho bài viết dở dang thành công');

    // Test 5: N10 - Multiple posts with distinct Facebook Post IDs
    console.log('\n--- 5. Kiểm tra Hai Bài Viết Có Facebook Post ID Khác Nhau ---');
    const p1 = await postRepo.createIfNew({
      facebook_post_id: 'fb_post_9991',
      content_raw: 'Tư vấn chụp ảnh gia đình 4 người',
      post_url: 'https://facebook.com/posts/9991',
    });
    const p2 = await postRepo.createIfNew({
      facebook_post_id: 'fb_post_9992',
      content_raw: 'Xin báo giá phóng ảnh kỷ yếu',
      post_url: 'https://facebook.com/posts/9992',
    });
    assert(p1.isNew, 'Bài 1 phải tạo mới');
    assert(p2.isNew, 'Bài 2 phải tạo mới');
    assert.notStrictEqual(p1.post.id, p2.post.id, 'Hai bài phải có ID độc lập');
    console.log('✓ [PASS] Hai bài viết có Facebook Post ID khác nhau được lưu độc lập');

    console.log('\n================================================================');
    console.log('✓ TẤT CẢ KIỂM THỬ N01 & N10 ĐÃ ĐẠT 100%!');
    console.log('================================================================\n');
  } finally {
    client.release();
  }
}

runTests().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
