-- Add invoice reminder setting to user_settings
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS invoice_reminder_active BOOLEAN DEFAULT false;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Invoice reminder column added successfully';
END $$;
