import { chromium, Browser, BrowserContext, Page } from 'playwright';
import crypto from 'crypto';
import { authManager } from './auth';

export interface RawExtractedPost {
  facebook_post_id?: string;
  post_url: string;
  post_url_hash: string;
  content_hash: string;
  author_name: string;
  content_raw: string;
  posted_at: string;
}

export interface CrawlGroupResult {
  success: boolean;
  posts: RawExtractedPost[];
  error?: string;
  needsAuth?: boolean;
  canPageComment?: boolean;
}

/**
 * Normalizes Facebook URL and extracts real post ID and SHA-256 hash.
 * Strips all tracking query parameters (mibextid, rdid, ref, etc.).
 */
export function canonicalizeFacebookUrl(rawUrl: string): {
  canonicalUrl: string;
  postId?: string;
  postHash: string;
  urlHash: string;
} {
  try {
    const url = new URL(rawUrl);
    // Remove tracking & referral noise
    const trackingKeys = [
      'mibextid', 'rdid', 'ref', 'share_id', '__tn__', 'set', 'type', 'app',
      'locale', 'comment_id', 'notif_id', 'notif_t', 'feedback_referrer',
      '__cft__', 'paipv'
    ];
    trackingKeys.forEach(k => url.searchParams.delete(k));

    let postId: string | undefined;
    const pathMatch = url.pathname.match(/\/(?:posts|permalink)\/([0-9]+)/);
    if (pathMatch) {
      postId = pathMatch[1];
    } else {
      const fbid = url.searchParams.get('story_fbid') || url.searchParams.get('fbid');
      if (fbid && /^[0-9]+$/.test(fbid)) {
        postId = fbid;
      }
    }

    const groupMatch = url.pathname.match(/\/groups\/([^\/]+)/);
    const groupSlug = groupMatch ? groupMatch[1] : '';

    let canonical = rawUrl;
    if (groupSlug && postId) {
      canonical = `https://www.facebook.com/groups/${groupSlug}/posts/${postId}`;
    } else {
      canonical = `${url.origin}${url.pathname}`.replace(/\/$/, '');
      if (url.searchParams.toString()) {
        canonical += `?${url.searchParams.toString()}`;
      }
    }

    const postHash = crypto.createHash('sha256').update(canonical.toLowerCase()).digest('hex');
    return { canonicalUrl: canonical, postId, postHash, urlHash: postHash };
  } catch {
    const clean = rawUrl.split('?')[0].replace(/\/$/, '');
    const postHash = crypto.createHash('sha256').update(clean.toLowerCase()).digest('hex');
    return {
      canonicalUrl: clean,
      postHash,
      urlHash: postHash,
    };
  }
}

/**
 * Parses Vietnamese Facebook post time into an ISO 8601 string
 */
export function parseFacebookTimestamp(timeText: string): string {
  const text = (timeText || '').toLowerCase().trim();
  const now = Date.now();

  if (text.includes('vừa xong') || text.includes('just now')) {
    return new Date(now).toISOString();
  }

  const minuteMatch = text.match(/([0-9]+)\s*(?:phút|m|min)/);
  if (minuteMatch) {
    const mins = parseInt(minuteMatch[1], 10);
    return new Date(now - mins * 60 * 1000).toISOString();
  }

  const hourMatch = text.match(/([0-9]+)\s*(?:giờ|h|hr|hour)/);
  if (hourMatch) {
    const hours = parseInt(hourMatch[1], 10);
    return new Date(now - hours * 3600 * 1000).toISOString();
  }

  const dayMatch = text.match(/([0-9]+)\s*(?:ngày|d|day)/);
  if (dayMatch) {
    const days = parseInt(dayMatch[1], 10);
    return new Date(now - days * 86400 * 1000).toISOString();
  }

  if (text.includes('hôm qua') || text.includes('yesterday')) {
    const timeInDayMatch = text.match(/([0-9]{1,2}):([0-9]{2})/);
    const date = new Date(now - 86400 * 1000);
    if (timeInDayMatch) {
      date.setHours(parseInt(timeInDayMatch[1], 10), parseInt(timeInDayMatch[2], 10), 0, 0);
    }
    return date.toISOString();
  }

  return new Date(now).toISOString();
}

