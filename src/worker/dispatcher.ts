import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { authManager } from './auth';

export interface DispatchCommentParams {
  postId: string;
  postUrl: string;
  commentContent: string;
  pageIdentity?: string; // Default: 'Maison MIPA'
  pageId?: string; // Facebook Page ID (e.g. '100083281234567')
  targetPageId?: string;
  accountType?: 'personal' | 'page'; // 'personal' cho phép bình luận bằng tài khoản cá nhân
  profileId?: string;
  storageState?: any;
  lookbackTimeoutMs?: number;
}

export interface DispatchCommentResult {
  success?: boolean;
  status: 'sent_confirmed' | 'uncertain_failed' | 'rejected';
  commentFacebookId?: string;
  commentId?: string;
  permalink?: string;
  commentPermalink?: string;
  errorMessage?: string;
  error?: string;
  needsAuth?: boolean;
}

export interface ActiveIdentityResult {
  activePageId: string | null;
  activeName: string | null;
  identityType: 'page' | 'personal' | 'unknown';
  evidenceSource: 'composer_badge' | 'composer_avatar' | 'composer_switch_button' | 'none';
  conflicts: string[];
  rawText?: string;
}

export interface PageIdentityVerificationResult {
  matched: boolean;
  activeIdentity?: string;
  structuredIdentity?: ActiveIdentityResult;
  error?: string;
}

/**
 * Pure parsing function to extract structured identity evidence from composer HTML/text
 */
