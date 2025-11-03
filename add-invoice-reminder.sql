-- Quick command to add invoice_reminder_active column
-- Copy and paste this entire line into your database console:

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS invoice_reminder_active BOOLEAN DEFAULT false;
