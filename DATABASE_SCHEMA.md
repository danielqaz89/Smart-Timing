# Database Persistence Schema

## Overview
Move all localStorage-based settings to PostgreSQL for multi-device sync and better data integrity.

## Tables

### 1. `user_settings` (NEW)
Stores per-user preferences and configuration.

```sql
CREATE TABLE IF NOT EXISTS user_settings (
  id SERIAL PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL DEFAULT 'default', -- Future: support multi-user
  
  -- Time tracking preferences
  paid_break BOOLEAN DEFAULT false,
  tax_pct NUMERIC(4,2) DEFAULT 35.00,
  hourly_rate NUMERIC(10,2) DEFAULT 0,
  
  -- Email settings
  timesheet_sender TEXT,
  timesheet_recipient TEXT,
  timesheet_format TEXT CHECK (timesheet_format IN ('xlsx', 'pdf')) DEFAULT 'xlsx',
  smtp_app_password TEXT, -- Encrypted in production
  
  -- Webhook settings
  webhook_active BOOLEAN DEFAULT false,
  webhook_url TEXT,
  sheet_url TEXT,
  
  -- UI preferences
  month_nav TEXT, -- YYYYMM format
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
```

### 2. `project_info` (ENHANCED)
Currently exists but unused. Make it functional.

```sql
-- Already exists, but add:
ALTER TABLE project_info ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT 'default';
ALTER TABLE project_info ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE project_info ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_project_info_user_active ON project_info(user_id, is_active);
```

### 3. `quick_templates` (NEW)
Predefined templates for quick stamping.

```sql
CREATE TABLE IF NOT EXISTS quick_templates (
  id SERIAL PRIMARY KEY,
  user_id TEXT DEFAULT 'default',
  label TEXT NOT NULL, -- "Daglig standup", "Kundemøte", etc.
  activity TEXT CHECK (activity IN ('Work', 'Meeting')) DEFAULT 'Work',
  title TEXT,
  project TEXT,
  place TEXT,
  is_favorite BOOLEAN DEFAULT false,
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quick_templates_user ON quick_templates(user_id, display_order);
```

### 4. `log_row` (ENHANCED)
Add metadata for better tracking.

```sql
-- Add columns to existing table:
ALTER TABLE log_row ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT 'default';
ALTER TABLE log_row ADD COLUMN IF NOT EXISTS is_stamped_in BOOLEAN DEFAULT false; -- true if end_time = start_time
ALTER TABLE log_row ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_log_row_user ON log_row(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_log_row_stamped ON log_row(user_id, is_stamped_in) WHERE is_stamped_in = true;
```

### 5. `sync_log` (NEW)
Track webhook sync operations.

```sql
CREATE TABLE IF NOT EXISTS sync_log (
  id SERIAL PRIMARY KEY,
  user_id TEXT DEFAULT 'default',
  sync_type TEXT CHECK (sync_type IN ('webhook_send', 'webhook_receive', 'sheets_import')),
  status TEXT CHECK (status IN ('success', 'error', 'pending')),
  row_count INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_log_user_time ON sync_log(user_id, created_at DESC);
```

## Migration Strategy

### Phase 1: Add Tables & Columns
1. Run schema updates on backend startup
2. Backward compatible (doesn't break existing localStorage)

### Phase 2: API Endpoints
Add CRUD endpoints for:
- `GET/POST/PUT /api/settings` - User settings
- `GET/POST/PUT /api/project-info` - Project configuration
- `GET/POST/DELETE /api/quick-templates` - Template management
- `GET /api/settings/sync` - Sync localStorage → DB (one-time migration helper)

### Phase 3: Frontend Migration
1. Create hook: `useUserSettings()` - replaces individual `useLocalStorage` calls
2. Create hook: `useProjectInfo()` - manages project data
3. Create hook: `useQuickTemplates()` - manages quick stamp templates
4. Add migration component to detect localStorage data and offer to sync to DB

### Phase 4: Deprecate localStorage
1. Add warning banner if localStorage data exists
2. Eventually remove localStorage fallbacks

## Benefits

1. **Multi-device sync** - Access settings from any device
2. **Data backup** - Settings survive browser clear
3. **Audit trail** - Track changes with timestamps
4. **Advanced features** - Enable webhook automation, scheduled exports, etc.
5. **Security** - Encrypt sensitive data (SMTP passwords) server-side

## Security Considerations

- Encrypt `smtp_app_password` using `pgcrypto`
- Add user authentication (future)
- Rate limit settings updates
- Validate all inputs server-side

## Example Usage

### Before (localStorage):
```js
const [rate, setRate] = useState(0); // Lost on reload
const [taxPct, setTaxPct] = useLocalStorage("tax_pct", 35); // Browser-only
```

### After (Database):
```js
const { settings, updateSettings } = useUserSettings();
// settings.hourly_rate, settings.tax_pct auto-sync across devices
```
