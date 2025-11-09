import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";
const { Pool } = pkg;
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import nodemailer from "nodemailer";
import { syncToKinoaSheet, isKinoaCompany, getOAuth2Client } from "./lib/googleSheets.js";
import { google } from "googleapis";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import crypto from "crypto";
import process from "process";
import formidable from "formidable";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const app = express();
export default app; // Allow Vercel (@vercel/node) to use the Express app as a handler
const JWT_SECRET = process.env.JWT_SECRET || 'smart-timing-secret-change-in-production';
const ADMIN_SESSION_HOURS = 24;

// Server health tracking
let serverStartTime = Date.now();
let isShuttingDown = false;
const allowedOrigins = (process.env.FRONTEND_ORIGINS || "https://smart-timing-git-main-daniel-qazis-projects.vercel.app,http://localhost:3000,http://127.0.0.1:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const allowedOriginSuffixes = (process.env.FRONTEND_ORIGIN_SUFFIXES || ".vercel.app")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  req.requestId = requestId;
  
  // Log request
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} [ID: ${requestId}]`);
  
  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'ERROR' : 'INFO';
    console.log(`[${logLevel}] ${req.method} ${req.path} ${res.statusCode} - ${duration}ms [ID: ${requestId}]`);
  });
  
  next();
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // non-browser clients
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (allowedOriginSuffixes.some((suf) => origin.endsWith(suf))) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET","POST","PUT","DELETE","OPTIONS"],
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' })); // Prevent payload too large errors

// Serve uploaded media files
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('✅ Created uploads directory');
}
app.use('/uploads', express.static(uploadsDir));

// Global error handler for JSON parsing errors
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('Bad JSON:', err.message);
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  next(err);
});

// Database connection pool with stability settings
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum pool size
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Timeout if connection takes more than 10 seconds
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Handle pool errors to prevent crashes
pool.on('error', (err, client) => {
  console.error('Unexpected database pool error:', err);
  // Don't exit process, just log the error
});

// Test database connection on startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  } else {
    console.log('✅ Database connected at', res.rows[0].now);
  }
});
async function initTables(){
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    
    -- Companies table
    CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      logo_base64 TEXT,
      display_order INT DEFAULT 0,
      enforce_hourly_rate BOOLEAN DEFAULT FALSE,
      enforced_hourly_rate NUMERIC(10,2),
      enforce_timesheet_recipient BOOLEAN DEFAULT FALSE,
      enforced_timesheet_to TEXT,
      enforced_timesheet_cc TEXT,
      enforced_timesheet_bcc TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Company users table (link between companies and app users by email)
    CREATE TABLE IF NOT EXISTS company_users (
      id SERIAL PRIMARY KEY,
      company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      user_email TEXT NOT NULL,
      google_email TEXT,
      role TEXT CHECK (role IN ('member','admin','case_manager')) DEFAULT 'member',
      approved BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(company_id, user_email)
    );

    -- User cases table (multiple client IDs per company user)
    CREATE TABLE IF NOT EXISTS user_cases (
      id SERIAL PRIMARY KEY,
      company_user_id INT NOT NULL REFERENCES company_users(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(company_user_id, case_id)
    );

    -- Company invites table
    CREATE TABLE IF NOT EXISTS company_invites (
      id SERIAL PRIMARY KEY,
      company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      invited_email TEXT NOT NULL,
      role TEXT CHECK (role IN ('member','admin','case_manager')) DEFAULT 'member',
      token TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
      expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days'),
      used_at TIMESTAMP,
      invited_by INT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Company audit log (advanced)
    CREATE TABLE IF NOT EXISTS company_audit_log (
      id SERIAL PRIMARY KEY,
      company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      actor_company_user_id INT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      details JSONB,
      prev_data JSONB,
      new_data JSONB,
      request_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      prev_hash TEXT,
      hash TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    
    -- Project info table (enhanced)
    CREATE TABLE IF NOT EXISTS project_info(
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
    
    -- Log rows table (enhanced)
    CREATE TABLE IF NOT EXISTS log_row(
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
    
    -- User settings table (new)
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
      invoice_reminder_active BOOLEAN DEFAULT false,
      theme_mode TEXT DEFAULT 'dark' CHECK (theme_mode IN ('light', 'dark')),
      view_mode TEXT DEFAULT 'month' CHECK (view_mode IN ('week', 'month')),
      language TEXT DEFAULT 'no' CHECK (language IN ('no','en')),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    -- Quick templates table (new)
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
    
    -- Sync log table (new)
    CREATE TABLE IF NOT EXISTS sync_log (
      id SERIAL PRIMARY KEY,
      user_id TEXT DEFAULT 'default',
      sync_type TEXT CHECK (sync_type IN ('webhook_send', 'webhook_receive', 'sheets_import')),
      status TEXT CHECK (status IN ('success', 'error', 'pending')),
      row_count INT DEFAULT 0,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    
    -- Admin users table
    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK (role IN ('super_admin', 'admin', 'moderator')) DEFAULT 'admin',
      is_active BOOLEAN DEFAULT true,
      last_login TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    -- Admin audit log table
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id SERIAL PRIMARY KEY,
      admin_id INT REFERENCES admin_users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      details JSONB,
      ip_address TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    
    -- System settings table (for CMS control)
    CREATE TABLE IF NOT EXISTS system_settings (
      id SERIAL PRIMARY KEY,
      setting_key TEXT UNIQUE NOT NULL,
      setting_value JSONB,
      description TEXT,
      updated_by INT REFERENCES admin_users(id),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    -- CMS Pages table (for landing page content)
    CREATE TABLE IF NOT EXISTS cms_pages (
      id SERIAL PRIMARY KEY,
      page_id TEXT,
      page_name TEXT,
      sections JSONB NOT NULL DEFAULT '[]'::jsonb,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_published BOOLEAN DEFAULT false,
      updated_by INT REFERENCES admin_users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    -- CMS Themes table (for global and company themes)
    CREATE TABLE IF NOT EXISTS cms_themes (
      id SERIAL PRIMARY KEY,
      theme_id TEXT UNIQUE NOT NULL,
      theme_name TEXT NOT NULL,
      theme_type TEXT CHECK (theme_type IN ('global', 'company')) DEFAULT 'global',
      company_id INT DEFAULT NULL,
      colors JSONB NOT NULL DEFAULT '{}'::jsonb,
      typography JSONB NOT NULL DEFAULT '{}'::jsonb,
      spacing JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN DEFAULT true,
      updated_by INT REFERENCES admin_users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    -- CMS Translations table (for i18n)
    CREATE TABLE IF NOT EXISTS cms_translations (
      id SERIAL PRIMARY KEY,
      translation_key TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      no TEXT,
      en TEXT,
      updated_by INT REFERENCES admin_users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    -- CMS Media Library table (for uploaded files)
    CREATE TABLE IF NOT EXISTS cms_media (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INT NOT NULL,
      url TEXT NOT NULL,
      uploaded_by INT REFERENCES admin_users(id),
      created_at TIMESTAMP DEFAULT NOW()
    );
    
    -- CMS Contact Submissions table (for landing page contact form)
    CREATE TABLE IF NOT EXISTS cms_contact_submissions (
      id SERIAL PRIMARY KEY,
      page_id TEXT NOT NULL,
      form_id TEXT,
      fields JSONB NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      status TEXT CHECK (status IN ('new', 'processed', 'error')) DEFAULT 'new',
      error_message TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    -- Company Requests table (for public company registration requests)
    CREATE TABLE IF NOT EXISTS company_requests (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      orgnr TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      address_line TEXT,
      postal_code TEXT,
      city TEXT,
      requester_email TEXT,
      status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
      notes TEXT,
      processed_by INT REFERENCES admin_users(id),
      processed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  
  // CMS translations table
  await pool.query(`
    -- Templates for company documents (HTML/CSS + handlebars)
    CREATE TABLE IF NOT EXISTS company_document_templates (
      id SERIAL PRIMARY KEY,
      company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      template_type TEXT CHECK (template_type IN ('timesheet','report','case_report')) NOT NULL,
      engine TEXT DEFAULT 'html',
      template_html TEXT NOT NULL,
      template_css TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(company_id, template_type)
    );

    -- Case Reports table (for user-written monthly case reports)
    CREATE TABLE IF NOT EXISTS case_reports (
      id SERIAL PRIMARY KEY,
      user_cases_id INT NOT NULL REFERENCES user_cases(id) ON DELETE CASCADE,
      company_user_id INT NOT NULL REFERENCES company_users(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL,
      month TEXT NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
      background TEXT,
      actions TEXT,
      progress TEXT,
      challenges TEXT,
      factors TEXT,
      assessment TEXT,
      recommendations TEXT,
      notes TEXT,
      status TEXT CHECK (status IN ('draft','submitted','approved','rejected')) DEFAULT 'draft',
      submitted_at TIMESTAMP,
      approved_by INT REFERENCES company_users(id),
      approved_at TIMESTAMP,
      rejection_reason TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_cases_id, month)
    );

  `);

  // CMS themes table
  await pool.query(`
  `);

  // CMS pages table
  await pool.query(`
  `);

  // CMS contact submissions table (stores contact form entries)
  await pool.query(`
  `);
  
  // Alter existing tables (safe, only adds if not exists) - run separately
  await pool.query(`
    -- Relax/extend role constraints to include case_manager
    DO $$ BEGIN
      ALTER TABLE company_users DROP CONSTRAINT IF EXISTS company_users_role_check;
      EXCEPTION WHEN others THEN NULL;
    END $$;
    DO $$ BEGIN
      ALTER TABLE company_users ADD CONSTRAINT company_users_role_check CHECK (role IN ('member','admin','case_manager'));
      EXCEPTION WHEN others THEN NULL;
    END $$;
    DO $$ BEGIN
      ALTER TABLE company_invites DROP CONSTRAINT IF EXISTS company_invites_role_check;
      EXCEPTION WHEN others THEN NULL;
    END $$;
    DO $$ BEGIN
      ALTER TABLE company_invites ADD CONSTRAINT company_invites_role_check CHECK (role IN ('member','admin','case_manager'));
      EXCEPTION WHEN others THEN NULL;
    END $$;

    ALTER TABLE project_info ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT 'default';
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS enforce_hourly_rate BOOLEAN DEFAULT FALSE;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS enforced_hourly_rate NUMERIC(10,2);
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS enforce_timesheet_recipient BOOLEAN DEFAULT FALSE;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS enforced_timesheet_to TEXT;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS enforced_timesheet_cc TEXT;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS enforced_timesheet_bcc TEXT;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS email_method TEXT CHECK (email_method IN ('gmail','smtp'));
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS smtp_host TEXT;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS smtp_port INT;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS smtp_secure BOOLEAN;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS smtp_user TEXT;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS smtp_pass TEXT;
    ALTER TABLE company_document_templates ADD COLUMN IF NOT EXISTS template_css TEXT;
    ALTER TABLE project_info ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    ALTER TABLE project_info ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
    ALTER TABLE project_info ADD COLUMN IF NOT EXISTS bedrift TEXT;
    ALTER TABLE log_row ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT 'default';
    ALTER TABLE log_row ADD COLUMN IF NOT EXISTS is_stamped_in BOOLEAN DEFAULT false;
    ALTER TABLE log_row ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
    ALTER TABLE log_row ADD COLUMN IF NOT EXISTS expense_coverage NUMERIC(10,2) DEFAULT 0;
    ALTER TABLE log_row ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
    ALTER TABLE log_row ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
    ALTER TABLE log_row ADD COLUMN IF NOT EXISTS case_id TEXT;
    ALTER TABLE log_row ADD COLUMN IF NOT EXISTS company_user_id INT REFERENCES company_users(id) ON DELETE SET NULL;
    ALTER TABLE company_users ADD COLUMN IF NOT EXISTS google_access_token TEXT;
    ALTER TABLE company_users ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
    ALTER TABLE company_users ADD COLUMN IF NOT EXISTS google_token_expiry TIMESTAMP;
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS invoice_reminder_active BOOLEAN DEFAULT false;
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS theme_mode TEXT DEFAULT 'dark';
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS view_mode TEXT DEFAULT 'month';
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'no';
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS google_access_token TEXT;
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS google_token_expiry TIMESTAMP;

    -- Reminder configuration (Gmail-based)
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS invoice_reminder_day SMALLINT;
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS invoice_reminder_hour SMALLINT;
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS invoice_reminder_timezone TEXT;
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS invoice_reminder_recipients TEXT;
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS invoice_reminder_attach_pdf BOOLEAN DEFAULT false;
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS invoice_reminder_subject TEXT;
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS invoice_reminder_message TEXT;
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS invoice_reminder_last_sent TIMESTAMP;
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS invoice_reminder_last_month TEXT;

    -- Ensure CMS tables have columns required by indexes and code (legacy DB compat)
    ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS page_id TEXT;
    ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS page_name TEXT;
    ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;
    ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS sections JSONB;
    ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS meta JSONB;
    ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS updated_by INT;
    ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
    ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

    ALTER TABLE cms_contact_submissions ADD COLUMN IF NOT EXISTS page_id TEXT;
    ALTER TABLE cms_contact_submissions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new';
    ALTER TABLE cms_contact_submissions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
    ALTER TABLE cms_contact_submissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

    ALTER TABLE cms_themes ADD COLUMN IF NOT EXISTS theme_id TEXT;
    ALTER TABLE cms_themes ADD COLUMN IF NOT EXISTS theme_type TEXT;
    ALTER TABLE cms_themes ADD COLUMN IF NOT EXISTS company_id INT;

    ALTER TABLE cms_translations ADD COLUMN IF NOT EXISTS translation_key TEXT;
    ALTER TABLE cms_translations ADD COLUMN IF NOT EXISTS category TEXT;

    ALTER TABLE cms_media ADD COLUMN IF NOT EXISTS uploaded_by INT;
    ALTER TABLE cms_media ADD COLUMN IF NOT EXISTS file_type TEXT;
    ALTER TABLE cms_media ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
  `);
  
  // Backfill missing CMS page_id for older DBs (columns added above)
  try {
    // Check if page_name column exists before attempting UPDATE
    const colCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'cms_pages' AND column_name IN ('page_id', 'page_name')
    `);
    // Avoid referencing page_name to guarantee compatibility
    await pool.query(`
      UPDATE cms_pages
      SET page_id = lower(regexp_replace(id::text, '[^a-z0-9]+', '-', 'g'))
      WHERE (page_id IS NULL OR page_id = '');
    `);
    console.log('✅ CMS page_id backfill completed (from id)');
  } catch (e) {
    console.log('⚠️  CMS page_id backfill skipped:', e.message);
  }
  
  // Create indexes (after columns exist)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
    CREATE INDEX IF NOT EXISTS idx_company_templates_company_type ON company_document_templates(company_id, template_type) WHERE is_active = TRUE;
    CREATE INDEX IF NOT EXISTS idx_company_users_company ON company_users(company_id, approved);
    CREATE INDEX IF NOT EXISTS idx_company_users_email ON company_users(user_email);
    CREATE INDEX IF NOT EXISTS idx_user_cases_user ON user_cases(company_user_id);
    CREATE INDEX IF NOT EXISTS idx_user_cases_case ON user_cases(case_id);
    CREATE INDEX IF NOT EXISTS idx_company_invites_company ON company_invites(company_id, invited_email);
    CREATE INDEX IF NOT EXISTS idx_company_invites_token ON company_invites(token);
    CREATE INDEX IF NOT EXISTS idx_company_audit_company_time ON company_audit_log(company_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_case_reports_user_cases ON case_reports(user_cases_id, month DESC);
    CREATE INDEX IF NOT EXISTS idx_case_reports_company_user ON case_reports(company_user_id, status, month DESC);
    CREATE INDEX IF NOT EXISTS idx_case_reports_case_month ON case_reports(case_id, month);
    CREATE INDEX IF NOT EXISTS idx_case_reports_status ON case_reports(status, submitted_at DESC);

    CREATE INDEX IF NOT EXISTS idx_log_row_date ON log_row (date DESC, start_time DESC);
    CREATE INDEX IF NOT EXISTS idx_log_row_user ON log_row(user_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_log_row_stamped ON log_row(user_id, is_stamped_in) WHERE is_stamped_in = true;
    CREATE INDEX IF NOT EXISTS idx_log_row_archived ON log_row(user_id, is_archived) WHERE is_archived = false;
    CREATE INDEX IF NOT EXISTS idx_log_row_case ON log_row(case_id) WHERE case_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_log_row_company_user ON log_row(company_user_id, date DESC) WHERE company_user_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
    CREATE INDEX IF NOT EXISTS idx_project_info_user_active ON project_info(user_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_quick_templates_user ON quick_templates(user_id, display_order);
    CREATE INDEX IF NOT EXISTS idx_sync_log_user_time ON sync_log(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_user_settings_google_auth ON user_settings(user_id, google_token_expiry);
    CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
    CREATE INDEX IF NOT EXISTS idx_admin_users_active ON admin_users(is_active);
    CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin ON admin_audit_log(admin_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON admin_audit_log(action, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key);
    -- Moved cms_pages indexes to guarded creation below
    CREATE INDEX IF NOT EXISTS idx_cms_themes_theme_id ON cms_themes(theme_id);
    CREATE INDEX IF NOT EXISTS idx_cms_themes_type_company ON cms_themes(theme_type, company_id) WHERE theme_type = 'company';
    CREATE INDEX IF NOT EXISTS idx_cms_translations_key ON cms_translations(translation_key);
    CREATE INDEX IF NOT EXISTS idx_cms_translations_category ON cms_translations(category);
    CREATE INDEX IF NOT EXISTS idx_cms_media_uploaded_by ON cms_media(uploaded_by, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cms_media_file_type ON cms_media(file_type);
    CREATE INDEX IF NOT EXISTS idx_cms_contact_submissions_status ON cms_contact_submissions(status, created_at DESC);
    -- Moved cms_contact_submissions(page_id) to guarded creation below
    CREATE INDEX IF NOT EXISTS idx_company_requests_status ON company_requests(status, created_at DESC);
  `);

  // Seed default translations (idempotent)
  await pool.query(`
    INSERT INTO cms_translations (translation_key, category, no, en)
    VALUES
      ('home.stamping','home','Stempling','Stamping'),
      ('home.add_manual','home','Legg til manuelt','Add manually'),
      ('home.month_metrics','home','Månedsfilter og nøkkeltall','Monthly filter and metrics'),
      ('home.copy_previous_row','home','Kopier forrige rad','Copy previous row'),
      ('home.stamp_in','home','Stemple INN','Clock IN'),
      ('home.stamp_out','home','Stemple UT','Clock OUT'),
      ('home.export_pdf','home','Eksporter PDF','Export PDF'),
      ('home.show_archived','home','Vis arkiverte','Show archived'),
      ('home.select_many','home','Velg flere','Select multiple'),
      ('home.cancel','home','Avbryt','Cancel'),
      ('home.send_timesheet','home','Send inn timeliste','Send timesheet'),
      ('home.report_month','home','Skriv en rapport for måneden','Write a monthly report'),
      ('home.files_import','home','Importer timeplan (CSV)','Import schedule (CSV)'),
      ('home.google_sheets_webhook','home','Google Sheets Webhook (toveis)','Google Sheets Webhook (two-way)'),
      ('home.add_workdays_month','home','Legg inn hverdager for måned','Add workdays for month'),
      ('home.search_placeholder','home','Søk i logger (tittel, prosjekt, sted, notater, aktivitet)...','Search logs (title, project, place, notes, activity)...'),
      ('settings.title','settings','Innstillinger','Settings'),
      ('settings.language','settings','Språk','Language'),
      ('portal.dashboard','portal','Dashboard','Dashboard'),
      ('portal.users','portal','Brukere','Users'),
      ('portal.companies','portal','Selskaper','Companies'),
      ('portal.cases','portal','Saker','Cases'),
      ('portal.templates','portal','Maler','Templates'),
      ('portal.reports','portal','Rapporter','Reports'),
      ('portal.invites','portal','Invitasjoner','Invites'),
      ('portal.settings','portal','Innstillinger','Settings'),
      ('admin.dashboard','admin','Dashboard','Dashboard'),
      ('admin.audit_log','admin','Revisjonslogg','Audit Log'),
      ('admin.settings','admin','Innstillinger','Settings'),
      ('admin.cms_pages','admin','CMS Sider','CMS Pages'),
      ('admin.cms_themes','admin','CMS Tema','CMS Themes'),
      ('admin.cms_translations','admin','CMS Oversettelser','CMS Translations'),
      ('admin.cms_media','admin','CMS Media','CMS Media'),
      ('admin.users','admin','Brukere','Users'),
      ('admin.companies','admin','Selskaper','Companies'),
      ('admin.admins','admin','Administratorer','Admins'),
      ('portal.title','portal','Bedriftsportal','Company Portal'),
      ('admin.title','admin','Smart Timing Admin','Smart Timing Admin'),
      ('common.logout','common','Logg ut','Logout'),
      ('common.switch_to_english','common','Bytt til engelsk','Switch to English'),
      ('common.switch_to_norwegian','common','Bytt til Norsk','Switch to Norwegian'),
      ('setup.title','setup','Prosjektinformasjon','Project information'),
      ('setup.edit_title','setup','Rediger prosjektinformasjon','Edit project information'),
      ('setup.completed','setup','Oppsett fullført','Setup completed'),
      ('app.name','app','Smart Stempling','Smart Stamping'),
      ('nav.reports','nav','Rapporter','Reports'),
      ('nav.project','nav','Prosjekt','Project'),
      -- Admin Companies
      ('admin.companies.title','admin','Selskaper','Companies'),
      ('admin.companies.new_company','admin','Ny bedrift','New Company'),
      ('admin.companies.users_label','admin','brukere','users'),
      ('admin.companies.company_users','admin','Bedriftsbrukere','Company Users'),
      ('admin.companies.add_user','admin','Legg til bruker','Add User'),
      ('admin.companies.no_users','admin','Ingen brukere ennå','No users yet'),
      ('admin.companies.create_title','admin','Opprett ny bedrift','Create New Company'),
      ('admin.companies.add_user_to','admin','Legg til bruker i','Add User to'),
      -- Admin Users
      ('admin.users.title','admin','Brukeradministrasjon','User Management'),
      ('admin.users.search_label','admin','Søk etter brukere','Search users'),
      ('admin.users.search_placeholder','admin','Søk etter bruker-ID...','Search by user ID...'),
      ('admin.users.none','admin','Ingen brukere funnet','No users found'),
      ('admin.users.no_activity','admin','Ingen aktivitet','No activity'),
      ('admin.users.delete_user','admin','Slett bruker','Delete user'),
      ('admin.users.delete_title','admin','Slett bruker','Delete User'),
      ('admin.users.delete_confirm','admin','Er du sikker på at du vil slette denne brukeren permanent? Dette kan ikke angres.','Are you sure you want to permanently delete this user? This cannot be undone.'),
      -- Admin Common
      ('admin.common.super_admin_only','admin','Kun for superadmin','Super admin only'),
      -- Admin Dashboard
      ('admin.dashboard.total_users','admin','Antall brukere','Total Users'),
      ('admin.dashboard.total_logs','admin','Antall logger','Total Logs'),
      ('admin.dashboard.total_projects','admin','Antall prosjekter','Total Projects'),
      ('admin.dashboard.total_hours','admin','Totalt antall timer','Total Hours Logged'),
      ('admin.dashboard.system_stats','admin','Systemstatistikk','System Statistics'),
      ('admin.dashboard.active_users','admin','Aktive brukere (med logger)','Active Users (with logs)'),
      ('admin.dashboard.users_with_projects','admin','Brukere med prosjekter','Users with Projects'),
      ('admin.dashboard.active_projects','admin','Aktive prosjekter','Active Projects'),
      ('admin.dashboard.active_months','admin','Aktive måneder','Active Months'),
      ('admin.dashboard.most_active','admin','Mest aktive brukere (siste 7 dager)','Most Active Users (Last 7 Days)'),
      ('admin.dashboard.no_activity_7d','admin','Ingen aktivitet siste 7 dager','No activity in the last 7 days'),
      -- Admin Login
      ('admin.login.title','admin','Admin-innlogging','Admin Login'),
      ('admin.login.username_or_email','admin','Brukernavn eller e-post','Username or Email'),
      ('admin.login.password','admin','Passord','Password'),
      ('admin.login.submit','admin','Logg inn','Login'),
      ('admin.login.default_creds','admin','Standard påloggingsinfo: admin / Admin@123','Default credentials: admin / Admin@123'),
      -- Fields
      ('fields.company_name','fields','Bedriftsnavn','Company Name'),
      ('fields.display_order','fields','Visningsrekkefølge','Display Order'),
      ('fields.logo_base64_optional','fields','Logo Base64 (valgfritt)','Logo Base64 (optional)'),
      ('fields.user_email','fields','Bruker-e-post','User Email'),
      ('fields.google_email_optional','fields','Google e-post (valgfritt)','Google Email (optional)'),
      ('fields.role','fields','Rolle','Role'),
      -- Roles
      ('roles.member','roles','Medlem','Member'),
      ('roles.case_manager','roles','Saksbehandler','Case Manager'),
      ('roles.admin','roles','Administrator','Admin'),
      -- Table
      ('table.email','table','E-post','Email'),
      ('table.google_email','table','Google e-post','Google Email'),
      ('table.role','table','Rolle','Role'),
      ('table.status','table','Status','Status'),
      ('table.cases','table','Saker','Cases'),
      ('table.actions','table','Handlinger','Actions'),
      ('table.user_id','table','Bruker-ID','User ID'),
      ('table.since','table','Siden','Since'),
      ('table.logs','table','Logger','Logs'),
      ('table.projects','table','Prosjekter','Projects'),
      ('table.hourly_rate','table','Timesats','Hourly Rate'),
      ('table.last_activity','table','Siste aktivitet','Last Activity'),
      ('table.theme','table','Tema','Theme'),
      -- Common extra
      ('common.approved','common','Godkjent','Approved'),
      ('common.pending','common','Venter','Pending'),
      ('common.approve','common','Godkjenn','Approve'),
      ('common.cancel','common','Avbryt','Cancel'),
      ('common.create','common','Opprett','Create'),
      ('common.refresh','common','Oppdater','Refresh'),
      ('common.delete_permanently','common','Slett permanent','Delete Permanently'),
      ('common.last_updated','common','Sist oppdatert:','Last updated:'),
      ('common.add','common','Legg til','Add'),
      ('common.close','common','Lukk','Close'),
      ('common.delete','common','Slett','Delete'),
      -- Fields extended
      ('fields.case_id','fields','Saksnummer','Case number'),
      ('fields.notes_optional','fields','Notater (valgfritt)','Notes (optional)'),
      ('fields.email','fields','E-post','Email'),
      -- Placeholders
      ('placeholders.email_to','placeholders','mottaker@firma.no','recipient@company.com'),
      ('placeholders.email_cc','placeholders','cc@firma.no','cc@company.com'),
      ('placeholders.email_bcc','placeholders','bcc@firma.no','bcc@company.com'),
      -- Portal Users
      ('portal.users.title','portal','Brukere','Users'),
      ('portal.users.assign_case','portal','Tildel sak','Assign case'),
      -- Portal Cases
      ('portal.cases.title','portal','Saksadministrasjon','Case management'),
      ('portal.cases.search_placeholder','portal','Søk etter bruker eller saks-ID...','Search by user or case ID...'),
      ('portal.cases.user','portal','Bruker','User'),
      ('portal.cases.assigned_cases','portal','Tildelte saker','Assigned cases'),
      ('portal.cases.no_cases','portal','Ingen saker','No cases'),
      ('portal.cases.add_case','portal','Legg til sak','Add case'),
      ('portal.cases.add_case_for','portal','Legg til sak for','Add case for'),
      -- Portal Templates
      ('portal.templates.title','portal','Dokumentmaler','Document Templates'),
      ('portal.templates.tab_timesheet','portal','Timeliste','Timesheet'),
      ('portal.templates.tab_case_report','portal','Saksrapport','Case report'),
      ('portal.templates.editor_html','portal','HTML','HTML'),
      ('portal.templates.editor_css','portal','CSS','CSS'),
      ('portal.templates.placeholder_html','portal','Skriv HTML med Handlebars-variabler...','Write HTML with Handlebars variables...'),
      ('portal.templates.placeholder_css','portal','Skriv CSS...','Write CSS...'),
      ('portal.templates.variables_hint','portal','Tilgjengelige variabler: {{company.name}}, {{period.month_label}}, {{totals.total_hours}}, {{per_case}}, {{report.*}}','Available variables: {{company.name}}, {{period.month_label}}, {{totals.total_hours}}, {{per_case}}, {{report.*}}'),
      ('portal.templates.save','portal','Lagre mal','Save template'),
      ('portal.templates.saved','portal','Mal lagret!','Template saved!'),
      ('portal.templates.save_failed','portal','Kunne ikke lagre mal','Failed to save template'),
      -- Portal Reports
      ('portal.reports.title','portal','Saksrapporter','Case reports'),
      ('portal.reports.user','portal','Bruker','User'),
      ('portal.reports.case','portal','Saksnr','Case no.'),
      ('portal.reports.month','portal','Måned','Month'),
      ('portal.reports.status','portal','Status','Status'),
      ('portal.reports.submitted','portal','Innsendt','Submitted'),
      ('portal.reports.view_title','portal','Rapport','Report'),
      ('portal.reports.background','portal','Bakgrunn','Background'),
      ('portal.reports.actions_done','portal','Tiltak gjennomført','Actions done'),
      ('portal.reports.progress','portal','Fremgang','Progress'),
      ('portal.reports.challenges','portal','Utfordringer','Challenges'),
      ('portal.reports.assessment','portal','Vurdering','Assessment'),
      ('portal.reports.recommendations','portal','Anbefalinger','Recommendations'),
      ('portal.reports.reject_title','portal','Avslå rapport','Reject report'),
      ('portal.reports.reason','portal','Begrunnelse','Reason'),
      ('portal.reports.reject','portal','Avslå','Reject'),
      ('portal.reports.approve_confirm','portal','Godkjenn denne rapporten?','Approve this report?'),
      -- Portal Invites
      ('portal.invites.title','portal','Invitasjoner','Invites'),
      ('portal.invites.new','portal','Ny invitasjon','New invite'),
      ('portal.invites.created','portal','Opprettet','Created'),
      ('portal.invites.accepted','portal','Akseptert','Accepted'),
      ('portal.invites.resend','portal','Send på nytt','Resend'),
      ('portal.invites.resent','portal','Invitasjon sendt på nytt','Invite resent'),
      ('portal.invites.create_title','portal','Opprett invitasjon','Create invite'),
      ('portal.invites.delete_confirm','portal','Sikker på at du vil slette invitasjonen?','Are you sure you want to delete the invite?'),
      -- Portal Settings
      ('portal.settings.title','portal','Innstillinger','Settings'),
      ('portal.settings.hourly_policy_title','portal','Timesats-policy','Hourly rate policy'),
      ('portal.settings.hourly_policy_desc','portal','Når aktivert, vil alle brukere måtte bruke den fastsatte timesatsen i sine rapporter.','When enabled, all users must use the enforced hourly rate in their reports.'),
      ('portal.settings.enforce_hourly','portal','Påtving fast timesats','Enforce fixed hourly rate'),
      ('portal.settings.timesheet_policy_title','portal','Timeliste-mottaker policy','Timesheet recipient policy'),
      ('portal.settings.timesheet_policy_desc','portal','Når aktivert, vil alle timelister sendes til de fastsatte mottakerne (brukerne kan ikke endre dette).','When enabled, all timesheets are sent to enforced recipients (users cannot change this).'),
      ('portal.settings.enforce_recipients','portal','Påtving faste mottakere','Enforce recipients'),
      ('portal.settings.save','portal','Lagre innstillinger','Save settings'),
      -- Portal Dashboard
      ('portal.dashboard','portal','Dashboard','Dashboard'),
      ('portal.dashboard.users','portal','Brukere','Users'),
      ('portal.dashboard.approvals','portal','Godkjenninger','Approvals'),
      ('portal.dashboard.invites','portal','Invitasjoner','Invites'),
      -- Portal Login & App Login
      ('portal.login.title','portal','Bedriftsportal','Company Portal'),
      ('portal.login.subtitle','portal','Logg inn med bedriftskonto','Sign in with your company account'),
      ('portal.login.password','portal','Passord','Password'),
      ('portal.login.loading','portal','Logger inn...','Signing in...'),
      ('portal.login.submit','portal','Logg inn','Sign in'),
      ('login.subtitle','login','Sign in to manage your time logs','Sign in to manage your time logs'),
      ('login.sign_in_google','login','Logg inn med Google','Sign in with Google'),
      -- Admin Audit
      ('admin.audit.title','admin','Revisjonslogg','Audit Log'),
      ('admin.audit.filter_action','admin','Handling','Action'),
      ('admin.audit.filter_admin_id','admin','Admin-ID','Admin ID'),
      ('common.search','common','Søk','Search'),
      ('common.offset','common','Offset','Offset'),
      ('common.limit','common','Limit','Limit'),
      ('common.prev','common','Forrige','Previous'),
      ('common.next','common','Neste','Next'),
      ('audit.time','audit','Tid','Time'),
      ('audit.admin','audit','Admin','Admin'),
      ('audit.email','audit','Epost','Email'),
      ('audit.action','audit','Handling','Action'),
      ('audit.target','audit','Mål','Target'),
      ('audit.details','audit','Detaljer','Details'),
      ('audit.ip','audit','IP','IP'),
      -- Settings Drawer extras
      ('fields.recipient_email','fields','Mottaker e-post','Recipient email'),
      ('placeholders.recipient_email','placeholders','kunde@bedrift.no','customer@company.com'),
      ('fields.timesheet_format','fields','Timeliste format','Timesheet format'),
      ('fields.format_xlsx','fields','Excel (XLSX)','Excel (XLSX)'),
      ('fields.smtp_app_password','fields','SMTP App-passord','SMTP app password'),
      ('placeholders.optional','placeholders','(valgfritt)','(optional)'),
      ('help.smtp_hint','help','For Gmail/Outlook: Bruk app-spesifikt passord. Vi gjetter SMTP-server fra e-post.','For Gmail/Outlook: Use an app-specific password. SMTP server is inferred from email.'),
      ('settings.invoice_reminder','settings','Aktiver påminnelse om fakturering','Enable invoice reminder'),
      ('help.invoice_reminder','help','Motta automatisk påminnelse om å sende faktura ved månedsslutt.','Receive an automatic reminder to send invoices at month end.'),
      ('settings.webhooks_integrations','settings','🔗 Webhook og Integrasjoner','🔗 Webhook & Integrations'),
      ('fields.enable_webhook','fields','Aktiver webhook','Enable webhook'),
      ('fields.webhook_url','fields','Webhook URL','Webhook URL'),
      ('fields.google_sheets_url','fields','Google Sheets URL','Google Sheets URL'),
      ('help.sheets_picker','help','Eller bruk \'Browse\' for å velge fra Google Drive','Or use \"Browse\" to pick from Google Drive'),
      ('help.webhook_sheets','help','Webhook sender data til eksterne systemer. Sheets-URL for toveis synk.','Webhook sends data to external systems. Sheets URL for two-way sync.'),
      ('settings.admin_system','settings','🔐 Admin og System','🔐 Admin & System'),
      ('settings.admin_panel','settings','Admin Panel','Admin Panel'),
      ('help.admin_panel','help','Tilgang til systemadministrasjon, brukeradministrasjon og analytics.','Access system administration, user management and analytics.'),
      ('settings.gdpr_privacy','settings','GDPR og Personvern','GDPR & Privacy'),
      ('help.gdpr','help','Eksporter dine data eller slett kontoen din (GDPR-rettigheter).','Export your data or delete your account (GDPR rights).'),
      ('settings.save_all','settings','Lagre alle innstillinger','Save all settings'),
      -- Admin CMS titles and fields
      ('admin.cms.pages.title','admin','CMS Sider','CMS Pages'),
      ('admin.cms.themes.title','admin','CMS Temaer','CMS Themes'),
      ('admin.cms.media.title','admin','CMS Media','CMS Media'),
      ('admin.cms.media.upload','admin','Last opp fil','Upload File'),
      ('admin.cms.media.file_uploaded','admin','Fil lastet opp','File uploaded'),
      ('admin.cms.media.file_deleted','admin','Fil slettet','File deleted'),
      ('fields.page_id','fields','Side-ID','Page ID'),
      ('fields.page_name','fields','Sidenavn','Page Name'),
      ('fields.published','fields','Publisert','Published'),
      ('fields.sections_json','fields','Seksjoner (JSON)','Sections (JSON)'),
      ('fields.meta_json','fields','Meta (JSON)','Meta (JSON)'),
      ('fields.theme_id','fields','Tema-ID','Theme ID'),
      ('fields.theme_name','fields','Temanavn','Theme Name'),
      ('fields.colors_json','fields','Farger (JSON)','Colors (JSON)'),
      ('fields.typography_json','fields','Typografi (JSON)','Typography (JSON)'),
      ('fields.spacing_json','fields','Spacing (JSON)','Spacing (JSON)'),
      ('common.load','common','Last','Load'),
      ('common.save','common','Lagre','Save'),
      ('table.key','table','Nøkkel','Key'),
      ('table.value','table','Verdi','Value'),
      ('table.description','table','Beskrivelse','Description'),
      -- Home page extra labels
      ('fields.title_meeting','fields','Tittel / Møte','Title / Meeting'),
      ('fields.project_client','fields','Prosjekt / Kunde','Project / Client'),
      ('fields.place_mode','fields','Sted / Modus','Place / Mode'),
      ('fields.notes','fields','Notater','Notes'),
      ('fields.notes_optional','fields','Notater (valgfritt)','Notes (optional)'),
      ('fields.date','fields','Dato','Date'),
      ('fields.today','fields','I dag','Today'),
      ('fields.yesterday','fields','I går','Yesterday'),
      ('fields.in','fields','Inn','In'),
      ('fields.out','fields','Ut','Out'),
      ('fields.break_hours','fields','Pause (timer)','Break (hours)'),
      ('fields.expense_coverage','fields','Utgiftsdekning (kr)','Expense coverage (NOK)'),
      ('fields.month','fields','Måned','Month'),
      ('filters.week','filters','Uke','Week'),
      ('filters.month','filters','Måned','Month'),
      ('filters.this_month','filters','Denne måneden','This month'),
      ('filters.prev_month','filters','Forrige måned','Previous month'),
      ('filters.this_year','filters','Dette året','This year'),
      ('stats.total_hours_weekdays','stats','Totale timer (man–fre)','Total hours (Mon–Fri)'),
      ('stats.work','stats','Arbeid','Work'),
      ('stats.meetings','stats','Møter','Meetings'),
      ('home.paid_break','home','Betalt pause','Paid break'),
      ('home.unpaid_break','home','Ubetalt pause','Unpaid break'),
      ('fields.hourly_rate','fields','Timesats (kr/t)','Hourly rate (NOK/hr)'),
      ('stats.estimated_salary','stats','Estimert lønn (man–fre)','Estimated salary (Mon–Fri)'),
      ('stats.expenses','stats','Utgiftsdekning','Expenses'),
      ('stats.total_payout','stats','Total utbetaling','Total payout'),
      ('fields.tax_percent','fields','Skatteprosent','Tax percent'),
      ('stats.set_aside_tax','stats','Sett av til skatt','Set aside for tax'),
      ('actions.reset_month','actions','Nullstill denne måneden','Reset this month'),
      ('actions.archive_month','actions','Arkiver denne måneden','Archive this month'),
      ('actions.reset_all','actions','Nullstill hele datasettet','Reset entire dataset'),
      ('home.month_reset','home','Denne måneden nullstilt','This month has been reset'),
      ('home.month_archived','home','Måneden er arkivert','Month archived'),
      ('home.dataset_reset','home','Hele datasettet er nullstilt','Entire dataset has been reset'),
      ('common.select_all','common','Velg alle','Select all'),
      ('common.clear_all','common','Fjern alle','Clear all'),
      ('table.date','table','Dato','Date'),
      ('table.in','table','Inn','In'),
      ('table.out','table','Ut','Out'),
      ('table.break','table','Pause','Break'),
      ('table.activity','table','Aktivitet','Activity'),
      ('table.title','table','Tittel','Title'),
      ('table.project','table','Prosjekt','Project'),
      ('table.place','table','Sted','Place'),
      ('table.notes','table','Notater','Notes'),
      ('table.expenses','table','Utgifter','Expenses'),
      ('helpers.out_after_in','helpers','Ut må være etter Inn','End must be after Start'),
      -- CSV Import / Webhook / Bulk / Reports / Timesheet / Landing
      ('import.format_hint','import','Format: Dato, Inn, Ut, Pause, Aktivitet, Tittel, Prosjekt, Sted, Notater','Format: Date, In, Out, Break, Activity, Title, Project, Place, Notes'),
      ('import.choose_file','import','Velg fil','Choose file'),
      ('import.no_file','import','Ingen fil valgt','No file chosen'),
      ('import.total','import','Totalt','Total'),
      ('import.invalid','import','Ugyldige','Invalid'),
      ('import.ignore_weekend_on','import','Ignorer helg: På','Ignore weekends: On'),
      ('import.ignore_weekend_off','import','Ignorer helg: Av','Ignore weekends: Off'),
      ('import.import','import','Importer','Import'),
      ('import.none','import','Ingen rader å importere','No rows to import'),
      ('import.done','import','Import fullført','Import completed'),
      ('import.rows','import','rader','rows'),
      ('import.failed','import','Import feilet','Import failed'),
      ('import.from_sheets','import','Importer fra Google Sheets','Import from Google Sheets'),
      ('import.sheet_note','import','Oppsett lagres i nettleseren. For import må arket være delt "Anyone with the link" eller publisert.','Settings are saved in your browser. For import, the sheet must be shared "Anyone with the link" or published.'),
      ('sync.enable_on','sync','Aktiver synk: På','Enable sync: On'),
      ('sync.enable_off','sync','Aktiver synk: Av','Enable sync: Off'),
      ('webhook.send_test','webhook','Send testrad','Send test row'),
      ('webhook.test_sent','webhook','Webhook testrad sendt','Webhook test row sent'),
      ('bulk.insert_month','bulk','Legg inn for hele måneden','Insert for the whole month'),
      ('bulk.no_weekdays','bulk','Ingen hverdager i valgt måned','No weekdays in selected month'),
      ('bulk.inserted','bulk','Lagt inn','Inserted'),
      ('bulk.weekdays','bulk','hverdager','weekdays'),
      ('reports.composer_title','reports','Rapportsammenstilling','Report composition'),
      ('reports.template_label','reports','Rapportmal','Report template'),
      ('reports.template_auto','reports','Automatisk (basert på prosjekt)','Automatic (based on project)'),
      ('reports.template_standard','reports','Standard','Standard'),
      ('reports.template_social','reports','Miljøarbeider / Sosialarbeider','Social worker'),
      ('reports.description','reports','Generer en profesjonell månedsrapport i Google Docs med prosjektinfo, statistikk og detaljert logg.','Generate a professional monthly report in Google Docs with project info, stats, and detailed log.'),
      ('reports.write','reports','Skriv rapport','Write report'),
      ('reports.privacy_header','reports','⚠️ Personvernretningslinjer for miljøarbeider','⚠️ Privacy guidelines for social worker'),
      ('reports.intro_optional','reports','Innledning (valgfritt)','Introduction (optional)'),
      ('reports.notes_optional','reports','Tilleggsnotater (valgfritt)','Additional notes (optional)'),
      ('reports.remove_names_first','reports','Fjern navn før generering','Remove names before generating'),
      ('reports.generate_docs','reports','Generer Google Docs rapport','Generate Google Docs report'),
      ('reports.preview_changes','reports','🔍 Forhåndsvisning av endringer','🔍 Preview changes'),
      ('reports.accept_changes','reports','✅ Godta endringer','✅ Accept changes'),
      ('reports.names_replaced','reports','Navn erstattet med generelle betegnelser','Names replaced with generic terms'),
      ('common.generating','common','Genererer...','Generating...'),
      ('timesheet.sent_via_gmail','timesheet','Timeliste sendt via Gmail','Timesheet sent via Gmail'),
      ('timesheet.send_failed','timesheet','Kunne ikke sende','Could not send'),
      ('timesheet.sent_via_smtp','timesheet','Timeliste sendt via SMTP','Timesheet sent via SMTP'),
      ('gmail.connected','gmail','Google-konto tilkoblet','Google account connected'),
      ('timesheet.method','timesheet','Sendemetode','Send method'),
      ('timesheet.gmail_recommended','timesheet','Gmail (anbefalt)','Gmail (recommended)'),
      ('fields.format','fields','Format','Format'),
      ('timesheet.send_via_gmail','timesheet','Send via Gmail','Send via Gmail'),
      ('timesheet.gmail_note','timesheet','E-posten sendes fra din tilkoblede Google-konto.','The email is sent from your connected Google account.'),
      ('fields.sender_email','fields','Avsender e-post','Sender email'),
      ('timesheet.send_via_smtp','timesheet','Send via SMTP','Send via SMTP'),
      ('timesheet.smtp_mode','timesheet','SMTP-modus: ','SMTP mode: '),
      ('timesheet.connect_google_hint','timesheet','Koble til Google-kontoen din for enklere sending, eller ','Connect your Google account for easier sending, or '),
      ('timesheet.smtp_hint','timesheet','Vi gjetter SMTP basert på e-post (Gmail/Outlook/Yahoo/iCloud/Proton m.fl.). Bruk app-passord for Gmail/Outlook.','We infer SMTP from the email (Gmail/Outlook/Yahoo/iCloud/Proton etc.). Use an app password for Gmail/Outlook.'),
      ('landing.loading','landing','Laster...','Loading...'),
      ('landing.error','landing','Kunne ikke laste siden','Failed to load page'),
      ('landing.contact_us','landing','Kontakt oss','Contact us'),
      ('landing.email','landing','E-post','Email'),
      ('landing.phone','landing','Telefon','Phone'),
      ('landing.address','landing','Adresse','Address'),
      ('landing.form_success','landing','Takk! Vi har mottatt meldingen din.','Thanks! We have received your message.'),
      ('landing.form_failed','landing','Kunne ikke sende','Could not send'),
      ('common.send','common','Send','Send'),
      ('landing.privacy','landing','Personvern','Privacy'),
      ('admin.cms.translations.title','admin','CMS Oversettelser','CMS Translations'),
      ('common.save_all','common','Lagre alle','Save All'),
      ('common.reload','common','Last på nytt','Reload'),
      ('table.category','table','Kategori','Category'),
      ('confirm.delete_rows','confirm','Sikker på at du vil slette','Are you sure you want to delete'),
      ('table.rows','table','rader','rows'),
      ('home.stamp_recorded','home','Stempling registrert','Stamp recorded'),
      ('home.stamped_in','home','Stemplet inn','Stamped in'),
      ('home.stamped_out','home','Stemplet ut','Stamped out'),
      ('home.row_added','home','Rad lagt til','Row added'),
      ('home.row_deleted','home','Rad slettet','Row deleted'),
      ('home.change_saved','home','Endring lagret','Change saved'),
      ('home.row_updated','home','Rad oppdatert','Row updated'),
      ('home.copied_previous_row','home','Forrige rad kopiert','Copied previous row'),
      ('home.no_previous_rows','home','Ingen tidligere rader funnet','No previous rows found'),
      ('aria.loading','aria','Laster data...','Loading data...'),
      ('aria.logs_loaded','aria','loggføringer lastet for','logs loaded for'),
      ('reports.names_warning_title','reports','🚨 ADVARSEL: Mulige navn oppdaget!','🚨 WARNING: Possible names detected!'),
      ('reports.names_warning_text','reports','Teksten din ser ut til å inneholde navn som kan identifisere personer:','Your text appears to contain names that can identify individuals:'),
      ('reports.names_auto_replace_question','reports','Skal vi automatisk erstatte disse navnene med generelle betegnelser?','Automatically replace these names with generic terms?'),
      ('reports.fix_auto_button','reports','✅ Fiks automatisk','✅ Fix automatically'),
      ('reports.example_replacement','reports','Eksempel','Example'),
      ('reports.example_boy','reports','Gutten','the boy'),
      ('reports.example_girl','reports','Jenta','the girl'),
      ('reports.example_user','reports','Brukeren','the user'),
      ('reports.cannot_generate_with_pii','reports','⚠️ Kan ikke generere rapport med personidentifiserbar informasjon','⚠️ Cannot generate report with personally identifiable information'),
      ('reports.names_to_replace','reports','Følgende navn vil bli erstattet med generelle betegnelser:','The following names will be replaced with generic terms:'),
      ('reports.text_with_changes','reports','Tekst med endringer markert:','Text with changes highlighted:'),
      -- Project info / Tooltips
      ('project_info.consultant','project_info','Konsulent','Consultant'),
      ('project_info.company','project_info','Bedrift','Company'),
      ('project_info.client','project_info','Oppdragsgiver','Client'),
      ('project_info.measure','project_info','Tiltak','Initiative'),
      ('project_info.period','project_info','Periode','Period'),
      ('tooltips.switch_theme','tooltips','Bytt tema','Switch theme'),
      ('tooltips.view_reports','tooltips','Se rapporter','View reports'),
      ('tooltips.edit_project_info','tooltips','Rediger prosjektinformasjon','Edit project info'),
      ('tooltips.export_pdf','tooltips','Eksporter PDF','Export PDF'),
      -- New tooltips/aria for stamping and setup labels
      ('tooltips.stamp_in','tooltips','Stemple inn','Stamp in'),
      ('tooltips.stamp_out','tooltips','Stemple ut','Stamp out'),
      ('aria.stamp_in','aria','Stemple inn','Stamp in'),
      ('aria.stamp_out','aria','Stemple ut','Stamp out'),
      ('aria.time_since_stamp_in','aria','Tid siden du stemplet inn','Time since you stamped in'),
      ('aria.company_search','aria','Bedrift søk','Company search'),
      ('aria.update_project_info','aria','Oppdater prosjektinfo','Update project info'),
      ('aria.create_project','aria','Opprett prosjekt','Create project'),
      ('home.stamp_in','home','Stemple INN','Stamp IN'),
      ('home.stamp_out','home','Stemple UT','Stamp OUT'),
      ('quick_templates.templates_header','quick_templates','MALER:','TEMPLATES:'),
      ('home.choose_template','home','Velg mal eller aktivitet:','Choose template or activity:'),
      ('stats.work','stats','Arbeid','Work'),
      ('stats.meetings','stats','Møte','Meeting'),
      ('setup.company_search_label','setup','Hvilken bedrift jobber du for?','Which company do you work for?'),
      ('setup.company_search_placeholder','setup','Søk etter bedrift...','Search for company...'),
      ('setup.role_label','setup','Tiltak / Rolle','Initiative / Role'),
      ('setup.role_placeholder','setup','Velg eller skriv din rolle...','Choose or type your role...'),
      ('setup.role_helper','setup','Velg rolle fra listen eller skriv egen. Påvirker rapportmal.','Choose from the list or type your own. Affects report template.'),
      ('setup.period_label','setup','Periode','Period'),
      ('setup.period_placeholder','setup','f.eks. Q1 2025','e.g., Q1 2025'),
      ('setup.client_id_label','setup','Klient ID / Saks nr','Client ID / Case no.'),
      ('setup.client_id_aria','setup','Klient ID eller saksnummer','Client ID or case number'),
      ('setup.email_hint','setup','E-postinnstillinger konfigureres i hovedvinduet under innstillinger.','Email settings are configured in the main window under Settings.'),
      ('setup.update_btn','setup','Oppdater','Update'),
      ('setup.create_btn','setup','Opprett prosjekt','Create project'),
      ('common.cancel','common','Avbryt','Cancel'),
      -- Privacy guidelines bullets/text
      ('reports.important','reports','Viktig','Important'),
      ('reports.no_personal_data','reports','Rapporter skal ikke inneholde personopplysninger.','Reports must not contain personal data.'),
      ('reports.no_names','reports','Ikke bruk navn på klienter','Do not use clients\' names'),
      ('reports.use_generic_terms','reports','Bruk heller generelle betegnelser: "Gutten", "Jenta", "Brukeren", "Deltakeren"','Use generic terms instead: "the boy", "the girl", "the user", "the participant"'),
      ('reports.avoid_identifying_details','reports','Unngå detaljer som kan identifisere personer (alder, adresse, spesifikke situasjoner)','Avoid details that can identify individuals (age, address, specific situations)'),
      ('reports.focus_on_activities_development','reports','Fokuser på aktiviteter og utvikling, ikke identitet','Focus on activities and development, not identity'),
      ('reports.consider_anonymizing_places','reports','Vurder anonymisering av steder hvis nødvendig','Consider anonymizing places if needed'),
      ('reports.gdpr_footer','reports','Disse retningslinjene sikrer GDPR-etterlevelse og beskytter klientenes personvern.','These guidelines ensure GDPR compliance and protect client privacy.'),
      ('reports.template_hint_auto','reports','Malen velges automatisk basert på din rolle i prosjektet.','Template is chosen automatically based on your project role.'),
      ('reports.template_hint_standard','reports','Standard rapport med fokus på arbeidstimer og møter.','Standard report focused on work hours and meetings.'),
      ('reports.template_hint_social','reports','Aktivitetsrapport med fokus på klientmøter og sosiale aktiviteter.','Activity report focused on client meetings and social activities.'),
      -- Composer placeholders and list
      ('reports.intro_placeholder_social','reports','Skriv en innledning til rapporten...\n\nEksempel: I løpet av denne perioden har jeg jobbet med flere brukere gjennom ulike aktiviteter. Fokuset har vært på sosial utvikling og hverdagsmestring.\n\nHusk: Unngå navn og identifiserbar informasjon.','Write an introduction to the report...\n\nExample: During this period I have worked with several users through various activities. The focus has been on social development and everyday coping.\n\nRemember: Avoid names and identifiable information.'),
      ('reports.intro_placeholder_standard','reports','Skriv en innledning til rapporten... \n\nEksempel: Dette er en oppsummering av mine aktiviteter i løpet av måneden. Jeg har fokusert på...','Write an introduction to the report... \n\nExample: This is a summary of my activities during the month. I have focused on...'),
      ('reports.intro_hint','reports','Innledningen vises øverst i rapporten, før prosjektinformasjonen.','The introduction appears at the top of the report, before the project information.'),
      ('reports.intro_anonymize_hint','reports','Husk å anonymisere all informasjon.','Remember to anonymize all information.'),
      ('reports.will_include','reports','Rapporten vil inneholde:','The report will include:'),
      ('reports.includes_title_month','reports','Tittel og måned','Title and month'),
      ('reports.includes_custom_intro','reports','Din egendefinerte innledning','Your custom introduction'),
      ('reports.includes_project_info','reports','Prosjektinformasjon','Project information'),
      ('reports.includes_summary','reports','Sammendrag (timer, dager, aktiviteter)','Summary (hours, days, activities)'),
      ('reports.includes_detailed_log','reports','Detaljert logg med alle registreringer','Detailed log with all entries'),
      ('reports.includes_custom_notes','reports','Dine tilleggsnotater','Your additional notes'),
      ('reports.notes_placeholder_social','reports','Legg til notater på slutten av rapporten...\n\nEksempel: Generelle observasjoner om fremgang, utfordringer i arbeidet, behov for oppfølging, samarbeidspartnere involvert, etc.\n\nHusk: Ikke inkluder personidentifiserbar informasjon.','Add notes at the end of the report...\n\nExample: General observations about progress, challenges in the work, need for follow-up, partners involved, etc.\n\nRemember: Do not include personally identifiable information.'),
      ('reports.notes_placeholder_standard','reports','Legg til notater på slutten av rapporten...\n\nEksempel: Refleksjoner, utfordringer, planlagte tiltak for neste måned, etc.','Add notes at the end of the report...\n\nExample: Reflections, challenges, planned actions for next month, etc.'),
      ('reports.notes_hint','reports','Notater vises nederst i rapporten, etter den detaljerte loggen.','Notes appear at the bottom of the report, after the detailed log.'),
      ('reports.notes_social_hint','reports','Fokuser på generelle mønstre og utvikling, ikke individuelle detaljer.','Focus on general patterns and development, not individual details.'),
      ('reports.docs_footer','reports','Rapporten opprettes som et nytt Google Docs-dokument som du kan redigere videre.','The report is created as a new Google Docs document that you can further edit.'),
      -- Additional common/aria/home keys
      ('common.save_failed','common','Feil ved lagring','Save failed'),
      ('common.deletion_undone','common','Sletting angret','Deletion undone'),
      ('common.change_undone','common','Endring angret','Change undone'),
      ('common.undo','common','Angre','Undo'),
      ('aria.save_changes','aria','Lagre endringer','Save changes'),
      ('aria.cancel_edit','aria','Avbryt redigering','Cancel editing'),
      ('aria.edit_row','aria','Rediger rad','Edit row'),
      ('aria.archive_row','aria','Arkiver rad','Archive row'),
      ('aria.restore_row','aria','Gjenopprett rad','Restore row'),
      ('aria.use_template','aria','Bruk mal','Use template'),
      ('home.row_archived','home','Rad arkivert','Row archived'),
      ('home.row_restored','home','Rad gjenopprettet','Row restored'),
      ('home.no_rows_this_month','home','Ingen rader i denne måneden enda.','No rows in this month yet.'),
      ('reports.connect_google','reports','Koble til Google-kontoen din for å generere rapporter.','Connect your Google account to generate reports.'),
      -- Templates manager and helpers
      ('templates.header','templates','Maler for hurtigstempling','Quick stamping templates'),
      ('templates.subheader','templates','Opprett maler for aktiviteter du gjør ofte','Create templates for activities you do often'),
      ('templates.new','templates','Ny mal','New template'),
      ('templates.edit_title','templates','Rediger mal','Edit template'),
      ('templates.new_title','templates','Ny mal','New template'),
      ('templates.name_label','templates','Navn på mal','Template name'),
      ('templates.name_placeholder','templates','F.eks. "Arbeid på kontoret"','e.g., "Work at the office"'),
      ('templates.name_helper','templates','Dette vises i listen over maler','Shown in the template list'),
      ('templates.saved','templates','Mal lagret','Template saved'),
      ('templates.deleted','templates','Mal slettet','Template deleted'),
      ('confirm.delete_template','confirm','Sikker på at du vil slette','Are you sure you want to delete'),
      ('common.name_activity_required','common','Navn og aktivitet er påkrevd','Name and activity are required'),
      ('helpers.eg_title_meeting','helpers','F.eks. "Prosjektmøte"','e.g., "Project meeting"'),
      ('helpers.eg_project_client','helpers','F.eks. "Kunde A"','e.g., "Client A"'),
      ('helpers.eg_place_mode','helpers','F.eks. "Kontor", "Hjemmekontor", "Felt"','e.g., "Office", "Home office", "Field"'),
      ('setup.org_number','setup','Org.nr:','Org. no:'),
      ('templates.none','templates','Ingen maler enda. Klikk "Ny mal" for å opprette din første mal.','No templates yet. Click "New template" to create your first.'),
      ('aria.delete_template','aria','Slett mal','Delete template'),
      ('common.save','common','Lagre','Save'),
      ('common.error','common','Feil','Error'),
      ('errors.save_project_info_failed','errors','Kunne ikke lagre prosjektinfo','Could not save project info'),
      -- Mobile nav and quick actions
      ('nav.home','nav','Hjem','Home'),
      ('nav.logs','nav','Logger','Logs'),
      ('nav.stats','nav','Statistikk','Stats'),
      ('nav.settings','nav','Innstillinger','Settings'),
      ('aria.go_home','aria','Gå til hjemside','Go to home'),
      ('aria.view_logs','aria','Se alle logger','View all logs'),
      ('aria.view_stats','aria','Se statistikk','View statistics'),
      ('aria.open_settings','aria','Åpne innstillinger','Open settings'),
      ('aria.quick_actions','aria','Hurtighandlinger','Quick actions'),
      ('mobile.quick.stamp_work','mobile','Stemple arbeid','Stamp work'),
      ('mobile.quick.stamp_meeting','mobile','Stemple møte','Stamp meeting'),
      ('mobile.quick.manual_entry','mobile','Manuell registrering','Manual entry'),
      ('mobile.quick.import_csv','mobile','Importer CSV','Import CSV'),
      -- Reports page keys
      ('common.back','common','Tilbake','Back'),
      ('common.unspecified','common','Uspesifisert','Unspecified'),
      ('stats.hours','stats','Timer','Hours'),
      ('reports.hours_per_day','reports','Timer per dag','Hours per day'),
      ('reports.activity_breakdown','reports','Aktivitetsfordeling','Activity breakdown'),
      ('reports.hours_per_project','reports','Timer per prosjekt','Hours per project'),
      -- Sheets picker keys
      ('sheets_picker.failed_load','sheets_picker','Kunne ikke laste Google Picker API','Failed to load Google Picker API'),
      ('sheets_picker.not_ready','sheets_picker','Picker er ikke klar enda','Picker is not ready yet'),
      ('sheets_picker.token_failed','sheets_picker','Kunne ikke hente tilgangstoken. Koble Google-konto først.','Failed to get access token. Please connect your Google account first.'),
      ('sheets_picker.open_failed','sheets_picker','Kunne ikke åpne velgeren','Failed to open picker'),
      ('common.opening','common','Åpner...','Opening...'),
      -- Settings drawer extras
      ('settings.section.language','settings','🌐 Språk','🌐 Language'),
      ('settings.section.pay_tax','settings','💰 Lønn og Skatt','💰 Pay & Tax'),
      ('settings.section.email_timesheet','settings','📧 E-post og Timeliste','📧 Email & Timesheet'),
      ('settings.saved_all','settings','Alle innstillinger lagret','All settings saved'),
      ('fields.paid_break','fields','Betalt pause','Paid break'),
      ('help.paid_break_hint','help','Ved betalt pause trekkes ikke pausetid fra lønnsberegningen.','When paid break is on, break time is not deducted from payroll.'),
      ('placeholders.sender_email','placeholders','din@epost.no','you@example.com'),
      ('common.selected','common','Valgt','Selected'),
      -- Reports KPIs
      ('stats.total_hours','stats','Total timer','Total hours'),
      ('stats.work_days','stats','Arbeidsdager','Work days'),
      ('stats.meetings_total','stats','Møter','Meetings'),
      ('stats.projects','stats','Prosjekter','Projects'),
      ('stats.hours_abbr','stats','t','h'),
      -- Case reports page
      ('portal.login_required_reports','portal','Du må være logget inn i bedriftsportalen for å skrive saksrapporter.','You must be logged into the company portal to write case reports.'),
      ('portal.login_here','portal','Logg inn her','Log in here'),
      ('case_reports.submit_confirm','case_reports','Send inn rapporten for godkjenning?','Submit the report for approval?'),
      ('case_reports.my_reports','case_reports','Mine saksrapporter','My case reports'),
      ('case_reports.rejected_prefix','case_reports','Avslått:','Rejected:'),
      ('case_reports.edit_title','case_reports','Rediger rapport','Edit report'),
      ('case_reports.new_title','case_reports','Ny saksrapport','New case report'),
      ('case_reports.case','case_reports','Sak','Case'),
      ('fields.month','fields','Måned','Month'),
      ('case_reports.background','case_reports','Bakgrunn for tiltaket','Background for the initiative'),
      ('case_reports.actions_label','case_reports','Arbeid og tiltak som er gjennomført','Work and measures carried out'),
      ('case_reports.progress','case_reports','Fremgang og utvikling','Progress and development'),
      ('case_reports.challenges','case_reports','Utfordringer','Challenges'),
      ('case_reports.factors','case_reports','Faktorer som påvirker','Influencing factors'),
      ('case_reports.assessment','case_reports','Vurdering','Assessment'),
      ('case_reports.recommendations','case_reports','Anbefalinger','Recommendations'),
      ('case_reports.save_draft','case_reports','Lagre utkast','Save draft'),
      ('case_reports.status.draft','case_reports','Utkast','Draft'),
      ('case_reports.status.submitted','case_reports','Sendt inn','Submitted'),
      ('case_reports.status.approved','case_reports','Godkjent','Approved'),
      ('case_reports.status.rejected','case_reports','Avslått','Rejected'),
      ('common.edit','common','Rediger','Edit'),
      ('common.submit','common','Send inn','Submit'),
      ('common.update','common','Oppdater','Update'),
      ('case_reports.saved','case_reports','Rapport lagret','Report saved'),
      ('case_reports.submitted','case_reports','Rapport sendt inn','Report submitted'),
      ('case_reports.submit_failed','case_reports','Kunne ikke sende inn','Could not submit'),
      ('case_reports.edit_opened','case_reports','Utkast åpnet for redigering','Draft opened for editing'),
      -- Portal invites toasts
      ('portal.invites.created_toast','portal','Invitasjon opprettet','Invitation created'),
      ('portal.invites.create_failed','portal','Kunne ikke opprette invitasjon','Could not create invitation'),
      ('portal.invites.deleted','portal','Invitasjon slettet','Invitation deleted'),
      ('portal.invites.delete_failed','portal','Kunne ikke slette invitasjon','Could not delete invitation'),
      ('portal.invites.resend_failed','portal','Kunne ikke sende på nytt','Could not resend invitation'),
      -- Admin companies/users toasts
      ('admin.companies.created','admin','Company created','Company created'),
      ('admin.companies.create_failed','admin','Failed to create company','Failed to create company'),
      ('admin.companies.user_added','admin','User added to company','User added to company'),
      ('admin.companies.user_add_failed','admin','Failed to add user','Failed to add user'),
      ('admin.companies.user_removed','admin','User removed','User removed'),
      ('admin.companies.user_remove_failed','admin','Failed to remove user','Failed to remove user'),
      ('admin.companies.user_approved','admin','User approved','User approved'),
      ('admin.companies.user_approve_failed','admin','Failed to approve user','Failed to approve user'),
      ('admin.users.deleted','admin','User deleted','User deleted'),
      ('admin.users.delete_failed','admin','Failed to delete user','Failed to delete user'),
      ('admin.companies.load_failed','admin','Failed to load companies','Failed to load companies'),
      ('admin.companies.load_users_failed','admin','Failed to load company users','Failed to load company users'),
      ('admin.companies.remove_user','admin','Remove user','Remove user'),
      ('admin.companies.approve_user','admin','Approve user','Approve user'),
      ('admin.users.load_failed','admin','Failed to load users','Failed to load users'),
      ('admin.companies.remove_user_confirm','admin','Er du sikker på at du vil fjerne denne brukeren fra selskapet?','Are you sure you want to remove this user from the company?'),
      ('admin.companies.user_removed_undo','admin','Du slettet nettopp denne brukeren. Angre?','You just removed this user. Undo?'),
      ('admin.companies.user_restored','admin','Bruker gjenopprettet','User restored'),
      -- Admin users soft delete/restore
      ('admin.users.archived','admin','User archived','User archived'),
      ('admin.users.archive_failed','admin','Failed to archive user','Failed to archive user'),
      ('admin.users.restored','admin','User restored','User restored'),
      ('admin.users.restore_failed','admin','Failed to restore user','Failed to restore user'),
      ('admin.users.archive_title','admin','Archive User','Archive User'),
      ('admin.users.archive_confirm','admin','Are you sure you want to archive this user? You can undo shortly or restore later.','Are you sure you want to archive this user? You can undo shortly or restore later.'),
      ('admin.users.archive_user','admin','Archive user','Archive user'),
      ('common.archive','common','Arkiver','Archive'),
      ('admin.users.show_archived','admin','Show archived','Show archived'),
      ('admin.users.restore_user','admin','Restore user','Restore user'),
      ('admin.users.filter_status','admin','Status filter','Status filter'),
      ('admin.users.status_active','admin','Active','Active'),
      ('admin.users.status_archived','admin','Archived','Archived'),
      ('admin.users.status_all','admin','All','All'),
      ('admin.users.archived_badge','admin','Archived','Archived')
    ON CONFLICT (translation_key) DO NOTHING
  `);

  // Additional translations for portal email/SMTP help
  await pool.query(`
    INSERT INTO cms_translations (translation_key, category, no, en) VALUES
      ('portal.settings.email_delivery','portal','E-postlevering','Email delivery'),
      ('portal.settings.provider','portal','Leverandør','Provider'),
      ('portal.settings.smtp_help','portal','Trenger hjelp med SMTP?','Need help with SMTP?'),
      ('portal.settings.smtp_host','portal','SMTP Host','SMTP Host'),
      ('portal.settings.port','portal','Port','Port'),
      ('portal.settings.secure_tls','portal','Secure (TLS)','Secure (TLS)'),
      ('portal.settings.user','portal','Bruker','User'),
      ('portal.settings.password_app','portal','Passord (app-passord)','Password (app password)'),
      ('portal.settings.save_email','portal','Lagre e-postinnstillinger','Save email settings'),
      ('portal.settings.send_test_to','portal','Send test til','Send test to'),
      ('portal.settings.gmail_connected','portal','Google tilkoblet','Google connected'),
      ('portal.settings.not_connected','portal','Ikke tilkoblet','Not connected'),
      ('portal.settings.connect_google','portal','Koble til Google','Connect Google'),
      ('portal.settings.disconnect_google','portal','Koble fra','Disconnect'),
      ('portal.onboarding.email_card_title','portal','E-postlevering','Email delivery'),
      ('portal.onboarding.email_card_desc','portal','Velg Gmail eller SMTP som leverandør for utsending av timelister/rapporter og invitasjoner.','Choose Gmail or SMTP as the provider for sending timesheets/reports and invites.'),
      ('portal.onboarding.email_help_btn','portal','Hjelp for SMTP','SMTP help'),
      ('smtp.help.title','portal','Hvor finner vi SMTP-innstillinger?','Where do we find SMTP settings?'),
      ('smtp.help.ask_it','portal','Hvis dere ikke har SMTP-verdiene, spør IT-avdelingen eller e-postleverandøren. Be om følgende:','If you don’t have SMTP values, ask your IT department or email provider. Ask for:'),
      ('smtp.help.providers','portal','Typiske leverandører','Typical providers'),
      ('smtp.help.tip','portal','Tips: Bruk alltid app-spesifikke passord. Del aldri hovedpassord. Dere kan også hoppe over nå og konfigurere senere.','Tip: Always use app-specific passwords. Never share your main password. You can also skip now and configure later.'),
      ('smtp.help.alt_gmail','portal','Alternativ: Velg “Gmail” som leverandør og klikk “Koble til Google”.','Alternative: Choose “Gmail” as provider and click “Connect Google”.')
    ON CONFLICT (translation_key) DO NOTHING
  `);

  // Guarded index creation for legacy DBs (only if columns exist)
  await pool.query(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'cms_pages' AND column_name = 'page_id'
      ) THEN
        CREATE INDEX IF NOT EXISTS idx_cms_pages_page_id ON cms_pages(page_id);
      END IF;
    END $$;
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'cms_pages' AND column_name = 'is_published'
      ) THEN
        CREATE INDEX IF NOT EXISTS idx_cms_pages_published ON cms_pages(is_published);
      END IF;
    END $$;
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'cms_contact_submissions' AND column_name = 'page_id'
      ) THEN
        CREATE INDEX IF NOT EXISTS idx_cms_contact_submissions_page_id ON cms_contact_submissions(page_id);
      END IF;
    END $$;
  `);
  // Ensure archived column exists on user_settings for soft-delete functionality
  await pool.query(`
    ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE INDEX IF NOT EXISTS idx_user_settings_archived ON user_settings(archived);
  `);
  console.log("✅ Tables initialized with persistence schema");
  
  // Create default super admin if none exists
  const adminCheck = await pool.query('SELECT COUNT(*) FROM admin_users WHERE role = $1', ['super_admin']);
  if (parseInt(adminCheck.rows[0].count) === 0) {
    const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123';
    const passwordHash = await bcrypt.hash(defaultAdminPassword, 10);
    await pool.query(
      'INSERT INTO admin_users (username, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      ['admin', 'admin@smarttiming.com', passwordHash, 'super_admin']
    );
    console.log('✅ Default super admin created (username: admin, email: admin@smarttiming.com)');
  }
}

// Puppeteer launcher for PDF (serverless/local)
async function launchPuppeteerBrowser() {
  const isServerless = !!(process.env.AWS_LAMBDA_FUNCTION_VERSION || process.env.VERCEL || process.env.CHROME_EXECUTABLE_PATH);
  try {
    if (isServerless) {
      const chromiumMod = await import('@sparticuz/chromium');
      const puppeteerCoreMod = await import('puppeteer-core');
      const chromium = (chromiumMod.default || chromiumMod);
      const puppeteerCore = (puppeteerCoreMod.default || puppeteerCoreMod);
      const execPath = (await (chromium.executablePath ? chromium.executablePath() : Promise.resolve(process.env.CHROME_EXECUTABLE_PATH))) || process.env.CHROME_EXECUTABLE_PATH;
      const args = chromium.args || ['--no-sandbox','--disable-setuid-sandbox'];
      const defaultViewport = chromium.defaultViewport || null;
      return await puppeteerCore.launch({ args, defaultViewport, executablePath: execPath, headless: true });
    }
    const puppeteerMod = await import('puppeteer');
    const puppeteer = (puppeteerMod.default || puppeteerMod);
    return await puppeteer.launch({ headless: 'new' });
  } catch (e) {
    // Fallback to standard puppeteer with safe flags
    const puppeteerMod = await import('puppeteer');
    const puppeteer = (puppeteerMod.default || puppeteerMod);
    return await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'], headless: 'new' });
  }
}

// ===== ADMIN MIDDLEWARE =====
// Verify JWT token and extract admin user
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.adminUser = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Check if admin has required role
function requireAdminRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.adminUser) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!allowedRoles.includes(req.adminUser.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Log admin action to audit trail
async function logAdminAction(adminId, action, targetType, targetId, details, ipAddress) {
  try {
    await pool.query(
      'INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details, ip_address) VALUES ($1, $2, $3, $4, $5, $6)',
      [adminId, action, targetType, targetId, JSON.stringify(details), ipAddress]
    );
  } catch (e) {
    console.error('Failed to log admin action:', e);
  }
}

app.get("/",(_,r)=>r.send("✅ Smart Stempling backend is running"));
app.get("/api/logs", async (req, res) => {
  const { month, archived } = req.query;
  const showArchived = archived === 'true';
  const archiveFilter = showArchived ? "is_archived = true" : "(is_archived = false OR is_archived IS NULL)";
  
  if (month) {
    const rows = (
      await pool.query(
        `SELECT * FROM log_row WHERE to_char(date,'YYYYMM')=$1 AND ${archiveFilter} ORDER BY date DESC, start_time DESC`,
        [String(month)]
      )
    ).rows;
    return res.json(rows);
  }
  // Default: current month only, not archived
  const rows = (
    await pool.query(
      `SELECT * FROM log_row WHERE date >= date_trunc('month', now()) AND ${archiveFilter} ORDER BY date DESC, start_time DESC`
    )
  ).rows;
  res.json(rows);
});

// Helper: fetch logs for a month
async function getLogsForMonth(yyyymm){
  const rows = (
    await pool.query(
      "SELECT * FROM log_row WHERE to_char(date,'YYYYMM')=$1 ORDER BY date ASC, start_time ASC",
      [String(yyyymm)]
    )
  ).rows;
  return rows;
}

function guessSmtpByEmail(email){
  const domain = String(email || "").split("@")[1] || "";
  const m = domain.toLowerCase();
  if (m.includes("gmail.com") || m.includes("googlemail.com")) return { host: "smtp.gmail.com", port: 465, secure: true };
  if (m.includes("outlook.com") || m.includes("hotmail.com") || m.includes("live.com") || m.includes("office365.com") || m.includes("msn.com")) return { host: "smtp.office365.com", port: 587, secure: false };
  if (m.includes("yahoo.com") || m.includes("ymail.com") || m.includes("rocketmail.com")) return { host: "smtp.mail.yahoo.com", port: 465, secure: true };
  if (m.includes("icloud.com") || m.includes("me.com") || m.includes("mac.com")) return { host: "smtp.mail.me.com", port: 587, secure: false };
  if (m.includes("proton.me") || m.includes("protonmail.com")) return { host: "smtp.protonmail.ch", port: 587, secure: false };
  return { host: `smtp.${domain}`, port: 587, secure: false };
}

// POST /api/timesheet/send { month: 'YYYYMM', senderEmail, recipientEmail, format: 'xlsx'|'pdf', smtpPass? }
app.post("/api/timesheet/send", async (req, res) => {
  // Deprecated: use Gmail-based endpoint instead
  return res.status(410).json({ error: 'Deprecated: Use /api/timesheet/send-gmail with Google OAuth' });
  try {
    const { month, senderEmail, recipientEmail, format, smtpPass } = req.body || {};
    if (!month || !senderEmail || !recipientEmail || !format) return res.status(400).json({ error: "Missing fields" });
    const rows = await getLogsForMonth(month);

    let buffer; let filename;
    if (format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(`Timeliste ${month}`);
      ws.columns = [
        { header: 'Dato', key: 'date', width: 12 },
        { header: 'Inn', key: 'start_time', width: 8 },
        { header: 'Ut', key: 'end_time', width: 8 },
        { header: 'Pause', key: 'break_hours', width: 8 },
        { header: 'Aktivitet', key: 'activity', width: 12 },
        { header: 'Tittel', key: 'title', width: 24 },
        { header: 'Prosjekt', key: 'project', width: 18 },
        { header: 'Sted', key: 'place', width: 14 },
        { header: 'Notater', key: 'notes', width: 30 },
      ];
      rows.forEach(r=>ws.addRow(r));
      buffer = await wb.xlsx.writeBuffer();
      filename = `timeliste-${month}.xlsx`;
    } else if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 40 });
      const chunks = [];
      doc.on('data', (d)=>chunks.push(d));
      doc.on('end', async ()=>{
        await sendMail(Buffer.concat(chunks));
      });
      doc.fontSize(18).text(`Timeliste ${month}`, { align: 'left' }).moveDown();
      doc.fontSize(10);
      rows.forEach((r)=>{
        doc.text(`${r.date}  ${String(r.start_time).slice(0,5)}–${String(r.end_time).slice(0,5)}  pause:${r.break_hours}  ${r.activity||''}  ${r.title||''}  ${r.project||''}`);
      });
      doc.end();
      async function sendMail(pdfBuf){
        await deliver(pdfBuf, `timeliste-${month}.pdf`, 'application/pdf');
      }
      return res.json({ ok: true });
    } else {
      return res.status(400).json({ error: 'Invalid format' });
    }

    await deliver(buffer, filename, format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/octet-stream');
    res.json({ ok: true });

    async function deliver(fileBuf, fileName, mime){
      const provider = process.env.SMTP_HOST ? {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
      } : guessSmtpByEmail(senderEmail);
      const authUser = process.env.SMTP_USER || senderEmail;
      const authPass = process.env.SMTP_PASS || smtpPass;
      const transport = nodemailer.createTransport({
        ...provider,
        auth: authPass ? { user: authUser, pass: authPass } : undefined,
      });
      const fromAddr = process.env.EMAIL_FROM || senderEmail;
      await transport.sendMail({
        from: fromAddr,
        to: recipientEmail,
        replyTo: senderEmail,
        subject: `Timeliste ${month}`,
        text: `Hei,\nVedlagt timeliste for ${month}.`,
        attachments: [{ filename: fileName, content: fileBuf, contentType: mime }],
      });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/timesheet/send-gmail - Send timesheet via Gmail API using OAuth2
// Body: { month: 'YYYYMM', recipientEmail, format: 'xlsx'|'pdf', user_id?: 'default' }
app.post("/api/timesheet/send-gmail", async (req, res) => {
  try {
    const { month, recipientEmail, format, user_id = 'default' } = req.body || {};
    if (!month || !recipientEmail || !format) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Fetch user's Google OAuth tokens from database
    const result = await pool.query(
      'SELECT google_access_token, google_refresh_token, google_token_expiry FROM user_settings WHERE user_id = $1',
      [user_id]
    );
    
    const settings = result.rows[0];
    if (!settings?.google_access_token) {
      return res.status(401).json({ error: 'Not authenticated with Google. Please connect your Google account first.' });
    }

    // Set up OAuth2 client with user's tokens
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: settings.google_access_token,
      refresh_token: settings.google_refresh_token,
      expiry_date: settings.google_token_expiry ? new Date(settings.google_token_expiry).getTime() : null,
    });

    // Refresh token if expired
    if (settings.google_token_expiry && new Date(settings.google_token_expiry) < new Date()) {
      if (!settings.google_refresh_token) {
        return res.status(401).json({ error: 'Token expired. Please reconnect your Google account.' });
      }
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);
        // Update tokens in database
        await pool.query(`
          UPDATE user_settings
          SET google_access_token = $1,
              google_token_expiry = $2,
              updated_at = NOW()
          WHERE user_id = $3
        `, [credentials.access_token, credentials.expiry_date ? new Date(credentials.expiry_date) : null, user_id]);
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        return res.status(401).json({ error: 'Failed to refresh token. Please reconnect your Google account.' });
      }
    }

    // Fetch logs for the month
    const rows = await getLogsForMonth(month);
    if (rows.length === 0) {
      return res.status(400).json({ error: 'No logs found for this month' });
    }

    // Generate file buffer
    let buffer, filename, mimeType;
    if (format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(`Timeliste ${month}`);
      ws.columns = [
        { header: 'Dato', key: 'date', width: 12 },
        { header: 'Inn', key: 'start_time', width: 8 },
        { header: 'Ut', key: 'end_time', width: 8 },
        { header: 'Pause', key: 'break_hours', width: 8 },
        { header: 'Aktivitet', key: 'activity', width: 12 },
        { header: 'Tittel', key: 'title', width: 24 },
        { header: 'Prosjekt', key: 'project', width: 18 },
        { header: 'Sted', key: 'place', width: 14 },
        { header: 'Notater', key: 'notes', width: 30 },
      ];
      rows.forEach(r => ws.addRow(r));
      buffer = await wb.xlsx.writeBuffer();
      filename = `timeliste-${month}.xlsx`;
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 40 });
      const chunks = [];
      doc.on('data', (d) => chunks.push(d));
      await new Promise((resolve) => {
        doc.on('end', resolve);
        doc.fontSize(18).text(`Timeliste ${month}`, { align: 'left' }).moveDown();
        doc.fontSize(10);
        rows.forEach((r) => {
          doc.text(`${r.date}  ${String(r.start_time).slice(0,5)}–${String(r.end_time).slice(0,5)}  pause:${r.break_hours}  ${r.activity||''}  ${r.title||''}  ${r.project||''}`);
        });
        doc.end();
      });
      buffer = Buffer.concat(chunks);
      filename = `timeliste-${month}.pdf`;
      mimeType = 'application/pdf';
    } else {
      return res.status(400).json({ error: 'Invalid format' });
    }

    // Get user's email from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const senderEmail = userInfo.data.email;

    // Create email message in RFC 2822 format
    const boundary = '----=_Part_' + Date.now();
    const messageParts = [
      `From: ${senderEmail}`,
      `To: ${recipientEmail}`,
      `Subject: Timeliste ${month}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      '',
      `Hei,\n\nVedlagt timeliste for ${month}.\n\nMed vennlig hilsen,\n${senderEmail}`,
      '',
      `--${boundary}`,
      `Content-Type: ${mimeType}; name="${filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
      buffer.toString('base64'),
      `--${boundary}--`,
    ].join('\r\n');

    // Encode message for Gmail API
    const encodedMessage = Buffer.from(messageParts)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send via Gmail API
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    res.json({ ok: true, message: 'Timesheet sent successfully via Gmail' });
  } catch (e) {
    console.error('Gmail send error:', e);
    res.status(500).json({ error: String(e) });
  }
});

