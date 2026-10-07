import { groupRepo } from '@/lib/repositories/group.repository';
import { postRepo } from '@/lib/repositories/post.repository';
import { serviceRepo } from '@/lib/repositories/service.repository';
import { templateRepo } from '@/lib/repositories/template.repository';
import { store } from '@/lib/store';
import { groupCrawler } from '@/worker/crawler';
import { classifyPostContent } from '@/lib/classifier';
import { outreachDispatchService } from './outreach-dispatch.service';
import { updateProfile } from '@/lib/profiles';
import { FacebookPost } from '@/types';

export interface ScanGroupOptions {
  groupId: string;
  lookbackHours?: number;
  profileId?: string;
  autoDispatch?: boolean;
}

export interface ScanGroupResult {
  success: boolean;
  groupId: string;
  groupName: string;
  postsFound: number;
  newPostsCount: number;
  posts: FacebookPost[];
  error?: string;
  needsAuth?: boolean;
}

export class GroupCrawlService {
  private static instance: GroupCrawlService;

  public static getInstance(): GroupCrawlService {
    if (!GroupCrawlService.instance) {
      GroupCrawlService.instance = new GroupCrawlService();
    }
    return GroupCrawlService.instance;
  }

  /**
   * Quét bài viết thực tế từ 1 nhóm Facebook mục tiêu
   */
  public async scanGroup(options: ScanGroupOptions): Promise<ScanGroupResult> {
    const { groupId, lookbackHours = 24, profileId, autoDispatch = false } = options;

    // 1. Tìm thông tin nhóm
    let group = await groupRepo.getById(groupId).catch(() => null);
    if (!group) {
      group = store.getGroups().find(g => g.id === groupId) || null;
    }

    if (!group) {
      return {
        success: false,
        groupId,
        groupName: 'Không xác định',
        postsFound: 0,
        newPostsCount: 0,
        posts: [],
        error: `Không tìm thấy nhóm với ID "${groupId}".`,
      };
    }

    // Cập nhật trạng thái profile nếu có
    if (profileId) {
      try {
        updateProfile(profileId, {
          status: 'busy',
          lastAction: `Đang quét nhóm "${group.name}" lúc ${new Date().toLocaleTimeString('vi-VN')}...`,
        });
      } catch {}
    }

    console.log(`[GroupCrawlService] Bắt đầu quét nhóm "${group.name}" (${group.url}) - Lookback: ${lookbackHours}h...`);

    // 2. Chạy Playwright Crawler
    const crawlResult = await groupCrawler.crawlGroup(group.url, lookbackHours, profileId);

    // Cập nhật lại trạng thái profile
    if (profileId) {
      try {
        updateProfile(profileId, {
          status: 'online',
          lastAction: crawlResult.success 
            ? `Hoàn tất quét nhóm "${group.name}". Tìm thấy ${crawlResult.posts.length} bài.`
            : `Lỗi quét nhóm: ${crawlResult.error?.slice(0, 40)}`,
        });
      } catch {}
    }

    if (!crawlResult.success) {
      // Cập nhật lỗi vào nhóm
      try {
        await groupRepo.updateStatus(group.id, crawlResult.needsAuth ? 'needs_auth' : 'error', crawlResult.error);
      } catch {
        store.updateGroup(group.id, { 
          status: crawlResult.needsAuth ? 'needs_auth' : 'error',
          last_error_message: crawlResult.error,
        });
      }

      return {
        success: false,
        groupId: group.id,
        groupName: group.name,
        postsFound: 0,
        newPostsCount: 0,
        posts: [],
        error: crawlResult.error,
        needsAuth: crawlResult.needsAuth,
      };
    }

    // 3. Tải services & templates để phân loại ý định
    let services = await serviceRepo.getAll().catch(() => []);
    if (!services || services.length === 0) services = store.getServices();

    let templates = await templateRepo.getAll().catch(() => []);
    if (!templates || templates.length === 0) templates = store.getTemplates();

    const savedPosts: FacebookPost[] = [];
    let newPostsCount = 0;

    // 4. Lưu từng bài viết & phân loại
    for (const rawPost of crawlResult.posts) {
      let createdPost: FacebookPost | null = null;
      let isNew = false;

      try {
        const res = await postRepo.createIfNew({
          group_id: group.id,
          group_name: group.name,
          facebook_post_id: rawPost.facebook_post_id,
          post_url: rawPost.post_url,
          author_name: rawPost.author_name,
          content_raw: rawPost.content_raw,
          posted_at: rawPost.posted_at,
          image_urls: rawPost.image_urls,
          media_preview_url: rawPost.media_preview_url,
        });
        createdPost = res.post;
        isNew = res.isNew;
      } catch {
        // Fallback store
        const res = store.addPostIfNew({
          group_id: group.id,
          group_name: group.name,
          facebook_post_id: rawPost.facebook_post_id,
          post_url: rawPost.post_url,
          author_name: rawPost.author_name,
          content_raw: rawPost.content_raw,
          posted_at: rawPost.posted_at,
          image_urls: rawPost.image_urls,
          media_preview_url: rawPost.media_preview_url,
        });
        createdPost = res.post;
        isNew = res.isNew;
      }

      if (createdPost) {
        try {
          store.addPostIfNew({
            id: createdPost.id,
            group_id: createdPost.group_id || group.id,
            group_name: createdPost.group_name || group.name,
            facebook_post_id: createdPost.facebook_post_id,
            post_url: createdPost.post_url,
            author_name: createdPost.author_name,
            content_raw: createdPost.content_raw,
            posted_at: createdPost.posted_at,
            image_urls: createdPost.image_urls || rawPost.image_urls,
            media_preview_url: createdPost.media_preview_url || rawPost.media_preview_url,
          });
        } catch {}

        if (isNew) newPostsCount++;
        savedPosts.push(createdPost);

        // 5. Tự động gửi bình luận ngay khi phát hiện bài có nhu cầu (không cần đợi duyệt)
        if (autoDispatch && isNew && createdPost.classification) {
          const cls = createdPost.classification;
          if (
            cls.intent === 'looking_for_service' &&
            cls.suggested_comment_text
          ) {
            console.log(`[GroupCrawlService Auto-Dispatch] Tự động gửi bình luận ngay cho bài: ${createdPost.post_url}`);
            try {
              const res = await outreachDispatchService.dispatchOutreach({
                postId: createdPost.id,
                commentContent: cls.suggested_comment_text,
                operatorName: 'Tự Động Quét Nhóm',
                pageIdentity: process.env.FACEBOOK_PAGE_NAME || 'Maison MIPA',
                targetPageId: process.env.FACEBOOK_PAGE_ID,
                templateId: cls.suggested_template_id || undefined,
                profileId,
              });
              if (res.success) {
                console.log(`[GroupCrawlService Auto-Dispatch] Gửi thành công cho bài ${createdPost.id}!`);
              }
            } catch (dispatchErr: any) {
              console.error('[GroupCrawlService Auto-Dispatch Error]', dispatchErr.message);
            }
          }
        }
      }
    }

    // 6. Cập nhật thời gian quét của nhóm
    const nowIso = new Date().toISOString();
    const nextCheckIso = new Date(Date.now() + (group.check_interval_seconds || 150) * 1000).toISOString();
    const totalFound = (group.total_posts_found || 0) + newPostsCount;

    try {
      await groupRepo.updateCheckTimestamps(group.id, nowIso, nextCheckIso, totalFound);
    } catch {
      store.updateGroup(group.id, {
        last_checked_at: nowIso,
        next_check_at: nextCheckIso,
        total_posts_found: totalFound,
        status: 'active',
        last_error_message: null,
      });
    }

    return {
      success: true,
      groupId: group.id,
      groupName: group.name,
      postsFound: crawlResult.posts.length,
      newPostsCount,
      posts: savedPosts,
    };
  }

