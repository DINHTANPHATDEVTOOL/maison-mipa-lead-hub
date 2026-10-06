-- ==============================================================================
-- MAISON MIPA LEAD HUB - DATABASE SCHEMA (POSTGRESQL MIGRATION 001)
-- ==============================================================================

-- 0. Schema Migrations History Tracker
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMPTZ
);

-- 1. Facebook Groups (Danh sách nhóm cần theo dõi bài viết)
CREATE TABLE IF NOT EXISTS facebook_groups (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL UNIQUE,
    check_interval_seconds INT NOT NULL DEFAULT 150,
    lookback_hours INT NOT NULL DEFAULT 24,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    last_checked_at TIMESTAMPTZ,
    next_check_at TIMESTAMPTZ,
    total_posts_found INT NOT NULL DEFAULT 0,
    last_error_message TEXT,
    can_page_comment BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fb_groups_status ON facebook_groups(status);
CREATE INDEX IF NOT EXISTS idx_fb_groups_next_check ON facebook_groups(next_check_at);

-- 2. Facebook Pages (Cấu hình Page chính thức của tiệm để bình luận)
CREATE TABLE IF NOT EXISTS facebook_pages (
    id VARCHAR(64) PRIMARY KEY,
    page_id VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    last_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fb_pages_page_id ON facebook_pages(page_id);

-- 3. Facebook Sessions (Lưu trữ phiên đăng nhập mã hóa)
CREATE TABLE IF NOT EXISTS facebook_sessions (
    id VARCHAR(64) PRIMARY KEY,
    page_id VARCHAR(100) REFERENCES facebook_pages(page_id) ON DELETE CASCADE,
    encrypted_storage_state TEXT NOT NULL,
    encryption_iv VARCHAR(64) NOT NULL,
    encryption_tag VARCHAR(64) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_valid BOOLEAN NOT NULL DEFAULT false,
    last_verified_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Services (Danh mục gói dịch vụ chụp ảnh Maison MIPA)
CREATE TABLE IF NOT EXISTS services (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    base_price NUMERIC(12, 2) NOT NULL,
    price_note TEXT,
    service_area VARCHAR(255) DEFAULT 'TP. Hồ Chí Minh',
    includes_posing_support BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_services_code ON services(code);

-- 5. Outreach Templates (Mẫu bình luận tiếp cận khách hàng)
CREATE TABLE IF NOT EXISTS outreach_templates (
    id VARCHAR(64) PRIMARY KEY,
    service_id VARCHAR(64) REFERENCES services(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    template_content TEXT NOT NULL,
    allowed_placeholders JSONB DEFAULT '["{gia}", "{khu_vuc}", "{ho_tro_tao_dang}", "{uu_dai}"]'::jsonb,
    is_approved BOOLEAN NOT NULL DEFAULT true,
    version INT NOT NULL DEFAULT 1,
    updated_by_name VARCHAR(100) DEFAULT 'Admin',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_templates_service ON outreach_templates(service_id);

-- 6. Facebook Posts (Bài viết cào từ các hội nhóm)
CREATE TABLE IF NOT EXISTS facebook_posts (
    id VARCHAR(64) PRIMARY KEY,
    group_id VARCHAR(64) REFERENCES facebook_groups(id) ON DELETE CASCADE,
    group_name VARCHAR(255),
    facebook_post_id VARCHAR(120),
    post_url TEXT NOT NULL,
    post_url_hash VARCHAR(64) NOT NULL UNIQUE,
    author_name VARCHAR(255),
    content_raw TEXT NOT NULL,
    posted_at TIMESTAMPTZ,
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fb_posts_fb_id ON facebook_posts(facebook_post_id);
CREATE INDEX IF NOT EXISTS idx_fb_posts_group_detected ON facebook_posts(group_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_fb_posts_url_hash ON facebook_posts(post_url_hash);

-- 7. Lead Classifications (Kết quả nhận dạng nhu cầu & trích xuất AI/NLP)
CREATE TABLE IF NOT EXISTS lead_classifications (
    id VARCHAR(64) PRIMARY KEY,
    post_id VARCHAR(64) NOT NULL REFERENCES facebook_posts(id) ON DELETE CASCADE UNIQUE,
    intent VARCHAR(50) NOT NULL DEFAULT 'unclear',
    service_detected VARCHAR(100),
    location VARCHAR(255),
    pax INT,
    shooting_date_text TEXT,
    shooting_date_suggested DATE,
    budget_raw TEXT,
    extra_requirements TEXT,
    confidence_score NUMERIC(5, 2) NOT NULL DEFAULT 100.0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
    classification_reason TEXT,
    suggested_template_id VARCHAR(64) REFERENCES outreach_templates(id) ON DELETE SET NULL,
    suggested_comment_text TEXT,
    review_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    reviewed_by VARCHAR(100),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_class_intent ON lead_classifications(intent);
CREATE INDEX IF NOT EXISTS idx_lead_class_review ON lead_classifications(review_status);

-- 8. Outreach Interactions (Lần gửi tiếp cận thành công hoặc hỗ trợ nhân viên)
-- Ràng buộc chống trùng nghiêm ngặt cấp cơ sở dữ liệu: mỗi bài viết chỉ có DUY NHẤT 1 lần tiếp cận (unique_first_touch_outreach)
CREATE TABLE IF NOT EXISTS outreach_interactions (
    id VARCHAR(64) PRIMARY KEY,
    post_id VARCHAR(64) NOT NULL REFERENCES facebook_posts(id) ON DELETE CASCADE CONSTRAINT unique_first_touch_outreach UNIQUE,
    page_identity VARCHAR(255) NOT NULL,
    operator_name VARCHAR(100) NOT NULL,
    template_used_id VARCHAR(64) REFERENCES outreach_templates(id) ON DELETE SET NULL,
    comment_content TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'sending',
    comment_facebook_id VARCHAR(120),
    comment_permalink TEXT,
    error_message TEXT,
    dispatched_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_outreach_status ON outreach_interactions(status);

-- 9. Outreach Attempts (Nhật ký kiểm toán từng lần thử nghiệm tiếp cận)
CREATE TABLE IF NOT EXISTS outreach_attempts (
    id VARCHAR(64) PRIMARY KEY,
    post_id VARCHAR(64) NOT NULL REFERENCES facebook_posts(id) ON DELETE CASCADE,
    page_id VARCHAR(100),
    page_name VARCHAR(255),
    template_id VARCHAR(64) REFERENCES outreach_templates(id) ON DELETE SET NULL,
    comment_content TEXT NOT NULL,
    status VARCHAR(50) NOT NULL,
    attempt_number INT NOT NULL DEFAULT 1,
    error_message TEXT,
    evidence_json JSONB DEFAULT '{}'::jsonb,
    attempted_by VARCHAR(100) DEFAULT 'Worker',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_outreach_attempts_post ON outreach_attempts(post_id);

-- 10. CRM Leads & Care Pipeline (Quản lý khách hàng tiềm năng cho CSKH)
CREATE TABLE IF NOT EXISTS crm_leads (
    id VARCHAR(64) PRIMARY KEY,
    post_id VARCHAR(64) REFERENCES facebook_posts(id) ON DELETE SET NULL,
    customer_name VARCHAR(255),
    customer_facebook_url TEXT,
    service_interest VARCHAR(100),
    stage VARCHAR(50) NOT NULL DEFAULT 'uncontacted',
    assigned_cskh_name VARCHAR(100) DEFAULT 'CSKH Team',
    booking_date TIMESTAMPTZ,
    quoted_amount NUMERIC(12, 2),
    notes TEXT,
    post_summary TEXT,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_leads_stage ON crm_leads(stage);
CREATE INDEX IF NOT EXISTS idx_crm_leads_post_id ON crm_leads(post_id);

-- 11. System Heartbeats (Theo dõi trạng thái sức khỏe worker)
CREATE TABLE IF NOT EXISTS system_heartbeats (
    worker_id VARCHAR(100) PRIMARY KEY,
    worker_name VARCHAR(255) NOT NULL,
    is_alive BOOLEAN NOT NULL DEFAULT true,
    facebook_auth_valid BOOLEAN NOT NULL DEFAULT false,
    page_permission_valid BOOLEAN NOT NULL DEFAULT false,
    active_jobs_count INT NOT NULL DEFAULT 0,
    last_ping TIMESTAMPTZ DEFAULT NOW(),
    operating_mode VARCHAR(50) NOT NULL DEFAULT 'manual_review',
    details JSONB DEFAULT '{}'::jsonb
);

-- 12. App Settings (Cấu hình hệ thống toàn cục)
CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by VARCHAR(100) DEFAULT 'Admin'
);

-- 13. Scheduled Jobs (Hàng đợi tác vụ bền vững với FOR UPDATE SKIP LOCKED)
CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id VARCHAR(64) PRIMARY KEY,
    job_type VARCHAR(50) NOT NULL,
    target_id VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'queued',
    locked_by VARCHAR(100),
    locked_at TIMESTAMPTZ,
    run_at TIMESTAMPTZ DEFAULT NOW(),
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    last_error TEXT,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_status ON scheduled_jobs(status, run_at);

-- 14. Audit Events (Kiểm toán bảo mật hành động nhân viên)
CREATE TABLE IF NOT EXISTS audit_events (
    id VARCHAR(64) PRIMARY KEY,
    actor_type VARCHAR(32) NOT NULL DEFAULT 'user',
    actor_id VARCHAR(128) NOT NULL,
    action VARCHAR(64) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(128) NOT NULL,
    changes JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at DESC);

-- 15. Revoked Tokens (Danh sách token đăng xuất bị thu hồi nguyên tử)
CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti VARCHAR(128) PRIMARY KEY,
    token_text TEXT,
    revoked_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_at ON revoked_tokens(revoked_at DESC);

-- 16. User Accounts (Tài khoản nhân viên với mật khẩu băm bảo mật)
CREATE TABLE IF NOT EXISTS user_accounts (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_accounts_username ON user_accounts(username);