// ===== REMINDERS (GMAIL-ONLY) =====
// Utility: get current date parts in a specific timezone
function getNowPartsInTZ(tz) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day), hour: Number(map.hour) };
}

function yyyymmFromParts(year, month) {
  return String(year).padStart(4, '0') + String(month).padStart(2, '0');
}

function prevMonthYYYYMMInTZ(tz) {
  const { year, month } = getNowPartsInTZ(tz);
  let y = year; let m = month - 1;
  if (m === 0) { m = 12; y = year - 1; }
  return yyyymmFromParts(y, m);
}

function monthLabelNo(yyyymm) {
  const year = yyyymm.slice(0,4);
  const m = Number(yyyymm.slice(4,6));
  const names = ['januar','februar','mars','april','mai','juni','juli','august','september','oktober','november','desember'];
  return `${names[m-1] || m} ${year}`;
}

async function buildTimesheetPdfBuffer(month) {
  const rows = await getLogsForMonth(month);
  const doc = new PDFDocument({ margin: 40 });
  const chunks = [];
  return await new Promise((resolve, reject) => {
    doc.on('data', d => chunks.push(d));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.fontSize(18).text(`Timeliste ${month}`, { align: 'left' }).moveDown();
    doc.fontSize(10);
    rows.forEach((r) => {
      doc.text(`${r.date}  ${String(r.start_time).slice(0,5)}–${String(r.end_time).slice(0,5)}  pause:${r.break_hours}  ${r.activity||''}  ${r.title||''}  ${r.project||''}`);
    });
    doc.end();
  });
}

