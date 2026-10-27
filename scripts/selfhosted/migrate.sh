#!/bin/bash
# scripts/selfhosted/migrate.sh — apply pending migrations to the self-hosted TEST database (P1557)
#
# Reached through `./scripts/migrate.sh --env selfhosted`, which hands over here BEFORE it reads any
# env file, token or project ref. Nothing in this file can reach a hosted project: no Management
# API, no `supabase db push`, no Supabase CLI, no PAT. The target is fixed below; a failure here is
# a failure, never a retry against hosted TEST.
#
# Output contract (shell-safety.md): status lines never contain a bare redirect token.
#
# How it applies: psql inside the supabase-db container on the VM, over an IAP SSH session, as the
# `postgres` role over the container's local socket. SQL travels on stdin, never in argv. Each
# migration and its ledger row are ONE transaction (psql --single-transaction, ON_ERROR_STOP), so a
# failed file leaves neither a partial schema nor a ledger row. That is stricter than the hosted
# test path, which sends the file and the ledger insert as separate calls and treats "already
# exists" as applied (not reproduced here: a statement failing with "already exists" says nothing
# about the statements after it).
#
# Ledger: supabase_migrations.schema_migrations (version, name), written exactly as migrate.sh
# writes it: version = leading digits, name = slug without the version prefix and .sql
# (pl_migration_name_of). The table is created if absent, with the CLI's own column set.
#
# Not done here, deliberately: no deploy-manifest stamp (that manifest records hosted deployments),
# no --only / --expect-sha (the committed-blob mode exists for prod /push), no prod gates.
#
# Usage (via the front door): ./scripts/migrate.sh --env selfhosted [--list]
#   --list                print the pending migrations and exit; applies nothing
#   --allow-empty-ledger  proceed when the ledger has no rows (a genuinely fresh database)

set -euo pipefail

# --- The one target. Changing these is a decision, not a flag. ---
GCP_PROJECT="gen-lang-client-0869694595"
VM="cp-test-supabase"
ZONE="asia-southeast1-a"
EXPECTED_URL="https://136-85-1-126.sslip.io"
DB_CONTAINER="supabase-db"
MAC_ENV="$HOME/.config/cp-selfhosted-test/env"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$(dirname "$SCRIPT_DIR")/lib"
# Git root of CWD so a worktree applies its own migrations (same convention as migrate.sh's callers).
PROJECT_DIR="$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null || dirname "$(dirname "$SCRIPT_DIR")")"
MIGRATIONS_DIR="$PROJECT_DIR/supabase/migrations"

# shellcheck source=../lib/prod-ledger.sh
source "$LIB_DIR/prod-ledger.sh"

die() { echo "ERROR: $*" >&2; exit 1; }

LIST_ONLY=false
ALLOW_EMPTY_LEDGER=false
SAW_ENV=false
while [ $# -gt 0 ]; do
  case "$1" in
    --env)
      [ "${2:-}" = "selfhosted" ] || die "--env must be selfhosted here (got '${2:-}')."
      SAW_ENV=true; shift 2 ;;
    --env=selfhosted) SAW_ENV=true; shift ;;
    --yes) shift ;;  # accepted for parity with the front door; this target has no ack prompt
    --list) LIST_ONLY=true; shift ;;
    --allow-empty-ledger) ALLOW_EMPTY_LEDGER=true; shift ;;
    --only|--expect-sha)
      die "$1 is the prod /push mode (committed blobs) and is not supported for selfhosted." ;;
    *) die "unknown argument '$1'." ;;
  esac
done
[ "$SAW_ENV" = true ] || die "run through './scripts/migrate.sh --env selfhosted'."

