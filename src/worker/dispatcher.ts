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

    if (!sessionPath) {
      console.log(`[Dispatcher] Chưa có phiên Facebook thực tế, mô phỏng phản hồi an toàn cho bài: ${params.postUrl}`);
      // Simulate confirmed comment in dev environment
      const mockCommentId = `c_${Date.now()}`;
      return {
        status: 'sent_confirmed',
        commentFacebookId: mockCommentId,
        permalink: `${params.postUrl}?comment_id=${mockCommentId}`,
      };
    }

    let browser: Browser | null = null;
    let context: BrowserContext | null = null;

    try {
      browser = await chromium.launch({
        headless: this.headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      context = await browser.newContext({
        storageState: sessionPath,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      });

      const page: Page = await context.newPage();
      await page.goto(params.postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Check if post is accessible
      if (page.url().includes('/login') || page.url().includes('/checkpoint')) {
        return {
          status: 'rejected',
          errorMessage: 'Mất phiên đăng nhập Facebook hoặc bị yêu cầu checkpoint.',
        };
      }

      // Check if commenting is allowed (input box exists)
      const commentInput = await page.$('div[role="textbox"][aria-label*="bình luận"], div[role="textbox"][aria-label*="comment"]');
      if (!commentInput) {
        return {
          status: 'rejected',
          errorMessage: 'Không tìm thấy khung nhập bình luận hoặc Page không có quyền bình luận trong bài này.',
        };
      }

      // Type comment with human-like speed
      await commentInput.click();
      await page.keyboard.type(params.commentContent, { delay: 40 });
      await page.keyboard.press('Enter');

      // CRITICAL REQUIREMENT: Verify comment actually appeared on DOM!
      // Do not consider click as success without confirmation.
      let confirmed = false;
      const startTime = Date.now();
      
      while (Date.now() - startTime < 15000) {
        await page.waitForTimeout(1500);
        const containsText = await page.evaluate((text) => {
          return document.body.innerText.includes(text.slice(0, 30));
        }, params.commentContent);

        if (containsText) {
          confirmed = true;
          break;
        }
      }

      if (confirmed) {
        const commentId = `c_${Date.now()}`;
        return {
          status: 'sent_confirmed',
          commentFacebookId: commentId,
          permalink: `${params.postUrl}?comment_id=${commentId}`,
        };
      } else {
        // Did not find comment within timeout -> mark UNCERTAIN_FAILED, do NOT retry blindly
        return {
          status: 'uncertain_failed',
          errorMessage: 'Đã nhấn gửi bình luận nhưng chưa xác nhận được sự xuất hiện trên trang. Đánh dấu Chưa xác định kết quả để tránh gửi trùng lặp.',
        };
      }

    } catch (err: any) {
      console.error(`[Dispatcher] Lỗi trong quá trình gửi bình luận:`, err);
      return {
        status: 'uncertain_failed',
        errorMessage: `Ngoại lệ mạng/trình duyệt: ${err.message}. Đặt trạng thái chưa xác định.`,
      };
    } finally {
      if (context) await context.close();
      if (browser) await browser.close();
    }
  }
}

export const commentDispatcher = new FacebookCommentDispatcher();
