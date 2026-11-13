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
# How it applies: psql inside the target's db container on the VM, over an IAP SSH session, as the
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
#   --applied             print the applied ledger versions, one per line, and nothing else on
#                         stdout (P1591 drift check); read-only, applies nothing
#   --allow-empty-ledger  proceed when the ledger has no rows (a genuinely fresh database)

set -euo pipefail

# --- The VM is fixed. WHICH environment on it (the main lane, or this worktree's own lane) is asked
# of the resolver, scripts/selfhosted/lane.py (P1672); nothing here decides it. ---
GCP_PROJECT="gen-lang-client-0869694595"
VM="cp-test-supabase"
ZONE="asia-southeast1-a"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$(dirname "$SCRIPT_DIR")/lib"
# Git root of CWD so a worktree applies its own migrations (same convention as migrate.sh's callers).
PROJECT_DIR="$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null || dirname "$(dirname "$SCRIPT_DIR")")"
MIGRATIONS_DIR="$PROJECT_DIR/supabase/migrations"

# shellcheck source=../lib/prod-ledger.sh
source "$LIB_DIR/prod-ledger.sh"

die() { echo "ERROR: $*" >&2; exit 1; }

LIST_ONLY=false
APPLIED_ONLY=false
ALLOW_EMPTY_LEDGER=false
SAW_ENV=false
MAIN_LANE=false
while [ $# -gt 0 ]; do
  case "$1" in
    --env)
      [ "${2:-}" = "selfhosted" ] || die "--env must be selfhosted here (got '${2:-}')."
      SAW_ENV=true; shift 2 ;;
    --env=selfhosted) SAW_ENV=true; shift ;;
    --yes) shift ;;  # accepted for parity with the front door; this target has no ack prompt
    --list) LIST_ONLY=true; shift ;;
    --applied) APPLIED_ONLY=true; LIST_ONLY=true; shift ;;
    --allow-empty-ledger) ALLOW_EMPTY_LEDGER=true; shift ;;
    --main-lane) MAIN_LANE=true; shift ;;
    --lane|--lane=*|--gen|--gen=*) die "$1 cannot be combined with anything: this script takes its lane from the resolver, or --main-lane." ;;
    --only|--expect-sha)
      die "$1 is the prod /push mode (committed blobs) and is not supported for selfhosted." ;;
    *) die "unknown argument '$1'." ;;
  esac
done
[ "$SAW_ENV" = true ] || die "run through './scripts/migrate.sh --env selfhosted'."

# --- Ask the resolver which environment this worktree uses (P1672). Listing is a read; applying is
# a write (a worktree on a branch that holds a lane may not write to the main lane). Exit 2 = refused:
# stop with its message, never fall back. The output is eval-safe (shell-quoted) and only evaluated
# after a zero exit. ---
RESOLVE_PURPOSE=write
[ "$LIST_ONLY" = true ] && RESOLVE_PURPOSE=run
if [ "$MAIN_LANE" = true ]; then
  # --main-lane (the landing hook invariant): the MAIN lane with its fixed constants, never lane.py. The
  # landing job runs this from a `git archive` extract of main's tip, which is not a git checkout: the tree
  # is the one this script sits in, and nothing below needs git. A lane context in the environment is
  # refused rather than ignored.
  if [ -n "${CP_TEST_LANE:-}" ] || [ -n "${CP_TEST_GEN:-}" ] || [ -n "${CP_TEST_LANECTL:-}" ] || [ "${CP_TEST_TARGET:-main}" != main ]; then
    die "--main-lane cannot be combined with a lane context (CP_TEST_LANE, CP_TEST_GEN, CP_TEST_LANECTL or CP_TEST_TARGET is set). Nothing was applied."
  fi
  PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
  MIGRATIONS_DIR="$PROJECT_DIR/supabase/migrations"
  # Allowed only from a non-git extract (the landing job) or the MAIN checkout. A feature worktree, claimed or
  # not, must not push its branch schema to the main lane with this flag. Unreadable git state is refused too.
  # "Not a checkout" is decided by the ABSENCE of any .git above the tree, never by a git command failing:
  # a broken or refused .git (safe.directory, permissions) must refuse, not pass as an extract.
  in_checkout=false; d="$PROJECT_DIR"
  while [ "$d" != / ] && [ -n "$d" ]; do [ -e "$d/.git" ] && { in_checkout=true; break; }; d="$(dirname "$d")"; done
  if [ "$in_checkout" = true ]; then
    main_top="$(git -C "$PROJECT_DIR" rev-parse --show-toplevel 2>/dev/null)" &&
      main_common="$(git -C "$PROJECT_DIR" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" ||
      die "--main-lane: $PROJECT_DIR is inside a git checkout whose state cannot be read. Nothing was applied."
    [ "$(dirname "$main_common")" = "$main_top" ] ||
      die "--main-lane runs only from the main checkout or a non-git extract; $main_top is a linked worktree. Nothing was applied."
    # From the main checkout, only landed migrations: on main, at a commit, with nothing uncommitted or untracked
    # in supabase/migrations (the landing job itself always runs from an extract of main's tip).
    [ "$(git -C "$main_top" symbolic-ref --short -q HEAD)" = main ] ||
      die "--main-lane from the main checkout needs it on branch main. Nothing was applied."
    [ -z "$(git -C "$main_top" status --porcelain --untracked-files=all -- supabase/migrations)" ] ||
      die "--main-lane: supabase/migrations in the main checkout has uncommitted or untracked files; only landed migrations go to the main lane. Nothing was applied."
  fi
  CP_TEST_TARGET=main; CP_TEST_LANE=""; CP_TEST_GEN=""; CP_TEST_LANECTL=""
  CP_TEST_ORIGIN="https://136-85-1-126.sslip.io"
  CP_TEST_DB_CONTAINER="supabase-db"
  CP_TEST_KEYS_FILE="$HOME/.config/cp-selfhosted-test/env"
