#!/bin/bash
# scripts/test-p1103-manifest-migration-union.sh — canary for P1103.
#
# Proves a stamp run PRESERVES an environment's already-recorded migration
# entries instead of replacing the array with whatever .sql files happen to be
# in the checkout it runs from.
#
# The bug: build_migrations_json() enumerates "$MIGRATIONS_DIR"/*.sql, and the
# merge did `env['migrations'] = json.loads(migrations_json)` — a whole-array
# assignment. A migration authored and applied from a WORKTREE has no file in
# the main checkout, so every migrate.sh run from main deleted its entry, and
# migrate.sh auto-stages the result. Observed 2026-08-18 and twice before
# (decisions.md 2026-08-11: "Both were caught, neither by a gate").
#
# The union direction is the safe one — an applied migration never becomes
# un-applied — but it has a cost this canary also pins down: a genuinely stale
# entry now survives. It must therefore be REPORTED, not silently kept, or the
# fix would mask the drift that check-deploy-manifest.sh exists to surface.
#
# Hermetic: throwaway project dirs under mktemp holding a copy of the REAL
# stamp-deploy-manifest.sh. No network, no database, no git operations against
# the real repo. cwd is always the scratch dir, which also keeps the script's
# own "must not run from a worktree" guard from firing when this canary is run
# from inside a worktree.
#
# Gate 7 (epistemic.md): point P1103_STAMP_SRC at the pre-fix script and the
# three union assertions must FAIL (11 passed, 3 failed, exit 1) — the
# worktree-only entry is deleted, and so is the spurious one, silently:
#   git show main:scripts/stamp-deploy-manifest.sh > /tmp/prefix-stamp.sh
#   P1103_STAMP_SRC=/tmp/prefix-stamp.sh ./scripts/test-p1103-manifest-migration-union.sh
set -u

REPO_ROOT="$(git rev-parse --show-toplevel)"
REAL_STAMP="${P1103_STAMP_SRC:-$REPO_ROOT/scripts/stamp-deploy-manifest.sh}"
PASS=0
FAIL=0

TMPROOT=$(mktemp -d)
cleanup() { rm -rf "$TMPROOT"; }
trap cleanup EXIT

ok()  { echo "  OK   $1"; PASS=$((PASS+1)); }
bad() { echo "  FAIL $1"; FAIL=$((FAIL+1)); }

# build_project <name> <json-manifest> <migration-version>...
# Creates a scratch project dir with the real stamp script, the given manifest,
# and one .sql file per version named. Echoes the dir.
build_project() {
  local name="$1" manifest="$2"; shift 2
  local pdir="$TMPROOT/$name"
  mkdir -p "$pdir/scripts" "$pdir/supabase/migrations" "$pdir/supabase/functions"
  cp "$REAL_STAMP" "$pdir/scripts/stamp-deploy-manifest.sh"
  chmod +x "$pdir/scripts/stamp-deploy-manifest.sh"
  printf '%s' "$manifest" > "$pdir/supabase/deploy-manifest.json"
  local v
  for v in "$@"; do
    printf -- '-- canary\n' > "$pdir/supabase/migrations/${v}_canary.sql"
  done
  # No git repo on purpose: the dirty-manifest guard treats a non-repo as clean,
  # which isolates the merge behaviour this canary is about.
  echo "$pdir"
}

# stamp <label> <pdir> [args...] — runs the stamp script, writes stdout+stderr to
# $pdir/out.log, and ASSERTS exit 0 with no shell/python error in the output.
#
# Both assertions are load-bearing, and neither was here first. An adversarial
# review found a backtick inside the double-quoted `python3 -c "..."` block: bash
# ran command substitution on it, printed `env[migrations]: command not found`,
# and the merge still produced a plausible manifest — so every scenario passed
# while the stamp was actually broken. A canary that only reads the resulting
# JSON cannot see that class of failure at all.
stamp() {
  local label="$1" pdir="$2"; shift 2
  ( cd "$pdir" && bash ./scripts/stamp-deploy-manifest.sh "$@" ) > "$pdir/out.log" 2>&1
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    bad "$label: stamp exited $rc (expected 0) — $(tail -3 "$pdir/out.log" | tr '\n' ' ')"
    return 1
  fi
  if grep -qE 'command not found|Traceback|Error:|SyntaxError|IndentationError' "$pdir/out.log"; then
    bad "$label: stamp exited 0 but its output carries an error — $(grep -m2 -E 'command not found|Traceback|Error:|SyntaxError|IndentationError' "$pdir/out.log" | tr '\n' ' ')"
    return 1
  fi
  ok "$label: stamp ran clean (exit 0, no error text)"
  return 0
}

# migrations_of <pdir> <env> -> space-separated versions in the manifest
migrations_of() {
  python3 -c "
import json,sys
d=json.load(open(sys.argv[1]))
print(' '.join(d.get(sys.argv[2],{}).get('migrations',[])))
" "$1/supabase/deploy-manifest.json" "$2"
}

BASE='{
  "test": { "migrations": ["20260101000000"], "migrations_deployed_at": "2020-01-01T00:00:00Z" },
  "prod": { "migrations": ["20260101000000"], "migrations_deployed_at": "2020-01-01T00:00:00Z" }
}'

echo "=== P1103 canary: a stamp run must union, never replace, the migrations array ==="
echo "    stamp script under test: $REAL_STAMP"
echo ""

