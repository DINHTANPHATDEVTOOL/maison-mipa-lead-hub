-- Migration 002: Upgrade confidence_score column scale and add check constraint

-- 1. Rescale existing data if in range 0..1 to percentage scale 0..100
UPDATE lead_classifications 
SET confidence_score = confidence_score * 100.0 
WHERE confidence_score <= 1.0 AND confidence_score > 0;

-- 2. Alter column type to NUMERIC(5, 2)
ALTER TABLE lead_classifications 
ALTER COLUMN confidence_score TYPE NUMERIC(5, 2);

-- 3. Set default to 100.0
ALTER TABLE lead_classifications 
ALTER COLUMN confidence_score SET DEFAULT 100.0;

-- 4. Add check constraint (drop if exists first to ensure idempotency)
ALTER TABLE lead_classifications 
DROP CONSTRAINT IF EXISTS lead_classifications_confidence_score_check;

ALTER TABLE lead_classifications 
ADD CONSTRAINT lead_classifications_confidence_score_check 
CHECK (confidence_score >= 0 AND confidence_score <= 100);
