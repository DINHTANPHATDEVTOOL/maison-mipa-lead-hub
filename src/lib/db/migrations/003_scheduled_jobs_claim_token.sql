-- Migration 003: Add claim_token and page_locks table for concurrency leases

ALTER TABLE scheduled_jobs ADD COLUMN IF NOT EXISTS claim_token VARCHAR(64);

CREATE TABLE IF NOT EXISTS page_locks (
    page_id VARCHAR(64) PRIMARY KEY,
    locked_by VARCHAR(100),
    locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
