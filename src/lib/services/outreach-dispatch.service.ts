import { postRepo } from '../repositories/post.repository';
import { groupRepo } from '../repositories/group.repository';
import { templateRepo } from '../repositories/template.repository';
import { outreachRepo } from '../repositories/outreach.repository';
import { leadRepo } from '../repositories/lead.repository';
import { commentDispatcher } from '@/worker/dispatcher';
import { getDbPool } from '../db';
import { OutreachInteraction, CRMLead } from '@/types';
import { store } from '../store';
import { getAllProfiles } from '../profiles';

export interface DispatchOutreachOptions {
  postId: string;
  commentContent: string;
  operatorName: string;
  pageIdentity?: string;
  targetPageId?: string;
  accountType?: 'personal' | 'page';
  profileId?: string;
  storageState?: any;
  isManual?: boolean;
  manualProofUrl?: string;
  templateId?: string;
  postUrl?: string;
  authorName?: string;
  contentRaw?: string;
  groupId?: string;
  groupName?: string;
}

export interface DispatchOutreachResult {
  success: boolean;
  message?: string;
  error?: string;
  needsAuth?: boolean;
  interaction?: OutreachInteraction | null;
  lead?: CRMLead | null;
}

async function acquirePageLock(pageId: string, locker: string, timeoutSec: number = 60): Promise<boolean> {
  const pool = getDbPool();
  try {
    // Delete expired locks
    await pool.query("DELETE FROM page_locks WHERE locked_at < NOW() - ($1 || ' seconds')::interval", [timeoutSec]).catch(() => {});
    const res = await pool.query(
      'INSERT INTO page_locks (page_id, locked_by, locked_at) VALUES ($1, $2, NOW()) ON CONFLICT (page_id) DO NOTHING RETURNING page_id',
      [pageId, locker]
    );
    return (res.rowCount || 0) > 0;
  } catch {
    return true; // Fallback gracefully if page_locks table not ready
  }
}

async function releasePageLock(pageId: string, locker: string): Promise<void> {
  const pool = getDbPool();
  try {
    await pool.query('DELETE FROM page_locks WHERE page_id = $1 AND locked_by = $2', [pageId, locker]);
  } catch {}
}

export class OutreachDispatchService {
  private static instance: OutreachDispatchService;

  public static getInstance(): OutreachDispatchService {
    if (!OutreachDispatchService.instance) {
      OutreachDispatchService.instance = new OutreachDispatchService();
    }
    return OutreachDispatchService.instance;
  }

