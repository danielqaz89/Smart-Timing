# Gmail Send Feature

## Overview
The Smart Timing app now supports sending timesheets via Gmail API using the user's authenticated Google account. This eliminates the need for SMTP app passwords when the user has connected their Google account.

## Features Added

### Backend (server.js)
1. **Added Gmail scope** to OAuth2 flow:
   - Added `https://www.googleapis.com/auth/gmail.send` to the OAuth scopes
   
2. **New endpoint: POST /api/timesheet/send-gmail**
   - Sends timesheets via Gmail API using user's OAuth2 tokens
   - Automatically refreshes expired tokens
   - Supports both XLSX and PDF formats
   - Gets sender email automatically from authenticated Google account
   - Body parameters:
     - `month` (string, required): YYYYMM format
     - `recipientEmail` (string, required): Recipient email address
     - `format` (string, required): 'xlsx' or 'pdf'
     - `user_id` (string, optional): Defaults to 'default'

### Frontend

#### API Functions (frontend/lib/api.ts)
1. **sendTimesheetViaGmail()**: Sends timesheet using Gmail API
2. **getGoogleAuthStatus()**: Checks if user has connected Google account

#### UI Updates (frontend/app/page.tsx)
1. **SendTimesheet component** now:
   - Checks Google authentication status on mount
   - Shows "Google-konto tilkoblet" chip when connected
   - Provides dropdown to switch between Gmail and SMTP methods
   - Gmail mode (when authenticated):
     - Only requires recipient email (sender auto-detected)
     - No password needed
     - Shows "Send via Gmail" button
   - SMTP mode (fallback):
     - Original functionality preserved
     - Requires sender email, recipient email, and SMTP password

## OAuth Scopes

The app requests all necessary scopes during initial Google account connection:

1. **Spreadsheets** (`auth/spreadsheets`): Read/write Google Sheets for timesheet sync
2. **Documents** (`auth/documents`): Read/write Google Docs for future features
3. **Drive (read-only)** (`auth/drive.readonly`): For Google Picker file selection
4. **Gmail Send** (`auth/gmail.send`): Send emails via user's Gmail account
5. **User Info** (`auth/userinfo.email`): Get user's email address

This means:
- ✅ Users authorize **once** and get access to all features
- ✅ No need for separate authorizations for different features
- ✅ Cleaner user experience with single consent screen

## User Flow

### For Users With Google Connected
1. User connects Google account once (authorizes all scopes)
2. Navigate to "Send inn timeliste" section
3. Gmail is automatically selected as default method (shows "Google-konto tilkoblet" chip)
4. Enter recipient email and select format (XLSX or PDF)
5. Click "Send via Gmail" button
6. Email is sent from their authenticated Google account - done!

### For New Users
1. Click "Connect Google Account" anywhere in the app
2. Google consent screen shows all requested permissions:
   - View and manage spreadsheets
   - View and manage documents
   - View Drive files (for Picker)
   - Send email on your behalf
   - View your email address
3. After authorization, all features are immediately available

### For Non-Authenticated Users
- Original SMTP flow remains available
- Can still use SMTP with app passwords

## Testing Steps

1. **Verify OAuth scope update**:
   ```bash
   # Users will need to re-authenticate to grant gmail.send permission
   # Visit the OAuth consent screen and verify the new scope
   ```

2. **Test Gmail sending**:
   - Connect Google account if not already connected
   - Navigate to "Send inn timeliste"
   - Verify "Google-konto tilkoblet" chip appears
   - Enter a recipient email
   - Select format (XLSX or PDF)
   - Click "Send via Gmail"
   - Verify email is received with correct attachment

3. **Test SMTP fallback**:
   - Switch dropdown to "SMTP"
   - Verify SMTP fields appear
   - Test sending via SMTP still works

4. **Test without authentication**:
   - Disconnect Google account
   - Verify only SMTP mode is available
   - Verify SMTP sending still works

## Environment Variables
No new environment variables required. Uses existing:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

## Database
No schema changes needed. Uses existing columns in `user_settings`:
- `google_access_token`
- `google_refresh_token`
- `google_token_expiry`

## Security
- Tokens are securely stored in database
- Automatic token refresh when expired
- Gmail API uses OAuth2, no passwords stored
- Sender email is verified through Google OAuth

## Benefits
1. **Easier for users**: No need to generate and manage SMTP app passwords
2. **More secure**: Uses OAuth2 instead of app passwords
3. **Better UX**: Fewer fields to fill when authenticated
4. **Automatic sender detection**: Uses authenticated Google account email
5. **Seamless integration**: Works with existing Google OAuth setup
