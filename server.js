import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";
const { Pool } = pkg;
dotenv.config();
const app = express();
app.use(
  cors({
    origin: "https://smart-timing-git-main-daniel-qazis-projects.vercel.app",
    methods: ["GET","POST","PUT","DELETE"],
    credentials: true
  })
);
app.use(express.json());
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function initTables(){
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    CREATE TABLE IF NOT EXISTS project_info(
      id SERIAL PRIMARY KEY,
      konsulent TEXT,
      oppdragsgiver TEXT,
      tiltak TEXT,
      periode TEXT,
      klient_id TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
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
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("✅ Tables initialized");
}
app.get("/",(_,r)=>r.send("✅ Smart Stempling backend is running"));
app.get("/api/logs",async(_,r)=>r.json((await pool.query("SELECT * FROM log_row ORDER BY created_at DESC")).rows));
app.post("/api/logs",async(req,r)=>{
  const {date,start,end,breakHours,activity,title,project,place,notes}=req.body;
  const res=await pool.query(
    `INSERT INTO log_row (date,start_time,end_time,break_hours,activity,title,project,place,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [date,start,end,breakHours,activity,title,project,place,notes]
  );
  r.json(res.rows[0]);
});
app.delete("/api/logs/:id", async (req, res) => {
  await pool.query("DELETE FROM log_row WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// ✅ Add this health-check route
app.get("/api/test", (req, res) => {
  res.json({ ok: true, message: "Smart Timing backend is working" });
});

const PORT = process.env.PORT || 4000;
initTables().then(() =>
  app.listen(PORT, () => console.log(`🚀 Backend running on http://localhost:${PORT}`))
);
