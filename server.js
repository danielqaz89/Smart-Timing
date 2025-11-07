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
      page_id TEXT UNIQUE NOT NULL,
      page_name TEXT NOT NULL,
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
    CREATE TABLE IF NOT EXISTS cms_translations (
      id TEXT PRIMARY KEY,
      translations JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // CMS themes table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cms_themes (
      id TEXT PRIMARY KEY,
      theme JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // CMS pages table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cms_pages (
      id TEXT PRIMARY KEY,
      content JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // CMS contact submissions table (stores contact form entries)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cms_contact_submissions (
      id SERIAL PRIMARY KEY,
      page_id TEXT NOT NULL,
      form_id TEXT NOT NULL,
      fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      ip_address TEXT,
      user_agent TEXT,
      status TEXT CHECK (status IN ('new','processed','error')) DEFAULT 'new',
      error_message TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
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
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS invoice_reminder_active BOOLEAN DEFAULT false;
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS theme_mode TEXT DEFAULT 'dark';
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS view_mode TEXT DEFAULT 'month';
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS google_access_token TEXT;
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS google_token_expiry TIMESTAMP;
  `);
  
  // Create indexes (after columns exist)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
    CREATE INDEX IF NOT EXISTS idx_company_users_company ON company_users(company_id, approved);
    CREATE INDEX IF NOT EXISTS idx_company_users_email ON company_users(user_email);
    CREATE INDEX IF NOT EXISTS idx_user_cases_user ON user_cases(company_user_id);
    CREATE INDEX IF NOT EXISTS idx_user_cases_case ON user_cases(case_id);
    CREATE INDEX IF NOT EXISTS idx_company_invites_company ON company_invites(company_id, invited_email);
    CREATE INDEX IF NOT EXISTS idx_company_invites_token ON company_invites(token);
    CREATE INDEX IF NOT EXISTS idx_company_audit_company_time ON company_audit_log(company_id, created_at DESC);

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
    CREATE INDEX IF NOT EXISTS idx_cms_pages_page_id ON cms_pages(page_id);
    CREATE INDEX IF NOT EXISTS idx_cms_pages_published ON cms_pages(is_published);
    CREATE INDEX IF NOT EXISTS idx_cms_themes_theme_id ON cms_themes(theme_id);
    CREATE INDEX IF NOT EXISTS idx_cms_themes_type_company ON cms_themes(theme_type, company_id) WHERE theme_type = 'company';
    CREATE INDEX IF NOT EXISTS idx_cms_translations_key ON cms_translations(translation_key);
    CREATE INDEX IF NOT EXISTS idx_cms_translations_category ON cms_translations(category);
    CREATE INDEX IF NOT EXISTS idx_cms_media_uploaded_by ON cms_media(uploaded_by, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cms_media_file_type ON cms_media(file_type);
    CREATE INDEX IF NOT EXISTS idx_cms_contact_submissions_status ON cms_contact_submissions(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cms_contact_submissions_page_id ON cms_contact_submissions(page_id);
    CREATE INDEX IF NOT EXISTS idx_company_requests_status ON company_requests(status, created_at DESC);
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
        theme_mode: 'dark',
        view_mode: 'month',
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
      invoice_reminder_active, theme_mode, view_mode
    } = req.body;
    
    const result = await pool.query(`
      INSERT INTO user_settings (
        user_id, paid_break, tax_pct, hourly_rate,
        timesheet_sender, timesheet_recipient, timesheet_format,
        smtp_app_password, webhook_active, webhook_url, sheet_url, month_nav, 
        invoice_reminder_active, theme_mode, view_mode, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
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
        updated_at = NOW()
      RETURNING *
    `, [userId, paid_break, tax_pct, hourly_rate, timesheet_sender, timesheet_recipient,
        timesheet_format, smtp_app_password, webhook_active, webhook_url, sheet_url, month_nav,
        invoice_reminder_active, theme_mode, view_mode]);
    
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
    const user_id = state || 'default';
    
    if (!code) {
      return res.status(400).send('Authorization code missing');
    }
    
    const oauth2Client = getOAuth2Client();
    
    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
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
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
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

// ===== CMS TRANSLATIONS (Admin) =====
// Public GET for frontend translation context
app.get('/api/admin/cms/translations', async (req, res) => {
  try {
    const r = await pool.query('SELECT translations FROM cms_translations WHERE id=$1', ['global']);
    const data = r.rows[0]?.translations || {};
    // Return raw map for client consumption
    res.json(data);
  } catch (e) {
    console.error('GET cms_translations failed', e);
    res.status(500).json({ error: 'Failed to load translations' });
  }
});

// Protected PUT to update all translations
app.put('/api/admin/cms/translations', authenticateAdmin, requireAdminRole('admin','super_admin'), async (req, res) => {
  try {
    const payload = (req.body && req.body.translations) ? req.body.translations : (req.body || {});
    await pool.query(`
      INSERT INTO cms_translations (id, translations, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (id) DO UPDATE SET translations = EXCLUDED.translations, updated_at = NOW()
    `, ['global', payload]);

    try { await logAdminAction(req.adminUser.id, 'cms_translations_updated', 'cms_translations', 'global', { keys: Object.keys(payload || {}).length }, req.ip); } catch {}

    res.json({ ok: true });
  } catch (e) {
    console.error('PUT cms_translations failed', e);
    res.status(500).json({ error: 'Failed to save translations' });
  }
});

// ===== CMS THEME =====
// Public GET for global theme
app.get('/api/admin/cms/themes/global', async (req, res) => {
  try {
    const r = await pool.query('SELECT theme FROM cms_themes WHERE id=$1', ['global']);
    res.json(r.rows[0]?.theme || {});
  } catch (e) {
    console.error('GET cms_theme failed', e);
    res.status(500).json({ error: 'Failed to load theme' });
  }
});

// Protected PUT to update global theme
app.put('/api/admin/cms/themes/global', authenticateAdmin, requireAdminRole('admin','super_admin'), async (req, res) => {
  try {
    const theme = req.body && (req.body.theme || req.body) || {};
    await pool.query(`
      INSERT INTO cms_themes (id, theme, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (id) DO UPDATE SET theme = EXCLUDED.theme, updated_at = NOW()
    `, ['global', theme]);
    try { await logAdminAction(req.adminUser.id, 'cms_theme_updated', 'cms_theme', 'global', null, req.ip); } catch {}
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT cms_theme failed', e);
    res.status(500).json({ error: 'Failed to save theme' });
  }
});

// ===== CMS PAGES =====
// Public GET page content by id
app.get('/api/admin/cms/pages/:pageId', async (req, res) => {
  try {
    const pageId = req.params.pageId;
    const r = await pool.query('SELECT content FROM cms_pages WHERE id=$1', [pageId]);
    res.json(r.rows[0]?.content || {});
  } catch (e) {
    console.error('GET cms_page failed', e);
    res.status(500).json({ error: 'Failed to load page' });
  }
});

// Protected PUT page content by id
app.put('/api/admin/cms/pages/:pageId', authenticateAdmin, requireAdminRole('admin','super_admin'), async (req, res) => {
  try {
    const pageId = req.params.pageId;
    const content = req.body && (req.body.content || req.body) || {};
    await pool.query(`
      INSERT INTO cms_pages (id, content, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
    `, [pageId, content]);
    try { await logAdminAction(req.adminUser.id, 'cms_page_updated', 'cms_page', pageId, null, req.ip); } catch {}
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT cms_page failed', e);
    res.status(500).json({ error: 'Failed to save page' });
  }
});

// ===== CMS CONTACT FORM SUBMISSIONS =====
// Public endpoint to submit contact form defined in CMS page sections (type: 'form')
app.post('/api/cms/contact/submit', async (req, res) => {
  try {
    const body = req.body || {};
    const page_id = typeof body.page_id === 'string' ? body.page_id : 'landing';
    const form_id = typeof body.form_id === 'string' ? body.form_id : 'contact_form';
    const values = (body.values && typeof body.values === 'object') ? body.values : {};

    // Load form definition from CMS page
    const pageRow = await pool.query('SELECT content FROM cms_pages WHERE id = $1', [page_id]);
    const content = pageRow.rows[0]?.content || {};
    const sections = Array.isArray(content.sections) ? content.sections : [];
    const formSection = sections.find((s) => (s?.id === form_id) && (s?.type === 'form'))
      || sections.find((s) => s?.type === 'form');

    if (!formSection || !Array.isArray(formSection?.content?.fields)) {
      return res.status(400).json({ error: 'Form not configured' });
    }

    const fieldsDef = formSection.content.fields;
    const errors = [];
    const clean = {};

    for (const f of fieldsDef) {
      const name = String(f?.name || '').trim();
      if (!name) continue;
      const type = String(f?.type || 'text');
      const required = Boolean(f?.required);
      let v = values[name];

      if (type === 'checkbox') {
        v = Boolean(v);
        if (required && v !== true) errors.push(`${name} required`);
      } else if (type === 'email') {
        if (v == null || typeof v !== 'string' || v.trim() === '') {
          if (required) errors.push(`${name} required`);
        } else {
          v = String(v).trim();
          const re = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
          if (!re.test(v)) errors.push(`${name} invalid`);
        }
      } else {
        if (v == null || typeof v !== 'string' || v.trim() === '') {
          if (required) errors.push(`${name} required`);
        } else {
          v = String(v).trim();
        }
      }
      if (v !== undefined) clean[name] = v;
    }

    if (errors.length) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    // Basic honeypot (optional hidden field)
    if (values.hp) {
      return res.json({ ok: true, skipped: true });
    }

    const ip = req.ip || null;
    const ua = req.headers?.['user-agent'] || null;

    const insert = await pool.query(`
      INSERT INTO cms_contact_submissions (page_id, form_id, fields, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, created_at
    `, [page_id, form_id, clean, ip, ua]);

    const submissionId = insert.rows[0].id;
    let webhook = 'skipped';

    if (process.env.CONTACT_WEBHOOK_URL) {
      try {
        const resp = await fetch(process.env.CONTACT_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            submission_id: submissionId,
            page_id,
            form_id,
            fields: clean,
            ip_address: ip,
            user_agent: ua,
            created_at: insert.rows[0].created_at,
          }),
        });
        webhook = resp.ok ? 'success' : `error:${resp.status}`;
        await pool.query(
          'UPDATE cms_contact_submissions SET status = $1, updated_at = NOW(), error_message = $2 WHERE id = $3',
          [resp.ok ? 'processed' : 'error', resp.ok ? null : `Webhook HTTP ${resp.status}`, submissionId]
        );
        await pool.query(
          `INSERT INTO sync_log (user_id, sync_type, status, row_count, error_message) VALUES ($1, 'webhook_send', $2, $3, $4)`,
          ['default', resp.ok ? 'success' : 'error', 1, resp.ok ? null : `HTTP ${resp.status}`]
        );
      } catch (e) {
        webhook = 'error';
        await pool.query(
          'UPDATE cms_contact_submissions SET status = $1, updated_at = NOW(), error_message = $2 WHERE id = $3',
          ['error', String(e), submissionId]
        );
        await pool.query(
          `INSERT INTO sync_log (user_id, sync_type, status, row_count, error_message) VALUES ($1, 'webhook_send', 'error', $2, $3)`,
          ['default', 0, String(e)]
        );
      }
    }

    res.json({ ok: true, submission_id: submissionId, webhook });
  } catch (e) {
    console.error('Contact submit error:', e);
    res.status(500).json({ error: 'Failed to submit form' });
  }
});

// Admin: list contact submissions
app.get('/api/admin/cms/contact/submissions', authenticateAdmin, requireAdminRole('admin','super_admin'), async (req, res) => {
  try {
    const { page_id, status, limit } = req.query || {};
    const clauses = [];
    const vals = [];
    if (page_id) { vals.push(String(page_id)); clauses.push(`page_id = $${vals.length}`); }
    if (status) { vals.push(String(status)); clauses.push(`status = $${vals.length}`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const lim = Math.min(parseInt(limit || '50', 10) || 50, 200);
    const rows = (await pool.query(`SELECT * FROM cms_contact_submissions ${where} ORDER BY created_at DESC LIMIT ${lim}`, vals)).rows;
    res.json({ submissions: rows });
  } catch (e) {
    console.error('List submissions error:', e);
    res.status(500).json({ error: 'Failed to list submissions' });
  }
});

// Admin: update submission status
app.patch('/api/admin/cms/contact/submissions/:id', authenticateAdmin, requireAdminRole('admin','super_admin'), async (req, res) => {
  try {
    const { status, error_message } = req.body || {};
    if (!['new','processed','error'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const r = await pool.query(
      'UPDATE cms_contact_submissions SET status = $1, error_message = COALESCE($2, error_message), updated_at = NOW() WHERE id = $3 RETURNING *',
      [status, error_message || null, req.params.id]
    );
    res.json(r.rows[0] || null);
  } catch (e) {
    console.error('Update submission error:', e);
    res.status(500).json({ error: 'Failed to update submission' });
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

async function sendInviteEmail(to, link, companyName) {
  const provider = process.env.SMTP_HOST ? {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
  } : guessSmtpByEmail(to);
  const authUser = process.env.SMTP_USER || process.env.EMAIL_FROM || 'noreply@smarttiming.no';
  const authPass = process.env.SMTP_PASS || process.env.SMTP_APP_PASSWORD;
  const transport = nodemailer.createTransport({
    ...provider,
    auth: authPass ? { user: authUser, pass: authPass } : undefined,
  });
  const fromAddr = process.env.EMAIL_FROM || 'Smart Timing <noreply@smarttiming.no>';
  await transport.sendMail({
    from: fromAddr,
    to,
    subject: `Invitasjon til ${companyName} • Smart Timing`,
    text: `Du er invitert til å bli med i ${companyName} i Smart Timing. Klikk for å godta invitasjonen: ${link}\n\nLenken utløper om 7 dager.`,
  });
}

app.post('/api/company/invites', authenticateCompany, requireCompanyRole('admin'), async (req, res) => {
  try {
    const { invited_email, role = 'member' } = req.body || {};
    if (!invited_email) return res.status(400).json({ error: 'invited_email is required' });
    const invite = (await pool.query(`INSERT INTO company_invites (company_id, invited_email, role, invited_by) VALUES ($1, $2, $3, $4) RETURNING *`, [req.companyUser.company_id, invited_email.toLowerCase(), role, req.companyUser.user_id])).rows[0];
    const company = (await pool.query('SELECT name FROM companies WHERE id = $1', [req.companyUser.company_id])).rows[0];
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const link = `${process.env.BACKEND_URL || 'http://localhost:4000'}/api/company/invites/accept?token=${encodeURIComponent(invite.token)}`;
    await sendInviteEmail(invited_email, link, company?.name || 'Smart Timing');
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
    await sendInviteEmail(inv.invited_email, link, company?.name || 'Smart Timing');
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
    return res.redirect(`${frontendUrl}/portal?invite=success`);
  } catch (e) {
    console.error('Invite accept error:', e);
    res.status(500).send('Failed to accept invite');
  }
});

// ===== ADMIN USER MANAGEMENT ENDPOINTS =====
// GET /api/admin/users - List all users with stats
app.get("/api/admin/users", authenticateAdmin, requireAdminRole('super_admin', 'admin', 'moderator'), async (req, res) => {
  try {
    const { search, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT 
        us.user_id,
        us.created_at as user_since,
        us.hourly_rate,
        us.theme_mode,
        COUNT(DISTINCT lr.id) as total_logs,
        COUNT(DISTINCT pi.id) as total_projects,
        MAX(lr.date) as last_activity_date
      FROM user_settings us
      LEFT JOIN log_row lr ON lr.user_id = us.user_id
      LEFT JOIN project_info pi ON pi.user_id = us.user_id
    `;
    
    const params = [];
    if (search) {
      query += ` WHERE us.user_id ILIKE $1`;
      params.push(`%${search}%`);
    }
    
    query += ` GROUP BY us.user_id, us.created_at, us.hourly_rate, us.theme_mode ORDER BY us.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(DISTINCT user_id) as total FROM user_settings';
    if (search) {
      countQuery += ' WHERE user_id ILIKE $1';
    }
    const countResult = await pool.query(countQuery, search ? [`%${search}%`] : []);
    
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
    server = app.listen(PORT, '0.0.0.0', () => {
      serverStartTime = Date.now();
      console.log(`🚀 Backend running on http://localhost:${PORT}`);
      console.log(`📊 Health endpoint: http://localhost:${PORT}/api/health`);
      console.log(`🗄️  Database: ${pool.options.connectionString.split('@')[1].split('?')[0]}`);
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
  })
  .catch((error) => {
    console.error('❌ Failed to initialize database:', error);
    process.exit(1);
  });
