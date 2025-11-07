# Smart Timing Deployment Guide

## Architecture

Smart Timing is a **monorepo** with two separate deployments:

1. **Backend** (Node.js + Express + PostgreSQL) → Deploy to **Render**
2. **Frontend** (Next.js) → Deploy to **Vercel**

---

## 1. Backend Deployment (Vercel)

### Prerequisites:
- Vercel account
- PostgreSQL database

### Steps (Vercel):
1. Import GitHub repo into Vercel
2. `vercel.json` is included to expose Express as serverless function
3. Set Environment Variables:
   ```
   DATABASE_URL=postgresql://user:pass@host:5432/dbname
   NODE_ENV=production
   FRONTEND_ORIGINS=https://your-frontend.vercel.app,http://localhost:3000
   FRONTEND_ORIGIN_SUFFIXES=.vercel.app
   JWT_SECRET=replace-me
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=https://<your-backend>.vercel.app/api/auth/google/callback
   SMTP_HOST=... (optional)
   SMTP_PORT=...
   SMTP_SECURE=false
   SMTP_USER=...
   SMTP_PASS=...
   ```
4. Deploy → Validate `/api/health`

### Database Setup:
Tables are auto-created on first boot via `initTables()` in `server.js`.

---

## 2. Frontend Deployment (Vercel)

### Prerequisites:
- PostgreSQL database (Neon, Render, or other)
- Render account

### Steps:

1. **Go to Render Dashboard** → https://render.com/

2. **Create New Web Service**
   - Connect your GitHub repo: `Smart-Timing`
   - **Root Directory**: Leave blank (or set to `/`)
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Environment**: Node

3. **Set Environment Variables**:
   ```
   DATABASE_URL=postgresql://user:pass@host:5432/dbname
   PORT=4000
   NODE_ENV=production
   FRONTEND_ORIGINS=https://smart-timing-yourapp.vercel.app,http://localhost:3000
   ```

4. **Deploy** → Render will auto-deploy

5. **Note your backend URL**: `https://smart-timing-backend.onrender.com`

### Database Setup:

Your backend auto-creates tables on startup via `server.js`:
```javascript
await initTables(); // Creates all 5 tables + indexes
```

**Tables created**:
- `user_settings`
- `project_info`
- `log_row`
- `quick_templates`
- `sync_log`

---

## 2. Frontend Deployment (Vercel)

### Prerequisites:
- Vercel account
- Backend deployed and running

### Steps:

#### Option A: Using Vercel Dashboard (Recommended)

1. **Go to Vercel Dashboard** → https://vercel.com/

2. **Import Project**
   - Select your GitHub repo: `Smart-Timing`

3. **Configure Project**:
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend` ← **IMPORTANT**
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `.next` (default)
   - **Install Command**: `npm install` (default)

4. **Set Environment Variables**:
   ```
   NEXT_PUBLIC_API_BASE=https://smart-timing-backend.onrender.com
   ```

5. **Deploy** → Vercel will build and deploy

#### Option B: Using Vercel CLI

```bash
# From project root
cd frontend
vercel --prod

# When prompted:
# Set up and deploy? Yes
# Which scope? Your scope
# Link to existing project? Yes/No
# Settings:
#   - Framework: Next.js
#   - Build Command: npm run build
#   - Output Directory: .next
#   - Install Command: npm install
```

Then set environment variable in Vercel dashboard:
```
NEXT_PUBLIC_API_BASE=https://smart-timing-backend.onrender.com
```

---

## 3. Environment Variables

### Backend (.env on Render):
```bash
DATABASE_URL=postgresql://user:pass@host:5432/dbname
PORT=4000
NODE_ENV=production
FRONTEND_ORIGINS=https://your-frontend.vercel.app,http://localhost:3000
FRONTEND_ORIGIN_SUFFIXES=.vercel.app
```

### Frontend (.env.local locally, Vercel dashboard for production):
```bash
NEXT_PUBLIC_API_BASE=https://your-backend.onrender.com
```

---

## 4. Post-Deployment Checklist

### Backend (Render):
- [ ] Service is running (check Render dashboard)
- [ ] Database connected (check logs for "✅ Tables initialized")
- [ ] Test health endpoint: `curl https://your-backend.onrender.com/api/test`
- [ ] CORS configured correctly (check `FRONTEND_ORIGINS`)

### Frontend (Vercel):
- [ ] Build successful (check Vercel deployment logs)
- [ ] Environment variable set (`NEXT_PUBLIC_API_BASE`)
- [ ] Site loads: https://your-app.vercel.app
- [ ] API calls working (check browser console)
- [ ] Setup gate redirects to `/setup` if no project info

### Full System:
- [ ] Can create project in setup page
- [ ] Can log time entries
- [ ] Settings persist across page reloads
- [ ] BRREG company search works
- [ ] Mobile bottom navigation visible on phone

---

## 5. Custom Domain (Optional)

### Vercel:
1. Go to project settings → Domains
2. Add your domain: `smarttiming.yourcompany.no`
3. Configure DNS records as instructed

### Render:
1. Go to service settings → Custom Domains
2. Add: `api.smarttiming.yourcompany.no`
3. Update `NEXT_PUBLIC_API_BASE` in Vercel to use custom domain

---

## 6. Troubleshooting

### Backend won't start:
- Check `DATABASE_URL` is set correctly
- Verify PostgreSQL version (12+)
- Check Render logs for errors

### Frontend build fails:
- Ensure Root Directory is set to `frontend`
- Check all imports are correct
- Verify `package.json` exists in `frontend/`

### API calls fail (CORS errors):
- Add your Vercel URL to `FRONTEND_ORIGINS` on backend
- Restart backend service after changing env vars
- Check browser console for exact error

### Database tables not created:
- Check Render logs for migration errors
- Verify PostgreSQL has `pgcrypto` extension
- Run migration manually: `npm run migrate` (if migrate script exists)

---

## 7. Continuous Deployment

Both Render and Vercel support auto-deployment:

- **Push to `main` branch** → Backend redeploys on Render
- **Push to `main` branch** → Frontend redeploys on Vercel

### Disable auto-deploy (if needed):
- Render: Settings → Auto-Deploy → Off
- Vercel: Settings → Git → Production Branch → Configure

---

## 8. Monitoring

### Backend (Render):
- View logs: Render Dashboard → Logs
- Metrics: Render Dashboard → Metrics
- Alerts: Set up in Render settings

### Frontend (Vercel):
- Analytics: Vercel Dashboard → Analytics
- Speed Insights: Built-in with Vercel
- Error tracking: Check deployment logs

---

## 9. Scaling

### Backend:
- Render: Upgrade to Standard plan for auto-scaling
- Database: Upgrade Neon/Render Postgres for more connections

### Frontend:
- Vercel handles auto-scaling (serverless)
- Edge caching automatic

---

## Current Deployment Status

**Backend**: Ready to deploy to Render  
**Frontend**: Ready to deploy to Vercel  
**Database**: Schema ready, tables auto-created on first boot  

**Next steps**: Follow Section 1 & 2 above to deploy both services.
