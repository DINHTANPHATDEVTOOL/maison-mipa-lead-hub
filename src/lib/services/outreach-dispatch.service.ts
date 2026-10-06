import { postRepo } from '../repositories/post.repository';
import { outreachRepo } from '../repositories/outreach.repository';
import { leadRepo } from '../repositories/lead.repository';
import { commentDispatcher } from '@/worker/dispatcher';
import { OutreachInteraction, CRMLead } from '@/types';

export interface DispatchOutreachOptions {
  postId: string;
  commentContent: string;
  operatorName: string;
  pageIdentity?: string;
  targetPageId?: string;
  isManual?: boolean;
  manualProofUrl?: string;
  templateId?: string;
}

export interface DispatchOutreachResult {
  success: boolean;
  message?: string;
  error?: string;
  needsAuth?: boolean;
  interaction?: OutreachInteraction | null;
  lead?: CRMLead | null;
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
      isManual = false,
      manualProofUrl,
      templateId,
    } = options;

    // 1. Fetch post from PostgreSQL database
    const post = await postRepo.getById(postId);
    if (!post) {
      return {
        success: false,
        error: 'Không tìm thấy bài viết trên cơ sở dữ liệu hệ thống.',
      };
    }

    // 2. Concurrency-safe atomic first-touch claim (backed by unique_first_touch_outreach constraint)
    const claimResult = await outreachRepo.claimFirstTouch({
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

    // 3. CASE A: Manual CSKH Outreach
    if (isManual) {
      const confirmedInteraction = await outreachRepo.updateStatus(post.id, 'sent_confirmed', {
        comment_permalink: manualProofUrl,
        notes: `Tiếp cận thủ công xác nhận bởi ${operatorName}`,
      });

      // Update or create CRM Lead
      let lead = await leadRepo.getByPostId(post.id);
      if (!lead) {
        lead = await leadRepo.create({
          post_id: post.id,
          customer_name: post.author_name || 'Khách Hàng Facebook',
          customer_facebook_url: post.post_url,
          stage: 'uncontacted',
          assigned_cskh_name: operatorName,
          notes: `Đã gửi tiếp cận thủ công: "${commentContent.slice(0, 100)}..."`,
          post_summary: post.content_raw.slice(0, 150),
        });
      } else {
        const updated = await leadRepo.updateWithOcc(lead.id, lead.version || 1, {
          stage: 'uncontacted',
          notes: `${lead.notes || ''}\n[${new Date().toLocaleString('vi-VN')}]: Tiếp cận thủ công bởi ${operatorName}`,
        });
        if (updated.success && updated.lead) {
          lead = updated.lead;
        }
      }

      return {
        success: true,
        message: 'Đã ghi nhận tiếp cận thủ công và cập nhật vào Pipeline CSKH.',
        interaction: confirmedInteraction || claimResult.interaction,
        lead,
      };
    }

    // 4. CASE B: Automated Playwright Dispatch
    try {
      const dispatchRes = await commentDispatcher.dispatchComment({
        postId: post.id,
        postUrl: post.post_url,
        commentContent: commentContent,
        pageIdentity: pageIdentity,
        targetPageId: targetPageId,
      });

      if (!dispatchRes.success) {
        // Record failure in DB outreach interaction
        const status = dispatchRes.status === 'uncertain_failed' ? 'uncertain_failed' : 'failed';
        await outreachRepo.updateStatus(post.id, status, {
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
      const finalized = await outreachRepo.updateStatus(post.id, 'sent_confirmed', {
        comment_facebook_id: dispatchRes.commentId,
        comment_permalink: dispatchRes.commentPermalink,
        notes: `Tự động bình luận thành công dưới danh nghĩa Page "${pageIdentity}"`,
      });

      // Update or create CRM Lead
      let lead = await leadRepo.getByPostId(post.id);
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
    }
  }
}

export const outreachDispatchService = OutreachDispatchService.getInstance();
