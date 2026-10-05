import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { authManager } from './auth';

export interface DispatchCommentParams {
  postId: string;
  postUrl: string;
  commentContent: string;
  pageIdentity?: string; // Default: 'Maison MIPA'
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
      const identityResult = await this.verifyAndSwitchPageIdentity(page, targetPageName);
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

      // STEP 3: Type with human-like cadence
      await commentInput.click();
      await page.waitForTimeout(600);
      await page.keyboard.type(params.commentContent, { delay: 40 });
      await page.waitForTimeout(800);
      await page.keyboard.press('Enter');

      // STEP 4: STRICT DOM CONFIRMATION
      // Look specifically inside comment containers for the comment snippet and matching author.
      const snippetToSearch = params.commentContent.slice(0, 35);
      const startTime = Date.now();
      let confirmedComment: { found: boolean; commentId?: string; commentPermalink?: string; authorMatches?: boolean } = { found: false };

      while (Date.now() - startTime < 16000) {
        await page.waitForTimeout(1500);

        confirmedComment = await page.evaluate(({ snippet, targetIdentity }) => {
          // Look in comment article elements
          const commentElements = document.querySelectorAll(
            'div[role="article"][aria-label*="bình luận"], div[role="article"][aria-label*="comment"], ul[aria-label*="bình luận"] li, div[class*="commentable_item"] div[role="article"]'
          );

          for (const el of Array.from(commentElements)) {
            const text = (el.textContent || '').trim();
            if (text.includes(snippet)) {
              // Check if author matches target identity
              const authorEl = el.querySelector('a[role="link"] span, h3, h4, span.x193iq5w');
              const authorText = (authorEl?.textContent || '').trim();
              const authorMatches = authorText.toLowerCase().includes(targetIdentity.toLowerCase());

              // Extract real comment ID and permalink if link is present
              const permalinkAnchor = el.querySelector('a[href*="comment_id="]') as HTMLAnchorElement | null;
              let commentId: string | undefined;
              let commentPermalink: string | undefined;

              if (permalinkAnchor) {
                const match = permalinkAnchor.href.match(/comment_id=([0-9]+)/);
                if (match) commentId = match[1];
                commentPermalink = permalinkAnchor.href;
              }

              return {
                found: true,
                commentId,
                commentPermalink,
                authorMatches,
              };
            }
          }

          return { found: false, authorMatches: false };
        }, { snippet: snippetToSearch, targetIdentity: targetPageName });

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
   * Helper to check and switch Facebook commenting voice / identity
   */
  public async verifyAndSwitchPageIdentity(page: Page, targetIdentity: string): Promise<{ matched: boolean; error?: string }> {
    try {
      // Look for the identity switcher button near comment box or post
      const switcher = await page.$(
        'div[aria-label*="Tương tác dưới danh nghĩa"], div[aria-label*="Interacting as"], div[aria-label*="Bình luận dưới tên"], div[aria-label*="vai trò"]'
      );

      if (!switcher) {
        // If no switcher is visible, verify active account name in top header or near input
        const currentVoice = await page.evaluate(() => {
          const profileLink = document.querySelector('div[role="textbox"]')?.closest('form')?.querySelector('img[alt]');
          return profileLink ? profileLink.getAttribute('alt') : null;
        });

        if (currentVoice && currentVoice.toLowerCase().includes(targetIdentity.toLowerCase())) {
          return { matched: true };
        }

        // CRITICAL FIX: If no switcher is found and profile does not match target Page,
        // strictly refuse to proceed with personal profile!
        return {
          matched: false,
          error: `Không tìm thấy nút chuyển đổi danh tính và tài khoản hiện tại không mang tên Page "${targetIdentity}". Từ chối bình luận bằng tài khoản cá nhân.`,
        };
      }

      // Check current switcher text
      const switcherText = (await switcher.textContent()) || (await switcher.getAttribute('aria-label')) || '';
      if (switcherText.toLowerCase().includes(targetIdentity.toLowerCase())) {
        return { matched: true };
      }

      // Click switcher to choose target Page
      await switcher.click();
      await page.waitForTimeout(1000);

      const switched = await page.evaluate((target) => {
        const options = Array.from(document.querySelectorAll('div[role="menuitem"], div[role="button"], div[role="radio"]'));
        const targetOption = options.find(o => (o.textContent || '').toLowerCase().includes(target.toLowerCase()));
        if (targetOption) {
          (targetOption as HTMLElement).click();
          return true;
        }
        return false;
      }, targetIdentity);

      await page.waitForTimeout(1500);

      if (switched) {
        return { matched: true };
      }

      return {
        matched: false,
        error: `Không tìm thấy Page "${targetIdentity}" trong danh sách vai trò có thể bình luận của tài khoản.`,
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
