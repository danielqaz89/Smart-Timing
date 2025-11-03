-- Migration: Add Google OAuth2 fields to user_settings table
-- This allows users to authenticate with their own Google account instead of using a service account

ALTER TABLE user_settings 
  ADD COLUMN IF NOT EXISTS google_access_token TEXT,
  ADD COLUMN IF NOT EXISTS google_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS google_token_expiry TIMESTAMP;

-- Add index for checking token expiry
CREATE INDEX IF NOT EXISTS idx_user_settings_google_auth 
  ON user_settings(user_id, google_token_expiry);
