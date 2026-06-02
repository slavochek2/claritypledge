#!/bin/bash
# scripts/migrate.sh — Push new migrations to the remote database
#
# Primary path: supabase db push (tracks history, uses pooler auth)
# Fallback path: Supabase Management API (bypasses CLI auth and history-sync
#   issues common when feature branches diverge from main on a shared test DB)
#
# Usage:
#   ./scripts/migrate.sh              # apply to test DB (default, uses .env.local)
#   ./scripts/migrate.sh --env prod   # apply to prod DB (uses .env.prod)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# --- Parse args ---
ENV_NAME="local"
for arg in "$@"; do
  if [ "$arg" = "--env" ]; then
    shift; ENV_NAME="$1"; shift
  elif [[ "$arg" == --env=* ]]; then
    ENV_NAME="${arg#--env=}"; shift
  fi
done

if [ "$ENV_NAME" = "prod" ]; then
  ENV_FILE="$PROJECT_DIR/.env.prod"
else
  ENV_FILE="$PROJECT_DIR/.env.local"
fi

# --- Extract env vars ---
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found"
  [ "$ENV_NAME" = "prod" ] && echo "  Create .env.prod with VITE_SUPABASE_URL, SUPABASE_DB_URL, SUPABASE_ACCESS_TOKEN"
  exit 1
fi

DB_URL=$(grep "^SUPABASE_DB_URL=" "$ENV_FILE" | cut -d= -f2-)
if [ -z "$DB_URL" ]; then
  echo "ERROR: SUPABASE_DB_URL not found in $ENV_FILE"
  exit 1
fi
DB_PASSWORD=$(echo "$DB_URL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')

SUPABASE_URL=$(grep "^VITE_SUPABASE_URL=" "$ENV_FILE" | cut -d= -f2-)
PROJECT_REF=$(echo "$SUPABASE_URL" | sed 's|https://||' | cut -d. -f1)

# --- Get Supabase PAT (keychain first, then env file fallback) ---
SUPABASE_PAT_RAW=$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null || true)
SUPABASE_PAT=""
if [ -n "$SUPABASE_PAT_RAW" ]; then
  SUPABASE_PAT=$(echo "$SUPABASE_PAT_RAW" | sed 's/go-keyring-base64://' | base64 -d 2>/dev/null || true)
fi
# Fallback: SUPABASE_ACCESS_TOKEN in env file (enables agent sessions without keychain access)
if [ -z "$SUPABASE_PAT" ]; then
  SUPABASE_PAT=$(grep "^SUPABASE_ACCESS_TOKEN=" "$ENV_FILE" | cut -d= -f2- || true)
fi

# --- Helper: validate Supabase Management API response body ---
# The API can return HTTP 200 with a JSON error object ({"message":...,"code":...})
# when a SQL statement fails. This function distinguishes real success (JSON array)
# from silent failure (JSON object with message key). P417 regression guard.
_check_api_success() {
  local BODY="$1"
  python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    if isinstance(d, list):
        sys.exit(0)   # array = success (DDL returns [], SELECT returns rows)
    elif isinstance(d, dict) and 'message' in d:
        sys.exit(1)   # object with message = SQL error from Supabase
    else:
        sys.exit(0)   # other shapes treated as success
except Exception:
    sys.exit(1)       # unparseable = treat as error (fail safe)
" <<< "$BODY"
}

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
  local VERSION
  VERSION=$(echo "$BASENAME" | sed -E 's/^([0-9]+)[_.]?.*/\1/')
  local INSERT_SQL="INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('${VERSION}') ON CONFLICT DO NOTHING"

  # Management API returns 200 for queries, 201 for DDL statements.
  # Guard: even on HTTP 200, check the body — the API can return an error object
  # ({"message":...,"code":...}) with HTTP 200 when SQL fails (P417).
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    if ! _check_api_success "$BODY"; then
      echo "  ✗ $BASENAME FAILED (HTTP $HTTP_CODE, SQL error in body): $BODY"
      return 1
    fi
    echo "  ✓ $BASENAME applied"
    # Record in migration history so future `db push` sees it as already applied
    curl -s -o /dev/null \
      -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
      -H "Authorization: Bearer ${SUPABASE_PAT}" \
      -H "Content-Type: application/json" \
      -d "{\"query\": $(echo "$INSERT_SQL" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}"
    return 0
  elif echo "$BODY" | grep -q "already exists"; then
    # Object already exists → migration is effectively applied; record in history and skip
    echo "  ~ $BASENAME already applied (skipping)"
    curl -s -o /dev/null \
      -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
      -H "Authorization: Bearer ${SUPABASE_PAT}" \
      -H "Content-Type: application/json" \
      -d "{\"query\": $(echo "$INSERT_SQL" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}"
    return 0
  else
    echo "  ✗ $BASENAME FAILED (HTTP $HTTP_CODE): $BODY"
    return 1
  fi
}

