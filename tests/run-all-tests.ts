import { execSync } from 'child_process';

const testSuites = [
  { name: 'Phase A: Database & OCC Repositories', script: 'tests/test-phase-a-db.ts' },
  { name: 'Phase B: Page Identity & Comment Freshness', script: 'tests/test-phase-b-dispatch.ts' },
  { name: 'Phase C: Worker Scheduler & Session Encryption', script: 'tests/test-phase-c-worker.ts' },
  { name: 'Phase D: NLP Heuristics, CRM Pipeline & Formula Guard', script: 'tests/test-phase-d-ui-crm.ts' },
  { name: 'Phase E: Multi-Worker Soak & Concurrency Test', script: 'tests/test-soak.ts' },
  { name: 'Comprehensive P1/P2 Regression Matrix', script: 'tests/test-e2e-fixes.ts' },
];

console.log('======================================================================');
console.log('   MAISON MIPA LEAD HUB - MASTER VERIFICATION TEST RUNNER');
console.log('======================================================================\n');

let totalPassedSuites = 0;
let totalFailedSuites = 0;

for (const suite of testSuites) {
  console.log(`\n>>> ĐANG CHẠY SUITE: [${suite.name}]`);
  try {
    execSync(`npx tsx "${suite.script}"`, { stdio: 'inherit' });
    console.log(`>>> [PASS] ${suite.name} HOÀN TẤT THÀNH CÔNG.`);
    totalPassedSuites++;
  } catch (err) {
    console.error(`\n>>> [FAIL] ${suite.name} THẤT BẠI!`);
    totalFailedSuites++;
    break;
  }
}

console.log('\n======================================================================');
console.log('                 TỔNG KẾT TOÀN BỘ KIỂM THỬ HỆ THỐNG');
console.log('======================================================================');
console.log(`  - Suites đạt: ${totalPassedSuites}/${testSuites.length}`);
console.log(`  - Suites lỗi: ${totalFailedSuites}`);

if (totalFailedSuites === 0) {
  console.log('\n>>> TẤT CẢ CÁC BÀI TEST ĐẠT CHUẨN 100%. SẴN SÀNG BÀN GIAO!');
  process.exit(0);
} else {
  console.error('\n>>> CÓ LỖI XẢY RA TRONG QUÁ TRÌNH KIỂM THỬ.');
  process.exit(1);
}