async function getFreshOAuthClientForUser(user_id) {
  // Fetch user's Google OAuth tokens from database
  const result = await pool.query(
    'SELECT google_access_token, google_refresh_token, google_token_expiry FROM user_settings WHERE user_id = $1',
    [user_id]
  );
  const settings = result.rows[0];
  if (!settings?.google_access_token) {
    throw new Error('Not authenticated with Google. Please connect your Google account first.');
  }
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: settings.google_access_token,
    refresh_token: settings.google_refresh_token,
    expiry_date: settings.google_token_expiry ? new Date(settings.google_token_expiry).getTime() : null,
  });
  if (settings.google_token_expiry && new Date(settings.google_token_expiry) < new Date()) {
    if (!settings.google_refresh_token) {
      throw new Error('Token expired. Please reconnect your Google account.');
    }
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);
    await pool.query(
      `UPDATE user_settings SET google_access_token = $1, google_token_expiry = $2, updated_at = NOW() WHERE user_id = $3`,
      [credentials.access_token, credentials.expiry_date ? new Date(credentials.expiry_date) : null, user_id]
    );
  }
  return oauth2Client;
}

async function sendGmailRaw(user_id, toCsv, subject, bodyText, attachments = []) {
  const oauth2Client = await getFreshOAuthClientForUser(user_id);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();
  const senderEmail = userInfo.data.email;
  const boundary = '----=_Part_' + Date.now();
  const lines = [
    `From: ${senderEmail}`,
    `To: ${toCsv}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
  ];
  if (attachments.length === 0) {
    lines.push('Content-Type: text/plain; charset=UTF-8', '', bodyText);
  } else {
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, '', `--${boundary}`);
    lines.push('Content-Type: text/plain; charset=UTF-8', '', bodyText, '', `--${boundary}`);
    for (let i = 0; i < attachments.length; i++) {
      const a = attachments[i];
      lines.push(
        `Content-Type: ${a.mimeType}; name="${a.filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${a.filename}"`,
        '',
        (a.contentBuffer instanceof Buffer ? a.contentBuffer : Buffer.from(a.contentBuffer)).toString('base64'),
        i === attachments.length - 1 ? `--${boundary}--` : `--${boundary}`
      );
    }
  }
  const message = lines.join('\r\n');
  const encoded = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
  return { from: senderEmail };
}

// POST /api/reminders/run - trigger due reminders for all users
app.post('/api/reminders/run', async (req, res) => {
  try {
    const rows = (await pool.query(
      `SELECT user_id, invoice_reminder_active, invoice_reminder_day, invoice_reminder_hour, invoice_reminder_timezone, invoice_reminder_recipients, invoice_reminder_attach_pdf, invoice_reminder_subject, invoice_reminder_message, invoice_reminder_last_month
       FROM user_settings
       WHERE invoice_reminder_active = TRUE AND COALESCE(archived, FALSE) = FALSE`
    )).rows;

    let sent = 0; const details = [];
    for (const s of rows) {
      const tz = s.invoice_reminder_timezone || 'Europe/Oslo';
      const now = getNowPartsInTZ(tz);
      const daysInMonth = new Date(now.year, now.month, 0).getDate();
      const targetDay = Math.min(Number(s.invoice_reminder_day || 1), daysInMonth);
      const hourOk = (s.invoice_reminder_hour == null) || (Number(s.invoice_reminder_hour) === now.hour);
      if (now.day !== targetDay || !hourOk) continue;

      // Dedupe: only once per month (current month in TZ)
      const currentMonth = yyyymmFromParts(now.year, now.month);
      if (s.invoice_reminder_last_month && s.invoice_reminder_last_month === currentMonth) {
        continue;
      }

      // Resolve recipients
      const toCsv = (s.invoice_reminder_recipients || '').split(',').map(x => x.trim()).filter(Boolean).join(', ');
      let recipients = toCsv;
      if (!recipients) {
        const fallback = await pool.query('SELECT timesheet_recipient FROM user_settings WHERE user_id = $1', [s.user_id]);
        const r = fallback.rows[0]?.timesheet_recipient;
        if (r) recipients = r;
      }
      if (!recipients) { details.push({ user_id: s.user_id, status: 'skipped_no_recipients' }); continue; }

      const prevMonth = prevMonthYYYYMMInTZ(tz);
      const monthLabel = monthLabelNo(prevMonth);
      const subject = s.invoice_reminder_subject || `Påminnelse: Send faktura for ${monthLabel}`;
      const message = s.invoice_reminder_message || `Hei! Dette er en automatisk påminnelse om å sende timeliste/faktura for ${monthLabel}.`;

      const attachments = [];
      if (s.invoice_reminder_attach_pdf) {
        const pdf = await buildTimesheetPdfBuffer(prevMonth);
        attachments.push({ filename: `timeliste-${prevMonth}.pdf`, mimeType: 'application/pdf', contentBuffer: pdf });
      }

      try {
        await sendGmailRaw(s.user_id, recipients, subject, message, attachments);
        await pool.query(
          `UPDATE user_settings SET invoice_reminder_last_sent = NOW(), invoice_reminder_last_month = $2, updated_at = NOW() WHERE user_id = $1`,
          [s.user_id, currentMonth]
        );
        sent++;
        details.push({ user_id: s.user_id, status: 'sent', recipients, month: prevMonth });
      } catch (err) {
        console.error('Reminder send failed for', s.user_id, err);
        details.push({ user_id: s.user_id, status: 'error', error: String(err) });
      }
    }

    res.json({ ok: true, sent, total_candidates: rows.length, details });
  } catch (e) {
    console.error('Reminders run error:', e);
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/reminders/test - send a test reminder immediately
// Body: { user_id?: 'default', recipients?: string, attach_pdf?: boolean, month?: 'YYYYMM', subject?: string, message?: string }
app.post('/api/reminders/test', async (req, res) => {
  try {
    const user_id = req.body?.user_id || 'default';
    const settings = (await pool.query('SELECT invoice_reminder_timezone FROM user_settings WHERE user_id = $1', [user_id])).rows[0] || {};
    const tz = settings.invoice_reminder_timezone || 'Europe/Oslo';
    const month = (req.body?.month && /^\d{6}$/.test(String(req.body.month))) ? String(req.body.month) : prevMonthYYYYMMInTZ(tz);
    const monthLabel = monthLabelNo(month);

    const to = String(req.body?.recipients || '').trim() || (await pool.query('SELECT invoice_reminder_recipients FROM user_settings WHERE user_id = $1', [user_id])).rows[0]?.invoice_reminder_recipients || '';
    if (!to) return res.status(400).json({ error: 'No recipients configured' });
    const subject = req.body?.subject || `Test: Påminnelse for ${monthLabel}`;
    const message = req.body?.message || `Dette er en test av påminnelsesfunksjonen for ${monthLabel}.`;

    const attachments = [];
    const attach = req.body?.attach_pdf === true || req.body?.attach_pdf === 'true';
    if (attach) {
      const pdf = await buildTimesheetPdfBuffer(month);
      attachments.push({ filename: `timeliste-${month}.pdf`, mimeType: 'application/pdf', contentBuffer: pdf });
    }

    await sendGmailRaw(user_id, to, subject, message, attachments);
    res.json({ ok: true, to, month });
  } catch (e) {
    console.error('Reminder test error:', e);
    res.status(500).json({ error: String(e) });
  }
});

app.post("/api/logs",async(req,r)=>{
  const {date,start,end,breakHours,activity,title,project,place,notes,expenseCoverage, case_id, caseId, company_user_id}=req.body || {};
  const resolvedCaseId = case_id ?? caseId ?? null;
  const resolvedCompanyUserId = company_user_id ?? null;
  const res=await pool.query(
    `INSERT INTO log_row (date,start_time,end_time,break_hours,activity,title,project,place,notes,expense_coverage,case_id,company_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [date,start,end,breakHours,activity,title,project,place,notes,expenseCoverage||0, resolvedCaseId, resolvedCompanyUserId]
  );
  r.json(res.rows[0]);
});

