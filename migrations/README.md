# Database Migrations

## Overview
This directory contains SQL migration files for the Smart Timing database schema.

## Running Migrations

### Option 1: Using the migration script (Recommended)
```bash
# From project root
./migrate.sh

# Or with explicit DATABASE_URL
./migrate.sh "postgresql://user:pass@host:port/dbname"
```

### Option 2: Using psql directly
```bash
psql "$DATABASE_URL" -f migrations/001_persistence_schema.sql
```

### Option 3: Auto-migration on server startup
The backend server automatically runs migrations when it starts (see `server.js` initTables()).

## Migration Files

### 001_persistence_schema.sql
Creates the complete database schema including:
- **project_info**: Project configuration (enhanced with user_id, is_active)
- **log_row**: Time tracking entries (enhanced with user_id, is_stamped_in)
- **user_settings**: User preferences (paid_break, tax_pct, hourly_rate, email settings, webhooks)
- **quick_templates**: Quick stamp templates
- **sync_log**: Webhook/sync audit trail

Also includes:
- All necessary indexes for performance
- Default seed data (3 quick templates)
- Safe `IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS` clauses (idempotent)

## Verifying Migration

Check tables:
```bash
psql "$DATABASE_URL" -c "\dt"
```

Check columns for a specific table:
```bash
psql "$DATABASE_URL" -c "\d user_settings"
```

Check seed data:
```bash
psql "$DATABASE_URL" -c "SELECT * FROM quick_templates;"
```

## Rollback
Since migrations use `IF NOT EXISTS`, re-running them is safe. To truly rollback:

```sql
DROP TABLE IF EXISTS sync_log CASCADE;
DROP TABLE IF EXISTS quick_templates CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
-- Note: Keep log_row and project_info as they contain user data
```

## Production Deployment

For Render:
1. Migrations run automatically on backend startup via `initTables()` in server.js
2. Alternatively, run manually via Render Shell:
   ```bash
   ./migrate.sh "$DATABASE_URL"
   ```

## Troubleshooting

**Error: psql not found**
- Install PostgreSQL: `brew install postgresql@17` (macOS)
- Or use Docker: `docker exec -i postgres_container psql ...`

**Error: relation already exists**
- This is a NOTICE, not an error. Migrations are idempotent.

**Error: column already exists**
- This is a NOTICE, not an error. Safe to ignore.
