-- Add theme mode and view mode preferences to user_settings
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS theme_mode TEXT DEFAULT 'dark' CHECK (theme_mode IN ('light', 'dark'));
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS view_mode TEXT DEFAULT 'month' CHECK (view_mode IN ('week', 'month'));
