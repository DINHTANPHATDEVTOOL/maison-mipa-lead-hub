-- ==============================================================================
-- MAISON MIPA LEAD HUB - DATABASE SCHEMA (SUPABASE POSTGRESQL + RLS)
-- Designed for Facebook Group Monitoring, Lead Detection & Shared CRM Pipeline
-- ==============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Enumerations
CREATE TYPE user_role AS ENUM ('admin', 'marketing', 'cskh');
CREATE TYPE group_check_status AS ENUM ('active', 'paused', 'error', 'needs_auth');
CREATE TYPE post_intent AS ENUM ('looking_for_service', 'selling', 'recruiting', 'spam', 'unclear');
CREATE TYPE post_review_status AS ENUM ('pending_review', 'approved', 'dismissed', 'auto_dispatched');
CREATE TYPE outreach_status AS ENUM ('not_started', 'sending', 'sent_confirmed', 'uncertain_failed', 'manual_assisted');
CREATE TYPE crm_stage AS ENUM ('uncontacted', 'replied', 'consulting', 'quoted', 'booked', 'lost');

-- 3. Groups Table (Danh sách link nhóm Facebook được cấu hình)
CREATE TABLE IF NOT EXISTS facebook_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL UNIQUE,
    check_interval_seconds INT NOT NULL DEFAULT 150, -- 120s, 150s, 180s
    lookback_hours INT NOT NULL DEFAULT 24,
    status group_check_status NOT NULL DEFAULT 'active',
    last_checked_at TIMESTAMPTZ,
    next_check_at TIMESTAMPTZ,
    total_posts_found INT DEFAULT 0,
    last_error_message TEXT,
    can_page_comment BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Services Table (Bảng dịch vụ Maison MIPA: Áo dài, Concept, Nàng thơ,...)
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    base_price NUMERIC(12, 2) NOT NULL,
    price_note TEXT,
    service_area VARCHAR(255) DEFAULT 'TP. Hồ Chí Minh',
    includes_posing_support BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Outreach Templates Table (Mẫu bình luận được duyệt)
CREATE TABLE IF NOT EXISTS outreach_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    template_content TEXT NOT NULL,
    allowed_placeholders JSONB DEFAULT '["{gia}", "{khu_vuc}", "{ho_tro_tao_dang}", "{uu_dai}"]'::jsonb,
    is_approved BOOLEAN DEFAULT true,
    version INT DEFAULT 1,
    updated_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Facebook Posts Table (Bài viết quét từ nhóm)
-- Chống trùng mức Database: UNIQUE hash hoặc ID bài
CREATE TABLE IF NOT EXISTS facebook_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES facebook_groups(id) ON DELETE CASCADE,
    facebook_post_id VARCHAR(120),
    post_url TEXT NOT NULL,
    post_url_hash VARCHAR(64) NOT NULL UNIQUE,
    author_name VARCHAR(255),
    content_raw TEXT NOT NULL,
    posted_at TIMESTAMPTZ,
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    content_modified_at TIMESTAMPTZ,
    raw_metadata JSONB DEFAULT '{}'::jsonb
);

-- 7. Lead Classifications Table (Kết quả nhận dạng nhu cầu & trích xuất AI)
CREATE TABLE IF NOT EXISTS lead_classifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES facebook_posts(id) ON DELETE CASCADE UNIQUE,
    intent post_intent NOT NULL DEFAULT 'unclear',
    service_detected VARCHAR(100),
    location VARCHAR(255),
    pax INT,
    shooting_date_text TEXT,
    shooting_date_suggested DATE,
    budget_raw TEXT,
    extra_requirements TEXT[],
    confidence_score NUMERIC(5, 2),
    classification_reason TEXT,
    suggested_template_id UUID REFERENCES outreach_templates(id),
    review_status post_review_status DEFAULT 'pending_review',
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Outreach Interactions Table (Lịch sử bình luận & tiếp cận - Chống trùng tuyệt đối)
CREATE TABLE IF NOT EXISTS outreach_interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES facebook_posts(id) ON DELETE CASCADE,
    -- ĐẢM BẢO CHỈ 1 LƯỢT TIẾP CẬN ĐẦU TIÊN CHO TOÀN TIỆM
    CONSTRAINT unique_first_touch_outreach UNIQUE (post_id),
    page_identity VARCHAR(255) NOT NULL,
    operator_id UUID,
    template_used_id UUID REFERENCES outreach_templates(id),
    comment_content TEXT NOT NULL,
    status outreach_status NOT NULL DEFAULT 'sending',
    comment_facebook_id VARCHAR(120),
    comment_permalink TEXT,
    verification_details JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. CRM Leads & Care Pipeline Table (Bàn giao CSKH)
CREATE TABLE IF NOT EXISTS crm_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID REFERENCES facebook_posts(id) ON DELETE SET NULL,
    customer_name VARCHAR(255),
    customer_facebook_url TEXT,
    service_interest VARCHAR(100),
    stage crm_stage NOT NULL DEFAULT 'uncontacted',
    assigned_cskh_id UUID,
    booking_date TIMESTAMPTZ,
    quoted_amount NUMERIC(12, 2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. System & Worker Health Heartbeats
CREATE TABLE IF NOT EXISTS system_heartbeats (
    worker_id VARCHAR(100) PRIMARY KEY,
    worker_name VARCHAR(255) NOT NULL,
    is_alive BOOLEAN DEFAULT true,
    facebook_auth_valid BOOLEAN DEFAULT false,
    active_jobs_count INT DEFAULT 0,
    last_ping TIMESTAMPTZ DEFAULT NOW(),
    ip_address VARCHAR(50),
    details JSONB DEFAULT '{}'::jsonb
);

-- ==============================================================================
-- INDEXES & PERFORMANCE OPTIMIZATIONS
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_posts_url_hash ON facebook_posts(post_url_hash);
CREATE INDEX IF NOT EXISTS idx_posts_group_detected ON facebook_posts(group_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_classifications_review ON lead_classifications(review_status, intent);
CREATE INDEX IF NOT EXISTS idx_crm_stage_assigned ON crm_leads(stage, assigned_cskh_id);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE facebook_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE facebook_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;

-- Default Policy: Authenticated users can view all shared business records
CREATE POLICY "Allow authenticated staff to read shared data" 
    ON facebook_posts FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Allow authenticated staff to read and update leads" 
    ON crm_leads FOR ALL 
    TO authenticated 
    USING (true);
