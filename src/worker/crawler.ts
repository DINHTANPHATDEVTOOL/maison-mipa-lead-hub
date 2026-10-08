import { Browser, BrowserContext, Page } from 'playwright';
import { launchBrowser } from '../lib/browser';
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
  raw_timestamp_text?: string;
  image_urls?: string[];
  media_preview_url?: string;
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
      '__cft__', 'paipv', '_rdc', '_rdr', 'extid', 'fs', 's', 'wtsid', 'substory_index'
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
 * Strips Facebook UI junk, SVG icon texts ("FacebookFacebook..."), Meta AI automated image descriptions,
 * contributor badges, privacy labels, and tracking hashes to isolate the clean post status.
 */
export function cleanFacebookPostText(rawText: string): string {
  if (!rawText) return '';

  let text = rawText;

  // 1. Remove repetitive SVG / Sprite / Logo "Facebook" text
  text = text.replace(/(?:Facebook)+/gi, ' ');

  // 2. Remove Facebook badges & contributor labels
  text = text.replace(/(?:Người đóng góp đang lên|Quản trị viên|Người kiểm duyệt|Tác giả bài viết|Tác giả|Thành viên hàng đầu|Thành viên nhóm)\s*[·•\-]?/gi, ' ');

  // 3. Remove privacy & sharing labels
  text = text.replace(/(?:Đã chia sẻ với Nhóm công khai|Đã chia sẻ với Công khai|Nhóm công khai|Nhóm riêng tư|Chỉ mình tôi|Bạn bè)\s*[·•\-]?/gi, ' ');
  text = text.replace(/Đã chia sẻ bài viết\s*[0-9]*/gi, ' ');

  // 4. Remove timestamp leakages if caught in text
  text = text.replace(/(?:[0-9]+\s*(?:ngày|giờ|phút|giây|tháng|tuần|h|m|d)\s*trước)\s*[·•\-]?/gi, ' ');

  // 5. Remove Meta AI automatic image description text and trailing image previews
  text = text.replace(/(?:Có thể là hình ảnh về|May be an image of)[\s\S]*?(?=(?:Ảnh từ bài viết|Đã chia sẻ|Facebook|$))/gi, ' ');

  // 6. Remove image attribution / author card artifacts
  text = text.replace(/Ảnh từ bài viết của\s*[^.\n]*/gi, ' ');

  // 7. Remove UI buttons: "Xem thêm", "See more", reactions
  text = text.replace(/\b(Xem thêm|See more)\b/gi, ' ');

  // 8. Remove random tracking CDN domains / hash codes (e.g., 6lswXi.com, mALBh4mXcWj7EUtJlW0fl2JvvDuhs)
  text = text.replace(/[a-zA-Z0-9_-]*\.com\b/gi, ' ');
  text = text.replace(/\b[a-zA-Z0-9_-]{15,}\b/g, ' ');

  // 9. Normalize whitespace and trim
  text = text.replace(/\s+/g, ' ').trim();

  return text;
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

  const weekMatch = text.match(/([0-9]+)\s*(?:tuần|w|week)/);
  if (weekMatch) {
    const weeks = parseInt(weekMatch[1], 10);
    return new Date(now - weeks * 7 * 86400 * 1000).toISOString();
  }

  // Explicit Vietnamese date formats: "5 tháng 10 lúc 14:30" or "ngày 5 tháng 10" or "5 thg 10"
  const fullDateMatch = text.match(/([0-9]{1,2})\s*(?:tháng|thg|\/)\s*([0-9]{1,2})(?:\s*(?:năm|\/)\s*([0-9]{4}))?/);
  if (fullDateMatch) {
    const day = parseInt(fullDateMatch[1], 10);
    const month = parseInt(fullDateMatch[2], 10) - 1; // 0-indexed
    const year = fullDateMatch[3] ? parseInt(fullDateMatch[3], 10) : new Date().getFullYear();
    const date = new Date(year, month, day);
    const timeInDay = text.match(/([0-9]{1,2}):([0-9]{2})/);
    if (timeInDay) {
      date.setHours(parseInt(timeInDay[1], 10), parseInt(timeInDay[2], 10), 0, 0);
    }
    return date.toISOString();
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
    const isGroupOrShare =
      url.pathname.includes('/groups/') ||
      url.pathname.includes('/share/g/') ||
      url.pathname.includes('/share/');
    if (!isGroupOrShare) {
      return { valid: false, error: 'URL không hợp lệ: Phải là đường dẫn nhóm Facebook (/groups/ hoặc link chia sẻ /share/g/).' };
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
      browser = await launchBrowser({
        headless: this.headless,
      });

      context = await browser.newContext({
        storageState: storageState as any,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
      });

      const page: Page = await context.newPage();

      // Ensure chronological sort URL to get NEWEST posts first (if not a share redirect link)
      let targetUrl = groupUrl.trim();
      if (!targetUrl.includes('/share/') && !targetUrl.includes('sorting_setting=')) {
        targetUrl += targetUrl.includes('?') ? '&sorting_setting=CHRONOLOGICAL' : '?sorting_setting=CHRONOLOGICAL';
      }

      console.log(`[Crawler] Đang mở nhóm Facebook: ${targetUrl}`);
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

      // Initial wait for feed container
      await page.waitForTimeout(2500);

      // Follow redirects to resolve canonical group URL and strictly enforce CHRONOLOGICAL sort
      const afterNavUrl = page.url();
      const groupMatch = afterNavUrl.match(/(https?:\/\/[^\/]+\/groups\/[^\/\?#]+)/);
      if (groupMatch && !afterNavUrl.includes('sorting_setting=CHRONOLOGICAL')) {
        const chronoUrl = `${groupMatch[1]}/?sorting_setting=CHRONOLOGICAL`;
        console.log(`[Crawler] Đảm bảo sắp xếp bài mới nhất qua URL chuẩn: ${chronoUrl}`);
        try {
          await page.goto(chronoUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
          await page.waitForTimeout(2500);
        } catch {}
      }

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

      // Helper to dismiss login dialogs and backdrop blockers
      const dismissFacebookPopups = async () => {
        try {
          await page.keyboard.press('Escape');
          const closeButtons = await page.$$(
            'div[role="dialog"] div[aria-label="Đóng" i], div[role="dialog"] div[aria-label="Close" i], div[aria-label="Đóng" i], div[aria-label="Close" i], [aria-label*="Từ chối" i], [aria-label*="Decline" i]'
          );
          for (const btn of closeButtons) {
            try {
              await btn.click({ timeout: 600 });
              await page.waitForTimeout(200);
            } catch {}
          }
        } catch {}
      };

      await dismissFacebookPopups();

      // Enforce "Bài viết mới nhất" in Facebook UI filter if currently on Top / Relevant posts
      try {
        const sortFilter = await page.$(
          'div[role="button"][aria-label*="sắp xếp" i], div[role="button"][aria-label*="sort" i], span:text-is("Phù hợp nhất"), span:text-is("Most relevant")'
        );
        if (sortFilter) {
          await sortFilter.click();
          await page.waitForTimeout(600);
          const newestOption = await page.$(
            'div[role="menuitem"]:has-text("Bài viết mới"), div[role="menuitem"]:has-text("New posts"), div[role="menuitem"]:has-text("Gần đây"), div[role="menuitem"]:has-text("Recent"), span:text-is("Bài viết mới"), span:text-is("New posts")'
          );
          if (newestOption) {
            await newestOption.click();
            await page.waitForTimeout(2000);
          }
        }
      } catch {}

      // Multi-scroll accumulator to gather posts across virtualization steps without losing items
      const accumulatedDOMMap = new Map<string, {
        rawHref?: string;
        authorName: string;
        contentText: string;
        timestampText: string;
        imageUrls?: string[];
      }>();

      for (let s = 0; s < 6; s++) {
        await dismissFacebookPopups();

        const currentBatch = await page.evaluate(() => {
          const articles: Array<{
            rawHref?: string;
            authorName: string;
            contentText: string;
            timestampText: string;
            imageUrls?: string[];
          }> = [];

          // Select candidate top-level article blocks
          const allArticles = Array.from(document.querySelectorAll('div[role="article"]')).filter((el) => {
            return el.parentElement && el.parentElement.closest('div[role="article"]') === null;
          });

          allArticles.forEach((el) => {
            // Filter out comment lists / comment sections
            if (
              el.closest('ul') !== null ||
              el.closest('form') !== null ||
              el.closest('div[aria-label*="bình luận" i]') !== null ||
              el.closest('div[aria-label*="comment" i]') !== null
            ) {
              return;
            }

            const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
            if (
              ariaLabel.includes('bình luận') ||
              ariaLabel.includes('comment') ||
              ariaLabel.includes('trả lời')
            ) {
              return;
            }

            // Extract Permalinks (SKIP links that point to specific comments: comment_id=)
            const allLinks = el.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid="], a[href*="fbid="]');
            let rawHref: string | undefined = undefined;
            for (let i = 0; i < allLinks.length; i++) {
              const h = (allLinks[i] as HTMLAnchorElement).href;
              if (h.includes('comment_id=') || h.includes('reply_comment_id=')) {
                continue;
              }
              rawHref = h;
              break;
            }

            // Extract Clean Author Name (supports standard links, anonymous pseudonyms, b and button headers)
            let authorName = 'Khách hàng Facebook';
            const header = el.querySelector('h2, h3, header');
            if (header) {
              const candidate = header.querySelector('div[role="button"], a[role="link"], strong, span[dir="auto"], b');
              const txt = (candidate ? candidate.textContent : header.textContent) || '';
              const cleanTxt = txt
                .replace(/^(Người đóng góp|Quản trị viên|Người kiểm duyệt|Tác giả bài viết|Tác giả|Thành viên nhóm)\s*[·•\-]?/gi, '')
                .trim();
              if (cleanTxt && cleanTxt.length >= 2 && cleanTxt.length <= 60 && !/^(Facebook|Nhóm|Bình luận)/i.test(cleanTxt)) {
                authorName = cleanTxt;
              }
            } else {
              const authorCandidates = el.querySelectorAll('h2 a, h3 a, strong a, header a, a[role="link"]');
              for (const a of authorCandidates) {
                const h = (a as HTMLAnchorElement).href || '';
                const txt = (a.textContent || '').trim();
                if (h.includes('/groups/') && !h.includes('/user/') && !h.includes('/profile.php')) continue;
                if (
                  txt &&
                  txt.length >= 2 &&
                  txt.length <= 60 &&
                  !/^(Người đóng góp|Quản trị viên|Người kiểm duyệt|Tác giả|Facebook|Thành viên|Group|Nhóm|Bình luận)/i.test(txt)
                ) {
                  authorName = txt;
                  break;
                }
              }
            }

            // Extract Timestamp (exclude avatar stories and profile link aria-labels)
            let timestampText = '';
            const timeElements = el.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid="], a[href*="fbid="], abbr, a[aria-label], span[aria-label]');
            for (const te of timeElements) {
              const aria = (te.getAttribute('aria-label') || '').trim();
              const txt = (te.textContent || '').trim();
              if (aria && /xem tin|avatar|ảnh đại diện|trang cá nhân/i.test(aria)) continue;
              if (aria && (/phút|giờ|ngày|hôm qua|tháng|tuần|vừa xong|min|hr|day|yesterday/i.test(aria) || /[0-9]{1,2}:[0-9]{2}/.test(aria) || /^[0-9]{1,2}\s*(?:h|m|d)\b/i.test(aria))) {
                timestampText = aria;
                break;
              }
              if (txt && (/phút|giờ|ngày|hôm qua|tháng|tuần|vừa xong|min|hr|day/i.test(txt) || /^[0-9]{1,2}\s*(?:h|m|d)\b/i.test(txt))) {
                timestampText = txt;
                break;
              }
            }

            // Extract ONLY the Post Content Body
            let contentText = '';
            const messageContainer = el.querySelector('div[data-ad-preview="message"], div[data-ad-comet-preview="message"], div[data-ad-rendering-role="story_message"], div[dir="auto"][style*="text-align"]');
            if (messageContainer && messageContainer.textContent) {
              contentText = (messageContainer as HTMLElement).innerText || messageContainer.textContent;
            } else {
              const clone = el.cloneNode(true) as HTMLElement;
              clone.querySelectorAll('svg, path, symbol, use, img, video, canvas, picture, audio').forEach(n => n.remove());
              clone.querySelectorAll('header, h2, h3, h4, h5, h6').forEach(n => n.remove());
              clone.querySelectorAll('ul, ol, form, button, [role="button"], [role="toolbar"], [role="dialog"], [role="menu"]').forEach(n => n.remove());
              clone.querySelectorAll('[aria-label*="bình luận" i], [aria-label*="comment" i], [aria-label*="thích" i], [aria-label*="chia sẻ" i]').forEach(n => n.remove());
              clone.querySelectorAll('[style*="display: none"], [style*="display:none"], [style*="clip:"], .visuallyhidden').forEach(n => n.remove());

              contentText = clone.innerText || clone.textContent || '';
            }

            // Extract Real Post Media/Images
            const imageUrls: string[] = [];
            const imgCandidates = el.querySelectorAll('img');
            imgCandidates.forEach((img) => {
              const src = (img as HTMLImageElement).src || img.getAttribute('src') || '';
              if (!src || src.startsWith('data:') || src.includes('emoji.php') || src.includes('rsrc.php')) {
                return;
              }
              if (img.closest('header, h2, h3, h4, a[aria-label*="avatar" i], div[role="button"][aria-label*="avatar" i]')) {
                return;
              }
              const alt = (img.getAttribute('alt') || '').toLowerCase();
              if (alt.includes('avatar') || alt.includes('ảnh đại diện')) {
                return;
              }
              const w = (img as HTMLImageElement).naturalWidth || (img as HTMLElement).clientWidth || img.width || 0;
              const h = (img as HTMLImageElement).naturalHeight || (img as HTMLElement).clientHeight || img.height || 0;
              if ((w > 0 && w < 80) || (h > 0 && h < 80)) {
                return;
              }
              if (src.includes('scontent') || src.includes('fbcdn.net') || src.includes('facebook.com')) {
                if (!imageUrls.includes(src)) {
                  imageUrls.push(src);
                }
              }
            });

            if (contentText.trim().length > 10) {
              articles.push({
                rawHref,
                authorName: authorName.trim(),
                contentText: contentText.slice(0, 2000),
                timestampText,
                imageUrls,
              });
            }
          });

          return articles;
        });

        // Merge batch into accumulator
        currentBatch.forEach((item) => {
          const key = item.rawHref || `${item.authorName}:${item.contentText.slice(0, 60)}`;
          if (!accumulatedDOMMap.has(key)) {
            accumulatedDOMMap.set(key, item);
          }
        });

        await page.mouse.wheel(0, 1600);
        await page.waitForTimeout(1600);
      }

      const rawDOMPosts = Array.from(accumulatedDOMMap.values());

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
        // Clean Facebook UI artifacts, SVG icons, Meta image descriptions
        const cleanContent = cleanFacebookPostText(domItem.contentText);
        if (cleanContent.length < 10) {
          continue;
        }

        // Refine author name if still default
        let authorName = domItem.authorName;
        if (!authorName || authorName === 'Khách hàng Facebook') {
          const separated = domItem.contentText.replace(/([a-zà-ỹ]+)([a-z][A-Z]{2,}[a-zA-Z0-9]*)/, '$1 $2');
          const noHash = separated.replace(/[a-zA-Z0-9_-]{15,}/g, ' ');
          const sharedAuthorMatch = noHash.match(/Ảnh từ bài viết của\s+([A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+)*?)(?=\s*(?:Đã chia sẻ|Facebook|$))/);
          if (sharedAuthorMatch) {
            authorName = sharedAuthorMatch[1].trim();
          }
        }

        const postedAtIso = parseFacebookTimestamp(domItem.timestampText);
        const postTimestamp = new Date(postedAtIso).getTime();

        // Enforce lookback window
        if (postTimestamp < cutoffTime) {
          continue;
        }

        // Compute content fingerprint
        const contentHash = crypto
          .createHash('sha256')
          .update(`${authorName}:${cleanContent.slice(0, 200)}`.toLowerCase())
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
          author_name: authorName,
          content_raw: cleanContent,
          posted_at: postedAtIso,
          raw_timestamp_text: domItem.timestampText || undefined,
          image_urls: domItem.imageUrls || [],
          media_preview_url: domItem.imageUrls?.[0] || undefined,
        });
      }

      // Strictly sort extracted posts by posted_at descending (newest first)
      processedPosts.sort((a, b) => {
        const timeA = new Date(a.posted_at).getTime();
        const timeB = new Date(b.posted_at).getTime();
        return timeB - timeA;
      });

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
