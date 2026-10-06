/**
 * Phase A Test Suite: PostgreSQL Data Layer, OCC Versioning & Token Revocation
 * Tests DB-01, DB-02, DB-03, DB-04, AUTH-01, AUTH-02
 */

import { checkDbHealth, getDbPool, withTransaction } from '../src/lib/db';
import { groupRepo } from '../src/lib/repositories/group.repository';
import { serviceRepo } from '../src/lib/repositories/service.repository';
import { templateRepo } from '../src/lib/repositories/template.repository';
import { leadRepo } from '../src/lib/repositories/lead.repository';
import { postRepo } from '../src/lib/repositories/post.repository';
import { outreachRepo } from '../src/lib/repositories/outreach.repository';
import { jobRepo } from '../src/lib/repositories/job.repository';
import { authRepo } from '../src/lib/repositories/auth.repository';
import { issueSignedToken, verifySignedToken, revokeToken, isTokenRevokedAsync } from '../src/lib/auth';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

async function runPhaseATests() {
  console.log('='.repeat(70));
  console.log('STARTING PHASE A (DATA & DATABASE ARCHITECTURE) TEST MATRIX');
  console.log('='.repeat(70));

  // -------------------------------------------------------------
  // DB-01: Connection Pool & Health Check
  // -------------------------------------------------------------
  console.log('\n[TEST GROUP 1] DB-01: Database Connection & Transaction Isolation');
  const isHealthy = await checkDbHealth();
  assert(isHealthy, 'DB-01.1: checkDbHealth() returns true');

  const pool = getDbPool();
  assert(pool !== null, 'DB-01.2: getDbPool() returns active connection pool');

  let txSuccess = false;
  await withTransaction(async (client) => {
    const res = await client.query('SELECT 1 as num');
    if (res.rows[0]?.num === 1) txSuccess = true;
  });
  assert(txSuccess, 'DB-01.3: withTransaction commits statement successfully');

  // -------------------------------------------------------------
  // DB-02: Concurrency-Safe Job Queue with FOR UPDATE SKIP LOCKED
  // -------------------------------------------------------------
  console.log('\n[TEST GROUP 2] DB-02: Scheduled Job Queue Concurrency (SKIP LOCKED)');
  const job1 = await jobRepo.createJob({
    job_type: 'crawl_group',
    target_id: 'grp-test-01',
    payload: { max_posts: 10 },
  });
  const job2 = await jobRepo.createJob({
    job_type: 'crawl_group',
    target_id: 'grp-test-02',
    payload: { max_posts: 15 },
  });
  assert(Boolean(job1.id && job2.id), 'DB-02.1: Created 2 scheduled jobs successfully');

  // Worker A claims job
  const claimedA = await jobRepo.claimNextJob('worker-A');
  assert(claimedA !== null, 'DB-02.2: Worker A claimed a job');

  // Worker B claims concurrently - must get the OTHER job, not double-claim Worker A's job!
  const claimedB = await jobRepo.claimNextJob('worker-B');
  assert(claimedB !== null, 'DB-02.3: Worker B claimed next job');
  assert(claimedA?.id !== claimedB?.id, 'DB-02.4: Worker A and Worker B claimed DISTINCT jobs (No duplicate claiming)');

  // Complete job A, fail job B
  if (claimedA) {
    const comp = await jobRepo.completeJob(claimedA.id);
    assert(comp, 'DB-02.5: Completed job successfully');
  }
  if (claimedB) {
    const failedJob = await jobRepo.failJob(claimedB.id, 'Test simulated error', 60);
    assert(failedJob?.status === 'pending' && failedJob.attempts === 1, 'DB-02.6: Failed job scheduled for retry');
  }

  // -------------------------------------------------------------
  // DB-03: Optimistic Concurrency Control (OCC) Versioning
  // -------------------------------------------------------------
  console.log('\n[TEST GROUP 3] DB-03: Optimistic Concurrency Control (OCC) for Templates & CRM Leads');

  // 1. Template OCC test
  const testTpl = await templateRepo.create({
    id: `tpl_occ_${Date.now()}`,
    title: 'Mẫu OCC Test',
    template_content: 'Nội dung {gia}',
  });
  assert(testTpl.version === 1, 'DB-03.1: Template created with version 1');

  // Staff 1 updates with current version 1 -> succeeds, bumps to version 2
  const occ1 = await templateRepo.updateWithOcc(testTpl.id, 1, { title: 'Mẫu đã sửa lần 1' });
  assert(occ1.success && occ1.template?.version === 2, 'DB-03.2: Staff 1 update succeeded, version bumped to 2');

  // Staff 2 attempts to update with STALE version 1 -> Must fail with conflict!
  const occ2 = await templateRepo.updateWithOcc(testTpl.id, 1, { title: 'Mẫu ghi đè lỗi' });
  assert(!occ2.success && occ2.current?.version === 2, 'DB-03.3: Staff 2 stale update rejected with OCC conflict');

  // 2. Lead OCC test
  const testLead = await leadRepo.create({
    id: `lead_occ_${Date.now()}`,
    customer_name: 'Khách hàng OCC Test',
    stage: 'uncontacted',
    quoted_amount: 1000000,
  });
  assert(testLead.version === 1, 'DB-03.4: CRM Lead created with version 1');

  // CSKH A updates lead stage
  const leadOcc1 = await leadRepo.updateWithOcc(testLead.id, 1, { stage: 'consulting' });
  assert(leadOcc1.success && leadOcc1.lead?.version === 2, 'DB-03.5: CSKH A updated lead stage, version bumped to 2');

  // CSKH B updates with stale version 1 -> Must fail with conflict!
  const leadOcc2 = await leadRepo.updateWithOcc(testLead.id, 1, { stage: 'quoted' });
  assert(!leadOcc2.success && leadOcc2.current?.version === 2, 'DB-03.6: CSKH B stale update rejected with OCC conflict');

  // -------------------------------------------------------------
  // DB-04: Outreach First-Touch Deduplication (DB Constraint)
  // -------------------------------------------------------------
  console.log('\n[TEST GROUP 4] DB-04: First-Touch Outreach Deduplication at DB Level');

  // Create test post
  const { post } = await postRepo.createIfNew({
    id: `post_dedup_${Date.now()}`,
    post_url: `https://facebook.com/groups/test/posts/dedup_${Date.now()}`,
    content_raw: 'Cần thuê thợ chụp ảnh áo dài quận 1',
    author_name: 'Khách test dedup',
  });

  // Worker 1 claims first touch outreach
  const claim1 = await outreachRepo.claimFirstTouch({
    post_id: post.id,
    page_identity: 'Maison MIPA Photography',
    operator_name: 'Worker 1',
    comment_content: 'Chào bạn, tiệm mình chuyên chụp áo dài...',
  });
  assert(claim1.success, 'DB-04.1: Worker 1 claimed first touch outreach successfully');

  // Worker 2 attempts concurrent claim on the SAME post -> Must be rejected by UNIQUE(post_id)!
  const claim2 = await outreachRepo.claimFirstTouch({
    post_id: post.id,
    page_identity: 'Maison MIPA Photography',
    operator_name: 'Worker 2',
    comment_content: 'Chào bạn bên mình gửi giá...',
  });
  assert(!claim2.success, 'DB-04.2: Worker 2 duplicate claim rejected by PostgreSQL unique constraint');
  assert(claim2.interaction?.id === claim1.interaction.id, 'DB-04.3: Existing interaction returned to caller');

  // -------------------------------------------------------------
  // AUTH-01 & AUTH-02: Token Revocation Blacklist in Database
  // -------------------------------------------------------------
  console.log('\n[TEST GROUP 5] AUTH-01 & AUTH-02: Cryptographic Token Revocation & DB Storage');

  const token = issueSignedToken('user-admin-01', 'admin');
  const verifyBefore = verifySignedToken(token);
  assert(verifyBefore.valid, 'AUTH-01.1: Newly issued token is valid');

  // Revoke token
  revokeToken(token);

  // Synchronous check
  const verifyAfter = verifySignedToken(token);
  assert(!verifyAfter.valid, 'AUTH-01.2: Token is immediately invalid after revokeToken()');

  // Asynchronous DB check
  const isRevokedInDb = await isTokenRevokedAsync(token);
  assert(isRevokedInDb, 'AUTH-02.1: isTokenRevokedAsync() verifies token revocation in database');

  console.log('\n' + '='.repeat(70));
  console.log(`PHASE A TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('='.repeat(70));

  if (failed > 0) {
    process.exit(1);
  }
}

runPhaseATests().catch((err) => {
  console.error('[FATAL] Phase A test suite crashed:', err);
  process.exit(1);
});
