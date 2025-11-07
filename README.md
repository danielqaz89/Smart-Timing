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

## Deploy on Render (alternative)
1. Root Directory → `/`
2. Build Command → `npm install`
3. Start Command → `node server.js`
4. Add env var: `DATABASE_URL` (already in .env locally)
