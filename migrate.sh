#!/bin/bash
# Database Migration Script for Smart Timing
# Usage: ./migrate.sh [database_url]

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Smart Timing Database Migration${NC}"
echo "======================================"

# Get database URL from argument or .env file
if [ -n "$1" ]; then
  DATABASE_URL="$1"
elif [ -f .env ]; then
  echo -e "${BLUE}📄 Loading DATABASE_URL from .env file${NC}"
  export $(grep -v '^#' .env | grep DATABASE_URL | xargs)
fi

if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}❌ Error: DATABASE_URL not provided${NC}"
  echo "Usage: ./migrate.sh <database_url>"
  echo "   or: export DATABASE_URL in .env file"
  exit 1
fi

echo -e "${BLUE}📊 Connecting to database...${NC}"

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
  echo "Install PostgreSQL client: brew install postgresql@17"
  exit 1
fi

echo -e "${BLUE}✓ Using psql: $PSQL${NC}"

# Run migrations in order
echo -e "${BLUE}🔄 Running migration: 001_persistence_schema.sql${NC}"
$PSQL "$DATABASE_URL" -f migrations/001_persistence_schema.sql

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Migration 001 completed${NC}"
else
  echo -e "${RED}❌ Migration 001 failed${NC}"
  exit 1
fi

echo -e "${BLUE}🔄 Running migration: 002_add_invoice_reminder.sql${NC}"
$PSQL "$DATABASE_URL" -f migrations/002_add_invoice_reminder.sql

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Migration completed successfully!${NC}"
  echo ""
  echo -e "${BLUE}📋 Verifying tables...${NC}"
  $PSQL "$DATABASE_URL" -c "\dt" -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
else
  echo -e "${RED}❌ Migration failed${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}✅ All done! Database is ready.${NC}"
