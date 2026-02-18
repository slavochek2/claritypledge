#!/bin/bash
# scripts/migrate.sh — Push new migrations to the remote database
#
# Extracts SUPABASE_DB_PASSWORD from .env.local and runs supabase db push.
# Run after creating any new migration file.
#
# Usage:
#   ./scripts/migrate.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env.local"

# --- Extract password from SUPABASE_DB_URL ---
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env.local not found at $ENV_FILE"
  exit 1
fi

DB_URL=$(grep "^SUPABASE_DB_URL=" "$ENV_FILE" | cut -d= -f2-)
if [ -z "$DB_URL" ]; then
  echo "ERROR: SUPABASE_DB_URL not found in .env.local"
  exit 1
fi

# Extract password: URL format is postgresql://user:PASSWORD@host:port/db
DB_PASSWORD=$(echo "$DB_URL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
if [ -z "$DB_PASSWORD" ]; then
  echo "ERROR: Could not parse password from SUPABASE_DB_URL"
  exit 1
fi

echo ">>> Checking migration status..."
npx supabase migration list -p "$DB_PASSWORD"

echo ""
echo ">>> Pushing new migrations..."
npx supabase db push -p "$DB_PASSWORD"

echo ""
echo "Done."