# --- Refuse unless the target is the self-hosted host ---
[ -f "$MAC_ENV" ] || die "$MAC_ENV not found: cannot confirm the target identity. Nothing was applied."
mac_url="$(grep '^SUPABASE_URL=' "$MAC_ENV" | head -1 | cut -d= -f2- | tr -d '"'"'" || true)"
[ "$mac_url" = "$EXPECTED_URL" ] || die "SUPABASE_URL in $MAC_ENV is not $EXPECTED_URL (found: ${mac_url:-empty}). Refusing; nothing was applied."
# Homebrew installs gcloud outside the default PATH of non-login shells.
command -v gcloud >/dev/null 2>&1 || PATH="/opt/homebrew/share/google-cloud-sdk/bin:$PATH"
command -v gcloud >/dev/null 2>&1 || die "gcloud not found"
gcloud auth print-access-token >/dev/null 2>&1 || die "gcloud login expired: run 'gcloud auth login', then re-run. Nothing was applied."
[ -d "$MIGRATIONS_DIR" ] || die "migrations dir not found: $MIGRATIONS_DIR"

GCLOUD_COMMON=(--project="$GCP_PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet)
PSQL_REMOTE="sudo docker exec -i $DB_CONTAINER psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1"

# Run psql on the VM with its stdin taken from the file in $2, remote psql flags in $1.
remote_psql() {
  gcloud compute ssh "$VM" "${GCLOUD_COMMON[@]}" --command "$PSQL_REMOTE $1" < "$2" \
    2> >(grep -v -i -E 'numpy|increasing_the_tcp|^WARNING:|^$' >&2)
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo ">>> Target: self-hosted TEST ($EXPECTED_URL), container $DB_CONTAINER on $VM"

# --- P1042 guard 1 (in-tree version collision): same script migrate.sh runs ---
if ! "$LIB_DIR/check-duplicate-migration-versions.sh" "$MIGRATIONS_DIR" --label "env: selfhosted"; then
  echo ""
  die "Aborted before applying anything: no migration was run, no ledger row written."
fi

# --- Ledger fetch (apply mode bootstraps the ledger table if the database has none) ---
# --list is strictly read-only, so it does not bootstrap the table.
: > "$WORK/ledger.sql"
if [ "$LIST_ONLY" != true ]; then
  cat >> "$WORK/ledger.sql" <<'SQL'
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text NOT NULL PRIMARY KEY,
  statements text[],
  name text
);
SQL
fi
cat >> "$WORK/ledger.sql" <<'SQL'
SELECT version || E'\t' || coalesce(name, '') FROM supabase_migrations.schema_migrations ORDER BY version;
SQL
if ! remote_psql "-At" "$WORK/ledger.sql" > "$WORK/ledger.tsv"; then
  die "could not read the migration ledger from $VM. Nothing was applied."
fi
# A restored database always has ledger rows. An empty ledger reads as "nothing is applied yet",
# which re-sends every migration; that is only right on a genuinely fresh database (P1174).
LEDGER_ROWS=$(wc -l < "$WORK/ledger.tsv" | tr -d ' ')
echo "Remote applied versions: $LEDGER_ROWS migrations"
if [ "$LEDGER_ROWS" -eq 0 ] && [ "$ALLOW_EMPTY_LEDGER" != true ]; then
  die "the ledger is empty. If this database is genuinely fresh, re-run with --allow-empty-ledger. Nothing was applied."
fi

# --- P1042 guard 2 (cross-tree collision): a version recorded by a DIFFERENT file ---
PENDING=()
for FILE in "$MIGRATIONS_DIR"/*.sql; do
  [ -e "$FILE" ] || continue
  BASE=$(basename "$FILE")
  echo "$BASE" | grep -qE '^[0-9]' || continue
  VER=$(pl_version_of "$BASE")
  REC=$(awk -F'\t' -v v="$VER" '$1 == v { print $2; exit }' "$WORK/ledger.tsv")
  if awk -F'\t' -v v="$VER" '$1 == v { found = 1 } END { exit !found }' "$WORK/ledger.tsv"; then
    if [ -n "$REC" ] && ! pl_name_matches "$REC" "$BASE" &&
       ! "$LIB_DIR/check-duplicate-migration-versions.sh" "$MIGRATIONS_DIR" --is-allowlisted "$VER"; then
      echo ""
      echo "ERROR: version $VER was recorded by a DIFFERENT migration file."
      echo "  in the ledger: $REC"
      echo "  on disk here:  $BASE"
      echo "  Fix: renumber $BASE to a unique timestamp, then re-run."
      exit 1
    fi
    continue
  fi
  PENDING+=("$BASE")
done

if [ ${#PENDING[@]} -eq 0 ]; then
  echo "No pending migrations: the self-hosted schema matches the local migration files."
  exit 0
fi
echo "Pending migrations (${#PENDING[@]}) for the self-hosted TEST database:"
for P in "${PENDING[@]}"; do echo "  - $P"; done
if [ "$LIST_ONLY" = true ]; then
  echo "(--list: nothing applied)"
  exit 0
fi
echo ""

# --- Apply, in order, stopping at the first failure ---
APPLIED_COUNT=0
for BASE in "${PENDING[@]}"; do
  VER=$(pl_version_of "$BASE")
  NAME=$(pl_migration_name_of "$BASE")
  # psql runs backslash commands from its input anywhere on a line (\! is a shell in the db
  # container, \c switches database). A migration must be plain SQL: refuse one outside a string.
  if ! python3 "$SCRIPT_DIR/lib/psql-meta-check.py" "$MIGRATIONS_DIR/$BASE" >&2; then
    echo "  REFUSED $BASE: contains a psql backslash command; migrations must be plain SQL." >&2
    exit 1
  fi
  # A file with its own BEGIN/COMMIT ends --single-transaction's outer transaction at its COMMIT,
  # so a failure after that point is NOT rolled back. Report it as such, never as clean.
  OWN_TXN=false
  grep -qiE '(^|;)[[:space:]]*(BEGIN|COMMIT|ROLLBACK|ABORT|START[[:space:]]+TRANSACTION)([[:space:]]+(WORK|TRANSACTION))?[[:space:]]*;' "$MIGRATIONS_DIR/$BASE" && OWN_TXN=true
  {
    cat "$MIGRATIONS_DIR/$BASE"
    # Newline + terminating semicolon: a file ending in a comment or no final semicolon must not
    # swallow the ledger insert. The insert is the last statement of the same transaction.
    printf '\n;\nINSERT INTO supabase_migrations.schema_migrations (version, name) VALUES (%s, %s) ON CONFLICT DO NOTHING;\n' \
      "'${VER//\'/\'\'}'" "'${NAME//\'/\'\'}'"
  } > "$WORK/apply.sql"
  if remote_psql "--single-transaction" "$WORK/apply.sql" > "$WORK/apply.out" 2>&1; then
    # The ledger row is the record of "applied": confirm it landed, whatever the exit code said.
    printf "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '%s';\n" "${VER//\'/\'\'}" > "$WORK/check.sql"
    if [ "$(remote_psql "-tA" "$WORK/check.sql" 2>/dev/null | tr -d '[:space:]')" != 1 ]; then
      echo "  FAILED $BASE: applied, but its ledger row is missing. Fix the ledger before the next run." >&2
      exit 1
    fi
    echo "  applied $BASE"
    APPLIED_COUNT=$((APPLIED_COUNT + 1))
  else
    if [ "$OWN_TXN" = true ]; then
      echo "  FAILED $BASE (the file manages its own transaction: it MAY be partly applied; inspect before re-running):"
    else
      echo "  FAILED $BASE (rolled back: no schema change, no ledger row):"
    fi
    head -c 1500 "$WORK/apply.out" | tr '<>|' '___'
    echo ""
    echo "Stopped at the first failure; later pending files were NOT attempted."
    exit 1
  fi
done

echo ""
echo "Applied $APPLIED_COUNT new migration(s) to the self-hosted TEST database."
echo "Deploy manifest not stamped: it records hosted deployments only."
echo "Done."
