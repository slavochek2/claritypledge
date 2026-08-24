#!/bin/bash
# scripts/migrate.sh — Push new migrations to the remote database
#
# Primary path: supabase db push (tracks history, uses pooler auth)
# Fallback path: Supabase Management API (bypasses CLI auth and history-sync
#   issues common when feature branches diverge from main on a shared test DB)
#
# Usage:
#   ./scripts/migrate.sh                    # apply to test DB (default, uses .env.local)
#   ./scripts/migrate.sh --env prod         # apply to prod DB (uses .env.prod)
#   ./scripts/migrate.sh --env prod --yes   # prod, non-interactive: acknowledges the
#                                           # printed pending list (calling skill must
#                                           # show that list in its own ASK gate first)
#
# Prod gates (P887, after the P886 auth outage):
#   1. Pending migrations are enumerated upfront; applying requires explicit ack
#      (interactive y/N, or --yes for non-interactive runs). Prevents silently
#      sweeping in a held-back client-breaking migration.
#   2. Coupling marker: a pending migration containing
#      "-- requires-frontend: <sha>" hard-blocks the prod apply until that
#      commit is an ancestor of origin/main (i.e. the coupled frontend is
#      deployed). Fail-safe: malformed marker or git failure also blocks.
#   3. After any successful prod run, scripts/prod-smoke-test.mjs runs
#      automatically; a smoke failure exits non-zero with a loud banner.
#   Test-env behavior is unchanged by all three gates.
#   Authoring side: pre-commit (check-migration-client-safety.sh) requires new
#   migrations with client-breaking shapes to carry requires-frontend or a
#   "-- client-safe: <reason>" annotation.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# --- Parse args ---
# while/case (not for+shift): flags must parse identically in any order —
# the old for-loop misparsed "--yes --env prod" into ENV_NAME="--env".
ENV_NAME="local"
YES_FLAG=false
while [ $# -gt 0 ]; do
  case "$1" in
    --env)   shift; ENV_NAME="$1"; shift ;;
    --env=*) ENV_NAME="${1#--env=}"; shift ;;
    --yes)   YES_FLAG=true; shift ;;
    *)       shift ;;
  esac
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

# --- Helper: ledger `name` for a migration basename (P1042) ---
# Strips the version prefix and the .sql extension, matching what `supabase db push`
# writes into supabase_migrations.schema_migrations.name.
_migration_name_of() {
  local NOEXT="${1%.sql}"
  echo "$NOEXT" | sed -E 's/^[0-9]+_//'
}

