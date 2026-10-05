import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { 
  FacebookGroup, 
  ServiceItem, 
  OutreachTemplate, 
  FacebookPost, 
  LeadClassification, 
  OutreachInteraction, 
  CRMLead, 
  WorkerHeartbeat,
  CRMStage
} from '@/types';
import { authManager } from '@/worker/auth';
import { commentDispatcher } from '@/worker/dispatcher';
import { canonicalizeFacebookUrl } from '@/worker/crawler';
import { classifyPostContent } from '@/lib/classifier';

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'mipa_shared_store.json');
const STORE_TEMP_FILE = path.join(DATA_DIR, 'mipa_shared_store.tmp');
const LOCK_DIR = path.join(DATA_DIR, 'store.lock');

function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url.trim().toLowerCase()).digest('hex');
}

interface StoreData {
  groups: FacebookGroup[];
  services: ServiceItem[];
  templates: OutreachTemplate[];
  posts: FacebookPost[];
  leads: CRMLead[];
  heartbeat: WorkerHeartbeat;
}

class LeadHubSharedStore {
  private static instance: LeadHubSharedStore;

  private constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    this.ensureInitialized();
  }

  public static getInstance(): LeadHubSharedStore {
    const g = globalThis as any;
    if (!g.__mipaSharedStoreInstance) {
      g.__mipaSharedStoreInstance = new LeadHubSharedStore();
    }
    return g.__mipaSharedStoreInstance;
  }

  // --- Concurrency Control (Inter-process POSIX File Lock) ---
  private withFileLock<T>(fn: () => T, timeoutMs: number = 8000): T {
    const start = Date.now();
    let acquired = false;

    while (!acquired) {
      try {
        fs.mkdirSync(LOCK_DIR);
        acquired = true;
      } catch (err: any) {
        if (err.code === 'EEXIST') {
          // Check for stale lock (older than 10 seconds)
          try {
            const stats = fs.statSync(LOCK_DIR);
            if (Date.now() - stats.mtimeMs > 10000) {
              fs.rmdirSync(LOCK_DIR);
              continue;
            }
          } catch {
            // lock may have been released between stat and rmdir
          }

          if (Date.now() - start > timeoutMs) {
            console.warn(`[SharedStore] Timeout chờ khóa tệp dữ liệu (${timeoutMs}ms). Cưỡng chế mở khóa cũ.`);
            try {
              fs.rmdirSync(LOCK_DIR);
            } catch {}
          } else {
            // Delay 15ms
            const delayMs = 15;
            try {
              Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
            } catch {
              const waitEnd = Date.now() + delayMs;
              while (Date.now() < waitEnd) {}
            }
          }
        } else {
          throw err;
        }
      }
    }

    try {
      return fn();
    } finally {
      try {
        if (fs.existsSync(LOCK_DIR)) {
          fs.rmdirSync(LOCK_DIR);
        }
      } catch {
        // ignore lock release error
      }
    }
  }

  // --- Persistence Layer (Atomic File Sync) ---
  private readData(): StoreData {
    try {
      if (fs.existsSync(STORE_FILE)) {
        const raw = fs.readFileSync(STORE_FILE, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('[SharedStore] Lỗi đọc file data:', err);
    }
    return this.getInitialSeed();
  }

  private writeData(data: StoreData): void {
    try {
      const json = JSON.stringify(data, null, 2);
      fs.writeFileSync(STORE_TEMP_FILE, json, 'utf-8');
      fs.renameSync(STORE_TEMP_FILE, STORE_FILE); // Atomic POSIX rename
    } catch (err) {
      console.error('[SharedStore] Lỗi ghi file data:', err);
    }
  }

  private ensureInitialized(): void {
    if (!fs.existsSync(STORE_FILE)) {
      this.writeData(this.getInitialSeed());
    }
  }

  private getInitialSeed(): StoreData {
    return {
      services: [
        {
          id: 'srv-01',
          code: 'AO_DAI',
          name: 'Chụp Ảnh Áo Dài Nghệ Thuật & Truyền Thống',
          base_price: 1200000,
          price_note: 'Gói 1-2 người, kèm phụ kiện, chỉnh sửa 15 ảnh chuyên sâu',
          service_area: 'TP. Hồ Chí Minh (Q.1, Q.3, Bình Thạnh, Thủ Đức)',
          includes_posing_support: true,
          is_active: true,
        },
        {
          id: 'srv-02',
          code: 'NANG_THO',
          name: 'Concept Nàng Thơ & Vintage Studio',
          base_price: 1500000,
          price_note: 'Gói cá nhân, bao gồm makeup nhẹ và layout hoa tươi',
          service_area: 'Studio Maison MIPA (Quận 1, TP.HCM)',
          includes_posing_support: true,
          is_active: true,
        },
        {
          id: 'srv-03',
          code: 'KY_YEU',
          name: 'Kỷ Yếu Nhóm & Tốt Nghiệp',
          base_price: 2500000,
          price_note: 'Gói nhóm từ 5-10 bạn, chụp ngoại cảnh + lớp học',
          service_area: 'TP. Hồ Chí Minh & Bình Dương',
          includes_posing_support: true,
          is_active: true,
        },
        {
          id: 'srv-04',
          code: 'GIA_DINH',
          name: 'Ảnh Gia Đình & Em Bé Đầy Tháng',
          base_price: 2200000,
          price_note: 'Gói gia đình 3-5 thành viên, phòng chụp máy lạnh riêng biệt',
          service_area: 'Studio Maison MIPA (Quận 1, TP.HCM)',
          includes_posing_support: true,
          is_active: true,
        }
      ],
      templates: [
        {
          id: 'tpl-01',
          service_id: 'srv-01',
          title: 'Mẫu Tiếp Cận Áo Dài (Nhẹ Nhàng, Nêu Giá & Tạo Dáng)',
          template_content: 'Chào bạn nha, Maison MIPA chuyên các bộ ảnh Áo dài tại {khu_vuc} ({gia}). Bên mình có stylist hướng dẫn tạo dáng chi tiết từng góc chụp cho bạn hoàn toàn yên tâm nhé! Bạn nhắn Page để tiệm gửi album ảnh mẫu tham khảo nha.',
          allowed_placeholders: ['{gia}', '{khu_vuc}', '{ho_tro_tao_dang}'],
          is_approved: true,
          version: 1,
          updated_by_name: 'Trần Minh Thư (Marketing Lead)',
          updated_at: new Date().toISOString(),
        },
        {
          id: 'tpl-02',
          service_id: 'srv-02',
          title: 'Mẫu Concept Nàng Thơ Studio (Tone Hàn/Vintage)',
          template_content: 'Dạ chào bạn, concept nàng thơ tại Maison MIPA ({khu_vuc}) đang có gói trọn gói {gia} đã gồm makeup nhẹ nhàng và hoa tươi theo tone. Bạn ghé Page xem một số bộ ảnh tiệm vừa thực hiện nhé!',
          allowed_placeholders: ['{gia}', '{khu_vuc}'],
          is_approved: true,
          version: 1,
          updated_by_name: 'Trần Minh Thư (Marketing Lead)',
          updated_at: new Date().toISOString(),
        },
        {
          id: 'tpl-03',
          service_id: 'srv-03',
          title: 'Mẫu Kỷ Yếu & Tốt Nghiệp Nhóm',
          template_content: 'Chào các bạn, Maison MIPA có gói chụp kỷ yếu nhóm tại {khu_vuc} giá chỉ từ {gia}. Studio hỗ trợ lên concept và hướng dẫn tạo dáng cho cả nhóm cực tự nhiên. Bạn nhắn Page để team tư vấn lịch chụp nhé!',
          allowed_placeholders: ['{gia}', '{khu_vuc}'],
          is_approved: true,
          version: 1,
          updated_by_name: 'Trần Minh Thư (Marketing Lead)',
          updated_at: new Date().toISOString(),
        }
      ],
      groups: [
        {
          id: 'grp-01',
          name: 'Hội Chụp Ảnh Áo Dài Sài Gòn & TP.HCM',
          url: 'https://facebook.com/groups/hoidammechupaodaivn',
          check_interval_seconds: 120,
          lookback_hours: 24,
          status: 'active',
          last_checked_at: new Date(Date.now() - 45000).toISOString(),
          next_check_at: new Date(Date.now() + 75000).toISOString(),
          total_posts_found: 42,
          last_error_message: null,
          can_page_comment: true,
          created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
        },
        {
          id: 'grp-02',
          name: 'Góc Tìm Thợ Chụp Ảnh Sài Gòn (Studio & Ngoại Cảnh)',
          url: 'https://facebook.com/groups/timthochupanhtphcm',
          check_interval_seconds: 150,
          lookback_hours: 24,
          status: 'active',
          last_checked_at: new Date(Date.now() - 70000).toISOString(),
          next_check_at: new Date(Date.now() + 80000).toISOString(),
          total_posts_found: 89,
          last_error_message: null,
          can_page_comment: true,
          created_at: new Date(Date.now() - 86400000 * 15).toISOString(),
        }
      ],
      posts: [
        {
          id: 'post-01',
          group_id: 'grp-01',
          group_name: 'Hội Chụp Ảnh Áo Dài Sài Gòn & TP.HCM',
          facebook_post_id: '108923489234',
          post_url: 'https://facebook.com/groups/hoidammechupaodaivn/posts/108923489234',
          post_url_hash: hashUrl('https://facebook.com/groups/hoidammechupaodaivn/posts/108923489234'),
          author_name: 'Lê Thảo My',
          content_raw: 'Cần tìm thợ chụp áo dài ở quận 1, chủ nhật này, hai người. Muốn có người hỗ trợ tạo dáng vì tụi mình ít chụp ảnh nên hay ngại.',
          posted_at: new Date(Date.now() - 3600000 * 2).toISOString(),
          detected_at: new Date(Date.now() - 3600000 * 1.8).toISOString(),
          classification: {
            id: 'cls-01',
            post_id: 'post-01',
            intent: 'looking_for_service',
            service_detected: 'Chụp Ảnh Áo Dài Nghệ Thuật & Truyền Thống',
            location: 'QUẬN 1, TP. Hồ Chí Minh',
            pax: 2,
            shooting_date_text: 'Chủ nhật tuần này',
            shooting_date_suggested: '2026-10-11',
            budget_raw: null,
            extra_requirements: ['Hỗ trợ hướng dẫn tạo dáng tận tình cho khách ít chụp', 'Có chuẩn bị hoặc tư vấn trang phục'],
            confidence_score: 94,
            classification_reason: 'Xác định nhu cầu khách hàng: Chụp Ảnh Áo Dài Nghệ Thuật & Truyền Thống. Địa điểm: QUẬN 1, TP. Hồ Chí Minh, Thời gian: Chủ nhật tuần này.',
            suggested_template_id: 'tpl-01',
            suggested_comment_text: 'Chào bạn nha, Maison MIPA chuyên các bộ ảnh Áo dài tại QUẬN 1, TP. Hồ Chí Minh (1.200.000 ₫). Bên mình có stylist hướng dẫn tạo dáng chi tiết từng góc chụp cho bạn hoàn toàn yên tâm nhé! Bạn nhắn Page để tiệm gửi album ảnh mẫu tham khảo nha.',
            review_status: 'pending_review',
          }
        }
      ],
      leads: [],
      heartbeat: {
        worker_id: 'worker-ubuntu-central-01',
        worker_name: 'Maison MIPA Central Worker',
        is_alive: false, // Calculated dynamically from worker ping
        facebook_auth_valid: authManager.hasStoredSession(),
        page_permission_valid: true,
        active_jobs_count: 0,
        last_ping: null, // Strictly null until actual worker process pings
        operating_mode: 'manual_review',
      }
    };
  }

  // --- Groups API ---
  public getGroups(): FacebookGroup[] {
    return this.readData().groups;
  }

  public addGroup(data: Omit<FacebookGroup, 'id' | 'last_checked_at' | 'next_check_at' | 'total_posts_found' | 'last_error_message' | 'created_at'>): FacebookGroup {
    return this.withFileLock(() => {
      const storeData = this.readData();
      const newGroup: FacebookGroup = {
        ...data,
        id: `grp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        last_checked_at: null,
        next_check_at: new Date(Date.now() + data.check_interval_seconds * 1000).toISOString(),
        total_posts_found: 0,
        last_error_message: null,
        created_at: new Date().toISOString(),
      };
      storeData.groups.unshift(newGroup);
      this.writeData(storeData);
      return newGroup;
    });
  }

  public updateGroup(id: string, updates: Partial<FacebookGroup>): FacebookGroup | null {
    return this.withFileLock(() => {
      const storeData = this.readData();
      const idx = storeData.groups.findIndex(g => g.id === id);
      if (idx === -1) return null;
      storeData.groups[idx] = { ...storeData.groups[idx], ...updates };
      this.writeData(storeData);
      return storeData.groups[idx];
    });
  }

  // --- Posts & Anti-Duplication API ---
  public getPosts(): FacebookPost[] {
    return this.readData().posts;
  }

  public getPostById(id: string): FacebookPost | null {
    return this.readData().posts.find(p => p.id === id) || null;
  }

  public addPostIfNew(postData: {
    group_id: string;
    group_name: string;
    facebook_post_id?: string;
    post_url: string;
    author_name: string;
    content_raw: string;
    posted_at?: string;
  }): { post: FacebookPost; isNew: boolean } {
    return this.withFileLock(() => {
      const storeData = this.readData();
      
      // Canonicalize URL
      const canonical = canonicalizeFacebookUrl(postData.post_url);
      const postUrlHash = canonical.postHash;
      const finalPostId = postData.facebook_post_id || canonical.postId;

      // Compute content fingerprint
      const contentFingerprint = crypto
        .createHash('sha256')
        .update(`${postData.author_name}:${postData.content_raw.slice(0, 200)}`.toLowerCase())
        .digest('hex');

      // Deduplication Check
      // 1. Same Post ID -> definite duplicate
      // 2. Same post URL hash with valid post ID -> definite duplicate
      // 3. Fallback when post ID is absent: match author + content in same group
      const existing = storeData.posts.find(p => {
        if (finalPostId && p.facebook_post_id && p.facebook_post_id === finalPostId) {
          return true;
        }
        if (canonical.postId && p.post_url_hash === postUrlHash) {
          return true;
        }
        if (!finalPostId && !p.facebook_post_id && p.group_id === postData.group_id) {
          const pFingerprint = crypto
            .createHash('sha256')
            .update(`${p.author_name}:${p.content_raw.slice(0, 200)}`.toLowerCase())
            .digest('hex');
          return pFingerprint === contentFingerprint;
        }
        return false;
      });

      if (existing) {
        // If content changed, update and re-run classification
        if (existing.content_raw !== postData.content_raw) {
          existing.content_raw = postData.content_raw;
          const reclass = classifyPostContent(postData.content_raw, storeData.services, storeData.templates, existing.posted_at);
          existing.classification = {
            id: existing.classification?.id || `cls-${Date.now()}`,
            post_id: existing.id,
            intent: reclass.intent,
            service_detected: reclass.service_detected,
            location: reclass.location,
            pax: reclass.pax,
            shooting_date_text: reclass.shooting_date_text,
            shooting_date_suggested: reclass.shooting_date_suggested,
            budget_raw: reclass.budget_raw,
            extra_requirements: reclass.extra_requirements,
            confidence_score: reclass.confidence_score,
            classification_reason: reclass.classification_reason,
            suggested_template_id: reclass.suggested_template_id,
            suggested_comment_text: reclass.suggested_comment_text,
            review_status: reclass.intent === 'looking_for_service' ? 'pending_review' : 'dismissed',
          };
          this.writeData(storeData);
        }
        return { post: existing, isNew: false };
      }

      // Check if there is a similar content from the same author with different post ID (suspected cross-post / duplicate)
      const isSuspectedDuplicate = storeData.posts.some(p => {
        const pFingerprint = crypto
          .createHash('sha256')
          .update(`${p.author_name}:${p.content_raw.slice(0, 200)}`.toLowerCase())
          .digest('hex');
        return pFingerprint === contentFingerprint && p.facebook_post_id !== finalPostId;
      });

      const newPost: FacebookPost = {
        id: `post-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        group_id: postData.group_id,
        group_name: postData.group_name,
        facebook_post_id: finalPostId,
        post_url: canonical.canonicalUrl,
        post_url_hash: postUrlHash,
        author_name: postData.author_name || 'Khách hàng Facebook',
        content_raw: postData.content_raw,
        posted_at: postData.posted_at || new Date().toISOString(),
        detected_at: new Date().toISOString(),
      };

      const grp = storeData.groups.find(g => g.id === postData.group_id);
      if (grp) grp.total_posts_found += 1;

      storeData.posts.unshift(newPost);
      this.writeData(storeData);
      return { post: newPost, isNew: true };
    });
  }

  public updatePostClassification(postId: string, classification: LeadClassification): boolean {
    return this.withFileLock(() => {
      const storeData = this.readData();
      const post = storeData.posts.find(p => p.id === postId);
      if (!post) return false;
      post.classification = classification;
      this.writeData(storeData);
      return true;
    });
  }

  public updatePostInteraction(postId: string, interaction: OutreachInteraction): boolean {
    return this.withFileLock(() => {
      const storeData = this.readData();
      const post = storeData.posts.find(p => p.id === postId);
      if (!post) return false;
      post.interaction = interaction;
      this.writeData(storeData);
      return true;
    });
  }

  // --- REAL OUTREACH DISPATCHER (STRICT ANTI-DUPLICATION & VERIFICATION) ---
  public async dispatchComment(
    postId: string, 
    commentContent: string, 
    operatorName: string = 'Marketing',
    isManualAssisted: boolean = false,
    manualProofUrl?: string
  ): Promise<{
    success: boolean;
    interaction?: OutreachInteraction;
    lead?: CRMLead;
    error?: string;
    needsAuth?: boolean;
  }> {
    // Phase 1: Lock and validate precondition
    const preCheck = this.withFileLock(() => {
      const storeData = this.readData();
      const post = storeData.posts.find(p => p.id === postId);
      if (!post) {
        return { success: false, error: 'Không tìm thấy bài viết trên hệ thống.' };
      }

      // STRICT IDEMPOTENCY: BLOCK sent_confirmed AND manual_assisted
      if (post.interaction) {
        if (post.interaction.status === 'sent_confirmed' || post.interaction.status === 'manual_assisted') {
          const method = post.interaction.status === 'manual_assisted' ? 'Tiếp cận thủ công' : 'Đã gửi qua Page';
          return { 
            success: false, 
            error: `Bài viết này đã được tiếp cận trước đó (${method}). Khóa an toàn chống gửi trùng lặp!` 
          };
        }
        if (post.interaction.status === 'sending') {
          return { 
            success: false, 
            error: 'Bình luận đang trong tiến trình xử lý tại trình duyệt. Vui lòng chờ kết quả.' 
          };
        }
        if (post.interaction.status === 'uncertain_failed' && !isManualAssisted) {
          return { 
            success: false, 
            error: 'Bài viết đang ở trạng thái [Chưa xác định kết quả]. Chặn tự động gửi lại để chống lặp! Vui lòng kiểm tra thực tế trên Facebook hoặc dùng chế độ duyệt thủ công.' 
          };
        }
      }

      // Check Page commenting permissions
      const group = storeData.groups.find(g => g.id === post.group_id);
      if (group && !group.can_page_comment && !isManualAssisted) {
        return { 
          success: false, 
          error: 'Page hiện chưa có quyền bình luận trong nhóm này. Vui lòng cấp quyền hoặc dùng chế độ hỗ trợ thủ công.' 
        };
      }

      // CASE A: Manual Assisted Mode - immediately finalize
      if (isManualAssisted) {
        const interaction: OutreachInteraction = {
          id: `int-${Date.now()}`,
          post_id: postId,
          page_identity: 'Maison MIPA Photography',
          operator_name: `${operatorName} (Thủ công)`,
          template_used_id: post.classification?.suggested_template_id || 'manual',
          comment_content: commentContent,
          status: 'manual_assisted',
          comment_permalink: manualProofUrl || post.post_url,
          dispatched_at: new Date().toISOString(),
        };

        post.interaction = interaction;
        if (post.classification) {
          post.classification.review_status = 'approved';
        }

        // Create CRM lead
        let lead = storeData.leads.find(l => l.post_id === postId);
        if (!lead) {
          lead = {
            id: `lead-${Date.now()}`,
            post_id: postId,
            customer_name: post.author_name,
            customer_facebook_url: post.post_url,
            service_interest: post.classification?.service_detected || 'Chưa xác định',
            stage: 'uncontacted',
            assigned_cskh_name: 'Ngọc Lan (CSKH)',
            booking_date: null,
            quoted_amount: null,
            notes: `Bình luận thủ công. Yêu cầu: ${post.classification?.extra_requirements.join(', ') || 'N/A'}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            post_summary: post.content_raw.slice(0, 120),
          };
          storeData.leads.unshift(lead);
        }

        this.writeData(storeData);
        return { success: true, isManualDone: true, interaction, lead };
      }

      // CASE B: Playwright Automated Mode - set 'sending' lock
      const sessionSummary = authManager.getSessionSummary();
      if (!sessionSummary.exists || !sessionSummary.valid) {
        return {
          success: false,
          needsAuth: true,
          error: 'Chưa có phiên đăng nhập Facebook hợp lệ (storageState.json). Hệ thống từ chối báo thành công giả khi chưa có quyền truy cập thực tế. Vui lòng nạp session trước khi gửi tự động.',
        };
      }

      post.interaction = {
        id: `int-${Date.now()}`,
        post_id: postId,
        page_identity: 'Maison MIPA Photography',
        operator_name: operatorName,
        template_used_id: post.classification?.suggested_template_id || 'custom',
        comment_content: commentContent,
        status: 'sending',
        dispatched_at: new Date().toISOString(),
      };
      this.writeData(storeData);

      return { success: true, isManualDone: false, postToDispatch: post };
    });

    if (!preCheck.success || (preCheck as any).isManualDone) {
      return preCheck as any;
    }

    const targetPost = (preCheck as any).postToDispatch as FacebookPost;

    // Call real Playwright comment dispatcher
    const dispatchResult = await commentDispatcher.dispatchComment({
      postId: targetPost.id,
      postUrl: targetPost.post_url,
      commentContent,
      pageIdentity: 'Maison MIPA',
    });

    // Phase 2: Lock and update final result
    return this.withFileLock(() => {
      const storeData = this.readData();
      const currentPost = storeData.posts.find(p => p.id === postId);
      if (!currentPost) return { success: false, error: 'Bài viết không còn tồn tại.' };

      if (dispatchResult.status === 'sent_confirmed') {
        const interaction: OutreachInteraction = {
          id: currentPost.interaction?.id || `int-${Date.now()}`,
          post_id: postId,
          comment_facebook_id: dispatchResult.commentFacebookId,
          comment_permalink: dispatchResult.permalink,
          page_identity: 'Maison MIPA Photography',
          operator_name: operatorName,
          template_used_id: currentPost.classification?.suggested_template_id || 'custom',
          comment_content: commentContent,
          status: 'sent_confirmed',
          dispatched_at: new Date().toISOString(),
        };

        currentPost.interaction = interaction;
        if (currentPost.classification) {
          currentPost.classification.review_status = 'approved';
        }

        // Handoff to CRM Pipeline
        let lead = storeData.leads.find(l => l.post_id === postId);
        if (!lead) {
          lead = {
            id: `lead-${Date.now()}`,
            post_id: postId,
            customer_name: currentPost.author_name,
            customer_facebook_url: currentPost.post_url,
            service_interest: currentPost.classification?.service_detected || 'Chưa xác định',
            stage: 'uncontacted',
            assigned_cskh_name: 'Nguyễn Ngọc Lan (CSKH)',
            booking_date: currentPost.classification?.shooting_date_suggested || null,
            quoted_amount: null,
            notes: `Tiếp cận tự động thành công. Nhu cầu: ${currentPost.classification?.extra_requirements.join(', ') || 'N/A'}. Lịch dự kiến: ${currentPost.classification?.shooting_date_text || 'Chưa rõ'}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            post_summary: currentPost.content_raw.slice(0, 120),
          };
          storeData.leads.unshift(lead);
        }

        this.writeData(storeData);
        return { success: true, interaction, lead };
      } else {
        // Mark UNCERTAIN_FAILED
        const interaction: OutreachInteraction = {
          id: currentPost.interaction?.id || `int-${Date.now()}`,
          post_id: postId,
          page_identity: 'Maison MIPA Photography',
          operator_name: operatorName,
          template_used_id: currentPost.classification?.suggested_template_id || 'custom',
          comment_content: commentContent,
          status: 'uncertain_failed',
          dispatched_at: new Date().toISOString(),
          error_message: dispatchResult.errorMessage,
        };

        currentPost.interaction = interaction;
        this.writeData(storeData);
        return { 
          success: false, 
          interaction, 
          error: dispatchResult.errorMessage || 'Không thể xác thực bình luận trên Facebook.' 
        };
      }
    });
  }

  // --- CRM Leads API ---
  public getLeads(): CRMLead[] {
    return this.readData().leads;
  }

  public updateLead(id: string, updates: Partial<CRMLead>): CRMLead | null {
    return this.withFileLock(() => {
      const storeData = this.readData();
      const idx = storeData.leads.findIndex(l => l.id === id);
      if (idx === -1) return null;

      // Filter out undefined to prevent overwriting existing valid values
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([_, v]) => v !== undefined)
      );

      storeData.leads[idx] = { 
        ...storeData.leads[idx], 
        ...cleanUpdates, 
        updated_at: new Date().toISOString() 
      };
      this.writeData(storeData);
      return storeData.leads[idx];
    });
  }

  // --- Services & Templates ---
  public getServices(): ServiceItem[] {
    return this.readData().services;
  }

  public updateService(id: string, updates: Partial<ServiceItem>): ServiceItem | null {
    return this.withFileLock(() => {
      const storeData = this.readData();
      const idx = storeData.services.findIndex(s => s.id === id);
      if (idx === -1) return null;
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([_, v]) => v !== undefined)
      );
      storeData.services[idx] = { ...storeData.services[idx], ...cleanUpdates };
      this.writeData(storeData);
      return storeData.services[idx];
    });
  }

  public getTemplates(): OutreachTemplate[] {
    return this.readData().templates;
  }

  public updateTemplate(id: string, updates: Partial<OutreachTemplate>): OutreachTemplate | null {
    return this.withFileLock(() => {
      const storeData = this.readData();
      const idx = storeData.templates.findIndex(t => t.id === id);
      if (idx === -1) return null;
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([_, v]) => v !== undefined)
      );
      storeData.templates[idx] = { 
        ...storeData.templates[idx], 
        ...cleanUpdates, 
        version: storeData.templates[idx].version + 1,
        updated_at: new Date().toISOString() 
      };
      this.writeData(storeData);
      return storeData.templates[idx];
    });
  }

  // --- Heartbeat & Health (Strictly Decoupled) ---
  public getHeartbeat(): WorkerHeartbeat {
    const data = this.readData();
    const lastPing = data.heartbeat.last_ping ? new Date(data.heartbeat.last_ping).getTime() : 0;
    const isFresh = lastPing > 0 && (Date.now() - lastPing < 120_000);
    data.heartbeat.is_alive = isFresh;
    data.heartbeat.facebook_auth_valid = authManager.getSessionSummary().valid;
    return data.heartbeat;
  }

  public updateOperatingMode(mode: 'manual_review' | 'auto_dispatch'): WorkerHeartbeat {
    return this.withFileLock(() => {
      const storeData = this.readData();
      storeData.heartbeat.operating_mode = mode;
      // Do NOT touch last_ping when changing operating mode!
      this.writeData(storeData);
      return storeData.heartbeat;
    });
  }

  public recordWorkerPing(workerId: string = 'worker-ubuntu-central-01', activeJobs: number = 0): WorkerHeartbeat {
    return this.withFileLock(() => {
      const storeData = this.readData();
      storeData.heartbeat = {
        ...storeData.heartbeat,
        worker_id: workerId,
        last_ping: new Date().toISOString(),
        is_alive: true,
        active_jobs_count: activeJobs,
        facebook_auth_valid: authManager.getSessionSummary().valid,
      };
      this.writeData(storeData);
      return storeData.heartbeat;
    });
  }

  public updateHeartbeat(updates: Partial<WorkerHeartbeat>): WorkerHeartbeat {
    return this.withFileLock(() => {
      const storeData = this.readData();
      storeData.heartbeat = {
        ...storeData.heartbeat,
        ...updates,
      };
      this.writeData(storeData);
      return storeData.heartbeat;
    });
  }
}

export const store = LeadHubSharedStore.getInstance();
