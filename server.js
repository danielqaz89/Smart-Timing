import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";
const { Pool } = pkg;

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/* ──────────────── Initialize Tables Automatically ──────────────── */
async function initTables() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS project_info (
      id SERIAL PRIMARY KEY,
      konsulent TEXT,
      oppdragsgiver TEXT,
      tiltak TEXT,
      periode TEXT,
      klient_id TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

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
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("✅ Tables ensured/initialized");
}

/* ──────────────── API Routes ──────────────── */

// Health check
app.get("/api/test", async (_, res) => {
  const result = await pool.query("SELECT NOW()");
  res.json({ ok: true, serverTime: result.rows[0].now });
});

// ─── Logs CRUD ─────────────────────────────
app.get("/api/logs", async (_, res) => {
  const r = await pool.query("SELECT * FROM log_row ORDER BY created_at DESC");
  res.json(r.rows);
});

app.post("/api/logs", async (req, res) => {
  const { date, start, end, breakHours, activity, title, project, place, notes } = req.body;
  const r = await pool.query(
    `INSERT INTO log_row (date,start_time,end_time,break_hours,activity,title,project,place,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [date, start, end, breakHours, activity, title, project, place, notes]
  );
  res.status(201).json(r.rows[0]);
});

app.put("/api/logs/:id", async (req, res) => {
  const { id } = req.params;
  const { start, end, breakHours, activity, title, project, place, notes } = req.body;
  const r = await pool.query(
    `UPDATE log_row
     SET start_time=$1,end_time=$2,break_hours=$3,activity=$4,title=$5,project=$6,place=$7,notes=$8
     WHERE id=$9 RETURNING *`,
    [start, end, breakHours, activity, title, project, place, notes, id]
  );
  res.json(r.rows[0]);
});

app.delete("/api/logs/:id", async (req, res) => {
  const { id } = req.params;
  await pool.query("DELETE FROM log_row WHERE id=$1", [id]);
  res.json({ success: true });
});

// ─── Project Info CRUD ─────────────────────
app.get("/api/projects", async (_, res) => {
  const r = await pool.query("SELECT * FROM project_info ORDER BY created_at DESC");
  res.json(r.rows);
});

app.post("/api/projects", async (req, res) => {
  const { konsulent, oppdragsgiver, tiltak, periode, klientId } = req.body;
  const r = await pool.query(
    `INSERT INTO project_info (konsulent,oppdragsgiver,tiltak,periode,klient_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [konsulent, oppdragsgiver, tiltak, periode, klientId]
  );
  res.status(201).json(r.rows[0]);
});

/* ──────────────── Start Server ──────────────── */
const PORT = process.env.PORT || 4000;

initTables()
  .then(() => {
    app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("❌ Failed to initialize tables:", err);
    process.exit(1);
  });
