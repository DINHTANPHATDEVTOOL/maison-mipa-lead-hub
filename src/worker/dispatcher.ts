import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { authManager } from './auth';

export interface DispatchCommentParams {
  postId: string;
  postUrl: string;
  commentContent: string;
  pageIdentity?: string; // Default: 'Maison MIPA'
  pageId?: string; // Facebook Page ID (e.g. '100083281234567')
  lookbackTimeoutMs?: number;
}

export interface DispatchCommentResult {
  status: 'sent_confirmed' | 'uncertain_failed' | 'rejected';
  commentFacebookId?: string;
  permalink?: string;
  errorMessage?: string;
}

export class FacebookCommentDispatcher {
  /**
   * Dispatch an outreach comment using real Playwright browser automation
   */
  public async dispatchComment(params: DispatchCommentParams): Promise<DispatchCommentResult> {
    const sessionSummary = authManager.getSessionSummary();
    if (!sessionSummary.exists || !sessionSummary.valid) {
      return {
        status: 'rejected',
        errorMessage: 'Chưa có phiên đăng nhập Facebook hợp lệ (storageState). Hệ thống từ chối báo thành công giả khi chưa có quyền truy cập thực tế.',
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

      context = await browser.newContext({
        storageState: authManager.getStorageStatePath(),
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
          status: 'rejected',
          errorMessage: 'Mất phiên đăng nhập Facebook hoặc bị Meta yêu cầu checkpoint xác minh danh tính.',
        };
      }

      await page.waitForTimeout(2500);

      // STEP 1: Verify & Switch Identity to Page (Maison MIPA)
      const targetPageName = params.pageIdentity || 'Maison MIPA';
      console.log(`[Dispatcher] Kiểm tra danh tính bình luận yêu cầu: "${targetPageName}"`);
      const identityResult = await this.verifyAndSwitchPageIdentity(page, targetPageName, params.pageId);
      if (!identityResult.matched) {
        return {
          status: 'rejected',
          errorMessage: identityResult.error || `Từ chối gửi bình luận: Chưa xác thực được danh tính Page "${targetPageName}". Không được phép gửi bằng tài khoản cá nhân.`,
        };
      }

      // STEP 2: Locate Comment Box
      const commentInput = await page.$(
        'div[role="textbox"][aria-label*="bình luận"], div[role="textbox"][aria-label*="comment"], div[role="textbox"][aria-label*="Viết"], div[role="textbox"][aria-label*="Write"]'
      );

      if (!commentInput) {
        return {
          status: 'rejected',
          errorMessage: 'Không tìm thấy khung nhập bình luận hoặc tài khoản/Page không có quyền bình luận trong bài này.',
        };
      }

      // STEP 2.5: Snapshot existing comments on the post BEFORE typing
      // Collect existing comment IDs and unique content/author fingerprints to prevent false positives from pre-existing comments.
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
      await page.keyboard.press('Enter');

      // STEP 4: STRICT DOM CONFIRMATION OF NEW COMMENT ONLY
      // Look specifically inside comment containers for the newly submitted comment,
      // strictly ignoring ANY pre-existing comment that was present prior to Enter.
      const snippetToSearch = params.commentContent.slice(0, 35);
      const startTime = Date.now();
      let confirmedComment: { found: boolean; commentId?: string; commentPermalink?: string; authorMatches?: boolean } = { found: false };

      while (Date.now() - startTime < 16000) {
        await page.waitForTimeout(1500);

        confirmedComment = await page.evaluate(({ snippet, targetIdentity, preExistingList }) => {
          const preSet = new Set(preExistingList);
          const commentElements = document.querySelectorAll(
            'div[role="article"][aria-label*="bình luận"], div[role="article"][aria-label*="comment"], ul[aria-label*="bình luận"] li, div[class*="commentable_item"] div[role="article"]'
          );

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

            // Ignore if this comment existed before our submission!
            if (commentId && preSet.has(`id:${commentId}`)) {
              continue;
            }
            if (preSet.has(`fp:${authorText}::${text.slice(0, 100)}`)) {
              continue;
            }

            // Only check newly appeared comments
            if (text.includes(snippet)) {
              const authorMatches = authorText.toLowerCase().includes(targetIdentity.toLowerCase());
              return {
                found: true,
                commentId,
                commentPermalink,
                authorMatches,
              };
            }
          }

          return { found: false, authorMatches: false };
        }, { snippet: snippetToSearch, targetIdentity: targetPageName, preExistingList: preExistingComments });

        if (confirmedComment.found && confirmedComment.authorMatches) {
          break;
        }
      }

      // CRITICAL FIX: Only confirm if BOTH comment text was found AND author matched our Page!
      if (confirmedComment.found && confirmedComment.authorMatches) {
        const finalPermalink = confirmedComment.commentPermalink ||
          (confirmedComment.commentId ? `${params.postUrl}?comment_id=${confirmedComment.commentId}` : params.postUrl);

        return {
          status: 'sent_confirmed',
          commentFacebookId: confirmedComment.commentId,
          permalink: finalPermalink,
        };
      } else {
        // Did not confirm presence inside comments list with matching author within timeout
        // Mark UNCERTAIN_FAILED to protect against duplicate posting!
        const reason = confirmedComment.found && !confirmedComment.authorMatches
          ? `Bình luận tương tự được phát hiện nhưng tác giả không khớp Page "${targetPageName}". Không xác nhận thành công để tránh nhầm lẫn với bình luận của người khác.`
          : `Đã nhấn phím Enter gửi bình luận nhưng sau 16 giây chưa thấy bài xuất hiện dưới tên Page "${targetPageName}". Đánh dấu "Chưa xác định kết quả" để chống gửi lặp.`;

        return {
          status: 'uncertain_failed',
          errorMessage: reason,
        };
      }

    } catch (err: any) {
      console.error(`[Dispatcher] Ngoại lệ khi gửi bình luận:`, err);
      return {
        status: 'uncertain_failed',
        errorMessage: `Ngoại lệ kết nối/trình duyệt: ${err.message}. Đặt trạng thái chưa xác định để chống gửi lặp.`,
      };
    } finally {
      if (context) await context.close();
      if (browser) await browser.close();
    }
  }

