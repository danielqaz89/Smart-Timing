-- Add daily rate support for activities that are billed per day instead of per hour
-- Add to log_row table
ALTER TABLE log_row ADD COLUMN IF NOT EXISTS is_daily_rate BOOLEAN DEFAULT false;
ALTER TABLE log_row ADD COLUMN IF NOT EXISTS daily_rate_amount NUMERIC(10,2) DEFAULT 0;

-- Add to quick_templates table
ALTER TABLE quick_templates ADD COLUMN IF NOT EXISTS is_daily_rate BOOLEAN DEFAULT false;
ALTER TABLE quick_templates ADD COLUMN IF NOT EXISTS daily_rate_amount NUMERIC(10,2) DEFAULT 0;

-- Add default daily rate to user_settings
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS default_daily_rate NUMERIC(10,2) DEFAULT 0;
