# Smart-Timing Backend
Node.js v22.16.0 · npm 10.x

## Deploy on Vercel (recommended for hobby)
- Add `vercel.json` at repo root (already included):
  ```json
  {"version":2,"builds":[{"src":"server.js","use":"@vercel/node"}],"routes":[{"src":"/(.*)","dest":"server.js"}],"env":{"NODE_ENV":"production"}}
  ```
- Set env vars in Vercel Project Settings → Environment Variables:
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `FRONTEND_ORIGINS` (e.g. https://your-frontend.vercel.app,http://localhost:3000)
  - `FRONTEND_ORIGIN_SUFFIXES` (e.g. .vercel.app)
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
  - `SMTP_*` if using SMTP sending
- No custom build/start commands needed; Vercel runs serverless handler from `server.js`.
- Note: In Vercel, the app is exported as a handler (no `listen()`); locally it still uses `listen()`.

## Deploy on Render (backend)
1. Root Directory → `/`
2. Build Command → `npm install`
3. Start Command → `node server.js`
4. Add env vars: `DATABASE_URL`, `JWT_SECRET`, Google creds (if used)

---

## Frontend (Next.js) on Vercel
- Project directory: `frontend/`
- Commands: `npm run build` / `npm start` (Vercel handles automatically)
- Env: set `NEXT_PUBLIC_API_BASE` to backend URL (Render or other)

## Translations (CMS)
Two ways to add/update UI strings (Norwegian/English):

1) Admin UI (recommended)
- Open `/admin/cms/translations`
- Click "Import new" to load `/i18n/new_translations.json` from the repo
- Review in the table → click "Save All" (persists to DB)

2) CLI (merge and apply via API)
```bash
# From repo root
API_BASE=https://your-backend.example.com \
ADMIN_JWT=eyJ... \
npm run cms:translations:apply
```
Notes:
- Uses `new_translations.json` in repo root and merges with existing DB values
- Requires `jq`, `curl`, and an admin JWT (do not commit tokens)

## Immediate DB population
- Use the Admin UI path above (Import new → Save All), or run the npm script with API_BASE and ADMIN_JWT set.

## Deployment tips
- If Vercel/Render are connected to your Git repo, pushing to `main` triggers deployment automatically.
- Backend CORS: ensure `FRONTEND_ORIGINS` includes your Vercel URL and localhost.
- Frontend env: `NEXT_PUBLIC_API_BASE` must point to the deployed backend.