# --- Primary path: supabase db push (test only — CLI is always linked to test project) ---
if [ "$ENV_NAME" != "prod" ]; then
  echo ">>> Checking migration status..."
  npx supabase migration list -p "$DB_PASSWORD" 2>&1 || echo "(migration list unavailable — pooler auth issue, continuing)"

  echo ""
  echo ">>> Pushing new migrations..."

  PUSH_OUTPUT=$(npx supabase db push -p "$DB_PASSWORD" 2>&1) && PUSH_EXIT=0 || PUSH_EXIT=$?

  if [ $PUSH_EXIT -eq 0 ]; then
    echo "$PUSH_OUTPUT"
    echo ""
    # Stamp deploy manifest after successful migration
    "$SCRIPT_DIR/stamp-deploy-manifest.sh" --env "$ENV_NAME" --migrations-only
    echo "Done."
    exit 0
  fi

  echo "$PUSH_OUTPUT"

  # Fall through to Management API if CLI failed
  NEEDS_FALLBACK=false
  if echo "$PUSH_OUTPUT" | grep -q "Remote migration versions not found in local"; then
    NEEDS_FALLBACK=true
  fi
  if echo "$PUSH_OUTPUT" | grep -q "Tenant or user not found\|unauthorized\|Unauthorized\|login role status\|password authentication failed\|Cannot find project ref"; then
    NEEDS_FALLBACK=true
  fi

  if [ "$NEEDS_FALLBACK" = "false" ]; then
    echo ""
    echo "ERROR: Migration push failed (exit $PUSH_EXIT). See output above."
    exit $PUSH_EXIT
  fi
else
  # Prod: skip CLI entirely (CLI is linked to test project), go straight to Management API
  echo ">>> Pushing new migrations to prod via Management API..."
  NEEDS_FALLBACK=true
fi

if [ "$NEEDS_FALLBACK" = "true" ]; then
  echo ""
  [ "$ENV_NAME" = "prod" ] && echo ">>> Applying migrations via Management API..." || echo ">>> Primary push failed — falling back to Management API..."

  if [ -z "$SUPABASE_PAT" ]; then
    echo "ERROR: Supabase PAT not found. Add SUPABASE_ACCESS_TOKEN to $ENV_FILE or run 'npx supabase login'."
    exit 1
  fi

  # Validate the resolved PAT AND get already-applied versions in one call.
  # migrate.sh resolves the PAT keychain-first ("Supabase CLI"), so a stale keychain
  # entry silently shadows a fresh SUPABASE_ACCESS_TOKEN in the env file. Capture the
  # HTTP status here and abort with one clear line, instead of a wall of per-migration
  # 401s (which also leaves the remote-versions list empty, so EVERY migration retries).
  APPLIED_RESPONSE=$(curl -s -w $'\n%{http_code}' \
    -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
    -H "Authorization: Bearer ${SUPABASE_PAT}" \
    -H "Content-Type: application/json" \
    -d '{"query": "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version"}' \
    2>&1)
  APPLIED_HTTP=$(printf '%s\n' "$APPLIED_RESPONSE" | tail -n1)
  APPLIED_JSON=$(printf '%s\n' "$APPLIED_RESPONSE" | sed '$d')
  if [ "$APPLIED_HTTP" != "200" ]; then
    echo "ERROR: Management API rejected the request (HTTP $APPLIED_HTTP) — the resolved Supabase PAT is invalid or expired."
    echo "  migrate.sh reads the PAT keychain-first ('Supabase CLI'), so a stale keychain entry"
    echo "  shadows a fresh SUPABASE_ACCESS_TOKEN in $ENV_FILE. Fix (non-destructive):"
    echo "    - refresh the keychain:  npx supabase login   (paste a current PAT), OR"
    echo "    - force the env token:   re-run with 'security' shadowed on PATH to return empty"
    echo "  Do NOT 'security delete' the keychain entry — it is shared with edge-function deploys."
    exit 1
  fi
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
  # Stamp deploy manifest after successful migration
  "$SCRIPT_DIR/stamp-deploy-manifest.sh" --env "$ENV_NAME" --migrations-only
  echo "Done."
fi
