export type UserRole = 'admin' | 'marketing' | 'cskh';

export type GroupCheckStatus = 'active' | 'paused' | 'error' | 'needs_auth';

export type PostIntent = 
  | 'looking_for_service' // Khách tìm thợ / dịch vụ
  | 'selling'             // Bán máy, phụ kiện
  | 'recruiting'          // Tuyển thợ, tuyển mẫu
  | 'spam'                // Quảng cáo rác, dịch vụ ngoài
  | 'unclear';            // Mơ hồ cần người duyệt

export type PostReviewStatus = 
  | 'pending_review' 
  | 'approved' 
  | 'dismissed' 
  | 'auto_dispatched';

export type OutreachStatus = 
  | 'not_started' 
  | 'queued'
  | 'sending' 
  | 'sent_confirmed' 
  | 'uncertain_failed' 
  | 'failed_before_submit'
  | 'manual_assisted'
  | 'failed'
  | 'rejected';

export type CRMStage = 
  | 'uncontacted'  // Chưa phản hồi
  | 'replied'      // Có phản hồi
  | 'consulting'   // Đang tư vấn
  | 'quoted'       // Đã báo giá
  | 'booked'       // Đã đặt lịch (Thành công)
  | 'lost';        // Không tiếp tục / Hủy

export interface FacebookGroup {
  id: string;
  name: string;
  url: string;
  check_interval_seconds: number; // 120, 150, 180s
  lookback_hours: number;
  status: GroupCheckStatus;
  last_checked_at: string | null;
  next_check_at: string | null;
  total_posts_found: number;
  last_error_message: string | null;
  can_page_comment: boolean;
  created_at: string;
}

export interface ServiceItem {
  id: string;
  code: string;
  name: string;
  base_price: number;
  price_note: string;
  service_area: string;
  includes_posing_support: boolean;
  is_active: boolean;
}

export interface OutreachTemplate {
  id: string;
  service_id: string;
  title: string;
  template_content: string;
  allowed_placeholders: string[];
  is_approved: boolean;
  version: number;
  updated_by_name: string;
  updated_at: string;
}

export interface FacebookPost {
  id: string;
  group_id: string;
  group_name: string;
  facebook_post_id?: string;
  post_url: string;
  post_url_hash: string;
  author_name: string;
  content_raw: string;
  posted_at: string;
  detected_at: string;
  classification?: LeadClassification;
  interaction?: OutreachInteraction;
}

export interface LeadClassification {
  id: string;
  post_id: string;
  intent: PostIntent;
  service_detected: string | null;
  location: string | null;
  pax: number | null;
  shooting_date_text: string | null;
  shooting_date_suggested: string | null;
  budget_raw: string | null;
  extra_requirements: string[];
  confidence_score: number;
  classification_reason: string;
  suggested_template_id: string | null;
  suggested_comment_text?: string;
  review_status: PostReviewStatus;
  reviewed_by?: string;
}

export interface OutreachInteraction {
  id: string;
  post_id: string;
  page_identity: string;
  operator_name: string;
  template_used_id: string;
  comment_content: string;
  status: OutreachStatus;
  comment_facebook_id?: string;
  comment_permalink?: string;
  error_message?: string;
  dispatched_at: string;
}

export interface CRMLead {
  id: string;
  post_id: string;
  customer_name: string;
  customer_facebook_url: string;
  service_interest: string;
  stage: CRMStage;
  assigned_cskh_name: string;
  booking_date: string | null;
  quoted_amount: number | null;
  notes: string;
  version?: number;
  created_at: string;
  updated_at: string;
  post_summary?: string;
}

export interface WorkerHeartbeat {
  worker_id: string;
  worker_name: string;
  is_alive: boolean;
  facebook_auth_valid: boolean;
  page_permission_valid: boolean;
  active_jobs_count: number;
  last_ping: string | null;
  operating_mode: 'manual_review' | 'auto_dispatch';
}
