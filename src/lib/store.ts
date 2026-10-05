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
import crypto from 'crypto';

function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url.trim().toLowerCase()).digest('hex');
}

// In-memory persistent singleton store
class LeadHubStore {
  private static instance: LeadHubStore;

  public groups: FacebookGroup[] = [];
  public services: ServiceItem[] = [];
  public templates: OutreachTemplate[] = [];
  public posts: FacebookPost[] = [];
  public interactions: OutreachInteraction[] = [];
  public leads: CRMLead[] = [];
  public heartbeat: WorkerHeartbeat = {
    worker_id: 'worker-ubuntu-central-01',
    worker_name: 'Maison MIPA Central Worker',
    is_alive: true,
    facebook_auth_valid: true,
    page_permission_valid: true,
    active_jobs_count: 3,
    last_ping: new Date().toISOString(),
    operating_mode: 'manual_review', // Default: Human-in-the-loop
  };

  private constructor() {
    this.seedInitialData();
  }

  public static getInstance(): LeadHubStore {
    const g = globalThis as any;
    if (!g.__mipaStoreInstance) {
      g.__mipaStoreInstance = new LeadHubStore();
    }
    return g.__mipaStoreInstance;
  }

  private seedInitialData() {
    // 1. Initial Services
    this.services = [
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
        price_note: 'Đã bao gồm makeup và 2 layout trang phục',
        service_area: 'Studio Maison MIPA (Q.1)',
        includes_posing_support: true,
        is_active: true,
      },
      {
        id: 'srv-03',
        code: 'PRE_WEDDING',
        name: 'Gói Chụp Đôi / Pre-Wedding Nhẹ Nhàng',
        base_price: 2800000,
        price_note: 'Chụp ngoại cảnh hoặc phim trường, 25 ảnh chỉnh sửa',
        service_area: 'TP. Hồ Chí Minh & lân cận',
        includes_posing_support: true,
        is_active: true,
      },
      {
        id: 'srv-04',
        code: 'KY_YEU',
        name: 'Kỷ Yếu Nghệ Thuật / Chụp Nhóm Bạn',
        base_price: 850000,
        price_note: 'Giá áp dụng từ 4 bạn trở lên, đã gồm phụ kiện kỷ yếu',
        service_area: 'TP. Hồ Chí Minh',
        includes_posing_support: true,
        is_active: true,
      }
    ];

    // 2. Initial Outreach Templates
    this.templates = [
      {
        id: 'tpl-01',
        service_id: 'srv-01',
        title: 'Mẫu Áo Dài - Có Hướng Dẫn Tạo Dáng Chi Tiết',
        template_content: 'Chào bạn nha, Maison MIPA chuyên các bộ ảnh Áo dài tại {khu_vuc} ({gia}). Bên mình có stylist hướng dẫn tạo dáng chi tiết từng góc chụp cho bạn hoàn toàn yên tâm nhé! Bạn nhắn Page để tiệm gửi album ảnh mẫu tham khảo nha.',
        allowed_placeholders: ['{gia}', '{khu_vuc}', '{ho_tro_tao_dang}'],
        is_approved: true,
        version: 1,
        updated_by_name: 'Admin Maison MIPA',
        updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
      {
        id: 'tpl-02',
        service_id: 'srv-02',
        title: 'Mẫu Concept Nàng Thơ Studio Trọn Gói',
        template_content: 'Dạ chào bạn, concept Nàng thơ tại Studio Maison MIPA hiện có ưu đãi trọn gói từ {gia} (đã gồm makeup & trang phục, có hỗ trợ tạo dáng). Mời bạn ghé Page tiệm xem qua album concept mới nhất nhé!',
        allowed_placeholders: ['{gia}', '{khu_vuc}'],
        is_approved: true,
        version: 2,
        updated_by_name: 'Marketing Lead',
        updated_at: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: 'tpl-03',
        service_id: 'srv-03',
        title: 'Mẫu Chụp Đôi / Kỷ Niệm Tự Nhiên',
        template_content: 'Chào hai bạn, Maison MIPA có các gói chụp đôi bắt khoảnh khắc tự nhiên, nhẹ nhàng từ {gia}. Ekip luôn hỗ trợ tạo dáng thoải mái như đang dạo phố. Hai bạn inbox tiệm để xem thêm ảnh đôi nhé!',
        allowed_placeholders: ['{gia}', '{khu_vuc}'],
        is_approved: true,
        version: 1,
        updated_by_name: 'Admin Maison MIPA',
        updated_at: new Date(Date.now() - 86400000 * 3).toISOString(),
      }
    ];

    // 3. Initial Facebook Groups
    this.groups = [
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
      },
      {
        id: 'grp-03',
        name: 'Review Studio & Nhiếp Ảnh Nghệ Thuật HCM',
        url: 'https://facebook.com/groups/reviewstudiophotohcm',
        check_interval_seconds: 180,
        lookback_hours: 24,
        status: 'active',
        last_checked_at: new Date(Date.now() - 110000).toISOString(),
        next_check_at: new Date(Date.now() + 70000).toISOString(),
        total_posts_found: 31,
        last_error_message: null,
        can_page_comment: true,
        created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
      }
    ];

