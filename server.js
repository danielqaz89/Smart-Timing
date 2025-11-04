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
dotenv.config();
const app = express();
const allowedOrigins = (process.env.FRONTEND_ORIGINS || "https://smart-timing-git-main-daniel-qazis-projects.vercel.app,http://localhost:3000,http://127.0.0.1:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const allowedOriginSuffixes = (process.env.FRONTEND_ORIGIN_SUFFIXES || ".vercel.app")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

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
app.use(express.json());
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function initTables(){
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    
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
  `);
  
  // Alter existing tables (safe, only adds if not exists) - run separately
  await pool.query(`
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
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS invoice_reminder_active BOOLEAN DEFAULT false;
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS theme_mode TEXT DEFAULT 'dark';
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS view_mode TEXT DEFAULT 'month';
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS google_access_token TEXT;
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS google_token_expiry TIMESTAMP;
  `);
  
  // Create indexes (after columns exist)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_log_row_date ON log_row (date DESC, start_time DESC);
    CREATE INDEX IF NOT EXISTS idx_log_row_user ON log_row(user_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_log_row_stamped ON log_row(user_id, is_stamped_in) WHERE is_stamped_in = true;
    CREATE INDEX IF NOT EXISTS idx_log_row_archived ON log_row(user_id, is_archived) WHERE is_archived = false;
    CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
    CREATE INDEX IF NOT EXISTS idx_project_info_user_active ON project_info(user_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_quick_templates_user ON quick_templates(user_id, display_order);
    CREATE INDEX IF NOT EXISTS idx_sync_log_user_time ON sync_log(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_user_settings_google_auth ON user_settings(user_id, google_token_expiry);
  `);
  console.log("✅ Tables initialized with persistence schema");
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
  const {date,start,end,breakHours,activity,title,project,place,notes,expenseCoverage}=req.body;
  const res=await pool.query(
    `INSERT INTO log_row (date,start_time,end_time,break_hours,activity,title,project,place,notes,expense_coverage)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [date,start,end,breakHours,activity,title,project,place,notes,expenseCoverage||0]
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
      const base = i * 10;
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
        row.expenseCoverage ?? 0
      );
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10})`;
    })
    .join(",");
  const q = `INSERT INTO log_row (date,start_time,end_time,break_hours,activity,title,project,place,notes,expense_coverage) VALUES ${placeholders} RETURNING id`;
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

// ✅ Add this health-check route
app.get("/api/test", (req, res) => {
  res.json({ ok: true, message: "Smart Timing backend is working" });
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

const PORT = process.env.PORT || 4000;
initTables().then(() =>
  app.listen(PORT, () => console.log(`🚀 Backend running on http://localhost:${PORT}`))
);