else
command -v python3 >/dev/null 2>&1 || die "python3 not found: cannot resolve the TEST target. Nothing was applied."
resolve_rc=0
resolved="$(python3 "$SCRIPT_DIR/lane.py" resolve --purpose "$RESOLVE_PURPOSE" --format shell --worktree "$PROJECT_DIR")" || resolve_rc=$?
if [ "$resolve_rc" -ne 0 ]; then
  echo "ERROR: the TEST target could not be resolved (exit $resolve_rc, message above). Nothing was applied." >&2
  exit "$resolve_rc"
fi
eval "$resolved"
fi
EXPECTED_URL="$CP_TEST_ORIGIN"
DB_CONTAINER="$CP_TEST_DB_CONTAINER"
MAC_ENV="$CP_TEST_KEYS_FILE"
IS_LANE=false
[ "$CP_TEST_TARGET" = "lane" ] && IS_LANE=true
TARGET_LABEL="self-hosted TEST"
[ "$IS_LANE" = true ] && TARGET_LABEL="self-hosted TEST lane $CP_TEST_LANE generation $CP_TEST_GEN"

# --- Refuse unless the target is the self-hosted host: the keys file must name the resolved origin ---
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
LANE_ARGS="--lane $CP_TEST_LANE --gen $CP_TEST_GEN"

# Run psql on the VM with its stdin taken from the file in $2, remote psql flags in $1.
# Main lane: psql in the main db container. Lane: the same through lanectl, which refuses a stale
# generation. The callers' -At / -tA both mean lanectl's --at.
remote_psql() {
  local cmd="$PSQL_REMOTE $1"
  if [ "$IS_LANE" = true ]; then
    local flags=""
    case "$1" in
      -At|-tA) flags=" --at" ;;
      --single-transaction) flags=" --single-transaction" ;;
      "") ;;
      *) die "internal: unmapped psql flags '$1' for a lane." ;;
    esac
    cmd="sudo $CP_TEST_LANECTL psql $LANE_ARGS$flags"
  fi
  gcloud compute ssh "$VM" "${GCLOUD_COMMON[@]}" --command "$cmd" < "$2" \
    2> >(grep -v -i -E 'numpy|increasing_the_tcp|^WARNING:|^$' >&2)
}

# lanectl lifecycle step on the VM (no stdin). Returns lanectl's exit code.
remote_lanectl() {
  gcloud compute ssh "$VM" "${GCLOUD_COMMON[@]}" --command "sudo $CP_TEST_LANECTL $1 $LANE_ARGS" < /dev/null \
    2> >(grep -v -i -E 'numpy|increasing_the_tcp|^WARNING:|^$' >&2)
}

# Lift the quarantine (outbound check). A failure keeps the lane quarantined and fails this script.
lift_lane() {
  if remote_lanectl lift; then
    echo "Lane $CP_TEST_LANE lifted: outbound check passed."
  else
    echo "ERROR: the lane $CP_TEST_LANE outbound check did not pass (lift failed). The lane STAYS QUARANTINED: functions stopped, cron off, no route. Fix the cause, then re-run." >&2
    exit 1
  fi
}

# Applying to a lane: extend the lease first (a dead lease refuses here, before anything is touched).
if [ "$IS_LANE" = true ] && [ "$LIST_ONLY" != true ]; then
  (cd "$PROJECT_DIR" && python3 "$SCRIPT_DIR/lane.py" heartbeat) || die "lane heartbeat failed. Nothing was applied."
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [ "$APPLIED_ONLY" = true ]; then
  # stdout carries only versions; the banner goes to stderr.
  echo ">>> Target: $TARGET_LABEL ($EXPECTED_URL), container $DB_CONTAINER on $VM" >&2
  cat > "$WORK/ledger.sql" <<'SQL'
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
SQL
  remote_psql "-At" "$WORK/ledger.sql" > "$WORK/applied.txt" || die "could not read the migration ledger from $VM."
  cat "$WORK/applied.txt"
  exit 0
fi
echo ">>> Target: $TARGET_LABEL ($EXPECTED_URL), container $DB_CONTAINER on $VM"

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
  # A lane may have been left quarantined by an earlier failed run: lifting is idempotent. Never on
  # --list/--applied, which must stay read-only.
  [ "$IS_LANE" = true ] && [ "$LIST_ONLY" != true ] && lift_lane
  exit 0
fi
echo "Pending migrations (${#PENDING[@]}) for the self-hosted TEST database:"
for P in "${PENDING[@]}"; do echo "  - $P"; done
if [ "$LIST_ONLY" = true ]; then
  echo "(--list: nothing applied)"
  exit 0
fi
echo ""

# --- A lane is quarantined (cron off, functions stopped, no route) while schema changes ---
if [ "$IS_LANE" = true ]; then
  remote_lanectl quarantine || die "could not quarantine lane $CP_TEST_LANE. Nothing was applied."
fi

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

[ "$IS_LANE" = true ] && lift_lane
echo ""
echo "Applied $APPLIED_COUNT new migration(s) to the self-hosted TEST database."
echo "Deploy manifest not stamped: it records hosted deployments only."
echo "Done."