// Update a single log row
app.put("/api/logs/:id", async (req, res) => {
  const b = req.body || {};
  const sets = [];
  const values = [];
  function add(col, val){ sets.push(`${col}=$${values.length+1}`); values.push(val); }
  if (b.date !== undefined) add("date", b.date);
  if (b.start !== undefined) add("start_time", b.start);
  if (b.end !== undefined) add("end_time", b.end);
  if (b.breakHours !== undefined) add("break_hours", b.breakHours);
  if (b.activity !== undefined) add("activity", b.activity);
  if (b.title !== undefined) add("title", b.title);
  if (b.project !== undefined) add("project", b.project);
  if (b.place !== undefined) add("place", b.place);
  if (b.notes !== undefined) add("notes", b.notes);
  if (b.expenseCoverage !== undefined) add("expense_coverage", b.expenseCoverage);
  if (b.case_id !== undefined || b.caseId !== undefined) add("case_id", b.case_id ?? b.caseId);
  if (b.company_user_id !== undefined) add("company_user_id", b.company_user_id);
  if (!sets.length) return res.status(400).json({ error: "No fields to update" });
  values.push(req.params.id);
  const q = `UPDATE log_row SET ${sets.join(",")} WHERE id=$${values.length} RETURNING *`;
  const result = await pool.query(q, values);
  res.json(result.rows[0]);
});

