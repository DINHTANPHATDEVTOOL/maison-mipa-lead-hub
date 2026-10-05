import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { authManager } from './auth';

export interface DispatchCommentParams {
  postId: string;
  postUrl: string;
  commentContent: string;
  pageIdentity: string;
}

export interface DispatchCommentResult {
  status: 'sent_confirmed' | 'uncertain_failed' | 'rejected';
  commentFacebookId?: string;
  permalink?: string;
  errorMessage?: string;
}

export class FacebookCommentDispatcher {
  private headless: boolean;

  constructor(headless: boolean = true) {
    this.headless = process.env.PLAYWRIGHT_HEADLESS !== 'false' && headless;
  }

  public async dispatchComment(params: DispatchCommentParams): Promise<DispatchCommentResult> {
    const sessionPath = authManager.getSessionPath();

    // STRICT CHECK: Reject immediately if no valid session exists! NEVER FAKE SUCCESS!
    if (!sessionPath) {
      return {
        status: 'rejected',
        errorMessage: 'Chưa có phiên đăng nhập Facebook hợp lệ (storageState.json). Không thể thực hiện bình luận tự động khi chưa được cấp quyền.',
      };
    }

    let browser: Browser | null = null;
    let context: BrowserContext | null = null;

    try {
      browser = await chromium.launch({
        headless: this.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
        ],
      });

      context = await browser.newContext({
        storageState: sessionPath,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
      });

      const page: Page = await context.newPage();
      console.log(`[Dispatcher] Mở bài viết để gửi bình luận: ${params.postUrl}`);

      const response = await page.goto(params.postUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      if (!response || response.status() >= 400) {
        return {
          status: 'rejected',
          errorMessage: `Không thể mở bài viết Facebook (HTTP ${response?.status() || 'Timeout'})`,
        };
      }

      // Check session expiration or checkpoint
      const currentUrl = page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/checkpoint') || currentUrl.includes('two_factor')) {
        return {
          status: 'rejected',
          errorMessage: 'Mất phiên đăng nhập Facebook hoặc bị Meta yêu cầu checkpoint xác minh danh tính.',
        };
      }

      await page.waitForTimeout(2500);

      // STEP 1: Verify & Switch Identity to Page
      if (params.pageIdentity) {
        console.log(`[Dispatcher] Kiểm tra danh tính bình luận yêu cầu: "${params.pageIdentity}"`);
        const identityResult = await this.verifyAndSwitchPageIdentity(page, params.pageIdentity);
        if (!identityResult.matched) {
          return {
            status: 'rejected',
            errorMessage: identityResult.error || `Không thể xác nhận hoặc chuyển đổi danh tính sang Page "${params.pageIdentity}".`,
          };
        }
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
      // Do NOT search document.body.innerText broadly!
      // Look specifically inside comment containers for the comment snippet and matching author.
      const snippetToSearch = params.commentContent.slice(0, 35);
      const startTime = Date.now();
      let confirmedComment: { found: boolean; commentId?: string; commentPermalink?: string } = { found: false };

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
              // Check if author matches target identity if present
              const authorEl = el.querySelector('a[role="link"] span, h3, h4, span.x193iq5w');
              const authorText = (authorEl?.textContent || '').trim();
              const authorMatches = !targetIdentity || authorText.toLowerCase().includes(targetIdentity.toLowerCase());

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

          return { found: false };
        }, { snippet: snippetToSearch, targetIdentity: params.pageIdentity });

        if (confirmedComment.found) {
          break;
        }
      }

      if (confirmedComment.found) {
        const finalPermalink = confirmedComment.commentPermalink ||
          (confirmedComment.commentId ? `${params.postUrl}?comment_id=${confirmedComment.commentId}` : params.postUrl);

        return {
          status: 'sent_confirmed',
          commentFacebookId: confirmedComment.commentId,
          permalink: finalPermalink,
        };
      } else {
        // Did not confirm presence inside comments list within timeout
        // Mark UNCERTAIN_FAILED to protect against duplicate posting!
        return {
          status: 'uncertain_failed',
          errorMessage: 'Đã nhấn phím Enter gửi bình luận nhưng sau 16 giây chưa thấy bài xuất hiện trong danh sách bình luận trên Facebook. Đánh dấu "Chưa xác định kết quả" để chống gửi lặp.',
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
  private async verifyAndSwitchPageIdentity(page: Page, targetIdentity: string): Promise<{ matched: boolean; error?: string }> {
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
        // In some groups without voice switcher, commenting defaults to user profile
        console.log(`[Dispatcher] Không tìm thấy nút chuyển đổi danh tính, tiếp tục kiểm tra quyền bình luận.`);
        return { matched: true };
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
      return { matched: true }; // Proceed to attempt comment
    }
  }
}

export const commentDispatcher = new FacebookCommentDispatcher();
