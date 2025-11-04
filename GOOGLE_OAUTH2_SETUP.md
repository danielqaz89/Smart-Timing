# Google Sheets OAuth2 Setup Guide

This guide explains how to set up Google OAuth2 authentication for Smart-Timing's Google Sheets integration. **This is the recommended approach** as it allows users to authenticate with their own Google account without needing to share sheets manually.

## Overview

With OAuth2, users can:
- Sign in with their own Google account
- Access their own Google Sheets without manual sharing
- Have full control over permissions
- Revoke access anytime

## Setup Steps

### 1. Create OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Enable the **Google Sheets API**:
   - Go to "APIs & Services" → "Library"
   - Search for "Google Sheets API"
   - Click "Enable"

4. Configure OAuth Consent Screen:
   - Go to "APIs & Services" → "OAuth consent screen"
   - Choose "External" (unless you have a Google Workspace)
   - Fill in:
     - **App name**: Smart Timing
     - **User support email**: Your email
     - **Developer contact**: Your email
   - Add scopes:
     - `https://www.googleapis.com/auth/spreadsheets`
     - `https://www.googleapis.com/auth/userinfo.email`
   - Add test users (yourself) if in testing mode
   - Click "Save and Continue"

5. Create OAuth 2.0 Client ID:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth 2.0 Client ID"
   - Application type: **Web application**
   - Name: `Smart Timing Web Client`
   - **Authorized redirect URIs**:
     - Development: `http://localhost:4000/api/auth/google/callback`
     - Production: `https://your-backend-domain.com/api/auth/google/callback`
   - Click "Create"
   - **Save the Client ID and Client Secret**

### 2. Configure Environment Variables

Add these to your `.env` file (backend):

```bash
# Google OAuth2 Credentials
GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
FRONTEND_URL=http://localhost:3000
```

For production (Render), set these environment variables in your dashboard:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (use your production URL)
- `FRONTEND_URL` (your frontend Vercel URL)

### 3. Grant Service Account Impersonation Permission

**IMPORTANT**: If you're using service account impersonation (`GOOGLE_USE_IMPERSONATION=true`), you must grant your Google account permission to impersonate the service account.

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **IAM & Admin** → **IAM** (main IAM page, not Service Accounts)
3. Click **"Grant Access"** or **"Add"**
4. Add your personal Google email (the one you'll use to log in to Smart-Timing)
5. Assign role: **Service Account Token Creator**
6. Click **"Save"**

**Alternative method via gcloud CLI:**
```bash
gcloud iam service-accounts add-iam-policy-binding \
  smarttiming@api-auth-463802.iam.gserviceaccount.com \
  --member="user:YOUR_EMAIL@gmail.com" \
  --role="roles/iam.serviceAccountTokenCreator"
```

Without this permission, you'll get authentication errors when trying to sync to Google Sheets.

### 4. Database Migration

The database schema has been updated to store OAuth tokens. Restart your backend server to apply the migrations automatically, or run:

```bash
npm start
```

This will add the following columns to `user_settings`:
- `google_access_token`
- `google_refresh_token`
- `google_token_expiry`

## Usage Flow

### 1. Connect Google Account (Frontend)

User clicks "Connect Google" button, which calls:

```javascript
const response = await fetch('/api/auth/google?user_id=default');
const { authUrl } = await response.json();
window.location.href = authUrl; // Redirect to Google login
```

### 2. User Authorizes

- User is redirected to Google's consent screen
- User grants permissions
- Google redirects back to `/api/auth/google/callback`
- Tokens are stored in database
- User is redirected back to frontend with success message

### 3. Check Connection Status

```javascript
const response = await fetch('/api/auth/google/status?user_id=default');
const { isConnected, isExpired, needsReauth } = await response.json();
```

### 4. Sync to Google Sheets

```javascript
const response = await fetch('/api/sheets/sync', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ month: '202412', user_id: 'default' }),
});
```

The backend will:
- Check if user is authenticated
- Auto-refresh expired tokens
- Sync logs to the Google Sheet
- Return success/error

### 5. Disconnect Google Account

```javascript
await fetch('/api/auth/google/disconnect', {
  method: 'DELETE',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_id: 'default' }),
});
```

## API Endpoints

### GET `/api/auth/google`
Initiate OAuth flow and get authorization URL.

**Query params:**
- `user_id` (optional): defaults to 'default'

**Response:**
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

### GET `/api/auth/google/callback`
OAuth callback endpoint (handled by Google redirect).

### GET `/api/auth/google/status`
Check if user has connected their Google account.

**Query params:**
- `user_id` (optional): defaults to 'default'

**Response:**
```json
{
  "isConnected": true,
  "isExpired": false,
  "needsReauth": false
}
```

### DELETE `/api/auth/google/disconnect`
Disconnect Google account and revoke access.

**Body:**
```json
{
  "user_id": "default"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Google account disconnected"
}
```

### POST `/api/sheets/sync`
Sync logs to Google Sheets (requires connected Google account).

**Body:**
```json
{
  "month": "202412",
  "user_id": "default"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Synced 15 log entries to Google Sheets",
  "rowsAdded": 15,
  "startRow": 11,
  "endRow": 40
}
```

## Token Management

### Automatic Refresh
Access tokens expire after ~1 hour. The backend automatically:
1. Checks token expiry before each sync
2. Refreshes the token using the refresh token
3. Updates the database with new tokens

### Token Storage
Tokens are encrypted at rest in PostgreSQL. Never expose tokens in:
- Client-side code
- Logs
- Error messages
- API responses

## Security Best Practices

1. **HTTPS Only**: Use HTTPS in production for redirect URIs
2. **Secure Storage**: Tokens are stored server-side, never in frontend
3. **Scopes**: Only request necessary scopes (Sheets + email)
4. **Rotation**: Refresh tokens are automatically managed
5. **Revocation**: Users can disconnect anytime via the UI

## Troubleshooting

### "redirect_uri_mismatch" error
- Ensure `GOOGLE_REDIRECT_URI` matches exactly what's configured in Google Cloud Console
- Include the protocol (`http://` or `https://`)
- No trailing slashes

### "invalid_grant" error
- Refresh token expired or revoked
- User needs to reconnect their Google account
- Check if OAuth consent screen is in "Testing" mode (limited to test users)

### "insufficient_permissions" error
- User didn't grant all required scopes
- Ask user to reconnect and accept all permissions

### Token not refreshing
- Check that `GOOGLE_CLIENT_SECRET` is set correctly
- Ensure refresh token was saved (user must go through full OAuth flow)

## Production Deployment

### Google Cloud Console
1. Add production redirect URI to OAuth client
2. Publish OAuth consent screen (or keep in testing with approved test users)

### Backend (Render)
Set environment variables:
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://your-backend.onrender.com/api/auth/google/callback
FRONTEND_URL=https://your-frontend.vercel.app
```

### Frontend (Vercel)
Update API base URL to point to production backend.

## Advantages Over Service Account

| Feature | OAuth2 (User Auth) | Service Account |
|---------|-------------------|-----------------|
| User owns their data | ✅ Yes | ❌ No |
| No manual sheet sharing | ✅ Yes | ❌ Required |
| User can revoke access | ✅ Yes | ❌ No |
| Multi-user support | ✅ Yes | ⚠️ Complex |
| Setup complexity | Medium | Low |
| Best for | Production apps | Internal tools |

OAuth2 is the recommended approach for user-facing applications like Smart-Timing.
