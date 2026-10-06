import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { getDbPool } from '../src/lib/db';
import { groupRepo } from '../src/lib/repositories/group.repository';
import { postRepo } from '../src/lib/repositories/post.repository';
import { leadRepo } from '../src/lib/repositories/lead.repository';
import { serviceRepo } from '../src/lib/repositories/service.repository';
import { templateRepo } from '../src/lib/repositories/template.repository';
import { backupDatabase } from '../scripts/backup-db';
import { restoreDatabase } from '../scripts/restore-db';

async function runBackupRestoreTest() {
  console.log('======================================================================');
  console.log('MAISON MIPA LEAD HUB - KIỂM THỬ TÍCH HỢP SAO LƯU & PHỤC HỒI CSDL');
  console.log('======================================================================\n');

  const pool = getDbPool();
  const testDir = path.join(process.cwd(), 'data', 'test_backups');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  const testBackupFile = path.join(testDir, `test_backup_${Date.now()}.json`);

  try {
    // 1. Seed known relational data
    console.log('[*] Bước 1: Khởi tạo dữ liệu mẫu có quan hệ toàn vẹn...');
    const service = await serviceRepo.create({
      id: `srv-br-${Date.now()}`,
      code: 'SRV_BR_TEST',
      name: 'Gói chụp kiểm thử Backup Restore',
      base_price: 1500000,
    });

    const template = await templateRepo.create({
      id: `tpl-br-${Date.now()}`,
      service_id: service.id,
      title: 'Mẫu kiểm thử Backup',
      template_content: 'Chào bạn, gói {gia} tại {khu_vuc}',
    });

    const group = await groupRepo.create({
      id: `grp-br-${Date.now()}`,
      name: 'Nhóm Test Backup Restore',
      url: `https://facebook.com/groups/br_test_${Date.now()}`,
    });

    const { post } = await postRepo.createIfNew({
      id: `post-br-${Date.now()}`,
      group_id: group.id,
      group_name: group.name,
      content_raw: 'Cần tìm thợ chụp kỷ yếu tại quận 1',
      author_name: 'Khách Test Backup',
      post_url: `https://facebook.com/groups/br/posts/111222333_${Date.now()}`,
    });

    const lead = await leadRepo.create({
      id: `lead-br-${Date.now()}`,
      post_id: post.id,
      customer_name: 'Khách Test Backup',
      service_interest: service.name,
      stage: 'uncontacted',
      notes: 'Ghi chú kiểm thử sao lưu',
    });

    console.log('  ✓ Đã tạo Service, Template, Group, Post và CRM Lead liên kết.');

    // 2. Perform Backup
    console.log('\n[*] Bước 2: Thực thi sao lưu dữ liệu toàn diện trong transaction...');
    const backupResult = await backupDatabase(testBackupFile);
    assert(fs.existsSync(testBackupFile), 'Tệp sao lưu phải tồn tại trên đĩa');
    assert(backupResult.totalRecords > 0, 'Tổng bản ghi sao lưu phải lớn hơn 0');
    assert(backupResult.tableCounts['facebook_posts'] >= 1, 'Bảng facebook_posts phải có ít nhất 1 bản ghi');
    assert(backupResult.tableCounts['crm_leads'] >= 1, 'Bảng crm_leads phải có ít nhất 1 bản ghi');
    console.log('  ✓ [PASS] Sao lưu thành công với đầy đủ cấu trúc bảng và bản ghi.');

    // 3. Verify Backup File Contents
    console.log('\n[*] Bước 3: Kiểm tra cấu trúc nội dung tệp JSON sao lưu...');
    const rawContent = fs.readFileSync(testBackupFile, 'utf-8');
    const parsedData = JSON.parse(rawContent);
    const tablesMap = parsedData.tables || parsedData;
    assert(Array.isArray(tablesMap['facebook_posts']), 'Bảng facebook_posts trong JSON phải là mảng');
    const backedPost = tablesMap['facebook_posts'].find((p: any) => p.id === post.id);
    assert(backedPost !== undefined, 'Bài viết tạo ở bước 1 phải có trong tệp sao lưu');
    assert(backedPost.author_name === 'Khách Test Backup', 'Tên tác giả phải khớp chính xác');
    console.log('  ✓ [PASS] Tệp sao lưu bảo toàn chính xác dữ liệu bài viết và trường liên quan.');

    // 4. Modify data after backup to test true disaster/change restoration
    console.log('\n[*] Bước 4: Sửa đổi dữ liệu sau khi sao lưu để kiểm tra khả năng phục hồi thay thế...');
    await pool.query('UPDATE facebook_groups SET name = $1 WHERE id = $2', ['Changed after backup', group.id]);
    await pool.query('UPDATE facebook_posts SET author_name = $1 WHERE id = $2', ['Tên bị sửa sau backup', post.id]);

    const checkChanged = await groupRepo.getById(group.id);
    assert.strictEqual(checkChanged?.name, 'Changed after backup', 'Dữ liệu phải được sửa thành công trước khi restore');

    // 5. Perform Restore
    console.log('\n[*] Bước 5: Thực thi phục hồi từ tệp sao lưu...');
    const restoreResult = await restoreDatabase(testBackupFile);
    assert(restoreResult.restoredRecords > 0, 'Phục hồi phải khôi phục các bản ghi đã thay đổi');
    console.log(`  ✓ [PASS] Phục hồi hoàn tất: đã cập nhật ${restoreResult.restoredRecords} bản ghi.`);

    // 6. Verify Database Content Post-Restore
    console.log('\n[*] Bước 6: Kiểm tra tính toàn vẹn quan hệ và hoàn nguyên dữ liệu sau phục hồi...');
    const fetchedGroup = await groupRepo.getById(group.id);
    assert.strictEqual(fetchedGroup?.name, 'Nhóm Test Backup Restore', 'Tên nhóm phải được phục hồi về nguyên trạng lúc sao lưu');

    const fetchedLead = await leadRepo.getById(lead.id);
    assert(fetchedLead !== null, 'Lead phải tồn tại sau khi phục hồi');
    assert(fetchedLead?.customer_name === 'Khách Test Backup', 'Dữ liệu khách hàng phải toàn vẹn');

    const fetchedPost = await postRepo.getById(post.id);
    assert(fetchedPost !== null, 'Bài viết liên kết phải tồn tại sau khi phục hồi');
    assert.strictEqual(fetchedPost?.author_name, 'Khách Test Backup', 'Tên tác giả bài viết phải được hoàn nguyên về nguyên trạng lúc sao lưu');
    assert(fetchedPost?.id === fetchedLead?.post_id, 'Khóa ngoại post_id giữa Lead và Post phải khớp chính xác');

    console.log('  ✓ [PASS] Dữ liệu quan hệ giữa CRM Lead và Bài viết được bảo toàn và hoàn nguyên tuyệt đối.');

    console.log('\n======================================================================');
    console.log('✓ TẤT CẢ KIỂM THỬ SAO LƯU & PHỤC HỒI ĐẠT 100%!');
    console.log('======================================================================');
  } finally {
    if (fs.existsSync(testBackupFile)) {
      try { fs.unlinkSync(testBackupFile); } catch {}
    }
    if (fs.existsSync(testDir)) {
      try { fs.rmdirSync(testDir); } catch {}
    }
  }
}

if (require.main === module) {
  runBackupRestoreTest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n✗ [FAIL] Lỗi kiểm thử Backup & Restore:', err);
      process.exit(1);
    });
}

export { runBackupRestoreTest };
