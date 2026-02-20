#!/bin/bash
# scripts/migrate.sh — Push new migrations to the remote database
#
# Primary path: supabase db push (tracks history, uses pooler auth)
# Fallback path: Supabase Management API (bypasses CLI auth and history-sync
#   issues common when feature branches diverge from main on a shared test DB)
#
# Usage:
#   ./scripts/migrate.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env.local"

# --- Extract env vars ---
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env.local not found at $ENV_FILE"
  exit 1
fi

DB_URL=$(grep "^SUPABASE_DB_URL=" "$ENV_FILE" | cut -d= -f2-)
if [ -z "$DB_URL" ]; then
  echo "ERROR: SUPABASE_DB_URL not found in .env.local"
  exit 1
fi
DB_PASSWORD=$(echo "$DB_URL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')

SUPABASE_URL=$(grep "^VITE_SUPABASE_URL=" "$ENV_FILE" | cut -d= -f2-)
PROJECT_REF=$(echo "$SUPABASE_URL" | sed 's|https://||' | cut -d. -f1)

# --- Get Supabase PAT from macOS keychain ---
SUPABASE_PAT_RAW=$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null || true)
SUPABASE_PAT=""
if [ -n "$SUPABASE_PAT_RAW" ]; then
  SUPABASE_PAT=$(echo "$SUPABASE_PAT_RAW" | sed 's/go-keyring-base64://' | base64 -d 2>/dev/null || true)
fi

# --- Helper: apply a single SQL file via Management API ---
apply_via_api() {
  local FILE="$1"
  local BASENAME
  BASENAME=$(basename "$FILE")
  local SQL
  SQL=$(cat "$FILE")
  local RESPONSE HTTP_CODE BODY
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
    -H "Authorization: Bearer ${SUPABASE_PAT}" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $(echo "$SQL" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}" \
    2>&1)
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  # Management API returns 200 for queries, 201 for DDL statements
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "  ✓ $BASENAME applied"
    return 0
  else
    echo "  ✗ $BASENAME FAILED (HTTP $HTTP_CODE): $BODY"
    return 1
  fi
}

# --- Show current status (informational, non-fatal) ---
echo ">>> Checking migration status..."
npx supabase migration list -p "$DB_PASSWORD" 2>&1 || echo "(migration list unavailable — pooler auth issue, continuing)"

echo ""
echo ">>> Pushing new migrations..."

# --- Primary path: supabase db push ---
PUSH_OUTPUT=$(npx supabase db push -p "$DB_PASSWORD" 2>&1) && PUSH_EXIT=0 || PUSH_EXIT=$?

if [ $PUSH_EXIT -eq 0 ]; then
  echo "$PUSH_OUTPUT"
  echo ""
  echo "Done."
  exit 0
fi

echo "$PUSH_OUTPUT"

# --- Fallback path: Management API ---
# Triggered by the known multi-branch history mismatch OR by pooler auth failures.
NEEDS_FALLBACK=false
if echo "$PUSH_OUTPUT" | grep -q "Remote migration versions not found in local"; then
  NEEDS_FALLBACK=true
fi
if echo "$PUSH_OUTPUT" | grep -q "Tenant or user not found\|unauthorized\|Unauthorized\|login role status"; then
  NEEDS_FALLBACK=true
fi

if [ "$NEEDS_FALLBACK" = "true" ]; then
  echo ""
  echo ">>> Primary push failed — falling back to Management API..."

  if [ -z "$SUPABASE_PAT" ]; then
    echo "ERROR: Supabase PAT not found in keychain. Run 'npx supabase login' first."
    exit 1
  fi

  # Get already-applied versions from the DB migration history table
  APPLIED_JSON=$(curl -s \
    -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
    -H "Authorization: Bearer ${SUPABASE_PAT}" \
    -H "Content-Type: application/json" \
    -d '{"query": "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version"}' \
    2>&1)
  # Extract version values from JSON array (e.g. [{"version":"20250101"},...]
  REMOTE_VERSIONS=$(echo "$APPLIED_JSON" | python3 -c \
    'import json,sys; rows=json.load(sys.stdin); print("\n".join(r["version"] for r in rows))' \
    2>/dev/null || true)

  echo "Remote applied versions: $(echo "$REMOTE_VERSIONS" | wc -l | tr -d ' ') migrations"
  echo ""

  APPLIED_COUNT=0
  FAIL_COUNT=0

  for MIGRATION_FILE in "$PROJECT_DIR"/supabase/migrations/*.sql; do
    BASENAME=$(basename "$MIGRATION_FILE")
    # Extract version = leading digits (before first underscore or .sql)
    VERSION=$(echo "$BASENAME" | sed -E 's/^([0-9]+)[_.]?.*/\1/')

    # Skip files with no version prefix (non-standard filenames like p63_*.sql)
    if ! echo "$BASENAME" | grep -qE '^[0-9]'; then
      echo "  - $BASENAME (no version prefix, skipping)"
      continue
    fi

    # Skip if this version is already in remote history
    if echo "$REMOTE_VERSIONS" | grep -qx "$VERSION"; then
      echo "  - $BASENAME (already applied, skipping)"
      continue
    fi

    if apply_via_api "$MIGRATION_FILE"; then
      APPLIED_COUNT=$((APPLIED_COUNT + 1))
    else
      FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
  done

  echo ""
  if [ $FAIL_COUNT -gt 0 ]; then
    echo "ERROR: $FAIL_COUNT migration(s) failed. Check output above."
    exit 1
  fi
  echo "Applied $APPLIED_COUNT new migration(s) via Management API."
  echo ""
  echo "Done."
else
  echo ""
  echo "ERROR: Migration push failed (exit $PUSH_EXIT). See output above."
  exit $PUSH_EXIT
fi