    // 4. Initial Sample Posts (Representing accurate scenarios from user's brief)
    const post1Url = 'https://facebook.com/groups/hoidammechupaodaivn/posts/108923489234';
    const post1: FacebookPost = {
      id: 'post-01',
      group_id: 'grp-01',
      group_name: 'Hội Chụp Ảnh Áo Dài Sài Gòn & TP.HCM',
      facebook_post_id: '108923489234',
      post_url: post1Url,
      post_url_hash: hashUrl(post1Url),
      author_name: 'Lê Thảo My',
      content_raw: 'Cần tìm thợ chụp áo dài ở quận 1, chủ nhật này, hai người. Muốn có người hỗ trợ tạo dáng vì tụi mình ít chụp ảnh nên hay ngại.',
      posted_at: new Date(Date.now() - 3600000 * 2).toISOString(),
      detected_at: new Date(Date.now() - 3600000 * 1.8).toISOString(),
      classification: {
        id: 'cls-01',
        post_id: 'post-01',
        intent: 'looking_for_service',
        service_detected: 'Chụp Ảnh Áo Dài Nghệ Thuật & Truyền Thống',
        location: 'Quận 1, TP. Hồ Chí Minh',
        pax: 2,
        shooting_date_text: 'Chủ nhật này',
        shooting_date_suggested: '2026-10-11',
        budget_raw: 'Chưa rõ',
        extra_requirements: ['Hỗ trợ tạo dáng tận tình cho khách ít chụp'],
        confidence_score: 98,
        classification_reason: 'Khách hàng có nhu cầu rõ ràng: tìm thợ chụp áo dài tại Q1, 2 người vào chủ nhật, có yêu cầu hướng dẫn tạo dáng.',
        suggested_template_id: 'tpl-01',
        suggested_comment_text: 'Chào bạn Thảo My, Maison MIPA chuyên các bộ ảnh Áo dài tại Quận 1, TP. Hồ Chí Minh (từ 1.200.000đ). Bên mình luôn có stylist hướng dẫn tạo dáng chi tiết từng góc chụp cho khách chưa quen ống kính yên tâm nhé! Bạn nhắn Page để tiệm gửi album ảnh mẫu tham khảo nha.',
        review_status: 'pending_review',
      }
    };

    const post2Url = 'https://facebook.com/groups/timthochupanhtphcm/posts/87346298172';
    const post2: FacebookPost = {
      id: 'post-02',
      group_id: 'grp-02',
      group_name: 'Góc Tìm Thợ Chụp Ảnh Sài Gòn (Studio & Ngoại Cảnh)',
      facebook_post_id: '87346298172',
      post_url: post2Url,
      post_url_hash: hashUrl(post2Url),
      author_name: 'Nguyễn Tiến Dũng',
      content_raw: 'Pass lại combo Sony A7R3 chụp 15k shot + lens Tamron 28-75 F2.8 G1 tình trạng hoàn hảo fullbox, gdtt tại Bình Thạnh.',
      posted_at: new Date(Date.now() - 3600000 * 4).toISOString(),
      detected_at: new Date(Date.now() - 3600000 * 3.9).toISOString(),
      classification: {
        id: 'cls-02',
        post_id: 'post-02',
        intent: 'selling',
        service_detected: null,
        location: 'Bình Thạnh',
        pax: null,
        shooting_date_text: null,
        shooting_date_suggested: null,
        budget_raw: null,
        extra_requirements: [],
        confidence_score: 99,
        classification_reason: 'Lọc tự động theo Quy tắc: Bài đăng bán thiết bị máy ảnh/ống kính, không phải khách hàng cần dịch vụ.',
        suggested_template_id: null,
        review_status: 'dismissed',
      }
    };