export function parseStructuredIdentity(
  rawEvidence: string,
  targetPageId?: string
): ActiveIdentityResult {
  const conflicts: string[] = [];
  const foundIds = new Set<string>();

  // Extract explicit Page IDs from patterns:
  // - [data-page-id=123] or data-page-id="123"
  // - [Page ID: 123] or Page ID 123
  // - /123 or facebook.com/123 (excluding post/comment/story URLs)
  const dataIdMatches = Array.from(rawEvidence.matchAll(/data-page-?id=["']?([0-9]+)["']?/gi));
  dataIdMatches.forEach(m => foundIds.add(m[1]));

  const labelIdMatches = Array.from(rawEvidence.matchAll(/(?:page\s*id[:=\s]+)([0-9]+)/gi));
  labelIdMatches.forEach(m => foundIds.add(m[1]));

  const linkIdMatches = Array.from(rawEvidence.matchAll(/(?:facebook\.com\/(?:pages\/[^\/]+\/)?|profile\.php\?id=)([0-9]{3,})/gi));
  linkIdMatches.forEach(m => foundIds.add(m[1]));

  const bracketMatches = Array.from(rawEvidence.matchAll(/\[https?:\/\/[^\]]*\/([0-9]{3,})\]/gi));
  bracketMatches.forEach(m => foundIds.add(m[1]));

  const idsArray = Array.from(foundIds);
  if (idsArray.length > 1) {
    conflicts.push(...idsArray);
  }

  let activePageId: string | null = null;
  if (idsArray.length === 1) {
    activePageId = idsArray[0];
  } else if (idsArray.length > 1) {
    // When conflicting IDs exist, record primary observed and ensure conflicts array is set
    activePageId = idsArray[0];
  }

  // Extract name: text before [ or (
  const nameMatch = rawEvidence.match(/^([^\[\(\n\r]+)/);
  let activeName = nameMatch ? nameMatch[1].replace(/Tương tác dưới danh nghĩa:?/i, '').replace(/Bình luận dưới tên:?/i, '').trim() : null;
  if (activeName && activeName.length > 100) activeName = activeName.slice(0, 100).trim();

  let evidenceSource: ActiveIdentityResult['evidenceSource'] = 'none';
  if (rawEvidence.includes('data-page-id') || rawEvidence.includes('Page ID')) {
    evidenceSource = 'composer_badge';
  } else if (rawEvidence.includes('Tương tác') || rawEvidence.includes('Interacting as')) {
    evidenceSource = 'composer_switch_button';
  } else if (rawEvidence.includes('avatar') || rawEvidence.includes('ảnh đại diện')) {
    evidenceSource = 'composer_avatar';
  }

  let identityType: ActiveIdentityResult['identityType'] = 'unknown';
  const lowerEv = rawEvidence.toLowerCase();
  if (lowerEv.includes('cá nhân') || lowerEv.includes('personal') || lowerEv.includes('profile.php')) {
    identityType = 'personal';
  } else if (activePageId || lowerEv.includes('page') || lowerEv.includes('maison')) {
    identityType = 'page';
  }

  return {
    activePageId,
    activeName,
    identityType,
    evidenceSource,
    conflicts,
    rawText: rawEvidence,
  };
}

export class FacebookCommentDispatcher {
  /**
   * Dispatch an outreach comment using real Playwright browser automation
   */
  public async dispatchComment(params: DispatchCommentParams): Promise<DispatchCommentResult> {
    const profileStorage = params.profileId ? authManager.getProfileStorageState(params.profileId) : null;
    const storageState = params.storageState || profileStorage || authManager.getStorageState();

    if (!storageState) {
      return {
        success: false,
        status: 'rejected',
        errorMessage: `Chưa có phiên đăng nhập Facebook hợp lệ cho thiết bị/tài khoản này (${params.profileId || 'mặc định'}). Vui lòng đăng nhập trước khi gửi.`,
        error: 'Chưa có phiên đăng nhập Facebook hợp lệ.',
        needsAuth: true,
      };
    }

    let browser: Browser | null = null;
    let context: BrowserContext | null = null;

    try {
      browser = await chromium.launch({
        headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      });

      const activeStorageState = params.storageState || storageState;
      context = await browser.newContext({
        storageState: activeStorageState as any,
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
        locale: 'vi-VN',
        timezoneId: 'Asia/Ho_Chi_Minh',
      });

      const page = await context.newPage();

      // Navigate to target post permalink
      console.log(`[Dispatcher] Điều hướng tới bài viết Facebook: ${params.postUrl}`);
      await page.goto(params.postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Check checkpoint / login prompt
      const isLoggedOut = await page.evaluate(() => {
        return !!(
          document.querySelector('input[name="email"]') ||
          document.querySelector('input[name="pass"]') ||
          document.body.innerText.includes('Đăng nhập Facebook') ||
          document.body.innerText.includes('Checkpoint') ||
          document.body.innerText.includes('Bạn phải đăng nhập để tiếp tục')
        );
      });

      if (isLoggedOut) {
        return {
          success: false,
          status: 'rejected',
          errorMessage: 'Mất phiên đăng nhập Facebook hoặc bị Meta yêu cầu checkpoint xác minh danh tính.',
          error: 'Mất phiên đăng nhập Facebook hoặc bị Meta yêu cầu checkpoint xác minh danh tính.',
          needsAuth: true,
        };
      }

      await page.waitForTimeout(2500);

      // STEP 1: Verify & Switch Identity
      const isPersonal = params.accountType === 'personal';
      const targetPageName = params.pageIdentity || 'Maison MIPA';
      const effectivePageId = params.targetPageId || params.pageId;

      if (!isPersonal) {
        // Enforce Page identity if mode is 'page'
        console.log(`[Dispatcher] Kiểm tra danh tính Page: "${targetPageName}" (Page ID: ${effectivePageId || 'bất kỳ'})`);
        const identityResult = await this.verifyAndSwitchPageIdentity(page, targetPageName, effectivePageId);
        if (!identityResult.matched) {
          const err = identityResult.error || `Từ chối gửi bình luận: Chưa xác thực được danh tính Page "${targetPageName}".`;
          return {
            success: false,
            status: 'rejected',
            errorMessage: err,
            error: err,
          };
        }
      } else {
        console.log(`[Dispatcher] Chế độ tài khoản cá nhân: Cho phép bình luận trực tiếp dưới tư cách tài khoản Facebook cá nhân.`);
      }

      // STEP 2: Locate Comment Box
      const commentInput = await page.$(
        'div[role="textbox"][aria-label*="bình luận"], div[role="textbox"][aria-label*="comment"], div[role="textbox"][aria-label*="Viết"], div[role="textbox"][aria-label*="Write"]'
      );

      if (!commentInput) {
        const err = 'Không tìm thấy khung nhập bình luận hoặc tài khoản/Page không có quyền bình luận trong bài này.';
        return {
          success: false,
          status: 'rejected',
          errorMessage: err,
          error: err,
        };
      }

      // STEP 2.5: Snapshot existing comments on the post BEFORE typing
      const preExistingComments = await page.evaluate(() => {
        const commentElements = document.querySelectorAll(
          'div[role="article"][aria-label*="bình luận"], div[role="article"][aria-label*="comment"], ul[aria-label*="bình luận"] li, div[class*="commentable_item"] div[role="article"]'
        );
        const set = new Set<string>();
        for (let i = 0; i < commentElements.length; i++) {
          const el = commentElements[i];
          const permalinkAnchor = el.querySelector('a[href*="comment_id="]') as HTMLAnchorElement | null;
          if (permalinkAnchor) {
            const match = permalinkAnchor.href.match(/comment_id=([0-9]+)/);
            if (match) set.add(`id:${match[1]}`);
          }
          const authorEl = el.querySelector('a[role="link"] span, h3, h4, span.x193iq5w');
          const authorText = (authorEl?.textContent || '').trim();
          const text = (el.textContent || '').trim();
          if (text) {
            set.add(`fp:${authorText}::${text.slice(0, 100)}`);
          }
        }
        return Array.from(set);
      });

      // STEP 3: Type with human-like cadence
      await commentInput.click();
      await page.waitForTimeout(600);
      await page.keyboard.type(params.commentContent, { delay: 40 });
      await page.waitForTimeout(800);

      // STEP 3.5: PRE-SUBMIT RE-VERIFICATION of composer identity
      // Immediately check the composer identity badge before pressing Enter
      if (!isPersonal) {
        const preSubmitIdentity = await this.verifyAndSwitchPageIdentity(page, targetPageName, effectivePageId);
        if (!preSubmitIdentity.matched) {
          // Abort submission! Clear typed comment
          await page.keyboard.press('Control+A');
          await page.keyboard.press('Backspace');
          const err = `[Pre-Submit Guard] Từ chối gửi: Danh tính composer bị thay đổi ngay trước khi gửi (${preSubmitIdentity.error || 'không khớp Page'}).`;
          return {
            success: false,
            status: 'rejected',
            errorMessage: err,
            error: err,
          };
        }
      }

      const submissionTimestamp = Date.now();
      await page.keyboard.press('Enter');

      // STEP 4: STRICT DOM CONFIRMATION OF FRESH NEW COMMENT ONLY
      const startTime = Date.now();
      let confirmedComment: { 
        found: boolean; 
        commentId?: string; 
        commentPermalink?: string; 
        authorMatches?: boolean;
        isFresh?: boolean;
        isContentFullMatch?: boolean;
      } = { found: false };

      while (Date.now() - startTime < 16000) {
        await page.waitForTimeout(1500);

        confirmedComment = await page.evaluate(({ fullContent, targetIdentity, targetPageId, preExistingList, submissionTime, isPersonalAccount }) => {
          const preSet = new Set(preExistingList);
          const commentElements = document.querySelectorAll(
            'div[role="article"][aria-label*="bình luận"], div[role="article"][aria-label*="comment"], ul[aria-label*="bình luận"] li, div[class*="commentable_item"] div[role="article"]'
          );

          const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
          const cleanTargetContent = norm(fullContent);

          for (const el of Array.from(commentElements)) {
            const permalinkAnchor = el.querySelector('a[href*="comment_id="]') as HTMLAnchorElement | null;
            let commentId: string | undefined;
            let commentPermalink: string | undefined;

            if (permalinkAnchor) {
              const match = permalinkAnchor.href.match(/comment_id=([0-9]+)/);
              if (match) commentId = match[1];
              commentPermalink = permalinkAnchor.href;
            }

            const authorEl = el.querySelector('a[role="link"] span, h3, h4, span.x193iq5w');
            const authorText = (authorEl?.textContent || '').trim();
            const text = (el.textContent || '').trim();
            const cleanText = norm(text);

            // 1. Snapshot filter: Ignore if this comment existed before our submission!
            if (commentId && preSet.has(`id:${commentId}`)) {
              continue;
            }
            if (preSet.has(`fp:${authorText}::${text.slice(0, 100)}`)) {
              continue;
            }

            // 2. Full Content verification (must match FULL comment content, never just a prefix or 120 chars)
            const isContentFullMatch = cleanText.includes(cleanTargetContent);
            if (!isContentFullMatch) {
              continue;
            }

            // 3. Author / Page ID verification
            let authorMatches = true;
            if (!isPersonalAccount) {
              const authorMatchesName = authorText.toLowerCase().includes(targetIdentity.toLowerCase());
              let authorMatchesId = true;
              if (targetPageId) {
                const authorAnchor = el.querySelector(
                  'h3 a, h4 a, a[role="link"]:not([href*="comment_id="]):not([href*="/posts/"]):not([href*="story_fbid="]), a[data-hovercard*="id="], a[data-profileid], a[data-page-id], a[href*="profile.php"]'
                ) as HTMLAnchorElement | null;
                const authorHref = authorAnchor?.href || '';
                const authorHovercard = authorAnchor?.getAttribute('data-hovercard') || '';
                const authorDataId = authorAnchor?.getAttribute('data-page-id') || authorAnchor?.getAttribute('data-profileid') || '';
                const authorInfo = `${authorText} ${authorHref} ${authorHovercard} ${authorDataId}`;

                const authorIdMatch = authorInfo.match(/(?:page\s*id[:=\s]+|\/|id=|user\/)([0-9]{3,})/i) ||
                                      authorInfo.match(/\b([0-9]{3,})\b/);
                // Strict equality check: NOT substring or includes!
                if (authorIdMatch && authorIdMatch[1] !== targetPageId) {
                  authorMatchesId = false; // Conflicting Page ID
                } else if (authorIdMatch && authorIdMatch[1] === targetPageId) {
                  authorMatchesId = true; // Exact match
                } else if (authorInfo.includes(targetPageId)) {
                  // Secondary check: verify exact boundary match
                  const exactRegex = new RegExp(`\\b${targetPageId}\\b`);
                  authorMatchesId = exactRegex.test(authorInfo);
                } else {
                  authorMatchesId = false;
                }
              }
              authorMatches = authorMatchesName && authorMatchesId;
            } else {
              // For personal accounts: if specific targetPageId (FB user id) is provided, verify it if found in author info
              if (targetPageId) {
                const authorAnchor = el.querySelector(
                  'h3 a, h4 a, a[role="link"]:not([href*="comment_id="]):not([href*="/posts/"]):not([href*="story_fbid="]), a[data-hovercard*="id="], a[data-profileid], a[href*="profile.php"]'
                ) as HTMLAnchorElement | null;
                const authorInfo = `${authorText} ${authorAnchor?.href || ''} ${authorAnchor?.getAttribute('data-hovercard') || ''}`;
                const authorIdMatch = authorInfo.match(/(?:user\/|id=|\/)([0-9]{5,})/i);
                if (authorIdMatch && authorIdMatch[1] !== targetPageId) {
                  authorMatches = false;
                }
              }
            }

            if (!authorMatches) {
              continue;
            }

            // 4. Freshness verification: Bằng chứng bình luận vừa được tạo SAU lần gửi
            const timeEl = el.querySelector('abbr, time, span[id*="timestamp"], a[href*="comment_id="] span');
            const timeText = (timeEl?.textContent || el.textContent || '').toLowerCase();

            // Indicators that a comment is OLD (minutes, hours, days, weeks, months, years ago)
            const isOldComment = /\b([0-9]+)\s*(?:phút|min|mins|minute|minutes|giờ|tiếng|ngày|tuần|tháng|năm|hours?|days?|weeks?|months?|years?|m|h|d|w|y)\b/i.test(timeText) ||
                                 /\b(hôm qua|yesterday|thứ\s+[hai|ba|tư|năm|sáu|bảy|nhật]|tháng\s+[0-9]+)\b/i.test(timeText);

            let hasFreshnessProof = false;
            let timestampProvedOld = false;

            // Check timeTag datetime if available
            const timeTag = el.querySelector('time') as HTMLTimeElement | null;
            if (timeTag) {
              const dt = timeTag.getAttribute('datetime');
              if (dt) {
                const parsed = Date.parse(dt);
                if (!isNaN(parsed)) {
                  if (parsed >= (submissionTime - 3000) && parsed <= (Date.now() + 30000)) {
                    hasFreshnessProof = true;
                  } else if (parsed < (submissionTime - 3000)) {
                    timestampProvedOld = true;
                  }
                }
              }
            }

            // Check relative time label: e.g. "10s ago" must match actual elapsed real time
            const recencyMatch = /\b(vừa xong|vừa gửi|vài giây|just now|few seconds|[0-9]{1,2}s\b|seconds?\s+ago)\b/i.test(timeText);
            const secondsMatch = timeText.match(/([0-9]{1,2})\s*(?:giây|s\b|seconds?\s+ago)/i);
            const elapsedSinceSubmit = (Date.now() - submissionTime) / 1000;

            if (secondsMatch) {
              const labeledSeconds = parseInt(secondsMatch[1], 10);
              // If comment says e.g. 10s ago, but we only submitted 2s ago, it is a stale comment!
              if (labeledSeconds > elapsedSinceSubmit + 3) {
                timestampProvedOld = true;
              }
            }

            if (!timestampProvedOld && (hasFreshnessProof || recencyMatch)) {
              hasFreshnessProof = true;
            }

            if (isOldComment || timestampProvedOld || !hasFreshnessProof) {
              continue;
            }

            return {
              found: true,
              commentId: commentId || `fb_cmt_${Date.now()}`,
              commentPermalink: commentPermalink || window.location.href,
              authorMatches: true,
              isFresh: true,
              isContentFullMatch: true,
            };
          }

          return { found: false };
        }, {
          fullContent: params.commentContent,
          targetIdentity: targetPageName,
          targetPageId: effectivePageId,
          preExistingList: preExistingComments,
          submissionTime: submissionTimestamp,
          isPersonalAccount: isPersonal,
        });

        if (confirmedComment.found) {
          break;
        }
      }

      if (confirmedComment.found) {
        return {
          success: true,
          status: 'sent_confirmed',
          commentFacebookId: confirmedComment.commentId,
          commentId: confirmedComment.commentId,
          permalink: confirmedComment.commentPermalink,
          commentPermalink: confirmedComment.commentPermalink,
        };
      }

      const recencyErr = 'Đã nhập nội dung và nhấn gửi, nhưng không thể xác thực bình luận mới xuất hiện trong DOM với bằng chứng vừa tạo (recency proof). Trạng thái chuyển thành "uncertain_failed" để nhân viên đối soát, chống gửi trùng.';
      return {
        success: false,
        status: 'uncertain_failed',
        errorMessage: recencyErr,
        error: recencyErr,
      };

    } catch (err: any) {
      console.error('[Dispatcher] Lỗi trong quá trình dispatch:', err);
      const playErr = `Lỗi kết nối / Playwright: ${err.message}`;
      return {
        success: false,
        status: 'uncertain_failed',
        errorMessage: playErr,
        error: playErr,
      };
    } finally {
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }
  }

  /**
   * Verifies that the current commenting voice in the DOM matches the target Page (and Page ID),
   * switching if necessary. Returns { matched: boolean, error?: string, structuredIdentity?: ActiveIdentityResult }
   */
  public async verifyAndSwitchPageIdentity(
    page: Page,
    targetIdentity: string = 'Maison MIPA',
    targetPageId?: string
  ): Promise<PageIdentityVerificationResult> {
    try {
      const readActiveVoice = async (): Promise<string | null> => {
        return await page.evaluate(() => {
          // Locate textbox first to strictly bind composer; do not fall back to entire document
          const textbox = document.querySelector(
            'div[role="textbox"][contenteditable="true"], form[action*="comment"] [role="textbox"], div[aria-label*="Bình luận"], div[aria-label*="comment"], div[contenteditable="true"]'
          );
          if (!textbox) {
            return null;
          }

          const form = textbox.closest('form, div[class*="UFIContainer"], div[role="presentation"], div[class*="comments"]') || textbox.parentElement;
          if (!form) return null;

          let altText = '';
          const avatarImg = form.querySelector('img[alt*="avatar"], img[alt*="ảnh đại diện"], div[role="button"] img');
          if (avatarImg) {
            altText = avatarImg.getAttribute('alt') || '';
          }

          let switcherText = '';
          const switcherEl = form.querySelector(
            'div[aria-label*="Tương tác dưới danh nghĩa"], div[aria-label*="Interacting as"], div[aria-label*="Bình luận dưới tên"], div[aria-label*="vai trò"], div[role="button"][aria-label*="danh nghĩa"]'
          );
          if (switcherEl) {
            switcherText = switcherEl.getAttribute('aria-label') || switcherEl.textContent || '';
          }

          // Collect author links and data-page-id attributes strictly from the composer avatar/switcher
          const collectedLinks: string[] = [];
          const avatarAnchor = avatarImg?.closest('a');
          if (avatarAnchor) {
            const href = avatarAnchor.getAttribute('href') || '';
            const text = avatarAnchor.textContent?.trim() || '';
            const pageIdAttr = avatarAnchor.getAttribute('data-page-id') || avatarAnchor.getAttribute('data-id') || '';
            if (href || pageIdAttr) {
              collectedLinks.push(`${text} [${href}] ${pageIdAttr ? `[data-page-id=${pageIdAttr}]` : ''}`.trim());
            }
          }

          if (switcherEl) {
            const pid = switcherEl.getAttribute('data-page-id') || switcherEl.getAttribute('data-id') || '';
            if (pid) collectedLinks.push(`[data-page-id=${pid}]`);
          }

          const parts = [altText, switcherText, ...collectedLinks].filter(Boolean);
          return parts.length > 0 ? parts.join(' ') : null;
        });
      };

      const checkIdentityMatch = (voice: string | null): { matched: boolean; structured: ActiveIdentityResult; error?: string } => {
        if (!voice) {
          const emptyStructured: ActiveIdentityResult = {
            activePageId: null,
            activeName: null,
            identityType: 'unknown',
            evidenceSource: 'none',
            conflicts: [],
            rawText: '',
          };
          return { matched: false, structured: emptyStructured, error: 'Không thể định vị vùng soạn thảo hoặc đọc danh tính người bình luận từ DOM.' };
        }

        const structured = parseStructuredIdentity(voice, targetPageId);
        const vLower = voice.toLowerCase();
        const tLower = targetIdentity.toLowerCase();

        // 1. Any detected conflicting IDs in composer evidence must be strictly rejected
        if (structured.conflicts.length > 1) {
          return {
            matched: false,
            structured,
            error: `Xung đột danh tính: Phát hiện nhiều ID khác nhau [${structured.conflicts.join(', ')}] trong vùng soạn thảo. Dừng gửi để bảo vệ Page.`,
          };
        }

        // 2. Personal profile must be rejected
        if (structured.identityType === 'personal') {
          return {
            matched: false,
            structured,
            error: `Danh tính hiện tại là Tài khoản cá nhân, không phải Page "${targetIdentity}". Dừng thao tác.`,
          };
        }

        // 3. If targetPageId is configured, STRICT EQUALITY IS MANDATORY
        if (targetPageId) {
          // If explicit ID mismatch (e.g. 222 when target is 111)
          if (structured.activePageId && structured.activePageId !== targetPageId) {
            return {
              matched: false,
              structured,
              error: `Sai Page ID: Danh tính trên DOM mang ID "${structured.activePageId}" khác với Page ID cấu hình "${targetPageId}".`,
            };
          }

          // If targetPageId was NOT found in structured identity
          const exactTargetRegex = new RegExp(`\\b${targetPageId}\\b`);
          const hasExactId = exactTargetRegex.test(voice) || structured.activePageId === targetPageId;

          // Check if voice contains explicit conflicting ID
          const explicitIdMatches = Array.from(voice.matchAll(/(?:page\s*id[:=\s]+|data-page-id=["']?|facebook\.com\/)([0-9]{3,})/gi));
          if (explicitIdMatches.length > 0) {
            const matchedIds = explicitIdMatches.map(m => m[1]);
            const hasConflict = matchedIds.some(id => id !== targetPageId);
            const hasMatch = matchedIds.some(id => id === targetPageId);
            if (hasConflict && !hasMatch) {
              return {
                matched: false,
                structured,
                error: `Phát hiện ID khác [${matchedIds.filter(id => id !== targetPageId).join(', ')}] không trùng khớp với Page ID yêu cầu ${targetPageId}.`,
              };
            }
          }

          if (!hasExactId) {
            return {
              matched: false,
              structured,
              error: `Từ chối gửi: Thiếu bằng chứng Page ID "${targetPageId}". Tên thuần túy không đủ điều kiện gửi bình luận tự động.`,
            };
          }

          return { matched: true, structured };
        }

        // 4. Name-only matching (when no targetPageId is required)
        if (vLower.includes(tLower)) {
          return { matched: true, structured };
        }

        return {
          matched: false,
          structured,
          error: `Tên danh tính "${structured.activeName || 'cá nhân'}" không khớp với "${targetIdentity}".`,
        };
      };

      // Check current voice before touching switcher
      const initialVoice = await readActiveVoice();
      const initialMatch = checkIdentityMatch(initialVoice);
      if (initialMatch.matched) {
        return {
          matched: true,
          activeIdentity: initialVoice || targetIdentity,
          structuredIdentity: initialMatch.structured,
        };
      }

      // Locate the switcher button within the page/composer
      const switcher = await page.$(
        'div[aria-label*="Tương tác dưới danh nghĩa"], div[aria-label*="Interacting as"], div[aria-label*="Bình luận dưới tên"], div[aria-label*="vai trò"]'
      );

      if (!switcher) {
        return {
          matched: false,
          activeIdentity: initialVoice || undefined,
          structuredIdentity: initialMatch.structured,
          error: initialMatch.error || `Không tìm thấy nút chuyển đổi danh tính và danh tính hiện tại không khớp Page "${targetIdentity}".`,
        };
      }

      // Click switcher to choose target Page
      await switcher.click();
      await page.waitForTimeout(1000);

      const switched = await page.evaluate(({ target, pageId }) => {
        const options = Array.from(document.querySelectorAll('div[role="menuitem"], div[role="button"], div[role="radio"]'));
        const targetOption = options.find(o => {
          const text = (o.textContent || '').toLowerCase();
          const targetLower = target.toLowerCase();
          const elPageId = o.getAttribute('data-page-id') || o.getAttribute('data-id') || '';

          if (pageId) {
            if (elPageId) {
              return elPageId === pageId;
            }
            const idMatch = text.match(/(?:page\s*id[:=\s]+|\/)([0-9]{3,})/i) || text.match(/\b([0-9]{3,})\b/);
            if (idMatch) {
              return idMatch[1] === pageId;
            }
            return text.includes(pageId);
          }

          return text.includes(targetLower);
        });
        if (targetOption) {
          (targetOption as HTMLElement).click();
          return true;
        }
        return false;
      }, { target: targetIdentity, pageId: targetPageId });

      if (!switched) {
        return {
          matched: false,
          structuredIdentity: initialMatch.structured,
          error: `Không tìm thấy Page "${targetIdentity}" ${targetPageId ? `(ID: ${targetPageId})` : ''} trong danh sách vai trò có thể bình luận của tài khoản.`,
        };
      }

      // Wait for DOM re-render and re-verify the active commenting identity strictly through composer evidence
      await page.waitForTimeout(1000);

      const postSwitchVoice = await readActiveVoice();
      const postMatchVoice = checkIdentityMatch(postSwitchVoice);

      if (postMatchVoice.matched) {
        return {
          matched: true,
          activeIdentity: postSwitchVoice || targetIdentity,
          structuredIdentity: postMatchVoice.structured,
        };
      }

      return {
        matched: false,
        activeIdentity: postSwitchVoice || undefined,
        structuredIdentity: postMatchVoice.structured,
        error: postMatchVoice.error || `Đã chọn Page "${targetIdentity}", nhưng sau khi chuyển, danh tính hoạt động trong DOM ghi nhận là "${postSwitchVoice || 'tài khoản cá nhân'}". Từ chối gửi bình luận để bảo đảm an toàn.`,
      };
    } catch (e: any) {
      console.warn(`[Dispatcher] Lỗi khi kiểm tra/chuyển đổi vai trò: ${e.message}`);
      return {
        matched: false,
        error: `Lỗi khi kiểm tra vai trò bình luận: ${e.message}. Từ chối bình luận để tránh nhầm lẫn danh tính.`,
      };
    }
  }
}

export const commentDispatcher = new FacebookCommentDispatcher();
