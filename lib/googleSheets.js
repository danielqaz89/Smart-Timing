import { google } from 'googleapis';
import { GoogleAuth, Impersonated } from 'google-auth-library';

/**
 * Google Sheets service for syncing Smart-Timing logs to Kinoa Tiltak AS timesheet format
 * This format is ONLY used when project_info.bedrift = "Kinoa Tiltak AS"
 * Supports both Service Account and OAuth2 user authentication
 */

/**
 * Create OAuth2 client for Google APIs
 */
export function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/auth/google/callback';
  
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  }
  
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Get impersonated credentials using user's OAuth token
 * @param {string} accessToken - User's OAuth access token
 * @param {string} refreshToken - User's OAuth refresh token (optional)
 */
async function getImpersonatedAuth(accessToken, refreshToken = null) {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || 'smarttiming@api-auth-463802.iam.gserviceaccount.com';
  
  // Create OAuth2 client with user credentials (source credentials)
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  
  // Create impersonated credentials
  const targetPrincipal = serviceAccountEmail;
  const targetScopes = ['https://www.googleapis.com/auth/spreadsheets'];
  
  const impersonatedClient = new Impersonated({
    sourceClient: oauth2Client,
    targetPrincipal: targetPrincipal,
    targetScopes: targetScopes,
    lifetime: 3600, // 1 hour in seconds
  });
  
  return impersonatedClient;
}

/**
 * Initialize Google Sheets API with OAuth2 user tokens
 * Uses service account impersonation if configured
 * @param {string} accessToken - User's OAuth access token
 * @param {string} refreshToken - User's OAuth refresh token (optional)
 */
async function getGoogleSheetsClient(accessToken, refreshToken = null) {
  const useImpersonation = process.env.GOOGLE_USE_IMPERSONATION === 'true';
  
  let auth;
  if (useImpersonation) {
    // Use service account impersonation
    auth = await getImpersonatedAuth(accessToken, refreshToken);
  } else {
    // Use direct OAuth2 authentication
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    auth = oauth2Client;
  }
  
  return google.sheets({ version: 'v4', auth });
}

/**
 * Initialize Google Sheets API with Service Account (legacy/fallback)
 */
function getGoogleSheetsClientWithServiceAccount() {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  
  if (!serviceAccountEmail || !privateKey) {
    throw new Error('Google Service Account credentials not configured.');
  }

  const auth = new google.auth.JWT({
    email: serviceAccountEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Extract spreadsheet ID from Google Sheets URL
 * Supports: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit...
 */
function extractSpreadsheetId(url) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error('Invalid Google Sheets URL');
  return match[1];
}

/**
 * Calculate decimal hours from start and end time
 */
function calculateHours(startTime, endTime, breakHours = 0) {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const workMinutes = endMinutes - startMinutes;
  
  const hours = (workMinutes / 60) - breakHours;
  return hours.toFixed(2);
}

/**
 * Format date to DD.MM.YY format (Kinoa sheet format)
 */
function formatDate(dateStr) {
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}

/**
 * Format time to HH:MM format
 */
function formatTime(timeStr) {
  // timeStr is typically "HH:MM:SS" from database, we just need "HH:MM"
  return timeStr.slice(0, 5);
}

/**
 * Read the Google Sheet to understand its current state
 * Returns metadata, existing row count, and total sheet row count
 * @param {string} sheetUrl - Google Sheet URL
 * @param {string} accessToken - OAuth2 access token
 * @param {string} refreshToken - OAuth2 refresh token (optional)
 */
export async function readKinoaSheet(sheetUrl, accessToken, refreshToken = null) {
  const sheets = await getGoogleSheetsClient(accessToken, refreshToken);
  const spreadsheetId = extractSpreadsheetId(sheetUrl);
  
  // Get sheet metadata to find total row count
  const sheetMetadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  });
  
  const firstSheet = sheetMetadata.data.sheets?.[0];
  const sheetId = firstSheet?.properties?.sheetId || 0;
  const totalRowCount = firstSheet?.properties?.gridProperties?.rowCount || 100;
  
  // Read header metadata (rows 4-6) and data range
  // Read up to current sheet size
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `A1:E${totalRowCount}`,
  });
  
  const rows = response.data.values || [];
  
  // Parse header info
  const metadata = {
    konsulent: rows[3]?.[1] || '', // B4
    oppdragsgiver: rows[3]?.[3] || '', // D4 (if present)
    tiltak: rows[4]?.[1] || '', // B5
    periode: rows[5]?.[1] || '', // B6
    klientId: rows[5]?.[3] || '', // D6 (if present)
  };
  
  // Count existing data rows (odd rows starting from 11)
  let dataRowCount = 0;
  for (let i = 10; i < rows.length; i += 2) { // Start at row 11 (index 10), skip by 2
    const row = rows[i];
    if (row && row[0] && !row[0].startsWith('[')) {
      dataRowCount++;
    } else {
      break; // Stop at first empty/placeholder row
    }
  }
  
  return {
    metadata,
    dataRowCount,
    nextDataRow: 11 + (dataRowCount * 2), // Next available odd row
    totalRowCount,
    sheetId,
  };
}

