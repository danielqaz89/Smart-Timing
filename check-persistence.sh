#!/bin/bash
# Persistence Verification Script for Smart Timing
# Checks that all fields are properly persisted in the database

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Smart Timing Persistence Verification${NC}"
echo "=========================================="

# Get database URL from argument or .env file
if [ -n "$1" ]; then
  DATABASE_URL="$1"
elif [ -f .env ]; then
  echo -e "${BLUE}📄 Loading DATABASE_URL from .env file${NC}"
  export $(grep -v '^#' .env | grep DATABASE_URL | xargs)
fi

if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}❌ Error: DATABASE_URL not provided${NC}"
  echo "Usage: ./check-persistence.sh <database_url>"
  echo "   or: export DATABASE_URL in .env file"
  exit 1
fi

# Find psql
PSQL=""
if command -v psql &> /dev/null; then
  PSQL="psql"
elif [ -f "/opt/homebrew/opt/postgresql@17/bin/psql" ]; then
  PSQL="/opt/homebrew/opt/postgresql@17/bin/psql"
elif [ -f "/usr/local/bin/psql" ]; then
  PSQL="/usr/local/bin/psql"
else
  echo -e "${RED}❌ Error: psql not found${NC}"
  exit 1
fi

echo -e "${BLUE}✓ Using psql: $PSQL${NC}"
echo ""

# Check tables exist
echo -e "${BLUE}📋 Checking tables...${NC}"
TABLES=$($PSQL "$DATABASE_URL" -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;")

EXPECTED_TABLES=("log_row" "project_info" "quick_templates" "sync_log" "user_settings")
for table in "${EXPECTED_TABLES[@]}"; do
  if echo "$TABLES" | grep -q "$table"; then
    echo -e "${GREEN}✅ Table '$table' exists${NC}"
  else
    echo -e "${RED}❌ Table '$table' missing${NC}"
  fi
done

echo ""
echo -e "${BLUE}📊 Checking user_settings columns...${NC}"

# Check user_settings columns
COLUMNS=$($PSQL "$DATABASE_URL" -t -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'user_settings' ORDER BY column_name;")

EXPECTED_COLUMNS=(
  "paid_break:boolean"
  "tax_pct:numeric"
  "hourly_rate:numeric"
  "timesheet_sender:text"
  "timesheet_recipient:text"
  "timesheet_format:text"
  "smtp_app_password:text"
  "webhook_active:boolean"
  "webhook_url:text"
  "sheet_url:text"
  "month_nav:text"
  "invoice_reminder_active:boolean"
  "theme_mode:text"
  "view_mode:text"
)

for col_def in "${EXPECTED_COLUMNS[@]}"; do
  col_name="${col_def%%:*}"
  col_type="${col_def##*:}"
  
  if echo "$COLUMNS" | grep -q "$col_name"; then
    actual_type=$(echo "$COLUMNS" | grep "$col_name" | awk '{print $3}')
    if [[ "$actual_type" == *"$col_type"* ]]; then
      echo -e "${GREEN}✅ Column '$col_name' exists with correct type${NC}"
    else
      echo -e "${YELLOW}⚠️  Column '$col_name' exists but type might differ (expected: $col_type, got: $actual_type)${NC}"
    fi
  else
    echo -e "${RED}❌ Column '$col_name' missing${NC}"
  fi
done

echo ""
echo -e "${BLUE}📊 Checking log_row columns...${NC}"
LOG_COLUMNS=$($PSQL "$DATABASE_URL" -t -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'log_row' ORDER BY column_name;" | grep -E "(expense_coverage|is_stamped_in)" || echo "")

if echo "$LOG_COLUMNS" | grep -q "expense_coverage"; then
  echo -e "${GREEN}✅ Column 'expense_coverage' exists${NC}"
else
  echo -e "${RED}❌ Column 'expense_coverage' missing${NC}"
fi

if echo "$LOG_COLUMNS" | grep -q "is_stamped_in"; then
  echo -e "${GREEN}✅ Column 'is_stamped_in' exists${NC}"
else
  echo -e "${RED}❌ Column 'is_stamped_in' missing${NC}"
fi

echo ""
echo -e "${GREEN}✅ Persistence check complete!${NC}"
echo ""
echo -e "${YELLOW}📝 Note: If any columns are missing, run: ./migrate.sh${NC}"
