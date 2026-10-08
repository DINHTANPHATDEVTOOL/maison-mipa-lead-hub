-- 005_add_min_confidence_score.sql
-- Thêm cột min_confidence_score vào bảng system_heartbeats để lưu ngưỡng độ phù hợp bền vững
ALTER TABLE system_heartbeats 
ADD COLUMN IF NOT EXISTS min_confidence_score NUMERIC(5, 2) DEFAULT 80.0;

-- Cập nhật giá trị mặc định cho bản ghi hiện tại nếu chưa có
UPDATE system_heartbeats 
SET min_confidence_score = 80.0 
WHERE min_confidence_score IS NULL;