    const post3Url = 'https://facebook.com/groups/reviewstudiophotohcm/posts/55491028374';
    const post3: FacebookPost = {
      id: 'post-03',
      group_id: 'grp-03',
      group_name: 'Review Studio & Nhiếp Ảnh Nghệ Thuật HCM',
      facebook_post_id: '55491028374',
      post_url: post3Url,
      post_url_hash: hashUrl(post3Url),
      author_name: 'Hoàng Yến',
      content_raw: 'Cuối tháng sinh nhật mình muốn chụp bộ ảnh concept nàng thơ vintage trong studio ấm cúng một mình. Ai biết studio nào gu nhẹ nhàng, makeup đẹp tư vấn mình với ạ.',
      posted_at: new Date(Date.now() - 3600000 * 5).toISOString(),
      detected_at: new Date(Date.now() - 3600000 * 4.8).toISOString(),
      classification: {
        id: 'cls-03',
        post_id: 'post-03',
        intent: 'looking_for_service',
        service_detected: 'Concept Nàng Thơ & Vintage Studio',
        location: 'TP. Hồ Chí Minh',
        pax: 1,
        shooting_date_text: 'Cuối tháng (dịp sinh nhật)',
        shooting_date_suggested: '2026-10-28',
        budget_raw: 'Chưa rõ',
        extra_requirements: ['Tone ấm cúng vintage', 'Makeup đẹp'],
        confidence_score: 96,
        classification_reason: 'Nhu cầu cá nhân chụp concept Nàng Thơ mừng sinh nhật, tìm studio có makeup và gu tinh tế.',
        suggested_template_id: 'tpl-02',
        suggested_comment_text: 'Dạ chào bạn Hoàng Yến, concept Nàng thơ tại Studio Maison MIPA hiện có ưu đãi trọn gói từ 1.500.000đ (đã gồm makeup & trang phục, có hỗ trợ tạo dáng). Mời bạn ghé Page tiệm xem qua album concept mới nhất nhé!',
        review_status: 'approved',
      },
      interaction: {
        id: 'int-01',
        post_id: 'post-03',
        page_identity: 'Maison MIPA Photography',
        operator_name: 'Trần Minh (Marketing)',
        template_used_id: 'tpl-02',
        comment_content: 'Dạ chào bạn Hoàng Yến, concept Nàng thơ tại Studio Maison MIPA hiện có ưu đãi trọn gói từ 1.500.000đ (đã gồm makeup & trang phục, có hỗ trợ tạo dáng). Mời bạn ghé Page tiệm xem qua album concept mới nhất nhé!',
        status: 'sent_confirmed',
        comment_facebook_id: 'c_9981248102',
        comment_permalink: 'https://facebook.com/groups/reviewstudiophotohcm/posts/55491028374?comment_id=9981248102',
        dispatched_at: new Date(Date.now() - 3600000 * 4.5).toISOString(),
      }
    };

    this.posts = [post1, post2, post3];

