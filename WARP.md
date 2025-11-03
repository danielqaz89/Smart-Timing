# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Project overview
- Backend: Node.js (ESM) + Express + PostgreSQL.
- Entry point: server.js; package name smart-stempling-backend.
- Env: requires DATABASE_URL; optional PORT (defaults to 4000). Uses dotenv to load .env.
- Tables are auto-initialized on boot (requires pgcrypto for gen_random_uuid()).

Prerequisites
- Node.js v22.16.0 and npm 10.x (from README).
- A reachable Postgres instance; set DATABASE_URL in environment or .env.
- Optional frontend: Next.js app in frontend/ (Material UI). Set NEXT_PUBLIC_API_BASE to backend URL.

Common commands
Backend (root):
- Install deps: npm install
- Start server (loads .env if present): npm start
- Start on a custom port: PORT=5000 npm start
- Quick health check: curl http://localhost:4000/api/test

Frontend (frontend/):
- Install deps: npm install
- Dev server: npm run dev (uses http://localhost:3000)
- Build/start: npm run build && npm start
- Configure API base: set NEXT_PUBLIC_API_BASE (default http://localhost:4000)

- Lint/Tests: not configured.

Runtime architecture
- Express app (type: module):
  - Middleware: CORS restricted to https://smart-timing-git-main-daniel-qazis-projects.vercel.app; JSON body parsing.
  - Database: pg Pool using process.env.DATABASE_URL.
  - Boot: initTables() executes on startup to create extension/table(s), then app.listen.
- Routes:
  - GET / → simple uptime text.
  - GET /api/test → health JSON.
  - GET /api/logs → returns all log_row ordered by created_at DESC.
  - POST /api/logs → inserts a row into log_row (fields: date, start_time, end_time, break_hours, activity, title, project, place, notes).
  - DELETE /api/logs/:id → deletes a log_row by UUID.

Data model (auto-created in initTables)
- project_info: id (SERIAL PK), konsulent, oppdragsgiver, tiltak, periode, klient_id, user_id (default 'default'), is_active (bool), created_at, updated_at.
- log_row: id (UUID PK, gen_random_uuid), project_id (nullable FK → project_info.id ON DELETE CASCADE), date, start_time, end_time, break_hours NUMERIC(4,2), activity ENUM-like CHECK ('Work','Meeting'), title, project, place, notes, user_id (default 'default'), is_stamped_in (bool, for clock-in/out workflow), created_at, updated_at.
- user_settings (NEW): id (SERIAL PK), user_id (unique, default 'default'), paid_break, tax_pct, hourly_rate, timesheet_sender, timesheet_recipient, timesheet_format, smtp_app_password, webhook_active, webhook_url, sheet_url, month_nav, created_at, updated_at.
- quick_templates (NEW): id (SERIAL PK), user_id, label, activity, title, project, place, is_favorite, display_order, created_at.
- sync_log (NEW): id (SERIAL PK), user_id, sync_type CHECK ('webhook_send'|'webhook_receive'|'sheets_import'), status CHECK ('success'|'error'|'pending'), row_count, error_message, created_at.
- Note: pgcrypto extension is created if not present; gen_random_uuid() depends on it.

CORS and local development
- CORS allowlist is configurable via FRONTEND_ORIGINS (comma-separated). Defaults include the production Vercel URL plus http://localhost:3000 and http://127.0.0.1:3000.
  Example: FRONTEND_ORIGINS="https://smart-timing-git-main-daniel-qazis-projects.vercel.app,http://localhost:3000".
- You can also allow wildcard suffixes via FRONTEND_ORIGIN_SUFFIXES (comma-separated). Default: .vercel.app (covers Vercel preview deployments).
- Credentials are enabled; methods allowed: GET, POST, PUT, DELETE, OPTIONS.

Deployment (from README)
- Target: Render.
  1) Root Directory → backend
  2) Build Command → npm install
  3) Start Command → node server.js
  4) Environment → set DATABASE_URL (present in local .env; set in Render dashboard for deploys)