/**
 * Update header metadata in the Kinoa sheet
 * Updates rows 4-6 with project info
 * @param {string} sheetUrl - Google Sheet URL
 * @param {object} projectInfo - Project information object
 * @param {string} accessToken - OAuth2 access token
 * @param {string} refreshToken - OAuth2 refresh token (optional)
 */
export async function updateKinoaSheetHeader(sheetUrl, projectInfo, accessToken, refreshToken = null) {
  const sheets = await getGoogleSheetsClient(accessToken, refreshToken);
  const spreadsheetId = extractSpreadsheetId(sheetUrl);
  
  // Update header cells
  const updates = [
    {
      range: 'B4', // Konsulent
      values: [[projectInfo.konsulent || '']],
    },
    {
      range: 'D4', // Oppdragsgiver
      values: [[projectInfo.oppdragsgiver || '']],
    },
    {
      range: 'B5', // Tiltak
      values: [[projectInfo.tiltak || '']],
    },
    {
      range: 'B6', // Periode
      values: [[projectInfo.periode || '']],
    },
    {
      range: 'D6', // Klient ID
      values: [[projectInfo.klient_id || '']],
    },
  ];
  
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: updates,
    },
  });
}

/**
 * Append log rows to the Kinoa sheet
 * Writes to odd rows only (11, 13, 15, ...) preserving placeholder rows
 * Automatically inserts new rows before footer (rows 57-59) if needed
 * @param {string} sheetUrl - Google Sheet URL
 * @param {array} logs - Array of log entries to append
 * @param {string} accessToken - OAuth2 access token
 * @param {string} refreshToken - OAuth2 refresh token (optional)
 */
export async function appendLogsToKinoaSheet(sheetUrl, logs, accessToken, refreshToken = null) {
  const sheets = await getGoogleSheetsClient(accessToken, refreshToken);
  const spreadsheetId = extractSpreadsheetId(sheetUrl);
  
  // Footer starts at row 57 and must be preserved
  const FOOTER_START_ROW = 57;
  
  // Read current state to find next available row and sheet size
  const { nextDataRow, totalRowCount, sheetId } = await readKinoaSheet(sheetUrl, accessToken, refreshToken);
  
  // Prepare rows: each log takes 2 rows (data row + placeholder row)
  const rowsToAdd = [];
  
  logs.forEach((log, index) => {
    const hours = calculateHours(log.start_time, log.end_time, log.break_hours || 0);
    const description = log.title || log.notes || log.activity || '';
    
    // Data row (odd row: 11, 13, 15...)
    rowsToAdd.push([
      formatDate(log.date),
      formatTime(log.start_time),
      formatTime(log.end_time),
      hours,
      description,
    ]);
    
    // Placeholder row (even row: 12, 14, 16...)
    rowsToAdd.push([
      '[Dato]',
      '[Starttidspunkt]',
      '[Sluttidspunkt]',
      '0.00',
      '',
    ]);
  });
  
  const startRow = nextDataRow;
  const endRow = startRow + rowsToAdd.length - 1;
  
  // Check if we need to insert new rows (if data would go into or past footer area)
  if (endRow >= FOOTER_START_ROW) {
    const rowsNeeded = (endRow - FOOTER_START_ROW) + 1;
    
    // Insert rows BEFORE the footer (at row 57) to push footer down
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            insertDimension: {
              range: {
                sheetId: sheetId,
                dimension: 'ROWS',
                startIndex: FOOTER_START_ROW - 1, // 0-indexed, so row 57 = index 56
                endIndex: FOOTER_START_ROW - 1 + rowsNeeded,
              },
              inheritFromBefore: true, // Copy formatting from row above
            },
          },
        ],
      },
    });
  }
  
  // Write all rows at once
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `A${startRow}:E${endRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: rowsToAdd,
    },
  });
  
  return {
    rowsAdded: logs.length,
    startRow,
    endRow,
  };
}

/**
 * Full sync: Update header + append new logs
 * @param {string} sheetUrl - Google Sheet URL
 * @param {object} projectInfo - Project information
 * @param {array} logs - Log entries to sync
 * @param {string} accessToken - OAuth2 access token
 * @param {string} refreshToken - OAuth2 refresh token (optional)
 */
export async function syncToKinoaSheet(sheetUrl, projectInfo, logs, accessToken, refreshToken = null) {
  // Update header metadata
  await updateKinoaSheetHeader(sheetUrl, projectInfo, accessToken, refreshToken);
  
  // Append logs
  const result = await appendLogsToKinoaSheet(sheetUrl, logs, accessToken, refreshToken);
  
  return result;
}

/**
 * Check if a company should use Kinoa sheet format
 */
export function isKinoaCompany(bedrift) {
  const normalized = String(bedrift || '').toLowerCase().trim();
  return normalized.includes('kinoa') && normalized.includes('tiltak');
}