  /**
   * Helper to check and switch Facebook commenting voice / identity,
   * then strictly re-verifies active identity in the DOM after switching.
   */
  public async verifyAndSwitchPageIdentity(
    page: Page, 
    targetIdentity: string,
    targetPageId?: string
  ): Promise<{ matched: boolean; activeIdentity?: string; error?: string }> {
    try {
      // Helper function to read the currently active voice from DOM
      const readActiveVoice = async () => {
        return await page.evaluate(() => {
          // 1. Check avatar alt near comment input
          const formImg = document.querySelector('div[role="textbox"]')?.closest('form')?.querySelector('img[alt]');
          const formAlt = formImg?.getAttribute('alt');
          if (formAlt) return formAlt.trim();

          // 2. Check switcher element text/aria-label
          const switcherEl = document.querySelector(
            'div[aria-label*="Tương tác dưới danh nghĩa"], div[aria-label*="Interacting as"], div[aria-label*="Bình luận dưới tên"], div[aria-label*="vai trò"]'
          );
          if (switcherEl) {
            const label = switcherEl.getAttribute('aria-label') || switcherEl.textContent || '';
            if (label) return label.trim();
          }

          // 3. Check profile anchor near comment input
          const anchor = document.querySelector('div[role="textbox"]')?.closest('form')?.querySelector('a[href*="facebook.com"]');
          if (anchor) {
            const anchorText = anchor.textContent?.trim();
            const href = anchor.getAttribute('href') || '';
            return `${anchorText || ''} [${href}]`.trim();
          }

          return null;
        });
      };

      const isVoiceMatching = (voice: string | null): boolean => {
        if (!voice) return false;
        const vLower = voice.toLowerCase();
        const tLower = targetIdentity.toLowerCase();
        if (vLower.includes(tLower)) return true;
        if (targetPageId && voice.includes(targetPageId)) return true;
        return false;
      };

      // 1. Check current voice before touching switcher
      const initialVoice = await readActiveVoice();
      if (isVoiceMatching(initialVoice)) {
        return { matched: true, activeIdentity: initialVoice || targetIdentity };
      }

      // 2. Locate the switcher button
      const switcher = await page.$(
        'div[aria-label*="Tương tác dưới danh nghĩa"], div[aria-label*="Interacting as"], div[aria-label*="Bình luận dưới tên"], div[aria-label*="vai trò"]'
      );

      if (!switcher) {
        // No switcher found and initial voice doesn't match target Page
        return {
          matched: false,
          error: `Không tìm thấy nút chuyển đổi danh tính và danh tính hiện tại ("${initialVoice || 'tài khoản cá nhân'}") không khớp Page "${targetIdentity}". Từ chối bình luận bằng tài khoản cá nhân.`,
        };
      }

      const switcherText = (await switcher.textContent()) || (await switcher.getAttribute('aria-label')) || '';
      if (isVoiceMatching(switcherText)) {
        return { matched: true, activeIdentity: switcherText };
      }

      // Click switcher to choose target Page
      await switcher.click();
      await page.waitForTimeout(1000);

      const switched = await page.evaluate(({ target, pageId }) => {
        const options = Array.from(document.querySelectorAll('div[role="menuitem"], div[role="button"], div[role="radio"]'));
        const targetOption = options.find(o => {
          const text = (o.textContent || '').toLowerCase();
          const targetLower = target.toLowerCase();
          if (text.includes(targetLower)) return true;
          if (pageId && (o.getAttribute('data-page-id') === pageId || text.includes(pageId))) return true;
          return false;
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
          error: `Không tìm thấy Page "${targetIdentity}" ${targetPageId ? `(ID: ${targetPageId})` : ''} trong danh sách vai trò có thể bình luận của tài khoản.`,
        };
      }

      // CRITICAL FIX: After clicking the selection, do NOT blindly assume success!
      // Wait for DOM re-render and re-verify the active commenting identity.
      await page.waitForTimeout(1500);

      const postSwitchVoice = await readActiveVoice();
      const currentSwitcher = await page.$(
        'div[aria-label*="Tương tác dưới danh nghĩa"], div[aria-label*="Interacting as"], div[aria-label*="Bình luận dưới tên"], div[aria-label*="vai trò"]'
      );
      const postSwitcherText = currentSwitcher
        ? ((await currentSwitcher.textContent()) || (await currentSwitcher.getAttribute('aria-label')) || '')
        : '';

      if (isVoiceMatching(postSwitchVoice) || isVoiceMatching(postSwitcherText)) {
        return {
          matched: true,
          activeIdentity: postSwitchVoice || postSwitcherText || targetIdentity,
        };
      }

      // Re-read failed to confirm target Page identity (still personal profile or unverified)
      return {
        matched: false,
        activeIdentity: postSwitchVoice || postSwitcherText || undefined,
        error: `Đã chọn Page "${targetIdentity}", nhưng sau khi chuyển, danh tính hoạt động trong DOM ghi nhận là "${postSwitchVoice || postSwitcherText || 'tài khoản cá nhân'}". Từ chối gửi bình luận để bảo đảm không dùng tài khoản cá nhân.`,
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
