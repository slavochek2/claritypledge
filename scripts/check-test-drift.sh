#!/bin/bash
# scripts/check-test-drift.sh — P1591: is every migration prod has also applied to the ACTIVE TEST?
#
#   ./scripts/check-test-drift.sh                          live: prod ledger vs the active TEST ledger
#   ./scripts/check-test-drift.sh --prod-file A --test-file B   pure comparator on two files
#   --migrations-dir D   only versions with a .sql file in D count (live default: supabase/migrations).
#                        Prod's legacy rows with no file in the tree are not something migrate.sh
#                        can apply, so flagging them would warn on every ship.
#
# Files hold one applied version per line (anything after the first tab is ignored).
# Read-only everywhere: the prod ledger comes from the read-only token (pl_fetch_prod_versions), the
# TEST ledger from `selfhosted/migrate.sh --applied` or the read-only SQL helper. It never writes.
#
# Exit: 0 no drift · 1 DRIFT (prod has versions the active TEST lacks; fix command printed)
#       2 could not compare (unreadable/empty side). Callers that warn only (git-ops) treat any
#       non-zero as a warning; nothing is blocked by this script.
# Output contract (shell-safety.md): no bare redirect tokens in status lines.

set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROD_FILE=""; TEST_FILE=""; MIG_DIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --prod-file) PROD_FILE="${2:-}"; shift 2 ;;
    --test-file) TEST_FILE="${2:-}"; shift 2 ;;
    --migrations-dir) MIG_DIR="${2:-}"; shift 2 ;;
    -h|--help) sed -n 2,14p "$0"; exit 0 ;;
    *) echo "check-test-drift: unknown argument '$1'" >&2; exit 2 ;;
  esac
done
if { [ -n "$PROD_FILE" ] && [ -z "$TEST_FILE" ]; } || { [ -z "$PROD_FILE" ] && [ -n "$TEST_FILE" ]; }; then
  echo "check-test-drift: --prod-file and --test-file go together" >&2; exit 2
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
TARGET="given files"

if [ -z "$PROD_FILE" ]; then
  # shellcheck source=lib/prod-ledger.sh
  source "$SCRIPT_DIR/lib/prod-ledger.sh"
  # shellcheck source=lib/active-test.sh
  source "$SCRIPT_DIR/lib/active-test.sh"
  TARGET=$(active_test_target) || { echo "check-test-drift: cannot resolve the active TEST server." >&2; exit 2; }
  pl_fetch_prod_versions > "$WORK/prod.raw" || { echo "check-test-drift: cannot read the prod ledger." >&2; exit 2; }
  if [ "$TARGET" = "selfhosted" ]; then
    # No coreutils timeout on macOS: perl alarm bounds the IAP ssh so a dead tunnel cannot hang ship/push.
    perl -e 'alarm shift; exec @ARGV or exit 127' "${CP_DRIFT_TIMEOUT:-180}" "$SCRIPT_DIR/selfhosted/migrate.sh" --env selfhosted --applied > "$WORK/test.raw" 2> "$WORK/test.err" \
      || { echo "check-test-drift: cannot read the self-hosted TEST ledger: $(tail -n 3 "$WORK/test.err" | tr '<>|' '___')" >&2; exit 2; }
  else
    python3 "$SCRIPT_DIR/supabase-readonly-sql.py" --env hosted-test \
      "select version from supabase_migrations.schema_migrations" > "$WORK/test.json" 2> "$WORK/test.err" \
      || { echo "check-test-drift: cannot read the hosted TEST ledger: $(tail -n 3 "$WORK/test.err" | tr '<>|' '___')" >&2; exit 2; }
    python3 -c "import json,sys; [print(r['version']) for r in json.load(open(sys.argv[1]))]" "$WORK/test.json" > "$WORK/test.raw" \
      || { echo "check-test-drift: unparseable hosted TEST ledger." >&2; exit 2; }
  fi
  PROD_FILE="$WORK/prod.raw"; TEST_FILE="$WORK/test.raw"
  [ -n "$MIG_DIR" ] || MIG_DIR="$SCRIPT_DIR/../supabase/migrations"
fi

[ -r "$PROD_FILE" ] || { echo "check-test-drift: cannot read $PROD_FILE" >&2; exit 2; }
[ -r "$TEST_FILE" ] || { echo "check-test-drift: cannot read $TEST_FILE" >&2; exit 2; }
cut -f1 "$PROD_FILE" | grep -v '^[[:space:]]*$' | sort -u > "$WORK/p" || true
cut -f1 "$TEST_FILE" | grep -v '^[[:space:]]*$' | sort -u > "$WORK/t" || true
# An empty side is "could not read", never "nothing applied": an empty list would flag (or hide) everything.
[ -s "$WORK/p" ] || { echo "check-test-drift: the prod list is empty; refusing to compare." >&2; exit 2; }
[ -s "$WORK/t" ] || { echo "check-test-drift: the TEST list is empty; refusing to compare." >&2; exit 2; }

MISSING=$(comm -23 "$WORK/p" "$WORK/t")
if [ -n "$MIG_DIR" ] && [ -n "$MISSING" ]; then
  [ -d "$MIG_DIR" ] || { echo "check-test-drift: no migrations dir $MIG_DIR" >&2; exit 2; }
  find "$MIG_DIR" -maxdepth 1 -name '*.sql' -exec basename {} \; | sed -n 's/^\([0-9][0-9]*\)_.*/\1/p' | sort -u > "$WORK/tree"
  MISSING=$(printf '%s\n' "$MISSING" | comm -12 - "$WORK/tree")
fi
if [ -z "$MISSING" ]; then
  echo "check-test-drift: OK. Every prod migration is applied on the active TEST ($TARGET)."
  exit 0
fi
N=$(printf '%s\n' "$MISSING" | wc -l | tr -d ' ')
echo "check-test-drift: DRIFT. $N prod migration(s) are missing from the active TEST ($TARGET):" >&2
printf '%s\n' "$MISSING" | sed 's/^/  - /' >&2
echo "  Fix: ./scripts/migrate.sh   (applies to the active TEST server)" >&2
exit 1