/**
 * Strict Facebook URL and anti-SSRF validator
 */
export function isValidFacebookUrl(rawUrl: string): { valid: boolean; error?: string } {
  try {
    const url = new URL(rawUrl.trim());
    const allowedHosts = ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com', 'fb.com'];
    if (!allowedHosts.includes(url.hostname.toLowerCase())) {
      return { valid: false, error: `Từ chối URL: Chỉ chấp nhận các tên miền chính thức của Facebook (${allowedHosts.join(', ')}). Host nhận được: ${url.hostname}` };
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return { valid: false, error: 'Giao thức URL không hợp lệ (yêu cầu https/http).' };
    }
    // Anti-SSRF check: Reject local and private IP networks
    if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|localhost|0\.0\.0\.0|::1)/i.test(url.hostname)) {
      return { valid: false, error: 'Từ chối URL: Không được phép truy cập mạng nội bộ hoặc địa chỉ loopback.' };
    }
    if (!url.pathname.includes('/groups/')) {
      return { valid: false, error: 'URL không hợp lệ: Phải là đường dẫn nhóm Facebook (/groups/).' };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'Định dạng URL không hợp lệ.' };
  }
}

export class FacebookGroupCrawler {
  private headless: boolean;

  constructor(headless: boolean = true) {
    this.headless = process.env.PLAYWRIGHT_HEADLESS !== 'false' && headless;
  }

  public async crawlGroup(groupUrl: string, lookbackHours: number = 24, profileId?: string): Promise<CrawlGroupResult> {
    // 1. Strict URL validation & Anti-SSRF
    const urlValidation = isValidFacebookUrl(groupUrl);
    if (!urlValidation.valid) {
      return {
        success: false,
        posts: [],
        error: urlValidation.error || 'URL nhóm không hợp lệ.',
      };
    }

    const profileStorage = profileId ? authManager.getProfileStorageState(profileId) : null;
    const storageState = profileStorage || authManager.getStorageState();

    // STRICT CHECK: Reject immediately if no valid session exists. NEVER FAKE DATA!
    if (!storageState) {
      return {
        success: false,
        posts: [],
        needsAuth: true,
        error: `Chưa có phiên đăng nhập Facebook hợp lệ ${profileId ? `cho thiết bị [${profileId}]` : '(storageState)'}. Vui lòng đăng nhập tài khoản trước khi quét.`,
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
        storageState: storageState as any,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
      });

      const page: Page = await context.newPage();

      // Ensure chronological sort URL to get NEWEST posts first
      let targetUrl = groupUrl.trim();
      if (!targetUrl.includes('sorting_setting=')) {
        targetUrl += targetUrl.includes('?') ? '&sorting_setting=CHRONOLOGICAL' : '?sorting_setting=CHRONOLOGICAL';
      }

      console.log(`[Crawler] Đang mở nhóm Facebook (sắp xếp mới nhất): ${targetUrl}`);
      const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      if (!response || response.status() >= 400) {
        return {
          success: false,
          posts: [],
          error: `Không thể kết nối đến Facebook (HTTP ${response?.status() || 'Timeout'})`,
        };
      }

      // Check login wall or checkpoint
      const currentUrl = page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/checkpoint') || currentUrl.includes('two_factor')) {
        return {
          success: false,
          posts: [],
          needsAuth: true,
          error: 'Phiên đăng nhập Facebook đã hết hạn hoặc bị Meta yêu cầu Checkpoint xác minh.',
        };
      }

      // Initial feed wait
      await page.waitForTimeout(3000);

