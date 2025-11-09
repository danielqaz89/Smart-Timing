# Database Initialization Fix

## Problem

Production deployment was failing with the following error:

```
❌ Failed to initialize database: error: null value in column "id" of relation "cms_translations" violates not-null constraint
Code: 23502
Detail: Failing row contains (null, {}, 2025-11-09 15:06:26.534969+00, home.stamping, home, Stempling, Stamping).
```

## Root Cause

The production database had a legacy schema for the `cms_translations` table where:

1. **Duplicate ALTER TABLE statements** (lines 552-553) were adding `translation_key` and `category` columns without proper NOT NULL constraints, conflicting with earlier schema definitions (lines 353-355)
2. **Missing SERIAL sequence** on the `id` column in legacy databases - the column existed but didn't have an auto-increment default value
3. **Schema migration conflicts** between CREATE TABLE IF NOT EXISTS and ALTER TABLE ADD COLUMN IF NOT EXISTS statements

## Solution Applied

### 1. Removed Duplicate ALTER TABLE Statements

**File**: `server.js` (around line 552)

**Removed**:
```sql
ALTER TABLE cms_translations ADD COLUMN IF NOT EXISTS translation_key TEXT;
ALTER TABLE cms_translations ADD COLUMN IF NOT EXISTS category TEXT;
```

These were redundant and conflicting with the proper schema definition at lines 353-355.

### 2. Added Missing Column Migrations

**File**: `server.js` (lines 356-358)

**Added**:
```sql
ALTER TABLE cms_translations ADD COLUMN IF NOT EXISTS updated_by INT;
ALTER TABLE cms_translations ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE cms_translations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
```

This ensures all columns from the CREATE TABLE statement exist in legacy databases.

### 3. Added SERIAL Sequence Fix

**File**: `server.js` (lines 370-388)

**Added**:
```sql
-- Fix cms_translations.id to be SERIAL if it's not (for legacy DBs)
DO $$ BEGIN
  -- Check if id column exists but doesn't have a default (not SERIAL)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cms_translations' AND column_name = 'id'
      AND column_default IS NULL
  ) THEN
    -- Create sequence if it doesn't exist
    CREATE SEQUENCE IF NOT EXISTS cms_translations_id_seq;
    -- Set the sequence to the current max id
    PERFORM setval('cms_translations_id_seq', COALESCE((SELECT MAX(id) FROM cms_translations), 0) + 1, false);
    -- Set the default to use the sequence
    ALTER TABLE cms_translations ALTER COLUMN id SET DEFAULT nextval('cms_translations_id_seq');
    -- Associate the sequence with the column
    ALTER SEQUENCE cms_translations_id_seq OWNED BY cms_translations.id;
  END IF;
END $$;
```

This migration:
- Detects if the `id` column lacks a default value (not SERIAL)
- Creates a sequence `cms_translations_id_seq`
- Sets the sequence to start after the current maximum ID
- Associates the sequence with the `id` column so it auto-increments

## Verification

```bash
node -c server.js  # ✅ Syntax valid
```

## Expected Outcome

After deployment:

1. ✅ The `id` column will auto-increment for new rows
2. ✅ All INSERT statements will work without specifying `id`
3. ✅ No NULL constraint violations on `cms_translations.id`
4. ✅ Database initializes successfully on startup
5. ✅ Production deployment succeeds

## Files Modified

- `server.js` - Lines 352-405 (schema migrations for `cms_translations`)

## Next Steps

1. Deploy to production (Render will auto-deploy from git push)
2. Monitor logs for successful database initialization
3. Verify application starts without errors
4. Test full functionality end-to-end