    // 5. Initial CRM Lead (converted from post3)
    this.leads = [
      {
        id: 'lead-01',
        post_id: 'post-03',
        customer_name: 'Hoàng Yến',
        customer_facebook_url: 'https://facebook.com/hoang.yen.photography.fan',
        service_interest: 'Concept Nàng Thơ & Vintage Studio',
        stage: 'consulting',
        assigned_cskh_name: 'Ngọc Lan (CSKH)',
        booking_date: '2026-10-28T09:30:00Z',
        quoted_amount: 1500000,
        notes: 'Khách thích tone vintage ánh vàng hoàng hôn, đã gửi bảng màu, đang chọn mẫu váy tại studio.',
        created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
        updated_at: new Date(Date.now() - 3600000 * 1).toISOString(),
        post_summary: 'Sinh nhật muốn chụp nàng thơ vintage studio 1 người, cần makeup',
      },
      {
        id: 'lead-02',
        post_id: 'post-legacy-02',
        customer_name: 'Phương Uyên',
        customer_facebook_url: 'https://facebook.com/phuonguyen.sample',
        service_interest: 'Chụp Ảnh Áo Dài Nghệ Thuật & Truyền Thống',
        stage: 'quoted',
        assigned_cskh_name: 'Ngọc Lan (CSKH)',
        booking_date: null,
        quoted_amount: 2400000,
        notes: 'Gói áo dài 2 người tại Bảo tàng Mỹ Thuật, đã báo giá 2.400.000đ bao gồm vé vào cổng.',
        created_at: new Date(Date.now() - 86400000).toISOString(),
        updated_at: new Date(Date.now() - 3600000 * 2).toISOString(),
        post_summary: 'Cần tìm thợ chụp áo dài bảo tàng mỹ thuật chủ nhật',
      }
    ];
  }

  // --- Group Methods ---
  public getGroups(): FacebookGroup[] {
    return this.groups;
  }

  public addGroup(data: Omit<FacebookGroup, 'id' | 'last_checked_at' | 'next_check_at' | 'total_posts_found' | 'last_error_message' | 'created_at'>): FacebookGroup {
    const newGroup: FacebookGroup = {
      ...data,
      id: `grp-${Date.now()}`,
      last_checked_at: null,
      next_check_at: new Date(Date.now() + data.check_interval_seconds * 1000).toISOString(),
      total_posts_found: 0,
      last_error_message: null,
      created_at: new Date().toISOString(),
    };
    this.groups.unshift(newGroup);
    return newGroup;
  }

  public updateGroup(id: string, updates: Partial<FacebookGroup>): FacebookGroup | null {
    const idx = this.groups.findIndex(g => g.id === id);
    if (idx === -1) return null;
    this.groups[idx] = { ...this.groups[idx], ...updates };
    return this.groups[idx];
  }

  public deleteGroup(id: string): boolean {
    const initial = this.groups.length;
    this.groups = this.groups.filter(g => g.id !== id);
    return this.groups.length < initial;
  }

  public triggerGroupCheck(id: string): { success: boolean; message: string; group?: FacebookGroup } {
    const group = this.groups.find(g => g.id === id);
    if (!group) return { success: false, message: 'Nhóm không tồn tại' };

    group.last_checked_at = new Date().toISOString();
    group.next_check_at = new Date(Date.now() + group.check_interval_seconds * 1000).toISOString();
    group.status = 'active';
    group.last_error_message = null;

    return { 
      success: true, 
      message: `Đã kích hoạt quét nhóm "${group.name}". Lần kiểm tra tiếp theo lúc ${new Date(group.next_check_at).toLocaleTimeString('vi-VN')}.`,
      group 
    };
  }

  // --- Posts & Ingestion with Strict Deduplication ---
  public getPosts(): FacebookPost[] {
    return this.posts;
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
    const hash = hashUrl(postData.post_url);
    const existing = this.posts.find(p => p.post_url_hash === hash || (postData.facebook_post_id && p.facebook_post_id === postData.facebook_post_id));

    if (existing) {
      // If content was modified, update content without duplicate entry
      if (existing.content_raw !== postData.content_raw) {
        existing.content_raw = postData.content_raw;
      }
      return { post: existing, isNew: false };
    }

    const newPost: FacebookPost = {
      id: `post-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      group_id: postData.group_id,
      group_name: postData.group_name,
      facebook_post_id: postData.facebook_post_id,
      post_url: postData.post_url,
      post_url_hash: hash,
      author_name: postData.author_name || 'Người dùng ẩn danh',
      content_raw: postData.content_raw,
      posted_at: postData.posted_at || new Date().toISOString(),
      detected_at: new Date().toISOString(),
    };

    // Increase count on group
    const grp = this.groups.find(g => g.id === postData.group_id);
    if (grp) grp.total_posts_found += 1;

    this.posts.unshift(newPost);
    return { post: newPost, isNew: true };
  }

  // --- Outreach & Idempotency Lock ---
  public dispatchComment(postId: string, commentContent: string, operatorName: string = 'Marketing'): {
    success: boolean;
    interaction?: OutreachInteraction;
    lead?: CRMLead;
    error?: string;
  } {
    const post = this.posts.find(p => p.id === postId);
    if (!post) {
      return { success: false, error: 'Không tìm thấy bài viết' };
    }

    // CHECK 1: Ensure no outreach already done (Single first-touch outreach constraint)
    if (post.interaction && (post.interaction.status === 'sent_confirmed' || post.interaction.status === 'sending')) {
      return { success: false, error: 'Bài viết này đã có tương tác tiếp cận hoặc đang được xử lý, không thể gửi trùng lặp!' };
    }

    // CHECK 2: Can Page comment?
    const group = this.groups.find(g => g.id === post.group_id);
    if (group && !group.can_page_comment) {
      return { success: false, error: 'Page hiện chưa có quyền bình luận trong nhóm này. Vui lòng kiểm tra quyền.' };
    }

    // Create interaction record
    const interaction: OutreachInteraction = {
      id: `int-${Date.now()}`,
      post_id: postId,
      page_identity: 'Maison MIPA Photography',
      operator_name: operatorName,
      template_used_id: post.classification?.suggested_template_id || 'custom',
      comment_content: commentContent,
      status: 'sent_confirmed',
      comment_facebook_id: `c_${Math.floor(Math.random() * 1000000000)}`,
      comment_permalink: `${post.post_url}?comment_id=${Math.floor(Math.random() * 1000000000)}`,
      dispatched_at: new Date().toISOString(),
    };

    post.interaction = interaction;
    if (post.classification) {
      post.classification.review_status = 'approved';
    }

    // Automatically create or link CRM Lead
    let lead = this.leads.find(l => l.post_id === postId);
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
        notes: `Tạo tự động từ bình luận tiếp cận. Yêu cầu: ${post.classification?.extra_requirements.join(', ') || 'Không có'}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        post_summary: post.content_raw.slice(0, 120),
      };
      this.leads.unshift(lead);
    }

    return { success: true, interaction, lead };
  }

  // --- CRM Leads ---
  public getLeads(): CRMLead[] {
    return this.leads;
  }

  public updateLead(id: string, updates: Partial<CRMLead>): CRMLead | null {
    const idx = this.leads.findIndex(l => l.id === id);
    if (idx === -1) return null;
    this.leads[idx] = { 
      ...this.leads[idx], 
      ...updates, 
      updated_at: new Date().toISOString() 
    };
    return this.leads[idx];
  }

  // --- Services & Templates ---
  public getServices(): ServiceItem[] {
    return this.services;
  }

  public updateService(id: string, updates: Partial<ServiceItem>): ServiceItem | null {
    const idx = this.services.findIndex(s => s.id === id);
    if (idx === -1) return null;
    this.services[idx] = { ...this.services[idx], ...updates };
    return this.services[idx];
  }

  public getTemplates(): OutreachTemplate[] {
    return this.templates;
  }

  public updateTemplate(id: string, updates: Partial<OutreachTemplate>): OutreachTemplate | null {
    const idx = this.templates.findIndex(t => t.id === id);
    if (idx === -1) return null;
    this.templates[idx] = { 
      ...this.templates[idx], 
      ...updates,
      version: this.templates[idx].version + 1,
      updated_at: new Date().toISOString()
    };
    return this.templates[idx];
  }

  // --- Heartbeat & Health ---
  public getHeartbeat(): WorkerHeartbeat {
    return this.heartbeat;
  }

  public updateHeartbeat(updates: Partial<WorkerHeartbeat>): WorkerHeartbeat {
    this.heartbeat = {
      ...this.heartbeat,
      ...updates,
      last_ping: new Date().toISOString(),
    };
    return this.heartbeat;
  }
}

export const store = LeadHubStore.getInstance();