# --- Helper: does a recorded ledger name refer to this file? (P1042) ---
# Tolerant on purpose. The rows in the ledger were written by more than one tool over
# time, and a FALSE mismatch here would abort a legitimate run — so accept every form
# that plausibly denotes the same file, and abort only when the recorded name denotes a
# DIFFERENT migration. Rows written before this change carry name = NULL and are handled
# by the caller (they cannot be judged, and are covered instead by the in-tree scan).
_migration_name_matches() {
  local RECORDED="$1" BASE="$2"
  local NOEXT="${BASE%.sql}"
  local SLUG
  SLUG=$(_migration_name_of "$BASE")
  [ "$RECORDED" = "$BASE" ] || [ "$RECORDED" = "$NOEXT" ] ||
    [ "$RECORDED" = "$SLUG" ] || [ "$RECORDED" = "$SLUG.sql" ]
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
  # P1042: record WHICH file claimed this version, not just the version. Without it the
  # ledger cannot distinguish two files sharing a prefix, so a collision leaves no forensic
  # trail and the apply-time check below has nothing to compare against.
  # Convention matches what `supabase db push` itself writes — measured 2026-08-24 against
  # the test ledger: version 20260606120000 -> name 'p898_seal_rpc_lead_count', i.e. the
  # slug with the timestamp prefix and the .sql extension stripped. Writing the same shape
  # keeps CLI-applied and API-applied rows comparable.
  local MIGRATION_NAME
  MIGRATION_NAME=$(_migration_name_of "$BASENAME")
  local INSERT_SQL="INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('${VERSION}', '${MIGRATION_NAME//\'/\'\'}') ON CONFLICT DO NOTHING"

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

# --- P1042 guard 1 (in-tree version collision) ---
# Runs before BOTH the CLI push path and the Management API path: schema_migrations is
# keyed on the version prefix alone, so two files sharing one prefix means only the first
# can ever be recorded and the second is skipped forever while its SQL never runs. Neither
# path can tell them apart, so neither may start. Fails closed — a missing guard script
# aborts the run rather than proceeding unguarded.
if ! "$SCRIPT_DIR/lib/check-duplicate-migration-versions.sh" \
      "$PROJECT_DIR/supabase/migrations" --label "env: $ENV_NAME"; then
  echo ""
  echo "Aborted before applying anything — no migration was run, no ledger row written."
  exit 1
fi

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
    -d '{"query": "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version"}' \
    2>&1)
  APPLIED_HTTP=$(printf '%s\n' "$APPLIED_RESPONSE" | tail -n1)
  APPLIED_JSON=$(printf '%s\n' "$APPLIED_RESPONSE" | sed '$d')
  # The /database/query endpoint returns 200 for SELECTs but 201 for some calls;
  # accept both. Treating 201 as failure here falsely reports "PAT invalid" and aborts
  # before the apply loop (which already handles 200 AND 201) ever runs. (P877)
  if [ "$APPLIED_HTTP" != "200" ] && [ "$APPLIED_HTTP" != "201" ]; then
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
  # P1042: version -> recorded filename, tab-separated. `name` is absent or NULL on every
  # row written before this change (217 of 248 on the test ledger, measured 2026-08-24), so
  # r.get() must tolerate both a missing key and a null value.
  REMOTE_NAMES=$(echo "$APPLIED_JSON" | python3 -c \
    'import json,sys; rows=json.load(sys.stdin); print("\n".join(r["version"]+"\t"+(r.get("name") or "") for r in rows))' \
    2>/dev/null || true)

  echo "Remote applied versions: $(echo "$REMOTE_VERSIONS" | wc -l | tr -d ' ') migrations"
  echo ""

  # --- Prod gate 1 (P887): enumerate pending migrations, require explicit ack ---
  # A prod migrate must never silently sweep in a held-back migration (P886:
  # a client-breaking grants migration rode along with an unrelated backend ship).
  if [ "$ENV_NAME" = "prod" ]; then
    PENDING_FILES=()
    for MIGRATION_FILE in "$PROJECT_DIR"/supabase/migrations/*.sql; do
      BASENAME=$(basename "$MIGRATION_FILE")
      echo "$BASENAME" | grep -qE '^[0-9]' || continue
      VERSION=$(echo "$BASENAME" | sed -E 's/^([0-9]+)[_.]?.*/\1/')
      echo "$REMOTE_VERSIONS" | grep -qx "$VERSION" && continue
      PENDING_FILES+=("$BASENAME")
    done

    if [ ${#PENDING_FILES[@]} -eq 0 ]; then
      echo "No pending migrations — prod schema matches local migration files."
    else
      echo "Pending migrations (${#PENDING_FILES[@]}) — these WILL be applied to PROD:"
      for PENDING in "${PENDING_FILES[@]}"; do
        echo "  - $PENDING"
      done
      echo ""

      # --- Prod gate 2 (P887): requires-frontend coupling marker hard-block ---
      # A client-breaking migration carries "-- requires-frontend: <sha>". It must
      # never apply before that frontend commit is deployed (ancestor of
      # origin/main). Fail-safe: malformed marker or git failure also blocks.
      # This refuses BEFORE the ack prompt — --yes does not bypass it.
      MARKER_BLOCKED=0
      for PENDING in "${PENDING_FILES[@]}"; do
        PENDING_PATH="$PROJECT_DIR/supabase/migrations/$PENDING"
        # [[:space:]]* — an indented marker must still arm the gate, never bypass it
        MARKER_LINE=$(grep -iE '^[[:space:]]*-- requires-frontend:' "$PENDING_PATH" | head -1 || true)
        [ -z "$MARKER_LINE" ] && continue
        # lowercase first: accepts any case variant; sha hex is case-insensitive
        REQUIRED_SHA=$(echo "$MARKER_LINE" | tr 'A-Z' 'a-z' | sed -E 's/^[[:space:]]*-- requires-frontend:[[:space:]]*([0-9a-f]+).*/\1/')
        if ! echo "$REQUIRED_SHA" | grep -qE '^[0-9a-f]{7,40}$'; then
          # tr: echoed file content must not re-introduce redirect tokens (P783)
          echo "BLOCKED: $PENDING carries a malformed requires-frontend marker: $(echo "$MARKER_LINE" | tr '<>|' '___')"
          MARKER_BLOCKED=$((MARKER_BLOCKED + 1))
          continue
        fi
        if git -C "$PROJECT_DIR" merge-base --is-ancestor "$REQUIRED_SHA" origin/main 2>/dev/null; then
          echo "  coupling OK: $PENDING (frontend $REQUIRED_SHA is on origin/main)"
        else
          echo "BLOCKED: $PENDING requires frontend commit $REQUIRED_SHA, which is NOT on origin/main."
          MARKER_BLOCKED=$((MARKER_BLOCKED + 1))
        fi
      done
      if [ $MARKER_BLOCKED -gt 0 ]; then
        echo ""
        echo "ERROR: $MARKER_BLOCKED pending migration(s) are coupled to undeployed frontend commits."
        echo "  Ship the coupled frontend first (push to origin/main), then re-run."
        echo "  This is the P886 prevention gate — do not bypass by deleting the marker."
        exit 1
      fi

      if [ "$YES_FLAG" = "true" ]; then
        echo "Proceeding: --yes acknowledges the pending list above."
      elif [ -t 0 ]; then
        printf 'Apply these %d migration(s) to PROD? [y/N] ' "${#PENDING_FILES[@]}"
        read -r ACK_REPLY
        case "$ACK_REPLY" in
          y|Y|yes|YES) echo "Acknowledged." ;;
          *) echo "Aborted — no migrations applied."; exit 1 ;;
        esac
      else
        echo "ERROR: non-interactive prod migrate requires --yes."
        echo "  Review the pending list above, then re-run: ./scripts/migrate.sh --env prod --yes"
        echo "  A held-back client-breaking migration in this list means STOP — ship its frontend first (P886)."
        exit 1
      fi
    fi
    echo ""
  fi

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
      # --- P1042 guard 2 (cross-tree version collision) ---
      # The in-tree scan above cannot see a colliding file that lives in a SIBLING
      # WORKTREE — only one of the pair is present here, so there is no duplicate to
      # find. The ledger is the only witness: if this version was recorded by a
      # DIFFERENT file, this file has never run and never will. Abort instead of
      # reporting the skip as success.
      RECORDED_NAME=$(printf '%s\n' "$REMOTE_NAMES" |
        awk -F'\t' -v v="$VERSION" '$1 == v { print $2; exit }')
      if [ -n "$RECORDED_NAME" ] && ! _migration_name_matches "$RECORDED_NAME" "$BASENAME"; then
        echo ""
        echo "ERROR: version $VERSION was recorded by a DIFFERENT migration file."
        echo "  in the ledger: $RECORDED_NAME"
        echo "  on disk here:  $BASENAME"
        echo ""
        echo "  $BASENAME has never been applied and never will be: schema_migrations is"
        echo "  keyed on the version prefix, so it is reported '(already applied, skipping)'"
        echo "  on every run while its SQL never executes (P1042)."
        echo ""
        echo "  Fix: renumber $BASENAME to a unique timestamp, then re-run."
        echo "Aborted — no further migrations applied."
        exit 1
      fi
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
  # (stamp BEFORE smoke: the manifest must reflect what was actually applied,
  #  even when the smoke gate below fails)
  "$SCRIPT_DIR/stamp-deploy-manifest.sh" --env "$ENV_NAME" --migrations-only

  # Stage the stamp so it can't sit uncommitted on main and block a later
  # /ship cherry-pick ("local changes would be overwritten") — see
  # docs/decisions.md 2026-04-25 [process] (proposed) and 2026-08-10 [process].
  git -C "$PROJECT_DIR" add supabase/deploy-manifest.json 2>/dev/null || true
  echo "Staged supabase/deploy-manifest.json — commit it (git-ops.sh commit-to-main if on main) before shipping."

  # --- Prod gate 3 (P887): mandatory post-migrate smoke ---
  # prod-smoke-test.mjs reads .env.local from cwd; run it from the project root.
  if [ "$ENV_NAME" = "prod" ]; then
    echo ""
    echo "Running prod smoke test (mandatory after prod migrate)..."
    if (cd "$PROJECT_DIR" && node "$SCRIPT_DIR/prod-smoke-test.mjs"); then
      echo "Prod smoke passed."
    else
      echo "============================================================"
      echo "PROD SMOKE FAILED AFTER MIGRATE"
      echo "Schema may be ahead of deployed clients (P886 class)."
      echo "Options: roll back the offending grant/migration via the"
      echo "Management API, ship the dependent frontend now, or re-run"
      echo "the smoke once if a transient network error is suspected."
      echo "============================================================"
      exit 1
    fi
  fi
  echo "Done."
fi
