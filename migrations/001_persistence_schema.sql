-- Smart Timing Persistence Schema Migration
-- Creates all tables, columns, and indexes for database-backed settings

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ===== PROJECT INFO TABLE =====
CREATE TABLE IF NOT EXISTS project_info (
  id SERIAL PRIMARY KEY,
  konsulent TEXT,
  bedrift TEXT,
  oppdragsgiver TEXT,
  tiltak TEXT,
  periode TEXT,
  klient_id TEXT,
  user_id TEXT DEFAULT 'default',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add missing columns to existing project_info (safe)
ALTER TABLE project_info ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT 'default';
ALTER TABLE project_info ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE project_info ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE project_info ADD COLUMN IF NOT EXISTS bedrift TEXT;

-- ===== LOG ROW TABLE =====
CREATE TABLE IF NOT EXISTS log_row (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INT REFERENCES project_info(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_hours NUMERIC(4,2) DEFAULT 0,
  activity TEXT CHECK (activity IN ('Work','Meeting')),
  title TEXT,
  project TEXT,
  place TEXT,
  notes TEXT,
  expense_coverage NUMERIC(10,2) DEFAULT 0,
  user_id TEXT DEFAULT 'default',
  is_stamped_in BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add missing columns to existing log_row (safe)
ALTER TABLE log_row ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT 'default';
ALTER TABLE log_row ADD COLUMN IF NOT EXISTS is_stamped_in BOOLEAN DEFAULT false;
ALTER TABLE log_row ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE log_row ADD COLUMN IF NOT EXISTS expense_coverage NUMERIC(10,2) DEFAULT 0;

-- ===== USER SETTINGS TABLE =====
CREATE TABLE IF NOT EXISTS user_settings (
  id SERIAL PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL DEFAULT 'default',
  paid_break BOOLEAN DEFAULT false,
  tax_pct NUMERIC(4,2) DEFAULT 35.00,
  hourly_rate NUMERIC(10,2) DEFAULT 0,
  timesheet_sender TEXT,
  timesheet_recipient TEXT,
  timesheet_format TEXT CHECK (timesheet_format IN ('xlsx', 'pdf')) DEFAULT 'xlsx',
  smtp_app_password TEXT,
  webhook_active BOOLEAN DEFAULT false,
  webhook_url TEXT,
  sheet_url TEXT,
  month_nav TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ===== QUICK TEMPLATES TABLE =====
CREATE TABLE IF NOT EXISTS quick_templates (
  id SERIAL PRIMARY KEY,
  user_id TEXT DEFAULT 'default',
  label TEXT NOT NULL,
  activity TEXT CHECK (activity IN ('Work', 'Meeting')) DEFAULT 'Work',
  title TEXT,
  project TEXT,
  place TEXT,
  is_favorite BOOLEAN DEFAULT false,
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ===== SYNC LOG TABLE =====
CREATE TABLE IF NOT EXISTS sync_log (
  id SERIAL PRIMARY KEY,
  user_id TEXT DEFAULT 'default',
  sync_type TEXT CHECK (sync_type IN ('webhook_send', 'webhook_receive', 'sheets_import')),
  status TEXT CHECK (status IN ('success', 'error', 'pending')),
  row_count INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ===== INDEXES =====
-- Log row indexes
CREATE INDEX IF NOT EXISTS idx_log_row_date ON log_row (date DESC, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_log_row_user ON log_row(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_log_row_stamped ON log_row(user_id, is_stamped_in) WHERE is_stamped_in = true;

-- User settings indexes
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Project info indexes
CREATE INDEX IF NOT EXISTS idx_project_info_user_active ON project_info(user_id, is_active);

-- Quick templates indexes
CREATE INDEX IF NOT EXISTS idx_quick_templates_user ON quick_templates(user_id, display_order);

-- Sync log indexes
CREATE INDEX IF NOT EXISTS idx_sync_log_user_time ON sync_log(user_id, created_at DESC);

-- ===== SEED DATA (Optional) =====
-- Insert default quick templates if none exist
INSERT INTO quick_templates (user_id, label, activity, title, place, display_order)
SELECT 'default', 'Miljøarbeider på felt', 'Work', 'Miljøarbeid', 'Felt', 0
WHERE NOT EXISTS (SELECT 1 FROM quick_templates WHERE user_id = 'default' AND label = 'Miljøarbeider på felt');

INSERT INTO quick_templates (user_id, label, activity, title, place, display_order)
SELECT 'default', 'Miljøarbeider på bolig', 'Work', 'Miljøarbeid', 'Bolig', 1
WHERE NOT EXISTS (SELECT 1 FROM quick_templates WHERE user_id = 'default' AND label = 'Miljøarbeider på bolig');

INSERT INTO quick_templates (user_id, label, activity, title, display_order)
SELECT 'default', 'Møte', 'Meeting', 'Møte', 2
WHERE NOT EXISTS (SELECT 1 FROM quick_templates WHERE user_id = 'default' AND label = 'Møte');

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Schema migration completed successfully';
END $$;
