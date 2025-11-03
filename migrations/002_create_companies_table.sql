-- Migration: Create companies table for storing company data with logos
-- Run with: psql $DATABASE_URL -f migrations/002_create_companies_table.sql

CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  logo_base64 TEXT,
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
CREATE INDEX IF NOT EXISTS idx_companies_order ON companies(display_order);

-- Insert initial companies (Kinoa logo will be added separately)
INSERT INTO companies (name, display_order) VALUES
  ('Kinoa', 1)
ON CONFLICT (name) DO NOTHING;
