import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";
const { Pool } = pkg;
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import nodemailer from "nodemailer";
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
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS invoice_reminder_active BOOLEAN DEFAULT false;
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS theme_mode TEXT DEFAULT 'dark';
    ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS view_mode TEXT DEFAULT 'month';
  `);
  
  // Create indexes (after columns exist)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_log_row_date ON log_row (date DESC, start_time DESC);
    CREATE INDEX IF NOT EXISTS idx_log_row_user ON log_row(user_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_log_row_stamped ON log_row(user_id, is_stamped_in) WHERE is_stamped_in = true;
    CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
    CREATE INDEX IF NOT EXISTS idx_project_info_user_active ON project_info(user_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_quick_templates_user ON quick_templates(user_id, display_order);
    CREATE INDEX IF NOT EXISTS idx_sync_log_user_time ON sync_log(user_id, created_at DESC);
  `);
  console.log("✅ Tables initialized with persistence schema");
}
app.get("/",(_,r)=>r.send("✅ Smart Stempling backend is running"));
app.get("/api/logs", async (req, res) => {
  const { month } = req.query;
  if (month) {
    const rows = (
      await pool.query(
        "SELECT * FROM log_row WHERE to_char(date,'YYYYMM')=$1 ORDER BY date DESC, start_time DESC",
        [String(month)]
      )
    ).rows;
    return res.json(rows);
  }
  // Default: current month only
  const rows = (
    await pool.query(
      "SELECT * FROM log_row WHERE date >= date_trunc('month', now()) ORDER BY date DESC, start_time DESC"
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

const PORT = process.env.PORT || 4000;
initTables().then(() =>
  app.listen(PORT, () => console.log(`🚀 Backend running on http://localhost:${PORT}`))
);
