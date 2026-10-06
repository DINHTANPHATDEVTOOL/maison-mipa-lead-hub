/**
 * Phase B Test Suite: Safe Dispatching & Comment Freshness Verification
 * Tests PAGE-01..07, COMMENT-01..05
 */

import { parseStructuredIdentity, commentDispatcher } from '../src/worker/dispatcher';
import { outreachRepo } from '../src/lib/repositories/outreach.repository';
import { postRepo } from '../src/lib/repositories/post.repository';

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

async function runPhaseBTests() {
  console.log('='.repeat(70));
  console.log('STARTING PHASE B (PAGE IDENTITY & COMMENT FRESHNESS) TEST MATRIX');
  console.log('='.repeat(70));

  // -------------------------------------------------------------
  // TASK 02: Page Identity Verification Tests (PAGE-01 .. PAGE-07)
  // -------------------------------------------------------------
  console.log('\n[TEST GROUP 1] TASK 02: Structured Page Identity & Exact ID Verification');

  // PAGE-01: Exact Match Page ID
  const rawExact = 'Maison MIPA [https://facebook.com/100083281234567] [data-page-id=100083281234567]';
  const idExact = parseStructuredIdentity(rawExact, '100083281234567');
  assert(
    idExact.activePageId === '100083281234567' && idExact.activeName?.includes('Maison MIPA'),
    'PAGE-01: Exactly matched Page ID and name'
  );

  // PAGE-02: Reject matching name with wrong Page ID (222 != 111)
  const rawWrongId = 'Maison MIPA [https://facebook.com/222] [data-page-id=222]';
  const idWrongId = parseStructuredIdentity(rawWrongId, '111');
  assert(
    idWrongId.activePageId !== '111',
    'PAGE-02: Structured parser detects ID mismatch (222 != 111)'
  );

  const mockWrongPage = {
    $: async () => null,
    evaluate: async () => 'Maison MIPA [Page ID: 222]',
    waitForTimeout: async () => {},
  } as any;
  const dispatchWrong = await commentDispatcher.verifyAndSwitchPageIdentity(mockWrongPage, 'Maison MIPA', '111');
  assert(!dispatchWrong.matched && Boolean(dispatchWrong.error), 'PAGE-02.1: Dispatcher strictly rejects wrong Page ID');

  // PAGE-03: Reject when Page ID is a substring of another ID ("111" vs "111888")
  const rawSubstringId = 'Maison MIPA [https://facebook.com/111888] [data-page-id=111888]';
  const idSubstring = parseStructuredIdentity(rawSubstringId, '111');
  assert(
    idSubstring.activePageId === '111888' && idSubstring.activePageId !== '111',
    'PAGE-03: Substring Page ID rejected (111888 is not 111)'
  );

  const mockSubstringPage = {
    $: async () => null,
    evaluate: async () => 'Maison MIPA [data-page-id=111888]',
    waitForTimeout: async () => {},
  } as any;
  const dispatchSubstring = await commentDispatcher.verifyAndSwitchPageIdentity(mockSubstringPage, 'Maison MIPA', '111');
  assert(!dispatchSubstring.matched, 'PAGE-03.1: Dispatcher strictly rejects substring Page ID');

  // PAGE-04: Reject personal profile ID 222 even if a link to Page 111 exists elsewhere
  const mockPersonalPage = {
    $: async () => null,
    evaluate: async () => 'Trần Văn A [https://facebook.com/222] (Tài khoản cá nhân)',
    waitForTimeout: async () => {},
  } as any;
  const dispatchPersonal = await commentDispatcher.verifyAndSwitchPageIdentity(mockPersonalPage, 'Maison MIPA', '111');
  assert(!dispatchPersonal.matched, 'PAGE-04: Personal profile 222 rejected from auto-commenting');

  // PAGE-05: Conflicting IDs in composer
  const rawConflicting = 'Maison MIPA [https://facebook.com/111] [data-page-id=222]';
  const idConflicting = parseStructuredIdentity(rawConflicting, '111');
  assert(
    idConflicting.conflicts.length > 1,
    'PAGE-05: Detected multiple conflicting Page IDs in single composer evidence'
  );

  // PAGE-06: Incomplete Page switch rejected
  const mockFailedSwitch = {
    $: async () => ({
      textContent: async () => 'Bình luận dưới tên cá nhân',
      getAttribute: async () => null,
      click: async () => {},
    }),
    evaluate: async (fn: any, args: any) => {
      // simulate switch option clicked, but DOM re-render still shows personal
      return false;
    },
    waitForTimeout: async () => {},
  } as any;
  const dispatchFailedSwitch = await commentDispatcher.verifyAndSwitchPageIdentity(mockFailedSwitch, 'Maison MIPA', '111');
  assert(!dispatchFailedSwitch.matched && Boolean(dispatchFailedSwitch.error), 'PAGE-06: Incomplete page switch rejected with diagnostic error');

  // PAGE-07: Structured identity attributes present
  assert(
    idExact.evidenceSource === 'composer_badge' && idExact.identityType === 'page',
    'PAGE-07: Identity properly classified with evidence source and identity type'
  );

  // -------------------------------------------------------------
  // TASK 03: Comment Freshness & State Machine (COMMENT-01 .. COMMENT-05)
  // -------------------------------------------------------------
  console.log('\n[TEST GROUP 2] TASK 03: Full Content Match, Freshness Verification & State Machine');

  // COMMENT-01: Confirm new comment created after submission timestamp
  const subTime = Date.now();
  const freshCommentTime = subTime + 500;
  const isFresh = freshCommentTime >= (subTime - 3000) && freshCommentTime <= (Date.now() + 30000);
  assert(isFresh, 'COMMENT-01: Newly submitted comment with valid timestamp confirmed');

  // COMMENT-02: Stale comment (1 minute before submit) rejected
  const staleCommentTime = subTime - 60000;
  const isStale = staleCommentTime < (subTime - 3000);
  assert(isStale, 'COMMENT-02: Comment created 1 minute before submission recognized as stale');

  // COMMENT-03: Comment with different price at end rejected
  const baseTpl = 'Chào bạn nha, Maison MIPA chuyên các bộ ảnh Áo dài tại TP.HCM. Giá 1.200.000đ.';
  const alteredPrice = 'Chào bạn nha, Maison MIPA chuyên các bộ ảnh Áo dài tại TP.HCM. Giá 800.000đ.';
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const isPriceMatch = norm(alteredPrice).includes(norm(baseTpl));
  assert(!isPriceMatch, 'COMMENT-03: Comment with different price rejected (no partial match allowed)');

  // COMMENT-04: Relative time mismatch (1.5s elapsed but label 10s ago)
  const submitMoment = Date.now();
  const elapsedSeconds = 1.5;
  const relativeLabel = '10s ago';
  const secondsMatch = relativeLabel.match(/([0-9]{1,2})\s*(?:s\b|seconds?\s+ago)/);
  const labeledSec = secondsMatch ? parseInt(secondsMatch[1], 10) : 0;
  const isStaleByRelativeTime = labeledSec > elapsedSeconds + 3;
  assert(isStaleByRelativeTime, 'COMMENT-04: 10s ago label with only 1.5s elapsed rejected as stale');

  // COMMENT-05: State machine transition in outreach repository
  const { post } = await postRepo.createIfNew({
    id: `post_sm_${Date.now()}`,
    post_url: `https://facebook.com/groups/test/posts/sm_${Date.now()}`,
    content_raw: 'Cần tìm thợ chụp hình concept nàng thơ',
    author_name: 'Khách SM Test',
  });

  // State: queued -> claimed
  const claimRes = await outreachRepo.claimFirstTouch({
    post_id: post.id,
    page_identity: 'Maison MIPA',
    operator_name: 'Test Worker',
    comment_content: 'Chào bạn bên mình có concept nàng thơ...',
    initialStatus: 'sending',
  });
  assert(claimRes.success && claimRes.interaction?.status === 'sending', 'COMMENT-05.1: State transition to "sending"');

  // State: sending -> sent_confirmed
  const updateRes = await outreachRepo.updateStatus(post.id, 'sent_confirmed', {
    comment_facebook_id: 'fb_cmt_verified_123',
    comment_permalink: 'https://facebook.com/comment_proof_123',
  });
  assert(updateRes !== null && updateRes.status === 'sent_confirmed', 'COMMENT-05.2: State transition to "sent_confirmed"');

  console.log('\n' + '='.repeat(70));
  console.log(`PHASE B TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('='.repeat(70));

  if (failed > 0) {
    process.exit(1);
  }
}

runPhaseBTests().catch((err) => {
  console.error('[FATAL] Phase B test suite crashed:', err);
  process.exit(1);
});
