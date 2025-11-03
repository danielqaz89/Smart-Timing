# Smart Timing Persistence Audit

## ✅ Everything is Now Database-Persistent

Last Updated: 2025-11-03

## Database Tables

All application data is stored in PostgreSQL via the following tables:

### 1. **user_settings** ✅
Stores all user preferences and configuration:
- `paid_break` (BOOLEAN) - Whether breaks are paid
- `tax_pct` (NUMERIC) - Tax percentage (20-50%)
- `hourly_rate` (NUMERIC) - Rate per hour in NOK
- `timesheet_sender` (TEXT) - Email sender address
- `timesheet_recipient` (TEXT) - Email recipient address
- `timesheet_format` (TEXT) - Export format (xlsx/pdf)
- `smtp_app_password` (TEXT) - SMTP authentication
- `webhook_active` (BOOLEAN) - Webhook enabled/disabled
- `webhook_url` (TEXT) - Webhook endpoint URL
- `sheet_url` (TEXT) - Google Sheets URL
- `month_nav` (TEXT) - Current month filter (YYYYMM)

**Used by**: Main app settings, SettingsDrawer, salary calculations

### 2. **project_info** ✅
Stores project/client configuration:
- `konsulent` (TEXT) - Consultant name
- `bedrift` (TEXT) - Company name (e.g., Kinoa Tiltak AS)
- `oppdragsgiver` (TEXT) - Client/customer name
- `tiltak` (TEXT) - Project/initiative name
- `periode` (TEXT) - Time period
- `klient_id` (TEXT) - Client ID/case number
- `is_active` (BOOLEAN) - Active status
- `user_id` (TEXT) - User identifier

**Used by**: Setup gate, project info banner, timesheet generation

### 3. **log_row** ✅
Stores all time entries:
- `date` (DATE) - Work date
- `start_time` (TIME) - Start time
- `end_time` (TIME) - End time
- `break_hours` (NUMERIC) - Break duration
- `activity` (TEXT) - "Work" or "Meeting"
- `title` (TEXT) - Entry title
- `project` (TEXT) - Project name
- `place` (TEXT) - Location
- `notes` (TEXT) - Additional notes
- `expense_coverage` (NUMERIC) - Expense reimbursement
- `is_stamped_in` (BOOLEAN) - Clock-in status
- `user_id` (TEXT) - User identifier

**Used by**: Stempling card, manual entry, log table, salary calculations

### 4. **quick_templates** ✅
Stores quick-fill templates:
- `label` (TEXT) - Template name (e.g., "Miljøarbeider på felt")
- `activity` (TEXT) - "Work" or "Meeting"
- `title` (TEXT) - Pre-filled title
- `project` (TEXT) - Pre-filled project
- `place` (TEXT) - Pre-filled location
- `is_favorite` (BOOLEAN) - Favorite status
- `display_order` (INT) - Sort order
- `user_id` (TEXT) - User identifier

**Used by**: Template chips in stempling card

### 5. **sync_log** ✅
Audit trail for sync operations:
- `sync_type` (TEXT) - "webhook_send", "webhook_receive", "sheets_import"
- `status` (TEXT) - "success", "error", "pending"
- `row_count` (INT) - Number of rows synced
- `error_message` (TEXT) - Error details if failed
- `user_id` (TEXT) - User identifier

**Used by**: Webhook sync, import operations

## Data Flow

### User Settings Flow:
```
User Input → useUserSettings() hook → API POST /api/settings → PostgreSQL user_settings table
                                                              ↓
                                    SWR cache ← API Response ← Database
```

### Project Info Flow:
```
Setup Form → useProjectInfo() hook → API POST /api/project-info → PostgreSQL project_info table
                                                                  ↓
                            Setup Gate Check ← API Response ← Database
                            Project Banner Display
```

### Time Logging Flow:
```
Stempling/Manual → createLog() → API POST /api/logs → PostgreSQL log_row table
                                                      ↓
                      Log Table ← API Response ← Database
                      Salary Calc
```

## No localStorage Dependencies ✅

