/**
 * Phase C Test Suite: Worker, Scheduler, Crawler & Facebook Session Management
 * Tests JOB-01..03, CRAWL-01..02, AUTH-SEC-01..03
 */

import { isValidFacebookUrl, canonicalizeFacebookUrl } from '../src/worker/crawler';
import { FacebookAuthManager } from '../src/worker/auth';
import { jobRepo } from '../src/lib/repositories/job.repository';
import fs from 'fs';
import path from 'path';

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

async function runPhaseCTests() {
  console.log('='.repeat(70));
  console.log('STARTING PHASE C (WORKER, CRAWLER & SESSION ENCRYPTION) TEST MATRIX');
  console.log('='.repeat(70));

  // -------------------------------------------------------------
  // TASK 04: Scheduler & Queue Concurrency Tests (JOB-01 .. JOB-03)
  // -------------------------------------------------------------
  console.log('\n[TEST GROUP 1] TASK 04: Persistent Scheduler & Queue Concurrency');

  // JOB-01: Create and claim job with worker exclusion
  const uniqueJobId = `job_test_c_${Date.now()}`;
  await jobRepo.createJob({
    id: uniqueJobId,
    job_type: 'crawl_group',
    target_id: 'grp-test-c',
    payload: { max_items: 5 },
  });

  const worker1Claim = await jobRepo.claimNextJob('worker-node-1', ['crawl_group']);
  assert(worker1Claim?.id === uniqueJobId, 'JOB-01.1: Worker 1 claimed scheduled job');

  // Concurrent worker 2 claiming - must NOT get worker 1's running job
  const worker2Claim = await jobRepo.claimNextJob('worker-node-2', ['crawl_group']);
  assert(worker2Claim?.id !== uniqueJobId, 'JOB-01.2: Worker 2 excluded from claiming active job of Worker 1');

  // JOB-02: Complete job
  if (worker1Claim) {
    const comp = await jobRepo.completeJob(worker1Claim.id);
    assert(comp, 'JOB-02.1: Job marked as completed in database');
    const completedJob = await jobRepo.getJobById(worker1Claim.id);
    assert(completedJob?.status === 'completed', 'JOB-02.2: Job status is "completed"');
  }

  // JOB-03: Failed job with exponential retry delay
  const failJobId = `job_fail_c_${Date.now()}`;
  await jobRepo.createJob({
    id: failJobId,
    job_type: 'crawl_group',
    target_id: 'grp-fail-c',
  });
  const claimFail = await jobRepo.claimNextJob('worker-node-1');
  if (claimFail) {
    const failedJob = await jobRepo.failJob(claimFail.id, 'Network timeout', 30);
    assert(failedJob?.status === 'pending' && failedJob.attempts === 1, 'JOB-03.1: Failed job scheduled for retry');
    const futureRunAt = new Date(failedJob!.run_at).getTime();
    assert(futureRunAt > Date.now() + 25000, 'JOB-03.2: Retry timestamp set at least 25s in future');
  }

  // -------------------------------------------------------------
  // TASK 05: Facebook Crawler URL Validation & Anti-SSRF (CRAWL-01 .. CRAWL-02)
  // -------------------------------------------------------------
  console.log('\n[TEST GROUP 2] TASK 05: Crawler URL Validation & Anti-SSRF Protection');

  // CRAWL-01.1: Reject external domain
  const nonFb = isValidFacebookUrl('https://evil-site.com/groups/test');
  assert(!nonFb.valid, 'CRAWL-01.1: Rejected non-Facebook domain (evil-site.com)');

  // CRAWL-01.2: Reject localhost & private IPs (SSRF prevention)
  const localIp = isValidFacebookUrl('http://127.0.0.1:8080/groups/test');
  assert(!localIp.valid, 'CRAWL-01.2: Rejected local loopback IP 127.0.0.1 (SSRF guard)');

  const privateIp = isValidFacebookUrl('http://192.168.1.1/groups/test');
  assert(!privateIp.valid, 'CRAWL-01.3: Rejected private subnet IP 192.168.1.1 (SSRF guard)');

  // CRAWL-01.3: Reject URLs without /groups/
  const profileUrl = isValidFacebookUrl('https://facebook.com/profile.php?id=123');
  assert(!profileUrl.valid, 'CRAWL-01.4: Rejected Facebook URL missing /groups/ path');

  // CRAWL-02: Valid Facebook group URLs
  const validUrl1 = isValidFacebookUrl('https://facebook.com/groups/hoidammechupaodaivn');
  assert(validUrl1.valid, 'CRAWL-02.1: Accepted standard Facebook group URL');

  const validUrl2 = isValidFacebookUrl('https://www.facebook.com/groups/123456789/');
  assert(validUrl2.valid, 'CRAWL-02.2: Accepted www.facebook.com numeric group URL');

  const canonical = canonicalizeFacebookUrl('https://www.facebook.com/groups/aodai/posts/123456?mibextid=123&ref=share');
  assert(
    canonical.canonicalUrl === 'https://www.facebook.com/groups/aodai/posts/123456' && canonical.postId === '123456',
    'CRAWL-02.3: Canonicalized URL stripped tracking parameters and isolated post ID'
  );

  // -------------------------------------------------------------
  // TASK 06: AES-256-GCM Session Encryption & Key Management (AUTH-SEC-01 .. 03)
  // -------------------------------------------------------------
  console.log('\n[TEST GROUP 3] TASK 06: Facebook Session Encryption & Key Lifecycle');

  const testKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const customAuth = new FacebookAuthManager(testKey);

  // Sample valid Facebook storageState
  const sampleSession = JSON.stringify({
    cookies: [
      { name: 'c_user', value: '100083281234567', domain: '.facebook.com', path: '/' },
      { name: 'xs', value: '45%3Atest_token_xs', domain: '.facebook.com', path: '/' },
    ],
    origins: [],
  });

  // AUTH-SEC-01: Encrypt and verify
  const saveRes = customAuth.saveSession(sampleSession);
  assert(saveRes.success, 'AUTH-SEC-01.1: Successfully saved and encrypted Facebook session');

  const summary = customAuth.getSessionSummary();
  assert(summary.exists && summary.valid && summary.userId === '100083281234567', 'AUTH-SEC-01.2: Session validated and user ID extracted');

  // Verify that encrypted file is NOT plaintext JSON
  const encFile = path.join(process.cwd(), 'data', 'auth', 'facebook_storage_state.enc');
  assert(fs.existsSync(encFile), 'AUTH-SEC-01.3: Encrypted session file exists on disk');
  const encRaw = fs.readFileSync(encFile);
  assert(!encRaw.toString('utf-8').includes('100083281234567'), 'AUTH-SEC-01.4: Encrypted file contains zero plaintext credentials');

  // AUTH-SEC-02: Clear plaintext and delete session
  customAuth.clearPlaintextSession();
  const plainFile = path.join(process.cwd(), 'data', 'auth', 'facebook_storage_state.json');
  assert(!fs.existsSync(plainFile), 'AUTH-SEC-02.1: Plaintext session file removed after clearPlaintextSession()');

  // Re-reading decrypts securely
  const decryptedPath = customAuth.getSessionPath();
  assert(decryptedPath !== null, 'AUTH-SEC-02.2: getSessionPath() decrypts AES-256-GCM on-demand');

  // Delete session completely
  customAuth.deleteSession();
  assert(!customAuth.hasStoredSession(), 'AUTH-SEC-02.3: deleteSession() removes all session files cleanly');

  // AUTH-SEC-03: Production mode requires explicit key
  const origEnv = process.env.NODE_ENV;
  const origKey = process.env.FACEBOOK_SESSION_ENCRYPTION_KEY;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.FACEBOOK_SESSION_ENCRYPTION_KEY;
    let threw = false;
    try {
      new FacebookAuthManager();
    } catch {
      threw = true;
    }
    assert(threw, 'AUTH-SEC-03: Production mode rejects starting without FACEBOOK_SESSION_ENCRYPTION_KEY');
  } finally {
    process.env.NODE_ENV = origEnv;
    if (origKey) process.env.FACEBOOK_SESSION_ENCRYPTION_KEY = origKey;
  }

  console.log('\n' + '='.repeat(70));
  console.log(`PHASE C TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('='.repeat(70));

  if (failed > 0) {
    process.exit(1);
  }
}

runPhaseCTests().catch((err) => {
  console.error('[FATAL] Phase C test suite crashed:', err);
  process.exit(1);
});