// Bulk insert logs
app.post("/api/logs/bulk", async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (rows.length === 0) return res.json({ inserted: 0 });
  const values = [];
  const placeholders = rows
    .map((row, i) => {
      const base = i * 13;
      values.push(
        row.date,
        row.start,
        row.end,
        row.breakHours ?? 0,
        row.activity ?? null,
        row.title ?? null,
        row.project ?? null,
        row.place ?? null,
        row.notes ?? null,
        row.expenseCoverage ?? 0,
        row.case_id ?? row.caseId ?? null,
        row.company_user_id ?? null
      );
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13})`;
    })
    .join(",");
  const q = `INSERT INTO log_row (date,start_time,end_time,break_hours,activity,title,project,place,notes,expense_coverage,case_id,company_user_id) VALUES ${placeholders} RETURNING id`;
  const result = await pool.query(q, values);
  res.json({ inserted: result.rowCount });
});

// Webhook test relay (placeholder for two-way sync)
app.post("/api/webhook/test", async (req, res) => {
  const { webhookUrl, sample } = req.body || {};
  if (!webhookUrl) return res.status(400).json({ error: "Missing webhookUrl" });
  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sample || { ping: true, ts: new Date().toISOString() }),
    });
    res.json({ ok: resp.ok, status: resp.status });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Proxy fetch for CSV (allows Sheets import without CORS issues)
app.get("/api/proxy/fetch-csv", async (req, res) => {
  try {
    const raw = req.query.url;
    if (!raw || typeof raw !== "string") return res.status(400).json({ error: "Missing url" });
    const u = new URL(raw);
    const allowedHosts = new Set(["docs.google.com", "drive.google.com", "storage.googleapis.com"]);
    if (!allowedHosts.has(u.hostname)) {
      return res.status(400).json({ error: "Host not allowed" });
    }
    const resp = await fetch(u.toString());
    const text = await resp.text();
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(text);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
app.delete("/api/logs/:id", async (req, res) => {
  await pool.query("DELETE FROM log_row WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// Archive a log (soft delete)
app.patch("/api/logs/:id/archive", async (req, res) => {
  const result = await pool.query(
    "UPDATE log_row SET is_archived = true, archived_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *",
    [req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: "Log not found" });
  res.json(result.rows[0]);
});

// Unarchive a log
app.patch("/api/logs/:id/unarchive", async (req, res) => {
  const result = await pool.query(
    "UPDATE log_row SET is_archived = false, archived_at = NULL, updated_at = NOW() WHERE id = $1 RETURNING *",
    [req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: "Log not found" });
  res.json(result.rows[0]);
});

// Bulk archive logs by month
app.post("/api/logs/archive-month", async (req, res) => {
  const { month } = req.body;
  if (!month) return res.status(400).json({ error: "Month required (YYYYMM)" });
  const result = await pool.query(
    "UPDATE log_row SET is_archived = true, archived_at = NOW(), updated_at = NOW() WHERE to_char(date,'YYYYMM') = $1 AND (is_archived = false OR is_archived IS NULL) RETURNING id",
    [String(month)]
  );
  res.json({ archived: result.rowCount, month });
});

// Delete logs by month (YYYYMM) or all
app.delete("/api/logs", async (req, res) => {
  const { month, all } = req.query;
  if (month) {
    const m = String(month);
    const result = await pool.query(
      "DELETE FROM log_row WHERE to_char(date,'YYYYMM') = $1",
      [m]
    );
    return res.json({ deleted: result.rowCount, month: m });
  }
  if (all !== undefined) {
    const result = await pool.query("TRUNCATE log_row RESTART IDENTITY");
    return res.json({ ok: true });
  }
  res.status(400).json({ error: "Provide ?month=YYYYMM or ?all=1" });
});

// ✅ Enhanced health-check route with detailed status
app.get("/api/test", (req, res) => {
  res.json({ ok: true, message: "Smart Timing backend is working" });
});

// Advanced health endpoint for monitoring
app.get("/api/health", async (req, res) => {
  try {
    // Check database connectivity
    const dbCheck = await pool.query('SELECT 1 as status');
    const uptime = Math.floor((Date.now() - serverStartTime) / 1000);
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime_seconds: uptime,
      database: dbCheck.rows[0].status === 1 ? 'connected' : 'error',
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB',
      },
      port: PORT,
      node_version: process.version,
    });
  } catch (e) {
    res.status(503).json({
      status: 'unhealthy',
      error: String(e),
      timestamp: new Date().toISOString(),
    });
  }
});

// ===== USER SETTINGS ENDPOINTS =====
// GET /api/settings?user_id=default
app.get("/api/settings", async (req, res) => {
  try {
    const userId = req.query.user_id || 'default';
    const result = await pool.query('SELECT * FROM user_settings WHERE user_id = $1', [userId]);
    if (result.rows.length === 0) {
      // Return defaults if not found
      return res.json({
        user_id: userId,
        paid_break: false,
        tax_pct: 35,
        hourly_rate: 0,
        timesheet_sender: null,
        timesheet_recipient: null,
        timesheet_format: 'xlsx',
        smtp_app_password: null,
        webhook_active: false,
        webhook_url: null,
        sheet_url: null,
        month_nav: null,
        invoice_reminder_active: false,
        invoice_reminder_day: null,
        invoice_reminder_hour: null,
        invoice_reminder_timezone: 'Europe/Oslo',
        invoice_reminder_recipients: null,
        invoice_reminder_attach_pdf: false,
        invoice_reminder_subject: null,
        invoice_reminder_message: null,
        invoice_reminder_last_sent: null,
        invoice_reminder_last_month: null,
        theme_mode: 'dark',
        view_mode: 'month',
        language: 'no',
      });
    }
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// POST/PUT /api/settings - Upsert settings
app.post("/api/settings", async (req, res) => {
  try {
    const userId = req.body.user_id || 'default';
    const {
      paid_break, tax_pct, hourly_rate,
      timesheet_sender, timesheet_recipient, timesheet_format,
      smtp_app_password, webhook_active, webhook_url, sheet_url, month_nav,
      invoice_reminder_active, theme_mode, view_mode, language,
      invoice_reminder_day, invoice_reminder_hour, invoice_reminder_timezone,
      invoice_reminder_recipients, invoice_reminder_attach_pdf,
      invoice_reminder_subject, invoice_reminder_message
    } = req.body || {};
    
    const result = await pool.query(`
      INSERT INTO user_settings (
        user_id, paid_break, tax_pct, hourly_rate,
        timesheet_sender, timesheet_recipient, timesheet_format,
        smtp_app_password, webhook_active, webhook_url, sheet_url, month_nav, 
        invoice_reminder_active, theme_mode, view_mode, language,
        invoice_reminder_day, invoice_reminder_hour, invoice_reminder_timezone,
        invoice_reminder_recipients, invoice_reminder_attach_pdf,
        invoice_reminder_subject, invoice_reminder_message,
        updated_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13, $14, $15, $16,
        $17, $18, $19,
        $20, $21,
        $22, $23,
        NOW()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        paid_break = COALESCE($2, user_settings.paid_break),
        tax_pct = COALESCE($3, user_settings.tax_pct),
        hourly_rate = COALESCE($4, user_settings.hourly_rate),
        timesheet_sender = COALESCE($5, user_settings.timesheet_sender),
        timesheet_recipient = COALESCE($6, user_settings.timesheet_recipient),
        timesheet_format = COALESCE($7, user_settings.timesheet_format),
        smtp_app_password = COALESCE($8, user_settings.smtp_app_password),
        webhook_active = COALESCE($9, user_settings.webhook_active),
        webhook_url = COALESCE($10, user_settings.webhook_url),
        sheet_url = COALESCE($11, user_settings.sheet_url),
        month_nav = COALESCE($12, user_settings.month_nav),
        invoice_reminder_active = COALESCE($13, user_settings.invoice_reminder_active),
        theme_mode = COALESCE($14, user_settings.theme_mode),
        view_mode = COALESCE($15, user_settings.view_mode),
        language = COALESCE($16, user_settings.language),
        invoice_reminder_day = COALESCE($17, user_settings.invoice_reminder_day),
        invoice_reminder_hour = COALESCE($18, user_settings.invoice_reminder_hour),
        invoice_reminder_timezone = COALESCE($19, user_settings.invoice_reminder_timezone),
        invoice_reminder_recipients = COALESCE($20, user_settings.invoice_reminder_recipients),
        invoice_reminder_attach_pdf = COALESCE($21, user_settings.invoice_reminder_attach_pdf),
        invoice_reminder_subject = COALESCE($22, user_settings.invoice_reminder_subject),
        invoice_reminder_message = COALESCE($23, user_settings.invoice_reminder_message),
        updated_at = NOW()
      RETURNING *
    `, [
      userId, paid_break, tax_pct, hourly_rate, timesheet_sender, timesheet_recipient,
      timesheet_format, smtp_app_password, webhook_active, webhook_url, sheet_url, month_nav,
      invoice_reminder_active, theme_mode, view_mode, language,
      invoice_reminder_day, invoice_reminder_hour, invoice_reminder_timezone,
      invoice_reminder_recipients, invoice_reminder_attach_pdf,
      invoice_reminder_subject, invoice_reminder_message,
    ]);
    
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// ===== PROJECT INFO ENDPOINTS =====
// GET /api/project-info?user_id=default
app.get("/api/project-info", async (req, res) => {
  try {
    const userId = req.query.user_id || 'default';
    const result = await pool.query(
      'SELECT * FROM project_info WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    if (result.rows.length === 0) {
      return res.json(null);
    }
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/project-info - Create or update project info
app.post("/api/project-info", async (req, res) => {
  try {
    const userId = req.body.user_id || 'default';
    const { konsulent, bedrift, oppdragsgiver, tiltak, periode, klient_id } = req.body;
    
    // Deactivate old project info
    await pool.query('UPDATE project_info SET is_active = false WHERE user_id = $1', [userId]);
    
    // Insert new
    const result = await pool.query(`
      INSERT INTO project_info (user_id, konsulent, bedrift, oppdragsgiver, tiltak, periode, klient_id, is_active, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
      RETURNING *
    `, [userId, konsulent, bedrift, oppdragsgiver, tiltak, periode, klient_id]);
    
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// PUT /api/project-info/:id - Update existing project info
app.put("/api/project-info/:id", async (req, res) => {
  try {
    const { konsulent, bedrift, oppdragsgiver, tiltak, periode, klient_id } = req.body;
    const result = await pool.query(`
      UPDATE project_info SET
        konsulent = COALESCE($1, konsulent),
        bedrift = COALESCE($2, bedrift),
        oppdragsgiver = COALESCE($3, oppdragsgiver),
        tiltak = COALESCE($4, tiltak),
        periode = COALESCE($5, periode),
        klient_id = COALESCE($6, klient_id),
        updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `, [konsulent, bedrift, oppdragsgiver, tiltak, periode, klient_id, req.params.id]);
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// ===== COMPANIES ENDPOINTS =====
// GET /api/companies - Fetch all companies with logos
app.get("/api/companies", async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, logo_base64, display_order FROM companies ORDER BY display_order ASC, name ASC'
    );
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/companies - Create or update company with logo
app.post("/api/companies", async (req, res) => {
  try {
    const { name, logo_base64, display_order } = req.body;
    if (!name) return res.status(400).json({ error: "Company name is required" });
    
    const result = await pool.query(`
      INSERT INTO companies (name, logo_base64, display_order, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (name) DO UPDATE SET
        logo_base64 = COALESCE($2, companies.logo_base64),
        display_order = COALESCE($3, companies.display_order),
        updated_at = NOW()
      RETURNING *
    `, [name, logo_base64, display_order || 0]);
    
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// ===== QUICK TEMPLATES ENDPOINTS =====
// GET /api/quick-templates?user_id=default
app.get("/api/quick-templates", async (req, res) => {
  try {
    const userId = req.query.user_id || 'default';
    const result = await pool.query(
      'SELECT * FROM quick_templates WHERE user_id = $1 ORDER BY display_order ASC, created_at ASC',
      [userId]
    );
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/quick-templates - Create template
app.post("/api/quick-templates", async (req, res) => {
  try {
    const userId = req.body.user_id || 'default';
    const { label, activity, title, project, place, is_favorite, display_order } = req.body;
    
    const result = await pool.query(`
      INSERT INTO quick_templates (user_id, label, activity, title, project, place, is_favorite, display_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [userId, label, activity || 'Work', title, project, place, is_favorite || false, display_order || 0]);
    
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /api/quick-templates/:id
app.delete("/api/quick-templates/:id", async (req, res) => {
  try {
    await pool.query('DELETE FROM quick_templates WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// ===== GOOGLE OAUTH2 ENDPOINTS =====
// GET /api/auth/google - Initiate Google OAuth2 flow
// Query: { user_id?: 'default' }
app.get("/api/auth/google", async (req, res) => {
  try {
    const user_id = req.query.user_id || 'default';
    const oauth2Client = getOAuth2Client();
    
    // Request all scopes upfront for single authorization
    const scopes = [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/documents', // For Google Docs
      'https://www.googleapis.com/auth/drive.readonly', // For Google Picker
      'https://www.googleapis.com/auth/gmail.send', // For sending emails via Gmail
      'https://www.googleapis.com/auth/userinfo.email', // For user email
    ];
    
    // Generate auth URL with all necessary scopes
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Get refresh token
      scope: scopes,
      state: user_id, // Pass user_id through state parameter
      prompt: 'consent', // Force consent screen to get refresh token
    });
    
    res.json({ authUrl });
  } catch (e) {
    console.error('OAuth initiation error:', e);
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/auth/google/callback - Handle OAuth2 callback from Google
// Query: { code: '...', state: 'user_id' }
app.get("/api/auth/google/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    const rawState = String(state || 'default');
    
    if (!code) {
      return res.status(400).send('Authorization code missing');
    }
    
    const oauth2Client = getOAuth2Client();
    
    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // Company portal email connect flow
    if (rawState.startsWith('company:')) {
      const company_user_id = rawState.split(':')[1];
      if (!company_user_id) {
        return res.redirect(`${frontendUrl}/portal?company_email_auth=error&message=${encodeURIComponent('Invalid state')}`);
      }
      await pool.query(`
        UPDATE company_users
        SET google_access_token = $1,
            google_refresh_token = COALESCE($2, google_refresh_token),
            google_token_expiry = $3,
            updated_at = NOW()
        WHERE id = $4
      `, [
        tokens.access_token,
        tokens.refresh_token || null,
        tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        Number(company_user_id)
      ]);
      return res.redirect(`${frontendUrl}/portal?company_email_auth=success`);
    }

    // Default user-level flow (timesheets/reports/sheets)
    const user_id = rawState || 'default';
    
    // Store tokens in database
    await pool.query(`
      INSERT INTO user_settings (user_id, google_access_token, google_refresh_token, google_token_expiry, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        google_access_token = $2,
        google_refresh_token = COALESCE($3, user_settings.google_refresh_token),
        google_token_expiry = $4,
        updated_at = NOW()
    `, [
      user_id,
      tokens.access_token,
      tokens.refresh_token || null,
      tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    ]);
    
    // Redirect back to frontend with success message
    res.redirect(`${frontendUrl}/?google_auth=success`);
    
  } catch (e) {
    console.error('OAuth callback error:', e);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/?google_auth=error&message=${encodeURIComponent(String(e))}`);
  }
});

// DELETE /api/auth/google/disconnect - Revoke Google OAuth access
// Body: { user_id?: 'default' }
app.delete("/api/auth/google/disconnect", async (req, res) => {
  try {
    const { user_id = 'default' } = req.body;
    
    // Clear tokens from database
    await pool.query(`
      UPDATE user_settings
      SET google_access_token = NULL,
          google_refresh_token = NULL,
          google_token_expiry = NULL,
          updated_at = NOW()
      WHERE user_id = $1
    `, [user_id]);
    
    res.json({ success: true, message: 'Google account disconnected' });
  } catch (e) {
    console.error('Disconnect error:', e);
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/auth/google/status - Check if user has connected Google account
// Query: { user_id?: 'default' }
app.get("/api/auth/google/status", async (req, res) => {
  try {
    const user_id = req.query.user_id || 'default';
    
    const result = await pool.query(
      'SELECT google_access_token, google_token_expiry FROM user_settings WHERE user_id = $1',
      [user_id]
    );
    
    const settings = result.rows[0];
    const isConnected = !!settings?.google_access_token;
    const isExpired = settings?.google_token_expiry ? new Date(settings.google_token_expiry) < new Date() : false;
    
    res.json({
      isConnected,
      isExpired,
      needsReauth: isConnected && isExpired,
    });
  } catch (e) {
    console.error('Status check error:', e);
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/auth/google/token - Get access token for Google Picker
// Query: { user_id?: 'default' }
app.get("/api/auth/google/token", async (req, res) => {
  try {
    const user_id = req.query.user_id || 'default';
    
    const result = await pool.query(
      'SELECT google_access_token, google_refresh_token, google_token_expiry FROM user_settings WHERE user_id = $1',
      [user_id]
    );
    
    const settings = result.rows[0];
    
    if (!settings?.google_access_token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    let accessToken = settings.google_access_token;
    
    // Check if token is expired and refresh if needed
    if (settings.google_token_expiry && new Date(settings.google_token_expiry) < new Date()) {
      if (!settings.google_refresh_token) {
        return res.status(401).json({ error: 'Token expired and no refresh token available' });
      }
      
      try {
        const oauth2Client = getOAuth2Client();
        oauth2Client.setCredentials({
          refresh_token: settings.google_refresh_token,
        });
        
        const { credentials } = await oauth2Client.refreshAccessToken();
        accessToken = credentials.access_token;
        
        // Update token in database
        await pool.query(`
          UPDATE user_settings
          SET google_access_token = $1,
              google_token_expiry = $2,
              updated_at = NOW()
          WHERE user_id = $3
        `, [
          accessToken,
          credentials.expiry_date ? new Date(credentials.expiry_date) : null,
          user_id,
        ]);
      } catch (refreshError) {
        console.error('Token refresh error:', refreshError);
        return res.status(401).json({ error: 'Failed to refresh token' });
      }
    }
    
    res.json({ accessToken });
  } catch (e) {
    console.error('Get token error:', e);
    res.status(500).json({ error: String(e) });
  }
});

// ===== GOOGLE SHEETS SYNC ENDPOINT =====
// POST /api/sheets/sync - Sync logs to Google Sheets (Kinoa Tiltak AS format only)
// Body: { month: 'YYYYMM', user_id?: 'default' }
app.post("/api/sheets/sync", async (req, res) => {
  try {
    const { month, user_id = 'default' } = req.body;
    if (!month) return res.status(400).json({ error: 'Month (YYYYMM) is required' });
    
    // Get user settings (contains sheet_url and OAuth tokens)
    const settingsResult = await pool.query(
      'SELECT * FROM user_settings WHERE user_id = $1',
      [user_id]
    );
    const settings = settingsResult.rows[0];
    
    if (!settings?.sheet_url) {
      return res.status(400).json({ error: 'Google Sheet URL not configured in user settings' });
    }
    
    // Check if user has connected Google account
    if (!settings.google_access_token) {
      return res.status(401).json({ 
        error: 'Google account not connected',
        message: 'Please connect your Google account first',
      });
    }
    
    // Check if token is expired and refresh if needed
    let accessToken = settings.google_access_token;
    let refreshToken = settings.google_refresh_token;
    
    if (settings.google_token_expiry && new Date(settings.google_token_expiry) < new Date()) {
      // Token expired, refresh it
      try {
        const oauth2Client = getOAuth2Client();
        oauth2Client.setCredentials({
          refresh_token: refreshToken,
        });
        
        const { credentials } = await oauth2Client.refreshAccessToken();
        accessToken = credentials.access_token;
        
        // Update tokens in database
        await pool.query(`
          UPDATE user_settings
          SET google_access_token = $1,
              google_token_expiry = $2,
              updated_at = NOW()
          WHERE user_id = $3
        `, [
          accessToken,
          credentials.expiry_date ? new Date(credentials.expiry_date) : null,
          user_id,
        ]);
      } catch (refreshError) {
        console.error('Token refresh error:', refreshError);
        return res.status(401).json({ 
          error: 'Failed to refresh Google authentication',
          message: 'Please reconnect your Google account',
        });
      }
    }
    
    // Get active project info
    const projectResult = await pool.query(
      'SELECT * FROM project_info WHERE user_id = $1 AND is_active = true LIMIT 1',
      [user_id]
    );
    const projectInfo = projectResult.rows[0];
    
    if (!projectInfo) {
      return res.status(400).json({ error: 'No active project found' });
    }
    
    // Check if this is a Kinoa company (only sync for Kinoa Tiltak AS)
    if (!isKinoaCompany(projectInfo.bedrift)) {
      return res.status(400).json({ 
        error: `Google Sheets sync is only available for Kinoa Tiltak AS. Current company: ${projectInfo.bedrift}` 
      });
    }
    
    // Get logs for the specified month
    const logsResult = await pool.query(
      `SELECT * FROM log_row 
       WHERE user_id = $1 
       AND to_char(date, 'YYYYMM') = $2 
       ORDER BY date ASC, start_time ASC`,
      [user_id, String(month)]
    );
    const logs = logsResult.rows;
    
    if (logs.length === 0) {
      return res.status(400).json({ error: 'No logs found for the specified month' });
    }
    
    // Perform sync with OAuth tokens
    const result = await syncToKinoaSheet(settings.sheet_url, projectInfo, logs, accessToken, refreshToken);
    
    // Log sync to sync_log table
    await pool.query(`
      INSERT INTO sync_log (user_id, sync_type, status, row_count)
      VALUES ($1, 'sheets_import', 'success', $2)
    `, [user_id, result.rowsAdded]);
    
    res.json({
      success: true,
      message: `Synced ${result.rowsAdded} log entries to Google Sheets`,
      ...result,
    });
    
  } catch (e) {
    console.error('Google Sheets sync error:', e);
    
    // Log error to sync_log table
    try {
      const user_id = req.body?.user_id || 'default';
      await pool.query(`
        INSERT INTO sync_log (user_id, sync_type, status, error_message)
        VALUES ($1, 'sheets_import', 'error', $2)
      `, [user_id, String(e)]);
    } catch (logError) {
      console.error('Failed to log sync error:', logError);
    }
    
    res.status(500).json({ 
      error: 'Failed to sync to Google Sheets',
      details: String(e),
    });
  }
});

// ===== GOOGLE DOCS REPORT ENDPOINT =====
// POST /api/reports/generate - Generate monthly report as Google Doc
// Body: { month: 'YYYYMM', user_id?: 'default' }
app.post("/api/reports/generate", async (req, res) => {
  try {
    const { month, user_id = 'default', template = 'auto', customIntro, customNotes } = req.body;
    if (!month) return res.status(400).json({ error: 'Month (YYYYMM) is required' });
    
    // Get user settings and OAuth tokens
    const settingsResult = await pool.query(
      'SELECT * FROM user_settings WHERE user_id = $1',
      [user_id]
    );
    const settings = settingsResult.rows[0];
    
    if (!settings?.google_access_token) {
      return res.status(401).json({ 
        error: 'Google account not connected',
        message: 'Please connect your Google account first',
      });
    }
    
    // Set up OAuth2 client with user's tokens
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: settings.google_access_token,
      refresh_token: settings.google_refresh_token,
      expiry_date: settings.google_token_expiry ? new Date(settings.google_token_expiry).getTime() : null,
    });
    
    // Refresh token if expired
    if (settings.google_token_expiry && new Date(settings.google_token_expiry) < new Date()) {
      if (!settings.google_refresh_token) {
        return res.status(401).json({ error: 'Token expired. Please reconnect your Google account.' });
      }
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);
        await pool.query(`
          UPDATE user_settings
          SET google_access_token = $1,
              google_token_expiry = $2,
              updated_at = NOW()
          WHERE user_id = $3
        `, [credentials.access_token, credentials.expiry_date ? new Date(credentials.expiry_date) : null, user_id]);
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        return res.status(401).json({ error: 'Failed to refresh token. Please reconnect your Google account.' });
      }
    }
    
    // Get active project info
    const projectResult = await pool.query(
      'SELECT * FROM project_info WHERE user_id = $1 AND is_active = true LIMIT 1',
      [user_id]
    );
    const projectInfo = projectResult.rows[0];
    
    if (!projectInfo) {
      return res.status(400).json({ error: 'No active project found. Please set up your project first.' });
    }
    
    // Determine template type based on project info
    let isMiljøarbeider = false;
    if (template === 'auto') {
      // Auto-detect from konsulent, tiltak, or bedrift fields
      const searchText = `${projectInfo.konsulent || ''} ${projectInfo.tiltak || ''} ${projectInfo.bedrift || ''}`.toLowerCase();
      isMiljøarbeider = searchText.includes('miljøarbeider') || 
                       searchText.includes('sosialarbeider') ||
                       searchText.includes('aktivitør') ||
                       searchText.includes('miljøterapeut') ||
                       searchText.includes('tiltaksleder');
    } else if (template === 'miljøarbeider') {
      isMiljøarbeider = true;
    }
    // else template === 'standard', isMiljøarbeider stays false
    
    // Get logs for the specified month
    const logsResult = await pool.query(
      `SELECT * FROM log_row 
       WHERE user_id = $1 
       AND to_char(date, 'YYYYMM') = $2 
       ORDER BY date ASC, start_time ASC`,
      [user_id, String(month)]
    );
    const logs = logsResult.rows;
    
    if (logs.length === 0) {
      return res.status(400).json({ error: 'No logs found for the specified month' });
    }
    
    // Calculate statistics
    const totalHours = logs.reduce((sum, log) => {
      const start = new Date(`2000-01-01T${log.start_time}`);
      const end = new Date(`2000-01-01T${log.end_time}`);
      const hours = (end - start) / (1000 * 60 * 60) - (log.break_hours || 0);
      return sum + hours;
    }, 0);
    
    const workDays = new Set(logs.map(log => log.date.toISOString().split('T')[0])).size;
    const meetings = logs.filter(log => log.activity === 'Meeting').length;
    const workSessions = logs.filter(log => log.activity === 'Work').length;
    
    // Format month for display
    const monthNames = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
    const year = month.slice(0, 4);
    const monthNum = parseInt(month.slice(4, 6), 10) - 1;
    const monthName = monthNames[monthNum];
    const displayMonth = `${monthName} ${year}`;
    
    // Create Google Docs API client
    const docs = google.docs({ version: 'v1', auth: oauth2Client });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    // Create new document
    const createResponse = await docs.documents.create({
      requestBody: {
        title: `Rapport for ${displayMonth} - ${projectInfo.konsulent}`,
      },
    });
    
    const documentId = createResponse.data.documentId;
    const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;
    
    // Build document content with role-specific formatting
    const requests = [];
    
    // Title - apply formatting after text insertion
    requests.push({
      insertText: {
        location: { index: 1 },
        text: isMiljøarbeider ? 
          `Aktivitetsrapport for Miljøarbeider\n${displayMonth}\n\n` :
          `Månedlig Rapport\n${displayMonth}\n\n`,
      },
    });
    
    // Add privacy notice for miljøarbeider reports
    if (isMiljøarbeider) {
      requests.push({
        insertText: {
          location: { index: 1 },
          text: `PERSONVERN: Denne rapporten inneholder ingen personidentifiserbar informasjon i tråd med GDPR-krav. Klienter er omtalt med generelle betegnelser.\n\n`,
        },
      });
    }
    
    // Add custom introduction if provided
    if (customIntro) {
      requests.push({
        insertText: {
          location: { index: 1 },
          text: `${customIntro}\n\n`,
        },
      });
    }
    
    // Project information section
    requests.push({
      insertText: {
        location: { index: 1 },
        text: `Prosjektinformasjon\n`,
      },
    });
    
    requests.push(
      {
        insertText: {
          location: { index: 1 },
          text: `Konsulent: ${projectInfo.konsulent || 'N/A'}\n`,
        },
      },
      {
        insertText: {
          location: { index: 1 },
          text: `Bedrift: ${projectInfo.bedrift || 'N/A'}\n`,
        },
      },
      {
        insertText: {
          location: { index: 1 },
          text: `Oppdragsgiver: ${projectInfo.oppdragsgiver || 'N/A'}\n`,
        },
      },
      {
        insertText: {
          location: { index: 1 },
          text: `Tiltak: ${projectInfo.tiltak || 'N/A'}\n`,
        },
      },
      {
        insertText: {
          location: { index: 1 },
          text: `Klient ID: ${projectInfo.klient_id || 'N/A'}\n`,
        },
      },
      {
        insertText: {
          location: { index: 1 },
          text: `Periode: ${projectInfo.periode || 'N/A'}\n\n`,
        },
      }
    );
    
    // Statistics - role-specific
    requests.push(
      {
        insertText: {
          location: { index: 1 },
          text: `Sammendrag\n`,
        },
      },
      {
        insertText: {
          location: { index: 1 },
          text: `Totalt antall timer: ${totalHours.toFixed(2)}\n`,
        },
      },
      {
        insertText: {
          location: { index: 1 },
          text: `Arbeidsdager: ${workDays}\n`,
        },
      }
    );
    
    // Add role-specific statistics
    if (isMiljøarbeider) {
      requests.push(
        {
          insertText: {
            location: { index: 1 },
            text: `Klientmøter: ${meetings} møter\n`,
          },
        },
        {
          insertText: {
            location: { index: 1 },
            text: `Aktiviteter: ${workSessions} aktiviteter\n\n`,
          },
        }
      );
    } else {
      requests.push(
        {
          insertText: {
            location: { index: 1 },
            text: `Arbeid: ${workSessions} økter\n`,
          },
        },
        {
          insertText: {
            location: { index: 1 },
            text: `Møter: ${meetings} møter\n\n`,
          },
        }
      );
    }
      // Logs table header - role-specific
      requests.push({
        insertText: {
          location: { index: 1 },
          text: isMiljøarbeider ? `Aktivitetslogg\n` : `Detaljert Logg\n`,
        },
      });
      
      if (isMiljøarbeider) {
        requests.push({
          insertText: {
            location: { index: 1 },
            text: `Dato\tTid\tVarighet\tType\tBeskrivelse\tKlient\tSted\tNotater\n`,
          },
        });
      } else {
        requests.push({
          insertText: {
            location: { index: 1 },
            text: `Dato\tInn\tUt\tPause\tAktivitet\tTittel\tProsjekt\tSted\n`,
          },
        });
      }
    
    // Add log entries - role-specific formatting
    logs.forEach(log => {
      const dateStr = new Date(log.date).toLocaleDateString('no-NO');
      const startTime = String(log.start_time).slice(0, 5);
      const endTime = String(log.end_time).slice(0, 5);
      const breakHours = log.break_hours || 0;
      const activity = log.activity === 'Work' ? 'Arbeid' : 'Møte';
      const title = log.title || '-';
      const project = log.project || '-';
      const place = log.place || '-';
      const notes = log.notes || '-';
      
      // Calculate duration
      const start = new Date(`2000-01-01T${log.start_time}`);
      const end = new Date(`2000-01-01T${log.end_time}`);
      const durationHours = ((end - start) / (1000 * 60 * 60) - breakHours).toFixed(2);
      
      if (isMiljøarbeider) {
        // Miljøarbeider format: focus on activities and client interactions
        const activityType = log.activity === 'Meeting' ? 'Klientmøte' : 'Aktivitet';
        requests.push({
          insertText: {
            location: { index: 1 },
            text: `${dateStr}\t${startTime}-${endTime}\t${durationHours}t\t${activityType}\t${title}\t${project}\t${place}\t${notes}\n`,
          },
        });
      } else {
        // Standard format
        requests.push({
          insertText: {
            location: { index: 1 },
            text: `${dateStr}\t${startTime}\t${endTime}\t${breakHours}h\t${activity}\t${title}\t${project}\t${place}\n`,
          },
        });
      }
    });
    
    // Add custom notes at the end if provided
    if (customNotes) {
      requests.push({
        insertText: {
          location: { index: 1 },
          text: `\n\nTilleggsnotater\n${customNotes}\n`,
        },
      });
    }
    
    // Apply formatting and content
    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests: requests.reverse() },
    });
    
    res.json({
      success: true,
      documentId,
      documentUrl,
      message: `Rapport opprettet for ${displayMonth}`,
      reportType: isMiljøarbeider ? 'miljøarbeider' : 'standard',
      stats: {
        totalHours,
        workDays,
        meetings,
        workSessions,
        logCount: logs.length,
      },
    });
    
  } catch (e) {
    console.error('Google Docs report generation error:', e);
    res.status(500).json({ 
      error: 'Failed to generate report',
      details: String(e),
    });
  }
});

// ===== ADMIN AUTHENTICATION ENDPOINTS =====
// POST /api/admin/login - Admin login
app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const result = await pool.query(
      'SELECT * FROM admin_users WHERE (username = $1 OR email = $1) AND is_active = true',
      [username]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const admin = result.rows[0];
    const validPassword = await bcrypt.compare(password, admin.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Update last login
    await pool.query('UPDATE admin_users SET last_login = NOW() WHERE id = $1', [admin.id]);
    
    // Generate JWT token
    const token = jwt.sign(
      { id: admin.id, username: admin.username, email: admin.email, role: admin.role },
      JWT_SECRET,
      { expiresIn: `${ADMIN_SESSION_HOURS}h` }
    );
    
    await logAdminAction(admin.id, 'admin_login', 'session', null, { username }, req.ip);
    
    res.json({
      success: true,
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        last_login: admin.last_login,
      },
    });
  } catch (e) {
    console.error('Admin login error:', e);
    res.status(500).json({ error: 'Login failed', details: String(e) });
  }
});

// POST /api/admin/register - Create new admin (super_admin only)
app.post("/api/admin/register", authenticateAdmin, requireAdminRole('super_admin'), async (req, res) => {
  try {
    const { username, email, password, role = 'admin' } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password required' });
    }
    
    if (!['admin', 'moderator', 'super_admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    // Check if username or email already exists
    const existing = await pool.query(
      'SELECT id FROM admin_users WHERE username = $1 OR email = $2',
      [username, email]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO admin_users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role, created_at',
      [username, email, passwordHash, role]
    );
    
    await logAdminAction(
      req.adminUser.id,
      'admin_created',
      'admin_user',
      result.rows[0].id,
      { username, email, role },
      req.ip
    );
    
    res.json({ success: true, admin: result.rows[0] });
  } catch (e) {
    console.error('Admin registration error:', e);
    res.status(500).json({ error: 'Registration failed', details: String(e) });
  }
});

// GET /api/admin/profile - Get current admin profile
app.get("/api/admin/profile", authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, role, is_active, last_login, created_at FROM admin_users WHERE id = $1',
      [req.adminUser.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    
    res.json(result.rows[0]);
  } catch (e) {
    console.error('Admin profile fetch error:', e);
    res.status(500).json({ error: 'Failed to fetch profile', details: String(e) });
  }
});

// PUT /api/admin/profile/password - Change admin password
app.put("/api/admin/profile/password", authenticateAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    
    // Fetch current admin
    const result = await pool.query(
      'SELECT id, password_hash FROM admin_users WHERE id = $1',
      [req.adminUser.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    
    const admin = result.rows[0];
    
    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Hash new password and update
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE admin_users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newPasswordHash, admin.id]
    );
    
    await logAdminAction(
      req.adminUser.id,
      'password_changed',
      'admin_user',
      admin.id,
      {},
      req.ip
    );
    
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (e) {
    console.error('Password change error:', e);
    res.status(500).json({ error: 'Password change failed', details: String(e) });
  }
});






// ===== COMPANY USER MANAGEMENT (ADMIN) =====
// GET /api/admin/companies/:companyId/users - List users for a company (with cases)
app.get("/api/admin/companies/:companyId/users", authenticateAdmin, requireAdminRole('super_admin', 'admin', 'moderator'), async (req, res) => {
  try {
    const companyId = Number(req.params.companyId);
    const users = (await pool.query(`
      SELECT cu.id, cu.user_email, cu.google_email, cu.role, cu.approved,
             cu.created_at, cu.updated_at,
             COALESCE(json_agg(json_build_object('id', uc.id, 'case_id', uc.case_id, 'notes', uc.notes) ORDER BY uc.created_at)
                      FILTER (WHERE uc.id IS NOT NULL), '[]') AS cases
      FROM company_users cu
      LEFT JOIN user_cases uc ON uc.company_user_id = cu.id
      WHERE cu.company_id = $1
      GROUP BY cu.id
      ORDER BY cu.created_at DESC
    `, [companyId])).rows;
    res.json({ users });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/admin/companies/:companyId/users - Add user to company
app.post("/api/admin/companies/:companyId/users", authenticateAdmin, requireAdminRole('super_admin', 'admin'), async (req, res) => {
  try {
    const companyId = Number(req.params.companyId);
    const { user_email, google_email, role = 'member', approved = false } = req.body || {};
    if (!user_email) return res.status(400).json({ error: 'user_email is required' });
    const result = await pool.query(`
      INSERT INTO company_users (company_id, user_email, google_email, role, approved)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (company_id, user_email)
      DO UPDATE SET google_email = COALESCE($3, company_users.google_email), role = COALESCE($4, company_users.role), approved = COALESCE($5, company_users.approved), updated_at = NOW()
      RETURNING *
    `, [companyId, user_email, google_email || null, role, approved]);
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// PATCH /api/admin/companies/:companyId/users/:id - Update user (approve, role, emails)
app.patch("/api/admin/companies/:companyId/users/:id", authenticateAdmin, requireAdminRole('super_admin', 'admin', 'moderator'), async (req, res) => {
  try {
    const { id } = req.params;
    const { approved, role, google_email } = req.body || {};
    const updates = [];
    const vals = [];
    if (approved !== undefined) { updates.push(`approved = $${updates.length+1}`); vals.push(Boolean(approved)); }
    if (role !== undefined) { updates.push(`role = $${updates.length+1}`); vals.push(role); }
    if (google_email !== undefined) { updates.push(`google_email = $${updates.length+1}`); vals.push(google_email); }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    vals.push(id);
    const result = await pool.query(`UPDATE company_users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${vals.length} RETURNING *`, vals);
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /api/admin/companies/:companyId/users/:id - Remove user from company
app.delete("/api/admin/companies/:companyId/users/:id", authenticateAdmin, requireAdminRole('super_admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM company_users WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/admin/companies/:companyId/users/:id/cases - Add case to user
app.post("/api/admin/companies/:companyId/users/:id/cases", authenticateAdmin, requireAdminRole('super_admin', 'admin', 'moderator'), async (req, res) => {
  try {
    const { id } = req.params;
    const { case_id, notes } = req.body || {};
    if (!case_id) return res.status(400).json({ error: 'case_id is required' });
    const result = await pool.query(`
      INSERT INTO user_cases (company_user_id, case_id, notes)
      VALUES ($1, $2, $3)
      ON CONFLICT (company_user_id, case_id) DO NOTHING
      RETURNING *
    `, [id, case_id, notes || null]);
    res.json(result.rows[0] || { ok: true, message: 'Already exists' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /api/admin/companies/:companyId/users/:id/cases/:caseId - Remove a case
app.delete("/api/admin/companies/:companyId/users/:id/cases/:caseId", authenticateAdmin, requireAdminRole('super_admin', 'admin'), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM user_cases WHERE company_user_id = $1 AND id = $2', [req.params.id, req.params.caseId]);
    res.json({ deleted: result.rowCount });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// ===== COMPANY PORTAL AUTH (GOOGLE) =====
const COMPANY_SESSION_HOURS = 24;

function authenticateCompany(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET);
    if (decoded?.type !== 'company') return res.status(401).json({ error: 'Invalid token' });
    req.companyUser = decoded; // { company_id, user_id, email, role, type }
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireCompanyRole(...roles) {
  return (req, res, next) => {
    if (!req.companyUser) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.companyUser.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}

// Initiate Google OAuth2 for company portal (email only)
app.get('/api/company/auth/google', async (req, res) => {
  try {
    const oauth2Client = getOAuth2Client();
    const scopes = ['https://www.googleapis.com/auth/userinfo.email'];
    const authUrl = oauth2Client.generateAuthUrl({ access_type: 'online', scope: scopes, prompt: 'consent' });
    res.redirect(authUrl);
  } catch (e) {
    console.error('Company auth init error:', e);
    res.status(500).send('Auth init failed');
  }
});

// Google OAuth2 callback for company portal
app.get('/api/company/auth/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('Missing code');

    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user email
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = String(userInfo.data.email || '').toLowerCase();

    // Match company user by google_email or user_email and approved
    const result = await pool.query(`
      SELECT cu.*, c.name as company_name
      FROM company_users cu
      JOIN companies c ON c.id = cu.company_id
      WHERE (LOWER(cu.google_email) = $1 OR LOWER(cu.user_email) = $1) AND cu.approved = TRUE
      LIMIT 1
    `, [email]);

    if (result.rows.length === 0) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/portal?company_auth=error&message=${encodeURIComponent('Not approved for any company')}`);
    }

    const cu = result.rows[0];
    const token = jwt.sign({ type: 'company', company_id: cu.company_id, user_id: cu.id, email, role: cu.role }, JWT_SECRET, { expiresIn: `${COMPANY_SESSION_HOURS}h` });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/portal?company_auth=success&token=${encodeURIComponent(token)}&company=${encodeURIComponent(cu.company_name)}&role=${encodeURIComponent(cu.role)}`);
  } catch (e) {
    console.error('Company auth callback error:', e);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/portal?company_auth=error&message=${encodeURIComponent(String(e))}`);
  }
});

async function logCompanyAction(companyId, actorId, action, targetType, targetId, details, req, prevData = null, newData = null) {
  try {
    const prev = await pool.query('SELECT hash FROM company_audit_log WHERE company_id = $1 ORDER BY id DESC LIMIT 1', [companyId]);
    const prev_hash = prev.rows[0]?.hash || '';
    const timestamp = new Date().toISOString();
    const payload = prev_hash + '|' + timestamp + '|' + String(action) + '|' + String(targetId || '') + '|' + JSON.stringify(details || {});
    const hash = crypto.createHash('sha256').update(payload).digest('hex');
    await pool.query(
      `INSERT INTO company_audit_log (company_id, actor_company_user_id, action, target_type, target_id, details, prev_data, new_data, request_id, ip_address, user_agent, prev_hash, hash, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [companyId, actorId || null, action, targetType || null, targetId || null, details ? JSON.stringify(details) : null, prevData ? JSON.stringify(prevData) : null, newData ? JSON.stringify(newData) : null, req?.requestId || null, req?.ip || null, req?.headers?.['user-agent'] || null, prev_hash, hash, timestamp]
    );
  } catch (e) { console.error('Company audit log error:', e); }
}

// Company policy endpoints
app.get('/api/company/policy', authenticateCompany, async (req, res) => {
  try {
    const row = (await pool.query('SELECT enforce_hourly_rate, enforced_hourly_rate, enforce_timesheet_recipient, enforced_timesheet_to, enforced_timesheet_cc, enforced_timesheet_bcc FROM companies WHERE id = $1', [req.companyUser.company_id])).rows[0];
    res.json({
      enforce_hourly_rate: row?.enforce_hourly_rate || false,
      hourly_rate: row?.enforced_hourly_rate || null,
      enforce_timesheet_recipient: row?.enforce_timesheet_recipient || false,
      enforced_timesheet_to: row?.enforced_timesheet_to || null,
      enforced_timesheet_cc: row?.enforced_timesheet_cc || null,
      enforced_timesheet_bcc: row?.enforced_timesheet_bcc || null,
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.put('/api/company/policy', authenticateCompany, requireCompanyRole('admin'), async (req, res) => {
  try {
    const { enforce_hourly_rate, hourly_rate, enforce_timesheet_recipient, enforced_timesheet_to, enforced_timesheet_cc, enforced_timesheet_bcc } = req.body || {};
    await pool.query(
      'UPDATE companies SET enforce_hourly_rate = COALESCE($1, enforce_hourly_rate), enforced_hourly_rate = COALESCE($2, enforced_hourly_rate), enforce_timesheet_recipient = COALESCE($3, enforce_timesheet_recipient), enforced_timesheet_to = COALESCE($4, enforced_timesheet_to), enforced_timesheet_cc = COALESCE($5, enforced_timesheet_cc), enforced_timesheet_bcc = COALESCE($6, enforced_timesheet_bcc), updated_at = NOW() WHERE id = $7',
      [enforce_hourly_rate, hourly_rate, enforce_timesheet_recipient, enforced_timesheet_to, enforced_timesheet_cc, enforced_timesheet_bcc, req.companyUser.company_id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Company email settings (choose Gmail or SMTP)
app.get('/api/company/email-settings', authenticateCompany, requireCompanyRole('admin'), async (req, res) => {
  try {
    const row = (await pool.query('SELECT email_method, smtp_host, smtp_port, smtp_secure, smtp_user, (smtp_pass IS NOT NULL) as has_smtp_pass FROM companies WHERE id = $1', [req.companyUser.company_id])).rows[0] || {};
    res.json(row);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.put('/api/company/email-settings', authenticateCompany, requireCompanyRole('admin'), async (req, res) => {
  try {
    const { email_method, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass } = req.body || {};
    await pool.query(
      'UPDATE companies SET email_method = COALESCE($1, email_method), smtp_host = COALESCE($2, smtp_host), smtp_port = COALESCE($3, smtp_port), smtp_secure = COALESCE($4, smtp_secure), smtp_user = COALESCE($5, smtp_user), smtp_pass = COALESCE($6, smtp_pass), updated_at = NOW() WHERE id = $7',
      [email_method, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, req.companyUser.company_id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Send a plain test email using the configured provider
app.post('/api/company/email/test', authenticateCompany, requireCompanyRole('admin'), async (req, res) => {
  try {
    const { to, subject, message } = req.body || {};
    if (!to) return res.status(400).json({ error: 'Recipient (to) is required' });
    const cfg = (await pool.query('SELECT email_method, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass FROM companies WHERE id = $1', [req.companyUser.company_id])).rows[0] || {};
    const subj = subject || 'Test email from Smart Timing';
    const text = message || 'Dette er en test-e-post fra Smart Timing.';
    if (cfg.email_method === 'gmail') {
      await sendCompanyGmailRaw(req.companyUser.user_id, to, undefined, undefined, subj, text, []);
      return res.json({ ok: true, provider: 'gmail' });
    }
    const provider = cfg.smtp_host ? { host: cfg.smtp_host, port: Number(cfg.smtp_port || 587), secure: Boolean(cfg.smtp_secure) } : guessSmtpByEmail(to);
    const authUser = cfg.smtp_user || process.env.SMTP_USER || process.env.EMAIL_FROM || 'noreply@smarttiming.no';
    const authPass = cfg.smtp_pass || process.env.SMTP_PASS || process.env.SMTP_APP_PASSWORD;
    const transport = nodemailer.createTransport({ ...provider, auth: authPass ? { user: authUser, pass: authPass } : undefined });
    const fromAddr = process.env.EMAIL_FROM || 'Smart Timing <noreply@smarttiming.no>';
    await transport.sendMail({ from: fromAddr, to, subject: subj, text });
    res.json({ ok: true, provider: 'smtp' });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Company Gmail status/connect/disconnect
app.get('/api/company/email/google/status', authenticateCompany, requireCompanyRole('admin'), async (req, res) => {
  try {
    const row = (await pool.query('SELECT google_access_token, google_token_expiry FROM company_users WHERE id = $1', [req.companyUser.user_id])).rows[0] || {};
    const isConnected = !!row.google_access_token;
    const isExpired = row.google_token_expiry ? new Date(row.google_token_expiry) < new Date() : false;
    res.json({ isConnected, isExpired, needsReauth: isConnected && isExpired });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get('/api/company/email/google/auth', authenticateCompany, requireCompanyRole('admin'), async (req, res) => {
  try {
    const oauth2Client = getOAuth2Client();
    const scopes = [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
    ];
    const authUrl = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: scopes, state: `company:${req.companyUser.user_id}`, prompt: 'consent' });
    res.json({ authUrl });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.delete('/api/company/email/google/disconnect', authenticateCompany, requireCompanyRole('admin'), async (req, res) => {
  try {
    await pool.query('UPDATE company_users SET google_access_token = NULL, google_refresh_token = NULL, google_token_expiry = NULL, updated_at = NOW() WHERE id = $1', [req.companyUser.user_id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Company template endpoints (HTML/CSS with handlebars)
app.get('/api/company/templates/:type', authenticateCompany, requireCompanyRole('admin'), async (req, res) => {
  try {
    const t = String(req.params.type);
    const row = (await pool.query('SELECT template_html, template_css, is_active, updated_at FROM company_document_templates WHERE company_id = $1 AND template_type = $2', [req.companyUser.company_id, t])).rows[0];
    res.json(row || { template_html: '<h1>{{company.name}}</h1>', template_css: 'body{font-family:Arial}', is_active: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.put('/api/company/templates/:type', authenticateCompany, requireCompanyRole('admin'), async (req, res) => {
  try {
    const t = String(req.params.type);
    const { template_html, template_css, is_active } = req.body || {};
    if (!template_html) return res.status(400).json({ error: 'template_html required' });
    await pool.query(`
      INSERT INTO company_document_templates (company_id, template_type, template_html, template_css, is_active)
      VALUES ($1, $2, $3, $4, COALESCE($5, TRUE))
      ON CONFLICT (company_id, template_type) DO UPDATE
      SET template_html = EXCLUDED.template_html,
          template_css = EXCLUDED.template_css,
          is_active = COALESCE(EXCLUDED.is_active, company_document_templates.is_active),
          updated_at = NOW()
    `, [req.companyUser.company_id, t, template_html, template_css || null, is_active]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/company/templates/:type/preview', authenticateCompany, requireCompanyRole('admin'), async (req, res) => {
  try {
    const t = String(req.params.type);
    const row = (await pool.query('SELECT template_html, template_css FROM company_document_templates WHERE company_id = $1 AND template_type = $2', [req.companyUser.company_id, t])).rows[0];
    const html = String(row?.template_html || req.body?.template_html || '');
    const css = String(row?.template_css || req.body?.template_css || '');
    if (!html) return res.status(400).json({ error: 'No template' });
    const { default: Handlebars } = await import('handlebars');
    const tpl = Handlebars.compile(html);
    const data = await buildTemplateData(req.companyUser.company_id, t, req.body?.month, req.body?.company_user_id);
    const body = tpl(data);
    const out = `<style>${css}</style>\n${body}`;
    res.json({ html: out, data });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/company/templates/:type/pdf', authenticateCompany, requireCompanyRole('admin'), async (req, res) => {
  try {
    const t = String(req.params.type);
    const row = (await pool.query('SELECT template_html, template_css FROM company_document_templates WHERE company_id = $1 AND template_type = $2', [req.companyUser.company_id, t])).rows[0];
    const htmlRaw = String(row?.template_html || req.body?.template_html || '');
    const css = String(row?.template_css || req.body?.template_css || '');
    if (!htmlRaw) return res.status(400).json({ error: 'No template' });
    const { default: Handlebars } = await import('handlebars');
    const tpl = Handlebars.compile(htmlRaw);
    const data = await buildTemplateData(req.companyUser.company_id, t, req.body?.month, req.body?.company_user_id);
    const html = `<style>${css}</style>\n${tpl(data)}`;
    let browser;
    try {
      browser = await launchPuppeteerBrowser();
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true });
      await browser.close();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${t}.pdf"`);
      return res.send(pdf);
    } catch (err) {
      if (browser) try { await browser.close(); } catch {}
      return res.status(501).json({ error: 'PDF rendering not available', details: String(err) });
    }
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/company/templates/:type/send', authenticateCompany, requireCompanyRole('admin'), async (req, res) => {
  try {
    const t = String(req.params.type);
    const { to, cc, bcc, subject, message, month, company_user_id, template_html, template_css } = req.body || {};
    if (!to && !((await pool.query('SELECT enforce_timesheet_recipient FROM companies WHERE id = $1',[req.companyUser.company_id])).rows[0]?.enforce_timesheet_recipient)) {
      return res.status(400).json({ error: 'Missing recipient' });
    }
    const row = (await pool.query('SELECT template_html, template_css FROM company_document_templates WHERE company_id = $1 AND template_type = $2', [req.companyUser.company_id, t])).rows[0];
    const htmlRaw = String(template_html || row?.template_html || '');
    const css = String(template_css || row?.template_css || '');
    if (!htmlRaw) return res.status(400).json({ error: 'No template' });
    const { default: Handlebars } = await import('handlebars');
    const tpl = Handlebars.compile(htmlRaw);
    const data = await buildTemplateData(req.companyUser.company_id, t, month, company_user_id);
    const html = `<style>${css}</style>\n${tpl(data)}`;

    // Render to PDF
    let browser; let pdf;
    try {
      browser = await launchPuppeteerBrowser();
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      pdf = await page.pdf({ format: 'A4', printBackground: true });
      await browser.close();
    } catch (err) {
      if (browser) try { await browser.close(); } catch {}
      return res.status(501).json({ error: 'PDF rendering not available', details: String(err) });
    }

    // Resolve recipients with company policy enforcement
    const policy = (await pool.query('SELECT enforce_timesheet_recipient, enforced_timesheet_to, enforced_timesheet_cc, enforced_timesheet_bcc FROM companies WHERE id = $1', [req.companyUser.company_id])).rows[0] || {};
    let toEmail = policy.enforce_timesheet_recipient ? String(policy.enforced_timesheet_to || '') : String(to || '');
    const ccEmail = policy.enforce_timesheet_recipient ? (policy.enforced_timesheet_cc || undefined) : (cc || undefined);
    const bccEmail = policy.enforce_timesheet_recipient ? (policy.enforced_timesheet_bcc || undefined) : (bcc || undefined);

    const subj = subject || `${t === 'timesheet' ? 'Timeliste' : 'Rapport'} ${data.period.month_label}`;
    const msg = message || `Vedlagt ${t === 'timesheet' ? 'timeliste' : 'rapport'} for ${data.period.month_label}.`;

    // Company email provider selection
    const emailCfg = (await pool.query('SELECT email_method, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass FROM companies WHERE id = $1', [req.companyUser.company_id])).rows[0] || {};

    if (emailCfg.email_method === 'gmail') {
      try {
        // Use the acting admin's Google account
        const attachments = [{ filename: `${t}.pdf`, mimeType: 'application/pdf', contentBuffer: pdf }];
        await sendCompanyGmailRaw(req.companyUser.user_id, toEmail, ccEmail, bccEmail, subj, msg, attachments);
      } catch (err) {
        return res.status(401).json({ error: 'Gmail not connected for this admin or send failed', details: String(err) });
      }
    } else {
      // SMTP path (configured or fallback)
      const provider = emailCfg.smtp_host ? {
        host: emailCfg.smtp_host,
        port: Number(emailCfg.smtp_port || 587),
        secure: Boolean(emailCfg.smtp_secure),
      } : (process.env.SMTP_HOST ? {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
      } : guessSmtpByEmail(toEmail));
      const authUser = emailCfg.smtp_user || process.env.SMTP_USER || process.env.EMAIL_FROM || 'noreply@smarttiming.no';
      const authPass = emailCfg.smtp_pass || process.env.SMTP_PASS || process.env.SMTP_APP_PASSWORD;
      const transport = nodemailer.createTransport({ ...provider, auth: authPass ? { user: authUser, pass: authPass } : undefined });
      const fromAddr = process.env.EMAIL_FROM || 'Smart Timing <noreply@smarttiming.no>';
      await transport.sendMail({
        from: fromAddr,
        to: toEmail,
        cc: ccEmail,
        bcc: bccEmail,
        subject: subj,
        text: msg,
        attachments: [{ filename: `${t}.pdf`, content: pdf, contentType: 'application/pdf' }],
      });
    }

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

async function buildTemplateData(companyId, type, month, companyUserId) {
  const company = (await pool.query('SELECT name, logo_base64, enforce_hourly_rate, enforced_hourly_rate FROM companies WHERE id = $1', [companyId])).rows[0] || {};
  const m = month && /^\d{6}$/.test(String(month)) ? String(month) : new Date().toISOString().slice(0,7).replace('-','');
  // totals per case
  const perCase = (await pool.query(`
    SELECT lr.case_id,
           ROUND(SUM(EXTRACT(EPOCH FROM (lr.end_time - lr.start_time)) / 3600.0 - COALESCE(lr.break_hours,0))::numeric, 2) AS hours
    FROM log_row lr
    JOIN company_users cu ON cu.id = lr.company_user_id
    WHERE cu.company_id = $1 AND to_char(lr.date,'YYYYMM') = $2 AND lr.case_id IS NOT NULL ${companyUserId ? 'AND lr.company_user_id = $3' : ''}
    GROUP BY lr.case_id
    ORDER BY lr.case_id ASC
  `, companyUserId ? [companyId, m, companyUserId] : [companyId, m])).rows;
  // rows (sample limited)
  const rows = (await pool.query(`
    SELECT lr.*, cu.user_email
    FROM log_row lr JOIN company_users cu ON cu.id = lr.company_user_id
    WHERE cu.company_id = $1 AND to_char(lr.date,'YYYYMM') = $2 ${companyUserId ? 'AND lr.company_user_id = $3' : ''}
    ORDER BY lr.date ASC, lr.start_time ASC LIMIT 500
  `, companyUserId ? [companyId, m, companyUserId] : [companyId, m])).rows.map(r => ({
    date: r.date,
    start: String(r.start_time).slice(0,5),
    end: String(r.end_time).slice(0,5),
    break_hours: Number(r.break_hours||0),
    activity: r.activity,
    title: r.title,
    project: r.project,
    place: r.place,
    notes: r.notes,
    case_id: r.case_id,
    hours: Math.max(0, ((new Date(`2000-01-01T${r.end_time}`) - new Date(`2000-01-01T${r.start_time}`)) / 3600000) - Number(r.break_hours||0))
  }));
  const total_hours = rows.reduce((s,r)=> s + Number(r.hours||0), 0);
  const effective_rate = company.enforce_hourly_rate ? Number(company.enforced_hourly_rate || 0) : null;
  const total_amount = effective_rate ? Math.round(total_hours * effective_rate * 100)/100 : null;
  const month_label = new Date(m.slice(0,4)+'-'+m.slice(4,6)+'-01').toLocaleString('no-NO', { month: 'long', year: 'numeric' });
  return {
    company: { name: company.name || '', logo_url: company.logo_base64 || null },
    period: { month: m, month_label },
    totals: { total_hours, total_amount },
    rows,
    per_case: perCase
  };
}

// Company self-service endpoints
// Get cases assigned to the authenticated company user
app.get('/api/company/my-cases', authenticateCompany, async (req, res) => {
  try {
    const rows = (await pool.query('SELECT id, case_id, notes, created_at FROM user_cases WHERE company_user_id = $1 ORDER BY created_at DESC', [req.companyUser.user_id])).rows;
    res.json({ cases: rows });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Company self-service endpoints
app.get('/api/company/me', authenticateCompany, async (req, res) => {
  try {
    const c = await pool.query('SELECT id, name, logo_base64 FROM companies WHERE id = $1', [req.companyUser.company_id]);
    res.json({ company: c.rows[0] || null, user: { email: req.companyUser.email, role: req.companyUser.role, id: req.companyUser.user_id } });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get('/api/company/users', authenticateCompany, async (req, res) => {
  try {
    const users = (await pool.query(`
      SELECT cu.id, cu.user_email, cu.google_email, cu.role, cu.approved,
             COALESCE(json_agg(json_build_object('id', uc.id, 'case_id', uc.case_id) ORDER BY uc.created_at)
                      FILTER (WHERE uc.id IS NOT NULL), '[]') AS cases
      FROM company_users cu
      LEFT JOIN user_cases uc ON uc.company_user_id = cu.id
      WHERE cu.company_id = $1
      GROUP BY cu.id
      ORDER BY cu.created_at DESC
    `, [req.companyUser.company_id])).rows;
    res.json({ users });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/company/users', authenticateCompany, requireCompanyRole('admin'), async (req, res) => {
  try {
    const { user_email, google_email, role = 'member', approved = false } = req.body || {};
    if (!user_email) return res.status(400).json({ error: 'user_email is required' });
    const result = await pool.query(`
      INSERT INTO company_users (company_id, user_email, google_email, role, approved)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (company_id, user_email)
      DO UPDATE SET google_email = COALESCE($3, company_users.google_email), role = COALESCE($4, company_users.role), approved = COALESCE($5, company_users.approved), updated_at = NOW()
      RETURNING *
    `, [req.companyUser.company_id, user_email, google_email || null, role, approved]);
    const row = result.rows[0];
    await logCompanyAction(req.companyUser.company_id, req.companyUser.user_id, 'company_user_added', 'company_user', String(row.id), { user_email, role, approved }, req, null, row);
    res.json(row);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.patch('/api/company/users/:id', authenticateCompany, requireCompanyRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { approved, role, google_email } = req.body || {};
    const before = (await pool.query('SELECT * FROM company_users WHERE id = $1 AND company_id = $2', [id, req.companyUser.company_id])).rows[0];
    const updates = [];
    const vals = [];
    if (approved !== undefined) { updates.push(`approved = $${updates.length+1}`); vals.push(Boolean(approved)); }
    if (role !== undefined) { updates.push(`role = $${updates.length+1}`); vals.push(role); }
    if (google_email !== undefined) { updates.push(`google_email = $${updates.length+1}`); vals.push(google_email); }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    vals.push(id, req.companyUser.company_id);
    const result = await pool.query(`UPDATE company_users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${vals.length-1} AND company_id = $${vals.length} RETURNING *`, vals);
    const row = result.rows[0];
    await logCompanyAction(req.companyUser.company_id, req.companyUser.user_id, 'company_user_updated', 'company_user', String(row.id), { patch: req.body }, req, before, row);
    res.json(row);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.delete('/api/company/users/:id', authenticateCompany, requireCompanyRole('admin'), async (req, res) => {
  try {
    const before = (await pool.query('SELECT * FROM company_users WHERE id = $1 AND company_id = $2', [req.params.id, req.companyUser.company_id])).rows[0];
    await pool.query('DELETE FROM company_users WHERE id = $1 AND company_id = $2', [req.params.id, req.companyUser.company_id]);
    await logCompanyAction(req.companyUser.company_id, req.companyUser.user_id, 'company_user_deleted', 'company_user', String(req.params.id), null, req, before, null);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/company/users/:id/cases', authenticateCompany, requireCompanyRole('admin','case_manager'), async (req, res) => {
  try {
    const { case_id, notes } = req.body || {};
    if (!case_id) return res.status(400).json({ error: 'case_id is required' });
    const result = await pool.query('INSERT INTO user_cases (company_user_id, case_id, notes) VALUES ($1, $2, $3) ON CONFLICT (company_user_id, case_id) DO NOTHING RETURNING *', [req.params.id, case_id, notes || null]);
    const row = result.rows[0];
    await logCompanyAction(req.companyUser.company_id, req.companyUser.user_id, 'user_case_added', 'company_user_case', String(req.params.id), { case_id }, req, null, row);
    res.json(row || { ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.delete('/api/company/users/:id/cases/:caseId', authenticateCompany, requireCompanyRole('admin','case_manager'), async (req, res) => {
  try {
    const before = (await pool.query('SELECT * FROM user_cases WHERE company_user_id = $1 AND id = $2', [req.params.id, req.params.caseId])).rows[0];
    const result = await pool.query('DELETE FROM user_cases WHERE company_user_id = $1 AND id = $2', [req.params.id, req.params.caseId]);
    await logCompanyAction(req.companyUser.company_id, req.companyUser.user_id, 'user_case_deleted', 'company_user_case', String(req.params.id), { case_row_id: req.params.caseId }, req, before, null);
    res.json({ deleted: result.rowCount });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Company reports: monthly totals per case
app.get('/api/company/reports/case-monthly', authenticateCompany, async (req, res) => {
  try {
    const { month } = req.query || {};
    const m = String(month || '').trim();
    if (!/^\d{6}$/.test(m)) return res.status(400).json({ error: 'month must be YYYYMM' });
    const params = [req.companyUser.company_id, m];
    const sql = `
      SELECT lr.case_id,
             ROUND(SUM(EXTRACT(EPOCH FROM (lr.end_time - lr.start_time)) / 3600.0 - COALESCE(lr.break_hours,0))::numeric, 2) AS hours
      FROM log_row lr
      JOIN company_users cu ON cu.id = lr.company_user_id
      WHERE cu.company_id = $1 AND to_char(lr.date,'YYYYMM') = $2 AND lr.case_id IS NOT NULL
      GROUP BY lr.case_id
      ORDER BY lr.case_id ASC
    `;
    const rows = (await pool.query(sql, params)).rows;
    res.json({ month: m, totals: rows });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Company logs - list logs across company with optional filters
app.get('/api/company/logs', authenticateCompany, async (req, res) => {
  try {
    const { case_id, from, to, user_id, limit = 200, offset = 0 } = req.query || {};
    const params = [req.companyUser.company_id];
    let where = 'WHERE cu.company_id = $1';
    if (case_id) { params.push(String(case_id)); where += ` AND lr.case_id = $${params.length}`; }
    if (user_id) { params.push(Number(user_id)); where += ` AND lr.company_user_id = $${params.length}`; }
    if (from) { params.push(new Date(String(from))); where += ` AND lr.date >= $${params.length}`; }
    if (to) { params.push(new Date(String(to))); where += ` AND lr.date <= $${params.length}`; }
    params.push(Number(limit), Number(offset));

    const sql = `
      SELECT lr.*, cu.user_email, cu.google_email
      FROM log_row lr
      JOIN company_users cu ON cu.id = lr.company_user_id
      ${where}
      ORDER BY lr.date DESC, lr.start_time DESC
      LIMIT $${params.length-1} OFFSET $${params.length}
    `;
    const rows = (await pool.query(sql, params)).rows;
    res.json({ logs: rows });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Company invites
app.get('/api/company/invites', authenticateCompany, requireCompanyRole('admin'), async (req, res) => {
  try {
    const rows = (await pool.query('SELECT id, invited_email, role, token, expires_at, used_at, created_at FROM company_invites WHERE company_id = $1 ORDER BY created_at DESC', [req.companyUser.company_id])).rows;
    res.json({ invites: rows });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

async function getFreshOAuthClientForCompanyUser(company_user_id) {
  const res = await pool.query('SELECT google_access_token, google_refresh_token, google_token_expiry FROM company_users WHERE id = $1', [company_user_id]);
  const s = res.rows[0];
  if (!s?.google_access_token) throw new Error('Company user not connected to Gmail');
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: s.google_access_token,
    refresh_token: s.google_refresh_token,
    expiry_date: s.google_token_expiry ? new Date(s.google_token_expiry).getTime() : null,
  });
  if (s.google_token_expiry && new Date(s.google_token_expiry) < new Date()) {
    if (!s.google_refresh_token) throw new Error('Token expired. Reconnect Google');
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);
    await pool.query('UPDATE company_users SET google_access_token = $1, google_token_expiry = $2, updated_at = NOW() WHERE id = $3', [
      credentials.access_token,
      credentials.expiry_date ? new Date(credentials.expiry_date) : null,
      company_user_id,
    ]);
  }
  return oauth2Client;
}

async function sendCompanyGmailRaw(company_user_id, toCsv, ccCsv, bccCsv, subject, bodyText, attachments = []) {
  const oauth2Client = await getFreshOAuthClientForCompanyUser(company_user_id);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();
  const senderEmail = userInfo.data.email;
  const boundary = '----=_Part_' + Date.now();
  const headers = [
    `From: ${senderEmail}`,
    `To: ${toCsv}`,
    ...(ccCsv ? [`Cc: ${ccCsv}`] : []),
    ...(bccCsv ? [`Bcc: ${bccCsv}`] : []),
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
  ];
  let lines = [];
  if (attachments.length === 0) {
    lines = [...headers, 'Content-Type: text/plain; charset=UTF-8', '', bodyText];
  } else {
    lines = [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, '', `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', '', bodyText, '', `--${boundary}`];
    for (let i = 0; i < attachments.length; i++) {
      const a = attachments[i];
      lines.push(
        `Content-Type: ${a.mimeType}; name="${a.filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${a.filename}"`,
        '',
        (a.contentBuffer instanceof Buffer ? a.contentBuffer : Buffer.from(a.contentBuffer)).toString('base64'),
        i === attachments.length - 1 ? `--${boundary}--` : `--${boundary}`
      );
    }
  }
  const message = lines.join('\r\n');
  const encoded = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
}

async function sendInviteEmail(to, link, companyName, companyId, actorCompanyUserId) {
  const cfg = (await pool.query('SELECT email_method, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass FROM companies WHERE id = $1', [companyId])).rows[0] || {};
  const subject = `Invitasjon til ${companyName} • Smart Timing`;
  const text = `Du er invitert til å bli med i ${companyName} i Smart Timing. Klikk for å godta invitasjonen: ${link}\n\nLenken utløper om 7 dager.`;
  if (cfg.email_method === 'gmail') {
    await sendCompanyGmailRaw(actorCompanyUserId, to, undefined, undefined, subject, text, []);
    return;
  }
  const provider = cfg.smtp_host ? { host: cfg.smtp_host, port: Number(cfg.smtp_port || 587), secure: Boolean(cfg.smtp_secure) } : (process.env.SMTP_HOST ? {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
  } : guessSmtpByEmail(to));
  const authUser = cfg.smtp_user || process.env.SMTP_USER || process.env.EMAIL_FROM || 'noreply@smarttiming.no';
  const authPass = cfg.smtp_pass || process.env.SMTP_PASS || process.env.SMTP_APP_PASSWORD;
  const transport = nodemailer.createTransport({
    ...provider,
    auth: authPass ? { user: authUser, pass: authPass } : undefined,
  });
  const fromAddr = process.env.EMAIL_FROM || 'Smart Timing <noreply@smarttiming.no>';
  await transport.sendMail({
    from: fromAddr,
    to,
    subject,
    text,
  });
}

app.post('/api/company/invites', authenticateCompany, requireCompanyRole('admin'), async (req, res) => {
  try {
    const { invited_email, role = 'member' } = req.body || {};
    if (!invited_email) return res.status(400).json({ error: 'invited_email is required' });
    const invite = (await pool.query(`INSERT INTO company_invites (company_id, invited_email, role, invited_by) VALUES ($1, $2, $3, $4) RETURNING *`, [req.companyUser.company_id, invited_email.toLowerCase(), role, req.companyUser.user_id])).rows[0];
    const company = (await pool.query('SELECT name FROM companies WHERE id = $1', [req.companyUser.company_id])).rows[0];
    const link = `${process.env.BACKEND_URL || 'http://localhost:4000'}/api/company/invites/accept?token=${encodeURIComponent(invite.token)}`;
    await sendInviteEmail(invited_email, link, company?.name || 'Smart Timing', req.companyUser.company_id, req.companyUser.user_id);
    await logCompanyAction(req.companyUser.company_id, req.companyUser.user_id, 'invite_created', 'company_invite', String(invite.id), { invited_email, role }, req, null, invite);
    res.json(invite);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/company/invites/:id/resend', authenticateCompany, requireCompanyRole('admin'), async (req, res) => {
  try {
    const inv = (await pool.query('SELECT * FROM company_invites WHERE id = $1 AND company_id = $2', [req.params.id, req.companyUser.company_id])).rows[0];
    if (!inv) return res.status(404).json({ error: 'Invite not found' });
    if (inv.used_at) return res.status(400).json({ error: 'Invite already used' });
    const company = (await pool.query('SELECT name FROM companies WHERE id = $1', [req.companyUser.company_id])).rows[0];
    const link = `${process.env.BACKEND_URL || 'http://localhost:4000'}/api/company/invites/accept?token=${encodeURIComponent(inv.token)}`;
    await sendInviteEmail(inv.invited_email, link, company?.name || 'Smart Timing', req.companyUser.company_id, req.companyUser.user_id);
    await logCompanyAction(req.companyUser.company_id, req.companyUser.user_id, 'invite_resent', 'company_invite', String(inv.id), null, req, inv, inv);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.delete('/api/company/invites/:id', authenticateCompany, requireCompanyRole('admin'), async (req, res) => {
  try {
    const before = (await pool.query('SELECT * FROM company_invites WHERE id = $1 AND company_id = $2', [req.params.id, req.companyUser.company_id])).rows[0];
    await pool.query('DELETE FROM company_invites WHERE id = $1 AND company_id = $2', [req.params.id, req.companyUser.company_id]);
    await logCompanyAction(req.companyUser.company_id, req.companyUser.user_id, 'invite_deleted', 'company_invite', String(req.params.id), null, req, before, null);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Update company logo
app.put('/api/company/logo', authenticateCompany, requireCompanyRole('admin'), async (req, res) => {
  try {
    const { logo_base64 } = req.body || {};
    if (!logo_base64) return res.status(400).json({ error: 'logo_base64 is required' });
    // Optional: size guard (rough)
    if (logo_base64.length > 2_000_000) return res.status(400).json({ error: 'Logo too large' });
    const before = (await pool.query('SELECT logo_base64 FROM companies WHERE id = $1', [req.companyUser.company_id])).rows[0];
    await pool.query('UPDATE companies SET logo_base64 = $1, updated_at = NOW() WHERE id = $2', [logo_base64, req.companyUser.company_id]);
    await logCompanyAction(req.companyUser.company_id, req.companyUser.user_id, 'company_logo_updated', 'company', String(req.companyUser.company_id), null, req, before, { logo_base64: '[updated]' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// List audit log (admin)
app.get('/api/company/audit', authenticateCompany, requireCompanyRole('admin'), async (req, res) => {
  try {
    const { action, actor, q, from, to, limit = 100, offset = 0 } = req.query;
    const params = [req.companyUser.company_id];
    let where = 'WHERE cal.company_id = $1';
    if (action) { params.push(String(action)); where += ` AND cal.action = $${params.length}`; }
    if (actor) { params.push(String(actor).toLowerCase()); where += ` AND LOWER(cu.user_email) = $${params.length}`; }
    if (from) { params.push(new Date(String(from))); where += ` AND cal.created_at >= $${params.length}`; }
    if (to) { params.push(new Date(String(to))); where += ` AND cal.created_at <= $${params.length}`; }
    if (q) { params.push(`%${String(q).toLowerCase()}%`); where += ` AND (LOWER(cal.target_type) LIKE $${params.length} OR LOWER(cal.target_id) LIKE $${params.length} OR LOWER(cal.action) LIKE $${params.length})`; }
    params.push(Number(limit), Number(offset));
    const sql = `
      SELECT cal.*, cu.user_email as actor_email
      FROM company_audit_log cal
      LEFT JOIN company_users cu ON cu.id = cal.actor_company_user_id
      ${where}
      ORDER BY cal.created_at DESC
      LIMIT $${params.length-1} OFFSET $${params.length}
    `;
    const rows = (await pool.query(sql, params)).rows;
    res.json({ logs: rows });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get('/api/company/audit/export', authenticateCompany, requireCompanyRole('admin'), async (req, res) => {
  try {
    const format = String(req.query.format || 'json').toLowerCase();
    const rows = (await pool.query('SELECT cal.created_at, cal.action, cal.target_type, cal.target_id, cu.user_email as actor_email, cal.details FROM company_audit_log cal LEFT JOIN company_users cu ON cu.id = cal.actor_company_user_id WHERE cal.company_id = $1 ORDER BY cal.created_at DESC LIMIT 1000', [req.companyUser.company_id])).rows;
    if (format === 'csv') {
      const header = 'created_at,action,target_type,target_id,actor_email,details\n';
      const body = rows.map(r => [r.created_at, r.action, r.target_type || '', r.target_id || '', r.actor_email || '', JSON.stringify(r.details || {})].map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
      res.setHeader('Content-Type','text/csv');
      res.setHeader('Content-Disposition','attachment; filename="company_audit.csv"');
      return res.send(header + body);
    }
    res.json({ logs: rows });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ===== CASE REPORTS ENDPOINTS =====
// User endpoints - manage their own case reports
app.get('/api/case-reports', authenticateCompany, async (req, res) => {
  try {
    const { case_id, month, status } = req.query || {};
    const params = [req.companyUser.user_id];
    let where = 'WHERE cr.company_user_id = $1';
    if (case_id) { params.push(String(case_id)); where += ` AND cr.case_id = $${params.length}`; }
    if (month) { params.push(String(month)); where += ` AND cr.month = $${params.length}`; }
    if (status) { params.push(String(status)); where += ` AND cr.status = $${params.length}`; }
    const sql = `
      SELECT cr.*, uc.case_id as case_name
      FROM case_reports cr
      JOIN user_cases uc ON uc.id = cr.user_cases_id
      ${where}
      ORDER BY cr.month DESC, cr.created_at DESC
    `;
    const rows = (await pool.query(sql, params)).rows;
    res.json({ reports: rows });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get('/api/case-reports/:id', authenticateCompany, async (req, res) => {
  try {
    const report = (await pool.query('SELECT * FROM case_reports WHERE id = $1 AND company_user_id = $2', [req.params.id, req.companyUser.user_id])).rows[0];
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json(report);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/case-reports', authenticateCompany, async (req, res) => {
  try {
    const { user_cases_id, case_id, month, background, actions, progress, challenges, factors, assessment, recommendations, notes } = req.body || {};
    if (!user_cases_id || !case_id || !month) return res.status(400).json({ error: 'user_cases_id, case_id, and month are required' });
    // Validate month format YYYY-MM
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) return res.status(400).json({ error: 'month must be YYYY-MM format' });
    // Verify user owns this case
    const userCase = (await pool.query('SELECT * FROM user_cases WHERE id = $1 AND company_user_id = $2', [user_cases_id, req.companyUser.user_id])).rows[0];
    if (!userCase) return res.status(403).json({ error: 'You do not have access to this case' });
    const result = await pool.query(`
      INSERT INTO case_reports (user_cases_id, company_user_id, case_id, month, background, actions, progress, challenges, factors, assessment, recommendations, notes, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft')
      RETURNING *
    `, [user_cases_id, req.companyUser.user_id, case_id, month, background, actions, progress, challenges, factors, assessment, recommendations, notes]);
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.put('/api/case-reports/:id', authenticateCompany, async (req, res) => {
  try {
    const { background, actions, progress, challenges, factors, assessment, recommendations, notes, status } = req.body || {};
    const existing = (await pool.query('SELECT * FROM case_reports WHERE id = $1 AND company_user_id = $2', [req.params.id, req.companyUser.user_id])).rows[0];
    if (!existing) return res.status(404).json({ error: 'Report not found' });
    // Only allow editing if draft or rejected
    if (existing.status !== 'draft' && existing.status !== 'rejected') {
      return res.status(403).json({ error: 'Cannot edit submitted or approved reports' });
    }
    const updates = [];
    const vals = [];
    if (background !== undefined) { updates.push(`background = $${updates.length+1}`); vals.push(background); }
    if (actions !== undefined) { updates.push(`actions = $${updates.length+1}`); vals.push(actions); }
    if (progress !== undefined) { updates.push(`progress = $${updates.length+1}`); vals.push(progress); }
    if (challenges !== undefined) { updates.push(`challenges = $${updates.length+1}`); vals.push(challenges); }
    if (factors !== undefined) { updates.push(`factors = $${updates.length+1}`); vals.push(factors); }
    if (assessment !== undefined) { updates.push(`assessment = $${updates.length+1}`); vals.push(assessment); }
    if (recommendations !== undefined) { updates.push(`recommendations = $${updates.length+1}`); vals.push(recommendations); }
    if (notes !== undefined) { updates.push(`notes = $${updates.length+1}`); vals.push(notes); }
    if (status !== undefined) { updates.push(`status = $${updates.length+1}`); vals.push(status); }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    // Handle submission timestamp
    if (status === 'submitted' && existing.status !== 'submitted') {
      updates.push(`submitted_at = NOW()`);
    }
    vals.push(req.params.id, req.companyUser.user_id);
    const result = await pool.query(`
      UPDATE case_reports SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${vals.length-1} AND company_user_id = $${vals.length}
      RETURNING *
    `, vals);
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.delete('/api/case-reports/:id', authenticateCompany, async (req, res) => {
  try {
    const existing = (await pool.query('SELECT * FROM case_reports WHERE id = $1 AND company_user_id = $2', [req.params.id, req.companyUser.user_id])).rows[0];
    if (!existing) return res.status(404).json({ error: 'Report not found' });
    // Only allow deletion if draft
    if (existing.status !== 'draft') {
      return res.status(403).json({ error: 'Cannot delete submitted or approved reports' });
    }
    await pool.query('DELETE FROM case_reports WHERE id = $1 AND company_user_id = $2', [req.params.id, req.companyUser.user_id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Company admin endpoints - view and approve reports
app.get('/api/company/case-reports', authenticateCompany, requireCompanyRole('admin','case_manager'), async (req, res) => {
  try {
    const { case_id, month, status, user_id, limit = 100, offset = 0 } = req.query || {};
    const params = [req.companyUser.company_id];
    let where = 'WHERE cu.company_id = $1';
    if (case_id) { params.push(String(case_id)); where += ` AND cr.case_id = $${params.length}`; }
    if (month) { params.push(String(month)); where += ` AND cr.month = $${params.length}`; }
    if (status) { params.push(String(status)); where += ` AND cr.status = $${params.length}`; }
    if (user_id) { params.push(Number(user_id)); where += ` AND cr.company_user_id = $${params.length}`; }
    params.push(Number(limit), Number(offset));
    const sql = `
      SELECT cr.*, cu.user_email, cu.google_email, 
             approver.user_email as approved_by_email
      FROM case_reports cr
      JOIN company_users cu ON cu.id = cr.company_user_id
      LEFT JOIN company_users approver ON approver.id = cr.approved_by
      ${where}
      ORDER BY cr.month DESC, cr.submitted_at DESC NULLS LAST, cr.created_at DESC
      LIMIT $${params.length-1} OFFSET $${params.length}
    `;
    const rows = (await pool.query(sql, params)).rows;
    res.json({ reports: rows });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get('/api/company/case-reports/:id', authenticateCompany, requireCompanyRole('admin','case_manager'), async (req, res) => {
  try {
    const sql = `
      SELECT cr.*, cu.user_email, cu.google_email,
             approver.user_email as approved_by_email
      FROM case_reports cr
      JOIN company_users cu ON cu.id = cr.company_user_id
      LEFT JOIN company_users approver ON approver.id = cr.approved_by
      WHERE cr.id = $1 AND cu.company_id = $2
    `;
    const report = (await pool.query(sql, [req.params.id, req.companyUser.company_id])).rows[0];
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json(report);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/company/case-reports/:id/approve', authenticateCompany, requireCompanyRole('admin','case_manager'), async (req, res) => {
  try {
    const report = (await pool.query(`
      SELECT cr.* FROM case_reports cr
      JOIN company_users cu ON cu.id = cr.company_user_id
      WHERE cr.id = $1 AND cu.company_id = $2
    `, [req.params.id, req.companyUser.company_id])).rows[0];
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (report.status !== 'submitted') {
      return res.status(400).json({ error: 'Only submitted reports can be approved' });
    }
    const result = await pool.query(`
      UPDATE case_reports
      SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [req.companyUser.user_id, req.params.id]);
    await logCompanyAction(req.companyUser.company_id, req.companyUser.user_id, 'case_report_approved', 'case_report', String(req.params.id), { case_id: report.case_id, month: report.month }, req, report, result.rows[0]);
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/company/case-reports/:id/reject', authenticateCompany, requireCompanyRole('admin','case_manager'), async (req, res) => {
  try {
    const { rejection_reason } = req.body || {};
    const report = (await pool.query(`
      SELECT cr.* FROM case_reports cr
      JOIN company_users cu ON cu.id = cr.company_user_id
      WHERE cr.id = $1 AND cu.company_id = $2
    `, [req.params.id, req.companyUser.company_id])).rows[0];
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (report.status !== 'submitted') {
      return res.status(400).json({ error: 'Only submitted reports can be rejected' });
    }
    const result = await pool.query(`
      UPDATE case_reports
      SET status = 'rejected', rejection_reason = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [rejection_reason || null, req.params.id]);
    await logCompanyAction(req.companyUser.company_id, req.companyUser.user_id, 'case_report_rejected', 'case_report', String(req.params.id), { case_id: report.case_id, month: report.month, rejection_reason }, req, report, result.rows[0]);
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Public acceptance endpoint
app.get('/api/company/invites/accept', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).send('Missing token');
    const inv = (await pool.query('SELECT * FROM company_invites WHERE token = $1', [String(token)])).rows[0];
    if (!inv) return res.status(404).send('Invalid invite');
    if (inv.used_at) return res.status(400).send('Invite already used');
    if (inv.expires_at && new Date(inv.expires_at) < new Date()) return res.status(400).send('Invite expired');

    // Upsert company user
    await pool.query(`
      INSERT INTO company_users (company_id, user_email, role, approved)
      VALUES ($1, LOWER($2), $3, TRUE)
      ON CONFLICT (company_id, user_email)
      DO UPDATE SET approved = TRUE, role = EXCLUDED.role, updated_at = NOW()
    `, [inv.company_id, inv.invited_email, inv.role]);

    // Mark used
    await pool.query('UPDATE company_invites SET used_at = NOW() WHERE id = $1', [inv.id]);
    await logCompanyAction(inv.company_id, null, 'invite_accepted', 'company_invite', String(inv.id), { invited_email: inv.invited_email }, null, inv, inv);
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/invite/accept?status=success`);
  } catch (e) {
    console.error('Invite accept error:', e);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/invite/accept?status=error&message=${encodeURIComponent(String(e))}`);
  }
});

// ===== ADMIN USER MANAGEMENT ENDPOINTS =====
// GET /api/admin/users - List all users with stats
app.get("/api/admin/users", authenticateAdmin, requireAdminRole('super_admin', 'admin', 'moderator'), async (req, res) => {
  try {
    const { search, limit = 50, offset = 0, archived } = req.query;
    
    let query = `
      SELECT 
        us.user_id,
        us.created_at as user_since,
        us.hourly_rate,
        us.theme_mode,
        us.archived as archived,
        COUNT(DISTINCT lr.id) as total_logs,
        COUNT(DISTINCT pi.id) as total_projects,
        MAX(lr.date) as last_activity_date
      FROM user_settings us
      LEFT JOIN log_row lr ON lr.user_id = us.user_id
      LEFT JOIN project_info pi ON pi.user_id = us.user_id
    `;
    
    const params = [];
    if (search) {
      if (archived === 'true') {
        query += ` WHERE us.archived = TRUE AND us.user_id ILIKE $1`;
      } else if (archived === 'any') {
        query += ` WHERE us.user_id ILIKE $1`;
      } else {
        query += ` WHERE us.archived = FALSE AND us.user_id ILIKE $1`;
      }
      params.push(`%${search}%`);
    } else {
      if (archived === 'true') {
        query += ` WHERE us.archived = TRUE`;
      } else if (archived === 'any') {
        // no filter
      } else {
        query += ` WHERE us.archived = FALSE`;
      }
    }
    
    query += ` GROUP BY us.user_id, us.created_at, us.hourly_rate, us.theme_mode, us.archived ORDER BY us.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(DISTINCT user_id) as total FROM user_settings';
    const countParams = [];
    if (search) {
      if (archived === 'true') {
        countQuery += ' WHERE archived = TRUE AND user_id ILIKE $1';
      } else if (archived === 'any') {
        countQuery += ' WHERE user_id ILIKE $1';
      } else {
        countQuery += ' WHERE archived = FALSE AND user_id ILIKE $1';
      }
      countParams.push(`%${search}%`);
    } else {
      if (archived === 'true') {
        countQuery += ' WHERE archived = TRUE';
      } else if (archived === 'any') {
        // no filter
      } else {
        countQuery += ' WHERE archived = FALSE';
      }
    }
    const countResult = await pool.query(countQuery, countParams);
    
    res.json({
      users: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (e) {
    console.error('Admin users list error:', e);
    res.status(500).json({ error: 'Failed to fetch users', details: String(e) });
  }
});

// GET /api/admin/users/:userId - Get detailed user information
app.get("/api/admin/users/:userId", authenticateAdmin, requireAdminRole('super_admin', 'admin', 'moderator'), async (req, res) => {
  try {
    const { userId } = req.params;
    
    const [settings, logs, projects, templates, syncLog] = await Promise.all([
      pool.query('SELECT * FROM user_settings WHERE user_id = $1', [userId]),
      pool.query('SELECT COUNT(*) as count, MIN(date) as first_log, MAX(date) as last_log FROM log_row WHERE user_id = $1', [userId]),
      pool.query('SELECT * FROM project_info WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
      pool.query('SELECT * FROM quick_templates WHERE user_id = $1 ORDER BY display_order', [userId]),
      pool.query('SELECT * FROM sync_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10', [userId]),
    ]);
    
    if (settings.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      user_id: userId,
      settings: settings.rows[0],
      statistics: logs.rows[0],
      projects: projects.rows,
      templates: templates.rows,
      recent_syncs: syncLog.rows,
    });
  } catch (e) {
    console.error('Admin user detail error:', e);
    res.status(500).json({ error: 'Failed to fetch user details', details: String(e) });
  }
});

// PATCH /api/admin/users/:userId/archive - Soft-archive user
app.patch("/api/admin/users/:userId/archive", authenticateAdmin, requireAdminRole('super_admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    await pool.query('UPDATE user_settings SET archived = TRUE, updated_at = NOW() WHERE user_id = $1', [userId]);
    await logAdminAction(req.adminUser.id, 'user_archived', 'user', userId, {}, req.ip);
    res.json({ success: true, archived: true });
  } catch (e) {
    console.error('Admin user archive error:', e);
    res.status(500).json({ error: 'Failed to archive user', details: String(e) });
  }
});

// PATCH /api/admin/users/:userId/restore - Restore archived user
app.patch("/api/admin/users/:userId/restore", authenticateAdmin, requireAdminRole('super_admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    await pool.query('UPDATE user_settings SET archived = FALSE, updated_at = NOW() WHERE user_id = $1', [userId]);
    await logAdminAction(req.adminUser.id, 'user_restored', 'user', userId, {}, req.ip);
    res.json({ success: true, archived: false });
  } catch (e) {
    console.error('Admin user restore error:', e);
    res.status(500).json({ error: 'Failed to restore user', details: String(e) });
  }
});

// DELETE /api/admin/users/:userId - Delete user (super_admin only)
app.delete("/api/admin/users/:userId", authenticateAdmin, requireAdminRole('super_admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Delete all user data
    const results = await Promise.all([
      pool.query('DELETE FROM log_row WHERE user_id = $1', [userId]),
      pool.query('DELETE FROM user_settings WHERE user_id = $1', [userId]),
      pool.query('DELETE FROM project_info WHERE user_id = $1', [userId]),
      pool.query('DELETE FROM quick_templates WHERE user_id = $1', [userId]),
      pool.query('DELETE FROM sync_log WHERE user_id = $1', [userId]),
    ]);
    
    const totalDeleted = results.reduce((sum, r) => sum + r.rowCount, 0);
    
    await logAdminAction(
      req.adminUser.id,
      'user_deleted',
      'user',
      userId,
      { deleted_records: totalDeleted },
      req.ip
    );
    
    res.json({ success: true, deleted_records: totalDeleted });
  } catch (e) {
    console.error('Admin user deletion error:', e);
    res.status(500).json({ error: 'Failed to delete user', details: String(e) });
  }
});

// ===== ADMIN ANALYTICS ENDPOINTS =====
// GET /api/admin/analytics - System-wide analytics
app.get("/api/admin/analytics", authenticateAdmin, requireAdminRole('super_admin', 'admin'), async (req, res) => {
  try {
    const [userStats, logStats, projectStats, recentActivity] = await Promise.all([
      pool.query(`
        SELECT 
          COUNT(DISTINCT user_id) as total_users,
          COUNT(*) as total_settings
        FROM user_settings
      `),
      pool.query(`
        SELECT 
          COUNT(*) as total_logs,
          COUNT(DISTINCT user_id) as active_users,
          SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600 - COALESCE(break_hours, 0)) as total_hours,
          COUNT(DISTINCT DATE_TRUNC('month', date)) as active_months
        FROM log_row
      `),
      pool.query(`
        SELECT 
          COUNT(*) as total_projects,
          COUNT(DISTINCT user_id) as users_with_projects,
          SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active_projects
        FROM project_info
      `),
      pool.query(`
        SELECT 
          user_id,
          COUNT(*) as log_count,
          MAX(date) as last_activity
        FROM log_row
        WHERE date >= NOW() - INTERVAL '7 days'
        GROUP BY user_id
        ORDER BY log_count DESC
        LIMIT 10
      `),
    ]);
    
    res.json({
      users: userStats.rows[0],
      logs: logStats.rows[0],
      projects: projectStats.rows[0],
      recent_active_users: recentActivity.rows,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Admin analytics error:', e);
    res.status(500).json({ error: 'Failed to fetch analytics', details: String(e) });
  }
});

// GET /api/admin/audit-log - View audit trail
app.get("/api/admin/audit-log", authenticateAdmin, requireAdminRole('super_admin', 'admin'), async (req, res) => {
  try {
    const { limit = 100, offset = 0, action, admin_id } = req.query;
    
    let query = `
      SELECT 
        aal.*,
        au.username as admin_username,
        au.email as admin_email
      FROM admin_audit_log aal
      LEFT JOIN admin_users au ON au.id = aal.admin_id
      WHERE 1=1
    `;
    const params = [];
    
    if (action) {
      params.push(action);
      query += ` AND aal.action = $${params.length}`;
    }
    
    if (admin_id) {
      params.push(admin_id);
      query += ` AND aal.admin_id = $${params.length}`;
    }
    
    query += ` ORDER BY aal.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    res.json({
      logs: result.rows,
      pagination: { limit: parseInt(limit), offset: parseInt(offset) },
    });
  } catch (e) {
    console.error('Admin audit log error:', e);
    res.status(500).json({ error: 'Failed to fetch audit log', details: String(e) });
  }
});

// ===== ADMIN SYSTEM SETTINGS ENDPOINTS =====
// GET /api/admin/settings - Get all system settings
app.get("/api/admin/settings", authenticateAdmin, requireAdminRole('super_admin', 'admin'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM system_settings ORDER BY setting_key');
    res.json(result.rows);
  } catch (e) {
    console.error('Admin settings fetch error:', e);
    res.status(500).json({ error: 'Failed to fetch settings', details: String(e) });
  }
});

// PUT /api/admin/settings/:key - Update system setting
app.put("/api/admin/settings/:key", authenticateAdmin, requireAdminRole('super_admin'), async (req, res) => {
  try {
    const { key } = req.params;
    const { value, description } = req.body;
    
    const result = await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value, description, updated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = $2, description = $3, updated_by = $4, updated_at = NOW()
       RETURNING *`,
      [key, JSON.stringify(value), description, req.adminUser.id]
    );
    
    await logAdminAction(
      req.adminUser.id,
      'setting_updated',
      'system_setting',
      key,
      { value, description },
      req.ip
    );
    
    res.json(result.rows[0]);
  } catch (e) {
    console.error('Admin settings update error:', e);
    res.status(500).json({ error: 'Failed to update setting', details: String(e) });
  }
});

// ===== CMS ENDPOINTS =====
// GET /api/admin/cms/pages/:pageId - Get page content
app.get("/api/admin/cms/pages/:pageId", authenticateAdmin, requireAdminRole('super_admin', 'admin'), async (req, res) => {
  try {
    const { pageId } = req.params;
    const result = await pool.query('SELECT * FROM cms_pages WHERE page_id = $1', [pageId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Page not found' });
    }
    
    res.json(result.rows[0]);
  } catch (e) {
    console.error('CMS page fetch error:', e);
    res.status(500).json({ error: 'Failed to fetch page', details: String(e) });
  }
});

// PUT /api/admin/cms/pages/:pageId - Update page content
app.put("/api/admin/cms/pages/:pageId", authenticateAdmin, requireAdminRole('super_admin', 'admin'), async (req, res) => {
  try {
    const { pageId } = req.params;
    const { page_name, sections, meta, is_published } = req.body;
    
    const result = await pool.query(
      `INSERT INTO cms_pages (page_id, page_name, sections, meta, is_published, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (page_id)
       DO UPDATE SET 
         page_name = $2,
         sections = $3,
         meta = $4,
         is_published = COALESCE($5, cms_pages.is_published),
         updated_by = $6,
         updated_at = NOW()
       RETURNING *`,
      [pageId, page_name, JSON.stringify(sections), JSON.stringify(meta), is_published, req.adminUser.id]
    );
    
    await logAdminAction(
      req.adminUser.id,
      'cms_page_updated',
      'cms_page',
      pageId,
      { page_name },
      req.ip
    );
    
    res.json(result.rows[0]);
  } catch (e) {
    console.error('CMS page update error:', e);
    res.status(500).json({ error: 'Failed to update page', details: String(e) });
  }
});

// GET /api/admin/cms/themes/:themeId - Get theme config
app.get("/api/admin/cms/themes/:themeId", authenticateAdmin, requireAdminRole('super_admin', 'admin'), async (req, res) => {
  try {
    const { themeId } = req.params;
    const result = await pool.query('SELECT * FROM cms_themes WHERE theme_id = $1 AND is_active = true', [themeId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Theme not found' });
    }
    
    res.json(result.rows[0]);
  } catch (e) {
    console.error('CMS theme fetch error:', e);
    res.status(500).json({ error: 'Failed to fetch theme', details: String(e) });
  }
});

// PUT /api/admin/cms/themes/:themeId - Update theme config
app.put("/api/admin/cms/themes/:themeId", authenticateAdmin, requireAdminRole('super_admin', 'admin'), async (req, res) => {
  try {
    const { themeId } = req.params;
    const { theme_name, colors, typography, spacing } = req.body;
    
    const result = await pool.query(
      `INSERT INTO cms_themes (theme_id, theme_name, theme_type, colors, typography, spacing, updated_by)
       VALUES ($1, $2, 'global', $3, $4, $5, $6)
       ON CONFLICT (theme_id)
       DO UPDATE SET 
         theme_name = $2,
         colors = $3,
         typography = $4,
         spacing = $5,
         updated_by = $6,
         updated_at = NOW()
       RETURNING *`,
      [themeId, theme_name, JSON.stringify(colors), JSON.stringify(typography), JSON.stringify(spacing), req.adminUser.id]
    );
    
    await logAdminAction(
      req.adminUser.id,
      'cms_theme_updated',
      'cms_theme',
      themeId,
      { theme_name },
      req.ip
    );
    
    res.json(result.rows[0]);
  } catch (e) {
    console.error('CMS theme update error:', e);
    res.status(500).json({ error: 'Failed to update theme', details: String(e) });
  }
});

// GET /api/admin/cms/translations - Get all translations
app.get("/api/admin/cms/translations", authenticateAdmin, requireAdminRole('super_admin', 'admin'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cms_translations ORDER BY category, translation_key');
    
    // Convert to object format expected by frontend
    const translations = result.rows.reduce((acc, row) => {
      acc[row.translation_key] = {
        key: row.translation_key,
        category: row.category,
        no: row.no,
        en: row.en,
      };
      return acc;
    }, {});
    
    res.json(translations);
  } catch (e) {
    console.error('CMS translations fetch error:', e);
    res.status(500).json({ error: 'Failed to fetch translations', details: String(e) });
  }
});

// PUT /api/admin/cms/translations - Update all translations
app.put("/api/admin/cms/translations", authenticateAdmin, requireAdminRole('super_admin', 'admin'), async (req, res) => {
  try {
    const translations = req.body;
    
    // Delete all existing translations and insert new ones (simpler than complex upsert)
    await pool.query('DELETE FROM cms_translations');
    
    const values = [];
    const params = [];
    let paramCounter = 1;
    
    Object.values(translations).forEach((t) => {
      values.push(`($${paramCounter}, $${paramCounter+1}, $${paramCounter+2}, $${paramCounter+3}, $${paramCounter+4})`);
      params.push(t.key, t.category, t.no, t.en, req.adminUser.id);
      paramCounter += 5;
    });
    
    if (values.length > 0) {
      await pool.query(
        `INSERT INTO cms_translations (translation_key, category, no, en, updated_by) VALUES ${values.join(', ')}`,
        params
      );
    }
    
    await logAdminAction(
      req.adminUser.id,
      'cms_translations_updated',
      'cms_translations',
      null,
      { count: Object.keys(translations).length },
      req.ip
    );
    
    res.json({ success: true, count: Object.keys(translations).length });
  } catch (e) {
    console.error('CMS translations update error:', e);
    res.status(500).json({ error: 'Failed to update translations', details: String(e) });
  }
});

// GET /api/admin/cms/media - Get media library
app.get("/api/admin/cms/media", authenticateAdmin, requireAdminRole('super_admin', 'admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         id,
         filename,
         original_filename,
         file_type as type,
         file_size as size,
         url,
         uploaded_by,
         created_at as uploaded_at,
         au.email as uploaded_by_email
       FROM cms_media cm
       LEFT JOIN admin_users au ON au.id = cm.uploaded_by
       ORDER BY cm.created_at DESC`
    );
    
    res.json(result.rows);
  } catch (e) {
    console.error('CMS media fetch error:', e);
    res.status(500).json({ error: 'Failed to fetch media', details: String(e) });
  }
});

// POST /api/admin/cms/media - Upload media file
app.post("/api/admin/cms/media", authenticateAdmin, requireAdminRole('super_admin', 'admin'), async (req, res) => {
  const form = formidable({
    uploadDir: uploadsDir,
    keepExtensions: true,
    maxFileSize: 50 * 1024 * 1024, // 50MB max
    filter: ({ mimetype }) => {
      // Allow images, videos, and documents
      return mimetype && (
        mimetype.startsWith('image/') ||
        mimetype.startsWith('video/') ||
        ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(mimetype)
      );
    },
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('File upload parse error:', err);
      return res.status(400).json({ error: 'Failed to parse upload', details: String(err) });
    }

    try {
      const file = files.file?.[0] || files.file;
      if (!file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const originalFilename = file.originalFilename || 'unknown';
      const filename = path.basename(file.filepath);
      const fileType = file.mimetype || 'application/octet-stream';
      const fileSize = file.size;
      const url = `/uploads/${filename}`;

      // Save to database
      const result = await pool.query(
        `INSERT INTO cms_media (filename, original_filename, file_type, file_size, url, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [filename, originalFilename, fileType, fileSize, url, req.adminUser.id]
      );

      await logAdminAction(
        req.adminUser.id,
        'cms_media_uploaded',
        'cms_media',
        result.rows[0].id,
        { filename: originalFilename, size: fileSize },
        req.ip
      );

      res.json({
        success: true,
        file: {
          id: result.rows[0].id,
          filename: result.rows[0].filename,
          original_filename: result.rows[0].original_filename,
          type: result.rows[0].file_type,
          size: result.rows[0].file_size,
          url: result.rows[0].url,
          uploaded_at: result.rows[0].created_at,
        },
      });
    } catch (e) {
      console.error('CMS media upload error:', e);
      res.status(500).json({ error: 'Failed to upload media', details: String(e) });
    }
  });
});

// DELETE /api/admin/cms/media/:id - Delete media file
app.delete("/api/admin/cms/media/:id", authenticateAdmin, requireAdminRole('super_admin', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get file info before deleting
    const file = await pool.query('SELECT * FROM cms_media WHERE id = $1', [id]);
    if (file.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Delete file from filesystem
    const filePath = path.join(__dirname, file.rows[0].url);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Delete from database
    await pool.query('DELETE FROM cms_media WHERE id = $1', [id]);
    
    await logAdminAction(
      req.adminUser.id,
      'cms_media_deleted',
      'cms_media',
      id,
      { filename: file.rows[0].filename },
      req.ip
    );
    
    res.json({ success: true });
  } catch (e) {
    console.error('CMS media deletion error:', e);
    res.status(500).json({ error: 'Failed to delete media', details: String(e) });
  }
});

// ===== CMS PUBLIC TRANSLATIONS (READ-ONLY) =====
app.get("/api/cms/translations", async (req, res) => {
  try {
    const result = await pool.query('SELECT translation_key as key, category, no, en FROM cms_translations ORDER BY category, translation_key');
    const out = result.rows.reduce((acc, r) => {
      acc[r.key] = { key: r.key, category: r.category, no: r.no, en: r.en };
      return acc;
    }, {});
    res.json(out);
  } catch (e) {
    console.error('Public translations fetch error:', e);
    res.status(500).json({ error: 'Failed to fetch translations', details: String(e) });
  }
});

// ===== CMS CONTACT FORM ENDPOINTS =====
// POST /api/cms/contact/submit - Public contact form submission
app.post("/api/cms/contact/submit", async (req, res) => {
  try {
    const { page_id = 'landing', form_id = 'contact', values } = req.body;
    const ip_address = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const user_agent = req.headers['user-agent'];
    
    if (!values || typeof values !== 'object') {
      return res.status(400).json({ error: 'Validation failed: values required' });
    }
    
    // Honeypot check - if 'hp' field is filled, it's likely a bot
    if (values.hp) {
      console.log('Honeypot triggered, skipping submission');
      return res.json({ success: true, submission_id: null, message: 'Submission received' });
    }
    
    // Fetch page content to validate against form field definitions
    const pageResult = await pool.query('SELECT content FROM cms_pages WHERE page_id = $1', [page_id]);
    if (pageResult.rows.length === 0) {
      return res.status(404).json({ error: 'Page not found' });
    }
    
    const pageContent = pageResult.rows[0].content;
    const formSection = pageContent.sections?.find(s => s.type === 'form' && s.form_id === form_id);
    
    if (!formSection) {
      return res.status(404).json({ error: 'Form not found' });
    }
    
    // Validate fields
    const errors = [];
    const cleanValues = {};
    
    for (const fieldDef of formSection.fields || []) {
      const { name, required, type } = fieldDef;
      const value = values[name];
      
      // Check required
      if (required && (!value || (typeof value === 'string' && !value.trim()))) {
        errors.push(`${name} is required`);
        continue;
      }
      
      // Type validation
      if (value) {
        if (type === 'email') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(value)) {
            errors.push(`${name} must be a valid email`);
          }
        }
        if (type === 'checkbox') {
          cleanValues[name] = !!value;
        } else {
          cleanValues[name] = String(value).trim();
        }
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', errors });
    }
    
    // Insert submission
    const result = await pool.query(
      `INSERT INTO cms_contact_submissions (page_id, form_id, fields, ip_address, user_agent, status)
       VALUES ($1, $2, $3, $4, $5, 'new')
       RETURNING id`,
      [page_id, form_id, JSON.stringify(cleanValues), ip_address, user_agent]
    );
    
    const submission_id = result.rows[0].id;
    
    // Optional webhook notification
    let webhookStatus = null;
    if (process.env.CONTACT_WEBHOOK_URL) {
      try {
        const webhookRes = await fetch(process.env.CONTACT_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submission_id, page_id, form_id, fields: cleanValues, ip_address, created_at: new Date().toISOString() }),
        });
        webhookStatus = webhookRes.ok ? 'success' : 'error';
        await pool.query(
          `INSERT INTO sync_log (user_id, sync_type, status, row_count, error_message)
           VALUES ('system', 'webhook_send', $1, 1, $2)`,
          [webhookStatus, webhookRes.ok ? null : `HTTP ${webhookRes.status}`]
        );
      } catch (webhookErr) {
        console.error('Webhook error:', webhookErr);
        webhookStatus = 'error';
        await pool.query(
          `INSERT INTO sync_log (user_id, sync_type, status, row_count, error_message)
           VALUES ('system', 'webhook_send', 'error', 1, $1)`,
          [String(webhookErr)]
        );
      }
    }
    
    res.json({ success: true, submission_id, webhook_status: webhookStatus, message: formSection.success_message || 'Thank you for your submission!' });
  } catch (e) {
    console.error('Contact form submission error:', e);
    res.status(500).json({ error: 'Failed to submit form', details: String(e) });
  }
});

// GET /api/admin/cms/contact/submissions - List contact form submissions (admin)
app.get("/api/admin/cms/contact/submissions", authenticateAdmin, requireAdminRole('super_admin', 'admin', 'moderator'), async (req, res) => {
  try {
    const { page_id, status, limit = 100 } = req.query;
    
    let query = 'SELECT * FROM cms_contact_submissions WHERE 1=1';
    const params = [];
    
    if (page_id) {
      params.push(page_id);
      query += ` AND page_id = $${params.length}`;
    }
    
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }
    
    params.push(limit);
    query += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) {
    console.error('Contact submissions fetch error:', e);
    res.status(500).json({ error: 'Failed to fetch submissions', details: String(e) });
  }
});

// PATCH /api/admin/cms/contact/submissions/:id - Update submission status
app.patch("/api/admin/cms/contact/submissions/:id", authenticateAdmin, requireAdminRole('super_admin', 'admin', 'moderator'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, error_message } = req.body;
    
    if (status && !['new', 'processed', 'error'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const result = await pool.query(
      `UPDATE cms_contact_submissions
       SET status = COALESCE($1, status),
           error_message = COALESCE($2, error_message),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, error_message, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    
    await logAdminAction(
      req.adminUser.id,
      'cms_contact_submission_updated',
      'cms_contact_submissions',
      id,
      { status, error_message },
      req.ip
    );
    
    res.json(result.rows[0]);
  } catch (e) {
    console.error('Contact submission update error:', e);
    res.status(500).json({ error: 'Failed to update submission', details: String(e) });
  }
});

// ===== COMPANY REQUESTS ENDPOINTS =====
// POST /api/company-requests - Public company registration request
app.post("/api/company-requests", async (req, res) => {
  try {
    const { name, orgnr, contact_email, contact_phone, address_line, postal_code, city, requester_email } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Company name is required' });
    }
    
    const result = await pool.query(
      `INSERT INTO company_requests (name, orgnr, contact_email, contact_phone, address_line, postal_code, city, requester_email, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING id`,
      [name, orgnr, contact_email, contact_phone, address_line, postal_code, city, requester_email]
    );
    
    res.json({ success: true, request_id: result.rows[0].id, message: 'Company request submitted successfully' });
  } catch (e) {
    console.error('Company request submission error:', e);
    res.status(500).json({ error: 'Failed to submit company request', details: String(e) });
  }
});

// GET /api/admin/company-requests - List company requests (admin)
app.get("/api/admin/company-requests", authenticateAdmin, requireAdminRole('super_admin', 'admin'), async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    
    let query = 'SELECT cr.*, au.username as processed_by_username FROM company_requests cr LEFT JOIN admin_users au ON au.id = cr.processed_by';
    const params = [];
    
    if (status && status !== 'all') {
      params.push(status);
      query += ` WHERE cr.status = $${params.length}`;
    }
    
    query += ' ORDER BY cr.created_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) {
    console.error('Company requests fetch error:', e);
    res.status(500).json({ error: 'Failed to fetch company requests', details: String(e) });
  }
});

// PATCH /api/admin/company-requests/:id - Approve/reject company request
app.patch("/api/admin/company-requests/:id", authenticateAdmin, requireAdminRole('super_admin', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be approved or rejected' });
    }
    
    // Get request details
    const request = await pool.query('SELECT * FROM company_requests WHERE id = $1', [id]);
    if (request.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    // Update request status
    await pool.query(
      `UPDATE company_requests
       SET status = $1, notes = COALESCE($2, notes), processed_by = $3, processed_at = NOW()
       WHERE id = $4`,
      [status, notes, req.adminUser.id, id]
    );
    
    // If approved, create company
    if (status === 'approved') {
      const { name, orgnr, contact_email, contact_phone, address_line, postal_code, city } = request.rows[0];
      await pool.query(
        `INSERT INTO companies (name, orgnr, contact_email, contact_phone, address_line, postal_code, city, display_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
         ON CONFLICT (name) DO NOTHING`,
        [name, orgnr, contact_email, contact_phone, address_line, postal_code, city]
      );
    }
    
    await logAdminAction(
      req.adminUser.id,
      `company_request_${status}`,
      'company_requests',
      id,
      { status, notes, company_name: request.rows[0].name },
      req.ip
    );
    
    res.json({ success: true, status, message: `Company request ${status}` });
  } catch (e) {
    console.error('Company request update error:', e);
    res.status(500).json({ error: 'Failed to update company request', details: String(e) });
  }
});

// ===== COMPANY USER MANAGEMENT ENDPOINTS =====
// GET /api/admin/companies/:companyId/users - List company users
app.get("/api/admin/companies/:companyId/users", authenticateAdmin, requireAdminRole('super_admin', 'admin'), async (req, res) => {
  try {
    const { companyId } = req.params;
    
    const usersResult = await pool.query(
      `SELECT cu.id, cu.user_email, cu.google_email, cu.role, cu.approved, cu.created_at, cu.updated_at
       FROM company_users cu
       WHERE cu.company_id = $1
       ORDER BY cu.created_at DESC`,
      [companyId]
    );
    
    // Fetch cases for each user
    const usersWithCases = await Promise.all(
      usersResult.rows.map(async (user) => {
        const casesResult = await pool.query(
          'SELECT id, case_id, notes, created_at FROM user_cases WHERE company_user_id = $1 ORDER BY created_at DESC',
          [user.id]
        );
        return { ...user, cases: casesResult.rows };
      })
    );
    
    res.json({ users: usersWithCases });
  } catch (e) {
    console.error('Company users fetch error:', e);
    res.status(500).json({ error: 'Failed to fetch company users', details: String(e) });
  }
});

// POST /api/admin/companies/:companyId/users - Add company user
app.post("/api/admin/companies/:companyId/users", authenticateAdmin, requireAdminRole('super_admin', 'admin'), async (req, res) => {
  try {
    const { companyId } = req.params;
    const { user_email, google_email, role = 'member', approved = false } = req.body;
    
    if (!user_email) {
      return res.status(400).json({ error: 'user_email is required' });
    }
    
    const result = await pool.query(
      `INSERT INTO company_users (company_id, user_email, google_email, role, approved)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (company_id, user_email) DO UPDATE
       SET google_email = EXCLUDED.google_email,
           role = EXCLUDED.role,
           approved = EXCLUDED.approved,
           updated_at = NOW()
       RETURNING *`,
      [companyId, user_email, google_email, role, approved]
    );
    
    await logAdminAction(
      req.adminUser.id,
      'company_user_added',
      'company_users',
      result.rows[0].id,
      { company_id: companyId, user_email },
      req.ip
    );
    
    res.json(result.rows[0]);
  } catch (e) {
    console.error('Company user add error:', e);
    res.status(500).json({ error: 'Failed to add company user', details: String(e) });
  }
});

// PATCH /api/admin/companies/:companyId/users/:userId - Update company user
app.patch("/api/admin/companies/:companyId/users/:userId", authenticateAdmin, requireAdminRole('super_admin', 'admin'), async (req, res) => {
  try {
    const { companyId, userId } = req.params;
    const { google_email, role, approved } = req.body;
    
    const result = await pool.query(
      `UPDATE company_users
       SET google_email = COALESCE($1, google_email),
           role = COALESCE($2, role),
           approved = COALESCE($3, approved),
           updated_at = NOW()
       WHERE id = $4 AND company_id = $5
       RETURNING *`,
      [google_email, role, approved, userId, companyId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Company user not found' });
    }
    
    await logAdminAction(
      req.adminUser.id,
      'company_user_updated',
      'company_users',
      userId,
      { company_id: companyId, changes: { google_email, role, approved } },
      req.ip
    );
    
    res.json(result.rows[0]);
  } catch (e) {
    console.error('Company user update error:', e);
    res.status(500).json({ error: 'Failed to update company user', details: String(e) });
  }
});

// DELETE /api/admin/companies/:companyId/users/:userId - Remove company user
app.delete("/api/admin/companies/:companyId/users/:userId", authenticateAdmin, requireAdminRole('super_admin', 'admin'), async (req, res) => {
  try {
    const { companyId, userId } = req.params;
    
    const result = await pool.query(
      'DELETE FROM company_users WHERE id = $1 AND company_id = $2 RETURNING user_email',
      [userId, companyId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Company user not found' });
    }
    
    await logAdminAction(
      req.adminUser.id,
      'company_user_deleted',
      'company_users',
      userId,
      { company_id: companyId, user_email: result.rows[0].user_email },
      req.ip
    );
    
    res.json({ success: true });
  } catch (e) {
    console.error('Company user deletion error:', e);
    res.status(500).json({ error: 'Failed to delete company user', details: String(e) });
  }
});

// POST /api/admin/companies/:companyId/users/:userId/cases - Add case to user
app.post("/api/admin/companies/:companyId/users/:userId/cases", authenticateAdmin, requireAdminRole('super_admin', 'admin'), async (req, res) => {
  try {
    const { companyId, userId } = req.params;
    const { case_id, notes } = req.body;
    
    if (!case_id) {
      return res.status(400).json({ error: 'case_id is required' });
    }
    
    // Verify user belongs to company
    const userCheck = await pool.query(
      'SELECT id FROM company_users WHERE id = $1 AND company_id = $2',
      [userId, companyId]
    );
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Company user not found' });
    }
    
    const result = await pool.query(
      `INSERT INTO user_cases (company_user_id, case_id, notes)
       VALUES ($1, $2, $3)
       ON CONFLICT (company_user_id, case_id) DO UPDATE
       SET notes = EXCLUDED.notes
       RETURNING *`,
      [userId, case_id, notes]
    );
    
    await logAdminAction(
      req.adminUser.id,
      'company_user_case_added',
      'user_cases',
      result.rows[0].id,
      { company_id: companyId, user_id: userId, case_id },
      req.ip
    );
    
    res.json(result.rows[0]);
  } catch (e) {
    console.error('Company user case add error:', e);
    res.status(500).json({ error: 'Failed to add case', details: String(e) });
  }
});

// DELETE /api/admin/companies/:companyId/users/:userId/cases/:caseRowId - Remove case from user
app.delete("/api/admin/companies/:companyId/users/:userId/cases/:caseRowId", authenticateAdmin, requireAdminRole('super_admin', 'admin'), async (req, res) => {
  try {
    const { companyId, userId, caseRowId } = req.params;
    
    // Verify user belongs to company and case belongs to user
    const caseCheck = await pool.query(
      `SELECT cuc.id, cuc.case_id
       FROM user_cases cuc
       JOIN company_users cu ON cu.id = cuc.company_user_id
       WHERE cuc.id = $1 AND cu.id = $2 AND cu.company_id = $3`,
      [caseRowId, userId, companyId]
    );
    
    if (caseCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Case not found' });
    }
    
    await pool.query('DELETE FROM user_cases WHERE id = $1', [caseRowId]);
    
    await logAdminAction(
      req.adminUser.id,
      'company_user_case_deleted',
      'user_cases',
      caseRowId,
      { company_id: companyId, user_id: userId, case_id: caseCheck.rows[0].case_id },
      req.ip
    );
    
    res.json({ success: true });
  } catch (e) {
    console.error('Company user case deletion error:', e);
    res.status(500).json({ error: 'Failed to delete case', details: String(e) });
  }
});

// ===== COMPANY THEME ENDPOINTS =====
// Note: These are placeholder endpoints. You'll need to implement company auth middleware
// GET /api/company/theme - Get company theme
app.get("/api/company/theme", async (req, res) => {
  try {
    // TODO: Add company authentication middleware
    // For now, return default theme or 404
    res.status(404).json({ error: 'Company theme not implemented yet' });
  } catch (e) {
    console.error('Company theme fetch error:', e);
    res.status(500).json({ error: 'Failed to fetch theme', details: String(e) });
  }
});

// PUT /api/company/theme - Update company theme
app.put("/api/company/theme", async (req, res) => {
  try {
    // TODO: Add company authentication middleware
    // TODO: Get company_id from auth token
    const { primary_color, secondary_color } = req.body;
    
    res.status(501).json({ 
      error: 'Company theme updates not fully implemented',
      message: 'Need to implement company authentication first'
    });
  } catch (e) {
    console.error('Company theme update error:', e);
    res.status(500).json({ error: 'Failed to update theme', details: String(e) });
  }
});

// ===== GDPR COMPLIANCE ENDPOINTS =====
// POST /api/gdpr/export-data - Export all user data (GDPR Right to Data Portability)
// Body: { user_id?: 'default' }
app.post("/api/gdpr/export-data", async (req, res) => {
  try {
    const { user_id = 'default' } = req.body;
    
    // Fetch all user data from all tables
    const [logs, settings, projectInfo, templates, syncLog] = await Promise.all([
      pool.query('SELECT * FROM log_row WHERE user_id = $1 ORDER BY date DESC, start_time DESC', [user_id]),
      pool.query('SELECT * FROM user_settings WHERE user_id = $1', [user_id]),
      pool.query('SELECT * FROM project_info WHERE user_id = $1 ORDER BY created_at DESC', [user_id]),
      pool.query('SELECT * FROM quick_templates WHERE user_id = $1 ORDER BY display_order ASC', [user_id]),
      pool.query('SELECT * FROM sync_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [user_id]),
    ]);
    
    // Remove sensitive fields from settings (passwords, tokens)
    const sanitizedSettings = settings.rows[0] ? {
      ...settings.rows[0],
      smtp_app_password: settings.rows[0].smtp_app_password ? '[REDACTED]' : null,
      google_access_token: settings.rows[0].google_access_token ? '[REDACTED]' : null,
      google_refresh_token: settings.rows[0].google_refresh_token ? '[REDACTED]' : null,
    } : null;
    
    const exportData = {
      export_date: new Date().toISOString(),
      user_id,
      data: {
        logs: logs.rows,
        settings: sanitizedSettings,
        projects: projectInfo.rows,
        templates: templates.rows,
        sync_history: syncLog.rows,
      },
      statistics: {
        total_logs: logs.rows.length,
        total_projects: projectInfo.rows.length,
        total_templates: templates.rows.length,
        total_syncs: syncLog.rows.length,
      },
      gdpr_notice: 'This export contains all your personal data stored in Smart Timing. You can use this to transfer your data to another service (data portability) or for your records.',
    };
    
    res.json(exportData);
  } catch (e) {
    console.error('GDPR export error:', e);
    res.status(500).json({ error: 'Failed to export user data', details: String(e) });
  }
});

// DELETE /api/gdpr/delete-account - Permanently delete all user data (GDPR Right to be Forgotten)
// Body: { user_id?: 'default', confirmation: 'DELETE_MY_ACCOUNT' }
app.delete("/api/gdpr/delete-account", async (req, res) => {
  try {
    const { user_id = 'default', confirmation } = req.body;
    
    // Require explicit confirmation to prevent accidental deletions
    if (confirmation !== 'DELETE_MY_ACCOUNT') {
      return res.status(400).json({ 
        error: 'Confirmation required', 
        message: 'You must provide confirmation: "DELETE_MY_ACCOUNT"' 
      });
    }
    
    // Delete all user data from all tables (cascading deletes will handle log_row via FK)
    const results = await Promise.all([
      pool.query('DELETE FROM log_row WHERE user_id = $1', [user_id]),
      pool.query('DELETE FROM user_settings WHERE user_id = $1', [user_id]),
      pool.query('DELETE FROM project_info WHERE user_id = $1', [user_id]),
      pool.query('DELETE FROM quick_templates WHERE user_id = $1', [user_id]),
      pool.query('DELETE FROM sync_log WHERE user_id = $1', [user_id]),
    ]);
    
    const totalDeleted = results.reduce((sum, r) => sum + r.rowCount, 0);
    
    res.json({
      success: true,
      message: 'All user data has been permanently deleted',
      deleted_records: {
        logs: results[0].rowCount,
        settings: results[1].rowCount,
        projects: results[2].rowCount,
        templates: results[3].rowCount,
        sync_history: results[4].rowCount,
        total: totalDeleted,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('GDPR account deletion error:', e);
    res.status(500).json({ error: 'Failed to delete account', details: String(e) });
  }
});

// Global error handler (must be after all routes)
app.use((err, req, res, next) => {
  console.error(`[ERROR] Unhandled error in ${req.method} ${req.path}:`, err);
  
  // Don't leak error details in production
  const isProduction = process.env.NODE_ENV === 'production';
  
  res.status(err.status || 500).json({
    error: isProduction ? 'Internal server error' : err.message,
    requestId: req.requestId,
    path: req.path,
    timestamp: new Date().toISOString(),
    ...(isProduction ? {} : { stack: err.stack }),
  });
});

const PORT = process.env.PORT || 4000;
// Global error handlers for uncaught errors
process.on('uncaughtException', (error) => {
  console.error('💥 UNCAUGHT EXCEPTION:', error);
  console.error('Stack:', error.stack);
  // Log but don't exit immediately - let health checks detect the issue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 UNHANDLED REJECTION at:', promise);
  console.error('Reason:', reason);
  // Log but don't exit immediately
});

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  if (isShuttingDown) {
    console.log('Shutdown already in progress...');
    return;
  }
  
  isShuttingDown = true;
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(async () => {
    console.log('✅ HTTP server closed');
    
    try {
      // Close database pool
      await pool.end();
      console.log('✅ Database pool closed');
      
      console.log('✅ Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error during shutdown:', err);
      process.exit(1);
    }
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Initialize database and start server
let server;
initTables()
  .then(() => {
    // On Vercel (@vercel/node), the app is exported as a handler and should not call listen()
    if (!process.env.VERCEL) {
      server = app.listen(PORT, '0.0.0.0', () => {
        serverStartTime = Date.now();
        console.log(`🚀 Backend running on http://localhost:${PORT}`);
        console.log(`📊 Health endpoint: http://localhost:${PORT}/api/health`);
        try {
          console.log(`🗄️  Database: ${pool.options.connectionString.split('@')[1].split('?')[0]}`);
        } catch {}
        console.log(`⏱️  Started at: ${new Date().toISOString()}`);
      });
      
      // Handle server errors
      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`❌ Port ${PORT} is already in use`);
          process.exit(1);
        } else {
          console.error('❌ Server error:', error);
        }
      });
    } else {
      console.log('Vercel environment detected; exporting Express app as handler without listen()');
    }
  })
  .catch((error) => {
    console.error('❌ Failed to initialize database:', error);
    process.exit(1);
  });