  /**
   * Quét nhiều nhóm đã chọn (hoặc tất cả các nhóm)
   */
  public async scanMultipleGroups(params: {
    groupIds: string[];
    lookbackHours?: number;
    profileId?: string;
    autoDispatch?: boolean;
  }): Promise<{
    success: boolean;
    scannedCount: number;
    totalPostsFound: number;
    totalNewPosts: number;
    results: ScanGroupResult[];
  }> {
    const { groupIds, lookbackHours = 24, profileId, autoDispatch = false } = params;
    const results: ScanGroupResult[] = [];
    let totalPostsFound = 0;
    let totalNewPosts = 0;

    for (const gId of groupIds) {
      try {
        const res = await this.scanGroup({
          groupId: gId,
          lookbackHours,
          profileId,
          autoDispatch,
        });
        results.push(res);
        if (res.success) {
          totalPostsFound += res.postsFound;
          totalNewPosts += res.newPostsCount;
        }
      } catch (err: any) {
        results.push({
          success: false,
          groupId: gId,
          groupName: 'Lỗi',
          postsFound: 0,
          newPostsCount: 0,
          posts: [],
          error: err.message,
        });
      }
    }

    return {
      success: results.some(r => r.success),
      scannedCount: results.length,
      totalPostsFound,
      totalNewPosts,
      results,
    };
  }
}

export const groupCrawlService = GroupCrawlService.getInstance();