# --- 1. THE DEFECT: a worktree-authored entry must survive -------------------
# test already records 20260818090000 (applied from worktree w4 on 2026-08-18).
# This checkout has only 20260101000000 and a new 20260901000000. The worktree
# entry has no .sql file here, and pre-fix it was silently deleted.
echo "1. worktree-only entry survives a stamp from another checkout"
MANIFEST_WITH_WORKTREE_ENTRY='{
  "test": { "migrations": ["20260101000000", "20260818090000"], "migrations_deployed_at": "2020-01-01T00:00:00Z" },
  "prod": { "migrations": [], "migrations_deployed_at": "2020-01-01T00:00:00Z" }
}'
PDIR="$(build_project worktree_entry "$MANIFEST_WITH_WORKTREE_ENTRY" 20260101000000 20260901000000)"
stamp "1: worktree entry" "$PDIR" --env test --migrations-only
GOT="$(migrations_of "$PDIR" test)"
case " $GOT " in
  *" 20260818090000 "*) ok "worktree-only entry 20260818090000 preserved (array: $GOT)" ;;
  *) bad "worktree-only entry 20260818090000 was DELETED (array: $GOT)" ;;
esac

# --- 2. and the run still adds what it just applied --------------------------
echo "2. the newly applied migration is still recorded"
case " $GOT " in
  *" 20260901000000 "*) ok "newly enumerated 20260901000000 added" ;;
  *) bad "newly enumerated 20260901000000 missing (array: $GOT)" ;;
esac

# --- 3. the OTHER environment is untouched -----------------------------------
echo "3. stamping test does not touch prod"
GOT_PROD="$(migrations_of "$PDIR" prod)"
if [ -z "$GOT_PROD" ]; then
  ok "prod migrations array unchanged (still empty)"
else
  bad "prod array changed to: $GOT_PROD"
fi

# --- 4. IDEMPOTENCE: a second identical run produces no diff -----------------
# A union implemented as plain concatenation passes scenario 1 and fails here,
# growing the array without bound on every run.
echo "4. two identical runs in a row produce no manifest diff"
PDIR2="$(build_project idempotent "$BASE" 20260101000000 20260901000000)"
stamp "4a: first run" "$PDIR2" --env test --migrations-only
FIRST="$(migrations_of "$PDIR2" test)"
stamp "4b: second run" "$PDIR2" --env test --migrations-only
SECOND="$(migrations_of "$PDIR2" test)"
if [ "$FIRST" = "$SECOND" ]; then
  ok "second run is a no-op (array: $SECOND)"
else
  bad "second run changed the array: '$FIRST' then '$SECOND'"
fi

# --- 5. A SPURIOUS entry is PRESERVED, and REPORTED --------------------------
# This is the risk the union creates: an entry that no file anywhere backs is
# now kept forever. The spec accepts that trade (removal becomes manual) on the
# condition that the tool says so on stdout rather than keeping it silently —
# otherwise the fix masks exactly the drift check-deploy-manifest.sh reports.
echo "5. an entry with no file here is preserved AND announced"
MANIFEST_WITH_SPURIOUS='{
  "test": { "migrations": ["20260101000000", "20991231235959"], "migrations_deployed_at": "2020-01-01T00:00:00Z" },
  "prod": { "migrations": [], "migrations_deployed_at": "2020-01-01T00:00:00Z" }
}'
PDIR3="$(build_project spurious "$MANIFEST_WITH_SPURIOUS" 20260101000000)"
stamp "5: spurious entry" "$PDIR3" --env test --migrations-only
GOT3="$(migrations_of "$PDIR3" test)"
case " $GOT3 " in
  *" 20991231235959 "*) ok "spurious entry preserved rather than silently dropped" ;;
  *) bad "spurious entry was deleted (array: $GOT3)" ;;
esac
if grep -q '20991231235959' "$PDIR3/out.log"; then
  ok "spurious entry named in the run output (drift stays visible)"
else
  bad "spurious entry kept SILENTLY — nothing in the output names it; log: $(cat "$PDIR3/out.log")"
fi

# --- 6. duplicate versions are not deduped -----------------------------------
# decisions.md 2026-08-25: two migration files sharing a 14-digit prefix
# legitimately produce two entries, and a sorted(set(...)) here is a documented
# known error. The union must not quietly become a dedupe.
echo "6. a legitimately duplicated version keeps both entries"
PDIR4="$(build_project duplicates "$BASE" 20260101000000)"
printf -- '-- second file, same version prefix\n' \
  > "$PDIR4/supabase/migrations/20260101000000_second_half.sql"
stamp "6: duplicate versions" "$PDIR4" --env test --migrations-only
GOT4="$(migrations_of "$PDIR4" test)"
N=$(printf '%s\n' $GOT4 | grep -c '^20260101000000$')
if [ "$N" -eq 2 ]; then
  ok "both halves of the shared version prefix recorded (array: $GOT4)"
else
  bad "expected 2 entries for 20260101000000, got $N (array: $GOT4)"
fi

# --- 7. --functions-only must not touch the migrations array -----------------
echo "7. --functions-only leaves the migrations array alone"
PDIR5="$(build_project functions_only "$MANIFEST_WITH_WORKTREE_ENTRY" 20260101000000)"
stamp "7: functions-only" "$PDIR5" --env test --functions-only
GOT5="$(migrations_of "$PDIR5" test)"
if [ "$GOT5" = "20260101000000 20260818090000" ]; then
  ok "migrations array untouched by a functions-only stamp"
else
  bad "functions-only stamp changed the migrations array to: $GOT5"
fi

echo ""
echo "=== $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