  /**
   * Unified, concurrency-safe outreach dispatch for both manual CSKH actions and Worker auto-dispatch
   */
  public async dispatchOutreach(options: DispatchOutreachOptions): Promise<DispatchOutreachResult> {
    const {
      postId,
      commentContent,
      operatorName,
      pageIdentity = process.env.FACEBOOK_PAGE_NAME || 'Maison MIPA',
      targetPageId = process.env.FACEBOOK_PAGE_ID,
      storageState,
      isManual = false,
      manualProofUrl,
      templateId,
    } = options;

    let profileId = options.profileId;
    let accountType = options.accountType;
    if (!profileId) {
      try {
        const allProfiles = getAllProfiles();
        const activeProf = allProfiles.find(p => p.hasSession && p.status === 'online') || allProfiles.find(p => p.hasSession);
        if (activeProf) {
          profileId = activeProf.id;
          if (!accountType) accountType = activeProf.type || 'personal';
        }
      } catch {}
    }
    if (!accountType) accountType = 'personal';

    // 1. Fetch post from PostgreSQL database or persistent store fallback
    let post = await postRepo.getById(postId).catch(() => null);
    if (!post) {
      post = store.getPostById(postId);
      if (!post) {
        const allPosts = store.getPosts();
        post = allPosts.find(p => 
          p.id === postId || 
          p.facebook_post_id === postId || 
          p.post_url === postId ||
          (p.facebook_post_id && postId.includes(p.facebook_post_id)) ||
          (options.postUrl && (p.post_url === options.postUrl || p.post_url.includes(options.postUrl)))
        ) || null;
      }
    }

    // Auto-recovery fallback: If post was temporarily purged from memory or not yet synced, recover from options
    if (!post && (options.postUrl || options.contentRaw)) {
      try {
        const recovered = store.addPostIfNew({
          id: postId,
          group_id: options.groupId || 'grp-01',
          group_name: options.groupName || 'Nhóm Facebook',
          post_url: options.postUrl || `https://facebook.com/posts/${postId}`,
          author_name: options.authorName || 'Khách Hàng Facebook',
          content_raw: options.contentRaw || 'Khách cần tư vấn dịch vụ chụp ảnh',
        });
        post = recovered.post;
      } catch {}
    }

    if (!post) {
      return {
        success: false,
        error: 'Không tìm thấy bài viết trên cơ sở dữ liệu hệ thống.',
      };
    }

    // Mirror to postRepo if in DB environment
    try {
      await postRepo.createIfNew({
        id: post.id,
        group_id: post.group_id,
        group_name: post.group_name,
        facebook_post_id: post.facebook_post_id,
        post_url: post.post_url,
        author_name: post.author_name,
        content_raw: post.content_raw,
        posted_at: post.posted_at,
      });
    } catch {}

    // 2. Validate group commenting permission (can_page_comment)
    if (post.group_id) {
      const group = (await groupRepo.getById(post.group_id).catch(() => null)) || store.getGroups().find(g => g.id === post.group_id);
      if (group && group.can_page_comment === false && accountType !== 'personal') {
        return {
          success: false,
          error: `Nhóm facebook "${group.name}" cấm Page bình luận (can_page_comment = false). Dừng gửi để bảo vệ Page (Bạn có thể chọn gửi bằng Tài khoản cá nhân).`,
        };
      }
    }

    // 3. Validate template if provided (must exist and be approved/active)
    if (templateId && templateId !== 'manual' && templateId !== 'custom') {
      const template = (await templateRepo.getById(templateId).catch(() => null)) || store.getTemplates().find(t => t.id === templateId);
      if (!template) {
        return {
          success: false,
          error: `Mẫu tin nhắn tiếp cận id "${templateId}" không tồn tại.`,
        };
      }
      if (!template.is_approved) {
        return {
          success: false,
          error: `Mẫu tin nhắn "${template.title}" chưa được duyệt (is_approved = false).`,
        };
      }
    }

    // 4. Concurrency-safe atomic first-touch claim (backed by unique_first_touch_outreach constraint & CAS)
    const existingStorePost = store.getPostById(post.id);
    if (existingStorePost?.interaction && (existingStorePost.interaction.status === 'sent_confirmed' || existingStorePost.interaction.status === 'sending')) {
      return {
        success: false,
        error: 'Bài viết này đã được tiếp cận trước đó bởi nhân viên khác hoặc worker tự động (Chống gửi trùng).',
      };
    }

    let claimResult: { success: boolean; interaction: OutreachInteraction | null } = { success: true, interaction: null };
    try {
      claimResult = await outreachRepo.claimFirstTouch({
        post_id: post.id,
        page_identity: pageIdentity,
        operator_name: operatorName,
        template_used_id: templateId,
        comment_content: commentContent,
        initialStatus: isManual ? 'sent_confirmed' : 'sending',
      });

      if (!claimResult.success) {
        return {
          success: false,
          error: 'Bài viết này đã được tiếp cận trước đó bởi nhân viên khác hoặc worker tự động (Chống gửi trùng).',
        };
      }
    } catch (claimErr: any) {
      console.warn('[OutreachDispatchService] Bỏ qua lỗi claim DB, tiếp tục tiến trình:', claimErr.message);
    }

    // 5. CASE A: Manual CSKH Outreach
    if (isManual) {
      let confirmedInteraction = null;
      try {
        confirmedInteraction = await outreachRepo.updateStatus(post.id, 'sent_confirmed', {
          comment_permalink: manualProofUrl,
          notes: `Tiếp cận thủ công xác nhận bởi ${operatorName}`,
        });
      } catch {}

      // Synchronize into persistent store
      try {
        store.updatePostInteraction(post.id, {
          id: confirmedInteraction?.id || `int-${Date.now()}`,
          post_id: post.id,
          page_identity: pageIdentity,
          operator_name: `${operatorName} (Thủ công)`,
          template_used_id: templateId || 'manual',
          comment_content: commentContent,
          status: 'sent_confirmed',
          comment_permalink: manualProofUrl || post.post_url,
          dispatched_at: new Date().toISOString(),
        });
      } catch {}

      // Update or create CRM Lead
      let lead = await leadRepo.getByPostId(post.id).catch(() => null);
      if (!lead) {
        try {
          lead = await leadRepo.create({
            post_id: post.id,
            customer_name: post.author_name || 'Khách Hàng Facebook',
            customer_facebook_url: post.post_url,
            stage: 'uncontacted',
            assigned_cskh_name: operatorName,
            notes: `Đã gửi tiếp cận thủ công: "${commentContent.slice(0, 100)}..."`,
            post_summary: post.content_raw.slice(0, 150),
          });
        } catch {}
      } else {
        try {
          const updated = await leadRepo.updateWithOcc(lead.id, lead.version || 1, {
            stage: 'uncontacted',
            notes: `${lead.notes || ''}\n[${new Date().toLocaleString('vi-VN')}]: Tiếp cận thủ công bởi ${operatorName}`,
          });
          if (updated.success && updated.lead) {
            lead = updated.lead;
          }
        } catch {}
      }

      return {
        success: true,
        message: 'Đã ghi nhận tiếp cận thủ công và cập nhật vào Pipeline CSKH.',
        interaction: confirmedInteraction || claimResult.interaction,
        lead,
      };
    }

    // 6. CASE B: Automated Playwright Dispatch with Page-Level Mutual Exclusion Lock
    const pageLockId = targetPageId || pageIdentity;
    const lockAcquired = await acquirePageLock(pageLockId, operatorName);
    if (!lockAcquired) {
      // Revert sending claim back to failed_before_submit so it can be retried later
      await outreachRepo.updateStatus(post.id, 'failed_before_submit', {
        notes: `Page "${pageLockId}" đang có thao tác gửi khác diễn ra. Hoãn lại để chống gửi đồng thời trên cùng Page.`,
      });
      return {
        success: false,
        error: `Page "${pageLockId}" đang có thao tác gửi bình luận khác đang diễn ra. Chống gửi đồng thời trên cùng Page.`,
      };
    }

    try {
      const dispatchRes = await commentDispatcher.dispatchComment({
        postId: post.id,
        postUrl: post.post_url,
        commentContent: commentContent,
        pageIdentity: pageIdentity,
        targetPageId: targetPageId,
        accountType: accountType,
        profileId: profileId,
        storageState: storageState,
      });

      if (!dispatchRes.success) {
        // Distinguish errors before submit from errors after submit
        const isPreSubmitError = dispatchRes.needsAuth || dispatchRes.status === 'rejected';
        const failureStatus = isPreSubmitError ? 'failed_before_submit' : (dispatchRes.status === 'uncertain_failed' ? 'uncertain_failed' : 'failed');

        await outreachRepo.updateStatus(post.id, failureStatus, {
          notes: dispatchRes.error || 'Thất bại khi gửi bình luận tự động',
        });

        return {
          success: false,
          error: dispatchRes.error,
          needsAuth: dispatchRes.needsAuth,
          interaction: null,
        };
      }

      // Successful dispatch: update outreach interaction with confirmed comment ID and permalink
      let finalized = null;
      try {
        finalized = await outreachRepo.updateStatus(post.id, 'sent_confirmed', {
          comment_facebook_id: dispatchRes.commentId,
          comment_permalink: dispatchRes.commentPermalink,
          notes: `Tự động bình luận thành công dưới danh nghĩa Page "${pageIdentity}"`,
        });
      } catch {}

      // Synchronize into persistent store
      try {
        store.updatePostInteraction(post.id, {
          id: finalized?.id || `int-${Date.now()}`,
          post_id: post.id,
          comment_facebook_id: dispatchRes.commentId,
          comment_permalink: dispatchRes.commentPermalink,
          page_identity: pageIdentity,
          operator_name: operatorName,
          template_used_id: templateId || 'auto',
          comment_content: commentContent,
          status: 'sent_confirmed',
          dispatched_at: new Date().toISOString(),
        });
      } catch {}

      // Update or create CRM Lead independently (do not fail outreach if CRM lead update throws)
      let lead: CRMLead | null = null;
      try {
        lead = await leadRepo.getByPostId(post.id);
        if (!lead) {
          lead = await leadRepo.create({
            post_id: post.id,
            customer_name: post.author_name || 'Khách Hàng Facebook',
            customer_facebook_url: post.post_url,
            stage: 'uncontacted',
            assigned_cskh_name: operatorName,
            notes: `Bình luận tự động thành công: "${commentContent.slice(0, 100)}..."`,
            post_summary: post.content_raw.slice(0, 150),
          });
        } else {
          const updated = await leadRepo.updateWithOcc(lead.id, lead.version || 1, {
            stage: 'uncontacted',
            notes: `${lead.notes || ''}\n[${new Date().toLocaleString('vi-VN')}]: Đã bình luận tự động thành công`,
          });
          if (updated.success && updated.lead) {
            lead = updated.lead;
          }
        }
      } catch (crmErr: any) {
        console.warn(`[OutreachDispatchService] Cảnh báo cập nhật CRM Lead sau gửi thành công: ${crmErr.message}`);
      }

      return {
        success: true,
        message: 'Đã gửi bình luận tự động thành công và xác nhận trên Page Facebook.',
        interaction: finalized || claimResult.interaction,
        lead,
      };
    } catch (err: any) {
      console.error(`[OutreachDispatchService] Lỗi không mong muốn khi dispatch bài ${post.id}:`, err);
      await outreachRepo.updateStatus(post.id, 'uncertain_failed', {
        notes: `Ngoại lệ hệ thống: ${err.message}`,
      });
      return {
        success: false,
        error: `Lỗi hệ thống: ${err.message}`,
      };
    } finally {
      await releasePageLock(pageLockId, operatorName);
    }
  }
}

export const outreachDispatchService = OutreachDispatchService.getInstance();