Previously using localStorage (now migrated):
- ❌ ~~`localStorage.getItem("paid_break")`~~ → ✅ `user_settings.paid_break`
- ❌ ~~`localStorage.getItem("tax_pct")`~~ → ✅ `user_settings.tax_pct`
- ❌ ~~`localStorage.getItem("hourly_rate")`~~ → ✅ `user_settings.hourly_rate`
- ❌ ~~`localStorage.getItem("timesheet_sender")`~~ → ✅ `user_settings.timesheet_sender`
- ❌ ~~`localStorage.getItem("timesheet_recipient")`~~ → ✅ `user_settings.timesheet_recipient`
- ❌ ~~`localStorage.getItem("project_info")`~~ → ✅ `project_info` table

**Current localStorage usage**: Only for migration detection (read-only, then deleted)

## React Hooks Architecture

All data access uses SWR-backed React hooks:

### `useUserSettings()`
- **Location**: `frontend/lib/hooks.ts`
- **Returns**: `{ settings, updateSettings, isLoading, mutate }`
- **Caches**: Yes (SWR)
- **Revalidates**: On focus, on reconnect

### `useProjectInfo()`
- **Location**: `frontend/lib/hooks.ts`
- **Returns**: `{ projectInfo, createProjectInfo, updateProjectInfo, isLoading }`
- **Caches**: Yes (SWR)
- **Revalidates**: On focus, on reconnect

### `useQuickTemplates()`
- **Location**: `frontend/lib/hooks.ts`
- **Returns**: `{ templates, createTemplate, deleteTemplate, isLoading }`
- **Caches**: Yes (SWR)
- **Revalidates**: On focus, on reconnect

## API Endpoints

All backend routes save to PostgreSQL:

### Settings:
- `GET /api/settings?user_id=default` - Fetch settings
- `POST /api/settings` - Create/update settings

### Project Info:
- `GET /api/project-info?user_id=default` - Fetch project info
- `POST /api/project-info` - Create project info
- `PUT /api/project-info/:id` - Update project info

### Logs:
- `GET /api/logs?month=YYYYMM` - Fetch logs for month
- `POST /api/logs` - Create log entry
- `PUT /api/logs/:id` - Update log entry
- `DELETE /api/logs/:id` - Delete log entry
- `POST /api/logs/bulk` - Bulk import logs

### Quick Templates:
- `GET /api/quick-templates?user_id=default` - Fetch templates
- `POST /api/quick-templates` - Create template
- `DELETE /api/quick-templates/:id` - Delete template

## Multi-Device Sync ✅

Because everything is database-backed:
- ✅ Settings sync across devices
- ✅ Project info accessible everywhere
- ✅ Time logs available on all devices
- ✅ Templates shared across sessions
- ✅ No data loss on browser cache clear
- ✅ Works offline with SWR cache, syncs on reconnect

## Migration Strategy

For users with existing localStorage data:

1. **MigrationBanner** component detects localStorage data
2. Prompts user to migrate
3. Reads localStorage values
4. Writes to database via API
5. Clears localStorage after successful migration
6. Shows success confirmation

**Migration keys cleared**:
- `paid_break`, `tax_pct`, `hourly_rate`
- `timesheet_sender`, `timesheet_recipient`, `timesheet_format`, `timesheet_smtp_pass`
- `webhook_active`, `webhook_url`, `sheet_url`, `month_nav`
- `project_info`

## Persistence Checklist ✅

- ✅ User settings → PostgreSQL `user_settings`
- ✅ Project info → PostgreSQL `project_info`
- ✅ Time entries → PostgreSQL `log_row`
- ✅ Quick templates → PostgreSQL `quick_templates`
- ✅ Sync logs → PostgreSQL `sync_log`
- ✅ SettingsDrawer → Database-backed (fixed)
- ✅ Setup gate → Database-backed
- ✅ Main app → Database-backed
- ✅ All API endpoints → PostgreSQL
- ✅ SWR caching → Automatic revalidation
- ✅ Migration path → Automated from localStorage

## Verification

To verify persistence:
1. Log time entries
2. Configure settings
3. Set up project info
4. Clear browser cache/localStorage
5. Reload application
6. **All data persists** ✅

## Deployment

**Backend**: Node.js + Express + PostgreSQL
- Database URL: Set via `DATABASE_URL` environment variable
- Auto-initializes tables on startup
- Migrations in `migrations/001_persistence_schema.sql`

**Frontend**: Next.js
- API calls via `fetch` to backend
- SWR for client-side caching
- No localStorage dependencies (except migration detection)

---

**Status**: 🟢 **FULLY PERSISTENT** - All data stored in PostgreSQL
