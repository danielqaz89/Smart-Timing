# Google Sheets Integration Setup

This guide explains how to set up Google Sheets sync for **Kinoa Tiltak AS** projects.

## Overview

Smart-Timing can automatically sync time logs to a Google Sheet in the Kinoa Tiltak AS timesheet format. This feature is **only available when the company is set to "Kinoa Tiltak AS"** in the project setup.

## Prerequisites

1. A Google Cloud Platform (GCP) project
2. A Google Service Account with Sheets API access
3. The target Google Sheet shared with the service account

## Setup Steps

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google Sheets API**:
   - Go to "APIs & Services" → "Library"
   - Search for "Google Sheets API"
   - Click "Enable"

### 2. Create a Service Account

1. Go to "IAM & Admin" → "Service Accounts"
2. Click "Create Service Account"
3. Name it (e.g., "smart-timing-sheets-sync")
4. Click "Create and Continue"
5. Skip granting roles (not needed for this use case)
6. Click "Done"

### 3. Generate Service Account Key

1. Click on the newly created service account
2. Go to the "Keys" tab
3. Click "Add Key" → "Create new key"
4. Choose **JSON** format
5. Download the key file (keep it secure!)

The JSON file will look like this:
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "smart-timing-sheets-sync@your-project.iam.gserviceaccount.com",
  ...
}
```

### 4. Share Your Google Sheet

1. Open your Google Sheet (the Kinoa timesheet template)
2. Click "Share"
3. Add the service account email from the JSON (e.g., `smart-timing-sheets-sync@your-project.iam.gserviceaccount.com`)
4. Give it **Editor** permissions
5. Click "Send"

### 5. Configure Environment Variables

Add these to your `.env` file (or Render environment variables):

```bash
# Google Sheets Service Account Credentials
GOOGLE_SERVICE_ACCOUNT_EMAIL=smart-timing-sheets-sync@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour\nPrivate\nKey\nHere\n-----END PRIVATE KEY-----\n"
```

**Important**: 
- Keep the quotes around the private key
- The `\n` characters must be preserved (they represent line breaks)
- In Render, paste the full private key including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`

### 6. Configure in Smart-Timing

1. Go to the Setup page in Smart-Timing
2. Set "Bedrift" to **"Kinoa Tiltak AS"**
3. In Settings (user_settings), add the Google Sheet URL:
   ```
   https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit...
   ```

## Usage

### API Endpoint

```http
POST /api/sheets/sync
Content-Type: application/json

{
  "month": "202412",
  "user_id": "default"
}
```

### Response

```json
{
  "success": true,
  "message": "Synced 15 log entries to Google Sheets",
  "rowsAdded": 15,
  "startRow": 11,
  "endRow": 40
}
```

## Sheet Format

The integration expects this Kinoa Tiltak AS timesheet structure:

| Row | Column A | Column B | Column C | Column D | Column E |
|-----|----------|----------|----------|----------|----------|
| 4   | Konsulent: | [value] | Oppdragsgiver: | [value] | |
| 5   | Tiltak: | [value] | Referanse: | | |
| 6   | Periode: | [value] | Klient ID/Saks nr: | [value] | |
| 10  | **Dato** | **Starttidspunkt** | **Sluttidspunkt** | **Antall timer** | **Arbeidets art** |
| 11  | 03.12.24 | 8:00 | 14:00 | 6.00 | Description |
| 12  | [Dato] | [Starttidspunkt] | [Sluttidspunkt] | 0.00 | |
| 13  | 04.12.24 | 8:00 | 12:00 | 4.00 | Description |
| 14  | [Dato] | [Starttidspunkt] | [Sluttidspunkt] | 0.00 | |

**Note**: Data rows are on odd rows (11, 13, 15...), placeholder rows on even rows (12, 14, 16...)

## Troubleshooting

### "Google Sheets credentials not configured"
- Make sure `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` are set in your environment
- Verify the private key includes the full content with `-----BEGIN PRIVATE KEY-----` headers

### "Permission denied"
- Ensure the Google Sheet is shared with the service account email
- Give the service account **Editor** permissions (not just Viewer)

### "Google Sheets sync is only available for Kinoa Tiltak AS"
- The sync only works when `project_info.bedrift` contains "Kinoa Tiltak"
- Check your project setup and make sure the company name is correct

### "No logs found for the specified month"
- Verify you have log entries for the specified month (YYYYMM format)
- Check that logs belong to the correct user_id

## Security Notes

1. **Never commit** the service account JSON file or private key to version control
2. Store credentials securely in environment variables
3. Rotate service account keys periodically
4. Use different service accounts for development and production
5. Monitor the `sync_log` table for sync attempts and errors