      // Check if restricted / closed group
      const isRestricted = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        return bodyText.includes('Nhóm này là nhóm riêng tư') ||
               bodyText.includes('Nội dung này hiện không khả dụng') ||
               bodyText.includes('Tham gia nhóm để xem');
      });

      if (isRestricted) {
        return {
          success: false,
          posts: [],
          error: 'Tài khoản chưa tham gia hoặc không có quyền truy cập nhóm riêng tư này.',
        };
      }

      // Multi-scroll to load dynamic posts
      for (let s = 0; s < 3; s++) {
        await page.mouse.wheel(0, 1800);
        await page.waitForTimeout(2000);
      }

      // Extract raw DOM articles
      const rawDOMPosts = await page.evaluate(() => {
        const articles: Array<{
          rawHref?: string;
          authorName: string;
          contentText: string;
          timestampText: string;
        }> = [];

        const elements = document.querySelectorAll(
          'div[role="feed"] div[role="article"], div[data-ad-preview="message"], div[class*="userContentWrapper"]'
        );

        elements.forEach((el) => {
          const text = (el.textContent || '').trim();
          if (text.length < 20) return;

          // Attempt to find permalink
          const link = el.querySelector(
            'a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid="], a[href*="fbid="]'
          );
          const rawHref = link ? (link as HTMLAnchorElement).href : undefined;

          // Author
          const authorEl = el.querySelector('h2 a, strong a, a[role="link"] span, h3 a');
          const authorName = authorEl ? (authorEl.textContent || 'Khách hàng Facebook') : 'Khách hàng Facebook';

          // Timestamp
          const timeEl = el.querySelector('abbr, a[aria-label*="phút"], a[aria-label*="giờ"], a[aria-label*="ngày"], span[id*="jsc_"] a');
          const timestampText = timeEl ? (timeEl.textContent || timeEl.getAttribute('aria-label') || '') : '';

          articles.push({
            rawHref,
            authorName: authorName.trim(),
            contentText: text.slice(0, 1500),
            timestampText,
          });
        });

        return articles;
      });

      // Check commenting rights
      const canPageComment = await page.evaluate(() => {
        const switcher = document.querySelector(
          'div[aria-label*="Tương tác dưới danh nghĩa"], div[aria-label*="Interacting as"], div[aria-label*="vai trò"], div[role="textbox"][aria-label*="bình luận"]'
        );
        return switcher !== null;
      });

      // Process, Canonicalize & Deduplicate extracted items
      const processedPosts: RawExtractedPost[] = [];
      const cutoffTime = Date.now() - lookbackHours * 3600 * 1000;

      for (const domItem of rawDOMPosts) {
        const postedAtIso = parseFacebookTimestamp(domItem.timestampText);
        const postTimestamp = new Date(postedAtIso).getTime();

        // Enforce lookback window
        if (postTimestamp < cutoffTime) {
          continue;
        }

        // Compute content fingerprint
        const contentHash = crypto
          .createHash('sha256')
          .update(`${domItem.authorName}:${domItem.contentText.slice(0, 200)}`.toLowerCase())
          .digest('hex');

        let canonicalUrl: string;
        let facebookPostId: string | undefined;
        let postUrlHash: string;

        if (domItem.rawHref) {
          const canon = canonicalizeFacebookUrl(domItem.rawHref);
          canonicalUrl = canon.canonicalUrl;
          facebookPostId = canon.postId;
          postUrlHash = canon.postHash;
        } else {
          // SAFE FALLBACK: Never use window.location.href!
          // Use content fingerprint so unique posts without permalink are distinct!
          const cleanGroupBase = groupUrl.split('?')[0].replace(/\/$/, '');
          canonicalUrl = `${cleanGroupBase}#post-${contentHash.slice(0, 16)}`;
          facebookPostId = `fb_${contentHash.slice(0, 12)}`;
          postUrlHash = crypto.createHash('sha256').update(canonicalUrl.toLowerCase()).digest('hex');
        }

        processedPosts.push({
          facebook_post_id: facebookPostId,
          post_url: canonicalUrl,
          post_url_hash: postUrlHash,
          content_hash: contentHash,
          author_name: domItem.authorName,
          content_raw: domItem.contentText,
          posted_at: postedAtIso,
        });
      }

      return {
        success: true,
        posts: processedPosts,
        canPageComment,
      };

    } catch (err: any) {
      console.error(`[Crawler] Lỗi khi cào dữ liệu nhóm ${groupUrl}:`, err);
      return {
        success: false,
        posts: [],
        error: `Lỗi kết nối trình duyệt Playwright: ${err.message}`,
      };
    } finally {
      if (context) await context.close();
      if (browser) await browser.close();
    }
  }
}

export const groupCrawler = new FacebookGroupCrawler();
