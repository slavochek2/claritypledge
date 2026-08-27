#!/bin/bash
# scripts/test-p1173-manifest-stamp-concurrency.sh — canary for P1173.
#
# Proves the manifest stamp+stage sequence is safe on the SHARED main checkout,
# where several Claude Code sessions run concurrently against one working tree
# and one index (.claude/rules/git.md; decisions.md 2026-08-23, 2026-08-25).
#
# Five scenarios, each an independently-reproduced mechanism from the P1168
# adversarial review (2026-08-27):
#   1. dangling-edit absorption  — a co-tenant's uncommitted edit to the manifest
#      becomes this run's merge baseline AND gets staged under this run's name
#   2. swallowed git-add failure — a held .git/index.lock makes `git add` exit
#      128, but `2>/dev/null || true` hides it and "Staged..." still prints
#   3. lost-update race          — two concurrent stamp writers, the slower one
#      silently clobbers the faster one's write (no lock anywhere)
#   4. truncate-on-failure       — `python3 ... > "$MANIFEST"` truncates the file
#      BEFORE python runs, so a merge failure destroys the manifest outright
#   5. no false positive         — a clean run must still stamp and stage
#   6. stale lock broken         — a lock left by a dead pid must not wedge the
#      tool forever
#   7. live lock respected       — ...but a live holder's lock is never stolen
#   8. no-repo is not a failure  — the fatal staging path fires on a refused
#      write, not on the absence of a git checkout
#   9. sequential stamp allowed  — the tool's own staged output is not a
#      bystander edit, but foreign content staged is still refused
#  10. primary path guarded      — the supabase-db-push path reports an applied
#      -but-unstamped migration instead of aborting bare
#  11. pid reuse detected        — a recycled PID does not disguise a stale lock
#
# Hermetic: throwaway git repo under mktemp holding copies of the REAL
# migrate.sh and the REAL stamp-deploy-manifest.sh (the bug lives in the stamp
# script, so it must not be stubbed here — unlike test-p1168-noop-stamp.sh).
# PATH-stubs npx/curl/security so no network call and no keychain read happens.
# The repo tree and every real database are untouched.
set -u

REPO_ROOT="$(git rev-parse --show-toplevel)"
# Overridable so the pre-fix control run is reproducible: point these at the
# pre-fix scripts (e.g. `git show main:scripts/migrate.sh`) and every assertion
# below must FAIL. A canary nobody has watched fail is not a canary.
REAL_MIGRATE="${P1173_MIGRATE_SRC:-$REPO_ROOT/scripts/migrate.sh}"
REAL_STAMP="${P1173_STAMP_SRC:-$REPO_ROOT/scripts/stamp-deploy-manifest.sh}"
PASS=0
FAIL=0

TMPROOT=$(mktemp -d)
cleanup() {
  if [ -n "${P1173_KEEP_TMP:-}" ]; then echo "TMPROOT kept: $TMPROOT"; return 0; fi
  rm -rf "$TMPROOT"
}
trap cleanup EXIT

ok()   { echo "  OK   $1"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL $1"; FAIL=$((FAIL+1)); }

# --- PATH stubs (shared) ----------------------------------------------------
STUBS="$TMPROOT/stubs"
mkdir -p "$STUBS"
printf '#!/bin/bash\nexit 1\n' > "$STUBS/security"
cat > "$STUBS/npx" <<'STUB'
#!/bin/bash
echo "failed to connect: Tenant or user not found"
exit 1
STUB
cat > "$STUBS/curl" <<'STUB'
#!/bin/bash
PAYLOAD=""; QUIET=false
while [ $# -gt 0 ]; do
  case "$1" in
    -d) shift; PAYLOAD="$1" ;;
    -o) shift; [ "$1" = "/dev/null" ] && QUIET=true ;;
  esac
  shift
done
[ "$QUIET" = true ] && exit 0
if printf '%s' "$PAYLOAD" | grep -q 'SELECT version'; then
  BODY=$(cat "$FAKE_LEDGER")
else
  BODY='[]'
fi
printf '%s\n200' "$BODY"
STUB
chmod +x "$STUBS"/*

# A slow `shasum`, used only by the race scenario to widen the read->write
# window of ONE writer deterministically. build_functions_json() runs after
# stamp-deploy-manifest.sh has already read its merge baseline, so delaying it
# reproduces the real interleaving without touching the code under test.
SLOWSTUBS="$TMPROOT/slowstubs"
mkdir -p "$SLOWSTUBS"
cat > "$SLOWSTUBS/shasum" <<'STUB'
#!/bin/bash
sleep 3
exec /usr/bin/shasum "$@"
STUB
chmod +x "$SLOWSTUBS/shasum"

# --- Scenario builder -------------------------------------------------------
# Builds a throwaway repo with the real scripts. $1 = scenario dir name.
build_repo() {
  local NAME="$1"
  local PDIR="$TMPROOT/$NAME"
  mkdir -p "$PDIR/scripts" "$PDIR/supabase/migrations" "$PDIR/supabase/functions/demo-fn"
  cp "$REAL_MIGRATE" "$PDIR/scripts/migrate.sh"
  cp "$REAL_STAMP"   "$PDIR/scripts/stamp-deploy-manifest.sh"
  cp -R "$REPO_ROOT/scripts/lib" "$PDIR/scripts/lib"
  printf 'export const x = 1;\n' > "$PDIR/supabase/functions/demo-fn/index.ts"
  printf '#!/usr/bin/env node\nprocess.exit(0);\n' > "$PDIR/scripts/prod-smoke-test.mjs"
  chmod +x "$PDIR/scripts"/*.sh "$PDIR/scripts/prod-smoke-test.mjs"

  git -C "$PDIR" init -q
  git -C "$PDIR" config user.email test@test.com
  git -C "$PDIR" config user.name test
  printf '%s\n' '{
  "prod": { "migrations": [], "migrations_deployed_at": "2020-01-01T00:00:00Z" },
  "test": { "migrations": [], "migrations_deployed_at": "2020-01-01T00:00:00Z" }
}' > "$PDIR/supabase/deploy-manifest.json"
  git -C "$PDIR" add -A
  git -C "$PDIR" commit -q -m init

  # Inert fake credentials, assembled from fragments so a full
  # postgresql://user:pass@host literal never appears in this file (gitleaks
  # connection-string rule in pre-commit-checks.sh). npx is stubbed, so
  # nothing ever opens a connection with these.
  local f
  for f in .env.local .env.prod; do
    {
      printf 'SUPABASE_DB_URL=postgres'
      printf 'ql://postgres:%s@%s\n' "canary-not-a-credential" "db.invalid.example:5432/postgres"
      printf 'VITE_SUPABASE_URL=https://fakeprojectref.supabase.co\n'
      printf 'SUPABASE_ACCESS_TOKEN=%s\n' "sbp-canary-not-a-token"
    } > "$PDIR/$f"
  done
  printf '[]' > "$PDIR/ledger.json"
  echo "$PDIR"
}

# Adds one pending migration so the run actually applies something and reaches
# the stamp+stage gate P1168 added.
add_pending_migration() {
  cat > "$1/supabase/migrations/20260812090000_p1173_pending.sql" <<'SQL'
CREATE TABLE IF NOT EXISTS public.p1173_demo (id uuid PRIMARY KEY);
SQL
}

# Every invocation runs with cwd = the scenario dir, matching how these scripts
# are really called (from the project root) — and keeping `.claude/worktrees`
# out of $PWD so stamp-deploy-manifest.sh's worktree guard does not fire when
# this canary is itself run from inside a worktree.
run_migrate() {
  local PDIR="$1"; shift
  ( cd "$PDIR" && FAKE_LEDGER="$PDIR/ledger.json" PATH="$STUBS:$PATH" \
      bash "$PDIR/scripts/migrate.sh" "$@" ) > "$PDIR/out.log" 2>&1
  echo $? > "$PDIR/exit.code"
}

run_stamp() {
  local PDIR="$1"; shift
  ( cd "$PDIR" && bash "$PDIR/scripts/stamp-deploy-manifest.sh" "$@" )
}

echo "=== P1173 canary: manifest stamp+stage must be safe on the shared checkout ==="
echo ""

# --- 1. DANGLING-EDIT ABSORPTION (highest severity) -------------------------
# A co-tenant left an uncommitted edit to deploy-manifest.json on the shared
# checkout. This run must not read it as its merge baseline, and must not stage
# it under its own name.
PDIR="$(build_repo dangling_edit)"
add_pending_migration "$PDIR"
python3 - "$PDIR/supabase/deploy-manifest.json" <<'PY'
import json, sys
p = sys.argv[1]
d = json.load(open(p))
d["bystander_key"] = "co-tenant-edit-this-session-never-wrote"
json.dump(d, open(p, "w"), indent=2)
PY
run_migrate "$PDIR" --env prod --yes
STAGED=$(git -C "$PDIR" show :supabase/deploy-manifest.json 2>/dev/null || echo '')
RC=$(cat "$PDIR/exit.code")

if ! printf '%s' "$STAGED" | grep -q 'bystander_key'; then
  ok "no-bystander-absorption — a co-tenant's dangling edit is not staged by this run"
else
  bad "no-bystander-absorption — this run STAGED a co-tenant's uncommitted edit:"
  printf '%s\n' "$STAGED" | grep -n 'bystander_key' | sed 's/^/         /'
fi

if [ "$RC" -ne 0 ] || grep -qiE 'dirty|uncommitted|refus|not clean|bystander' "$PDIR/out.log"; then
  ok "dirty-baseline-surfaced — the operator is told the manifest was dirty before the stamp"
else
  bad "dirty-baseline-surfaced — run exited $RC and never mentioned the pre-existing dirty manifest"
fi

# --- 2. SWALLOWED git-add FAILURE -------------------------------------------
# A concurrent session holds .git/index.lock. `git add` exits 128. The run must
# not print a false "Staged..." success.
PDIR="$(build_repo indexlock)"
add_pending_migration "$PDIR"
touch "$PDIR/.git/index.lock"
run_migrate "$PDIR" --env prod --yes
RC=$(cat "$PDIR/exit.code")
OUT=$(cat "$PDIR/out.log")
rm -f "$PDIR/.git/index.lock"

if ! grep -q 'Staged supabase/deploy-manifest.json' <<< "$OUT"; then
  ok "no-false-staged-message — a failed git add does not print 'Staged...'"
else
  bad "no-false-staged-message — git add failed (index.lock held) yet the run reported success:"
  grep -n 'Staged supabase/deploy-manifest.json' <<< "$OUT" | sed 's/^/         /'
fi

if [ "$RC" -ne 0 ] || grep -qiE 'could not stage|failed to stage|index\.lock|git add failed' <<< "$OUT"; then
  ok "add-failure-surfaced — lock contention is reported to the operator, not swallowed"
else
  bad "add-failure-surfaced — expected non-zero exit or an explicit staging-failure message, got exit $RC"
fi

# --- 3. LOST-UPDATE RACE ----------------------------------------------------
# Two concurrent stamp writers against one manifest. Writer A (slow shasum)
# reads its baseline first and writes last; writer B lands entirely inside A's
# read->write window. Both stamps must survive.
#
# Both writers pass --allow-dirty on purpose: that opts past scenario 1's
# dirty-baseline refusal so this scenario isolates the LOCK. Without it the
# second writer would simply be refused (safe, but it would prove the dirty
# gate again instead of proving mutual exclusion). Pre-fix the flag is unknown
# to the arg parser and silently ignored, so the lost update still reproduces.
PDIR="$(build_repo race)"
(
  cd "$PDIR" && PATH="$SLOWSTUBS:$PATH" bash "$PDIR/scripts/stamp-deploy-manifest.sh" \
    --env prod --migrations-only --allow-dirty
) > "$PDIR/writerA.log" 2>&1 &
A_PID=$!
sleep 1
run_stamp "$PDIR" --env test --migrations-only --allow-dirty > "$PDIR/writerB.log" 2>&1
B_RC=$?
wait "$A_PID"; A_RC=$?

PROD_AT=$(python3 -c "import json;print(json.load(open('$PDIR/supabase/deploy-manifest.json'))['prod']['migrations_deployed_at'])" 2>/dev/null || echo PARSE_ERROR)
TEST_AT=$(python3 -c "import json;print(json.load(open('$PDIR/supabase/deploy-manifest.json'))['test']['migrations_deployed_at'])" 2>/dev/null || echo PARSE_ERROR)

if [ "$PROD_AT" != "2020-01-01T00:00:00Z" ] && [ "$PROD_AT" != "PARSE_ERROR" ] \
   && [ "$TEST_AT" != "2020-01-01T00:00:00Z" ] && [ "$TEST_AT" != "PARSE_ERROR" ]; then
  ok "no-lost-update — both concurrent stamps survive (prod=$PROD_AT test=$TEST_AT)"
elif [ "$A_RC" -ne 0 ] || [ "$B_RC" -ne 0 ]; then
  ok "no-lost-update — one writer refused rather than clobbering (A=$A_RC B=$B_RC)"
else
  bad "no-lost-update — a concurrent stamp was silently clobbered (prod=$PROD_AT test=$TEST_AT, both writers exited 0)"
fi

# --- 4. TRUNCATE-ON-FAILURE -------------------------------------------------
# `python3 ... > "$MANIFEST"` truncates before python runs. A merge failure
# (here: a manifest already corrupted by a partial concurrent write) must not
# destroy the file on disk. --allow-dirty for the same reason as scenario 3:
# reach the merge itself rather than stopping at the dirty gate.
PDIR="$(build_repo truncate)"
printf '{"prod": {"migrations": [], "migr' > "$PDIR/supabase/deploy-manifest.json"
run_stamp "$PDIR" --env prod --migrations-only --allow-dirty > "$PDIR/stamp.log" 2>&1
SIZE=$(wc -c < "$PDIR/supabase/deploy-manifest.json" | tr -d ' ')

if [ "$SIZE" -gt 0 ]; then
  ok "no-truncate-on-failure — a failed merge leaves the manifest intact ($SIZE bytes)"
else
  bad "no-truncate-on-failure — a failed merge destroyed the manifest (0 bytes on disk)"
fi

# --- 5. NO FALSE POSITIVE ---------------------------------------------------
# A clean run with a genuinely pending migration must still stamp AND stage.
PDIR="$(build_repo clean_run)"
add_pending_migration "$PDIR"
run_migrate "$PDIR" --env prod --yes
RC=$(cat "$PDIR/exit.code")
OUT=$(cat "$PDIR/out.log")
STATUS=$(git -C "$PDIR" status --short)

if [ "$RC" -eq 0 ] && grep -q 'Applied 1 new migration' <<< "$OUT"; then
  ok "clean-run-applies — a genuinely pending migration is still applied"
else
  bad "clean-run-applies — expected exit 0 + 'Applied 1 new migration(s)', got exit $RC"
fi

if printf '%s' "$STATUS" | grep -q '^M  supabase/deploy-manifest.json$'; then
  ok "clean-run-stages — manifest edit is staged (M , index only) on a clean run"
else
  bad "clean-run-stages — expected 'M  supabase/deploy-manifest.json' in git status, got:"
  printf '%s\n' "$STATUS" | sed 's/^/         /'
fi

if python3 -c "
import json,sys
d=json.load(open('$PDIR/supabase/deploy-manifest.json'))
sys.exit(0 if d['prod']['migrations_deployed_at']!='2020-01-01T00:00:00Z' else 1)
" 2>/dev/null; then
  ok "clean-run-stamps — migrations_deployed_at was rewritten"
else
  bad "clean-run-stamps — expected migrations_deployed_at to change"
fi

# --- 6. STALE LOCK IS BROKEN ------------------------------------------------
# A run killed mid-stamp leaves .deploy-manifest.lock behind. The next stamp
# must break it (holder PID is gone) rather than wedge every future deploy.
PDIR="$(build_repo stale_lock)"
sleep 0.1 &
DEAD_PID=$!
wait "$DEAD_PID" 2>/dev/null
printf 'PID=%s\nSTARTED=2020-01-01T00:00:00Z\n' "$DEAD_PID" \
  > "$PDIR/supabase/.deploy-manifest.lock"
STAMP_MANIFEST_LOCK_TIMEOUT=10 run_stamp "$PDIR" --env prod --migrations-only \
  > "$PDIR/stale.log" 2>&1
STALE_RC=$?

if [ "$STALE_RC" -eq 0 ] && grep -q 'breaking stale lock' "$PDIR/stale.log"; then
  ok "stale-lock-broken — a lock left by a dead pid is broken, not waited out"
else
  bad "stale-lock-broken — expected exit 0 and a 'breaking stale lock' notice, got exit $STALE_RC:"
  sed 's/^/         /' "$PDIR/stale.log"
fi

# --- 7. LIVE LOCK IS NEVER BROKEN -------------------------------------------
# The other half of scenario 6: a lock whose holder is still running must make
# this run wait and then fail, never steal the lock. A stale-lock breaker that
# cannot tell the two apart is worse than no breaker at all.
PDIR="$(build_repo live_lock)"
sleep 30 &
LIVE_PID=$!
printf 'PID=%s\nSTARTED=2020-01-01T00:00:00Z\n' "$LIVE_PID" \
  > "$PDIR/supabase/.deploy-manifest.lock"
STAMP_MANIFEST_LOCK_TIMEOUT=3 run_stamp "$PDIR" --env prod --migrations-only \
  > "$PDIR/live.log" 2>&1
LIVE_RC=$?
LOCK_STILL_THERE=$([ -f "$PDIR/supabase/.deploy-manifest.lock" ] && echo yes || echo no)
kill "$LIVE_PID" 2>/dev/null
wait "$LIVE_PID" 2>/dev/null

if [ "$LIVE_RC" -ne 0 ] && [ "$LOCK_STILL_THERE" = yes ] \
   && ! grep -q 'breaking stale lock' "$PDIR/live.log"; then
  ok "live-lock-respected — a live holder's lock is waited on, then reported, never stolen"
else
  bad "live-lock-respected — expected non-zero exit with the lock intact; got exit $LIVE_RC, lock present: $LOCK_STILL_THERE"
  sed 's/^/         /' "$PDIR/live.log"
fi

# --- 8. NO REPO IS NOT A STAGING FAILURE ------------------------------------
# The fatal path in scenario 2 must fire on a REFUSED write, not merely on a
# non-zero `git add`. Outside a git checkout there is no index to stage into and
# nothing has gone wrong, so the run must stay green. Without this distinction
# migrate.sh fails every non-repo invocation (caught by the P1042 canary).
PDIR="$(build_repo no_repo)"
rm -rf "$PDIR/.git"
add_pending_migration "$PDIR"
run_migrate "$PDIR" --env prod --yes
NOREPO_RC=$(cat "$PDIR/exit.code")
NOREPO_OUT=$(cat "$PDIR/out.log")

if [ "$NOREPO_RC" -eq 0 ] && ! grep -q 'COULD NOT BE STAGED' <<< "$NOREPO_OUT"; then
  ok "no-repo-is-not-a-failure — a non-git checkout stamps cleanly instead of failing the run"
else
  bad "no-repo-is-not-a-failure — expected exit 0 without a staging-failure banner, got exit $NOREPO_RC"
fi

# --- 9. THE TOOL'S OWN STAGED STAMP IS NOT A BYSTANDER EDIT ------------------
# migrate.sh stamps AND stages, then expects a later commit. So the manifest is
# routinely dirty-and-staged when the next run starts. A blanket "differs from
# HEAD" refusal breaks that documented two-step workflow: running migrate.sh
# twice before committing hard-fails. Only non-stamp content may be refused.
PDIR="$(build_repo sequential_stamp)"
run_stamp "$PDIR" --env test --migrations-only > "$PDIR/seq1.log" 2>&1
SEQ1_RC=$?
git -C "$PDIR" add supabase/deploy-manifest.json
run_stamp "$PDIR" --env test --migrations-only > "$PDIR/seq2.log" 2>&1
SEQ2_RC=$?

if [ "$SEQ1_RC" -eq 0 ] && [ "$SEQ2_RC" -eq 0 ]; then
  ok "sequential-stamp-allowed — a staged, uncommitted prior stamp does not block the next run"
else
  bad "sequential-stamp-allowed — second stamp over this tool's own staged output failed (run1=$SEQ1_RC run2=$SEQ2_RC):"
  sed 's/^/         /' "$PDIR/seq2.log"
fi

# ...and the refusal must still fire for content a stamp could not have written,
# even when the manifest is staged rather than merely modified.
PDIR="$(build_repo staged_bystander)"
python3 - "$PDIR/supabase/deploy-manifest.json" <<'PY2'
import json, sys
d = json.load(open(sys.argv[1])); d["bystander_key"] = "not-stamp-shaped"
json.dump(d, open(sys.argv[1], "w"), indent=2)
PY2
git -C "$PDIR" add supabase/deploy-manifest.json
run_stamp "$PDIR" --env test --migrations-only > "$PDIR/staged.log" 2>&1
STAGED_RC=$?

if [ "$STAGED_RC" -ne 0 ] && grep -q 'refusing to stamp' "$PDIR/staged.log"; then
  ok "staged-bystander-still-refused — staging foreign content does not launder it past the gate"
else
  bad "staged-bystander-still-refused — expected a refusal, got exit $STAGED_RC"
fi

# --- 10. PRIMARY (supabase db push) PATH IS GUARDED TOO ---------------------
# The CLI-success path has its own stamp call. Under bare `set -e` a refusal
# there aborts with no sign the push already succeeded — the operator reads it
# as a failed migration and may re-run it.
PDIR="$(build_repo primary_path)"
add_pending_migration "$PDIR"
python3 - "$PDIR/supabase/deploy-manifest.json" <<'PY2'
import json, sys
d = json.load(open(sys.argv[1])); d["bystander_key"] = "blocks-the-stamp"
json.dump(d, open(sys.argv[1], "w"), indent=2)
PY2
# npx succeeds here, so migrate.sh takes the primary path instead of the fallback.
OKSTUBS="$TMPROOT/okstubs"
mkdir -p "$OKSTUBS"
cp "$STUBS/security" "$OKSTUBS/security"
cp "$STUBS/curl" "$OKSTUBS/curl"
printf '#!/bin/bash\necho "Applying migration..."\nexit 0\n' > "$OKSTUBS/npx"
chmod +x "$OKSTUBS"/*
( cd "$PDIR" && FAKE_LEDGER="$PDIR/ledger.json" PATH="$OKSTUBS:$PATH" \
    bash "$PDIR/scripts/migrate.sh" ) > "$PDIR/out.log" 2>&1
PRIMARY_RC=$?
PRIMARY_OUT=$(cat "$PDIR/out.log")

if [ "$PRIMARY_RC" -ne 0 ] && grep -q 'MIGRATIONS APPLIED, BUT THE MANIFEST WAS NOT STAMPED' <<< "$PRIMARY_OUT" \
   && grep -q 'SUCCEEDED' <<< "$PRIMARY_OUT"; then
  ok "primary-path-guarded — a stamp refusal on the CLI path says the push succeeded, not just 'failed'"
else
  bad "primary-path-guarded — expected non-zero exit plus the applied-but-not-stamped banner, got exit $PRIMARY_RC:"
  printf '%s\n' "$PRIMARY_OUT" | tail -6 | sed 's/^/         /'
fi

# --- 11. PID REUSE DOES NOT DISGUISE A STALE LOCK ---------------------------
# A recycled PID makes `kill -0` succeed for a holder that is long gone. Without
# the recorded start time the lock reads as live and wedges until timeout.
PDIR="$(build_repo pid_reuse)"
printf 'PID=%s\nPID_START_TIME=%s\nSTARTED=2020-01-01T00:00:00Z\n' \
  "$$" "Thu Jan  1 00:00:00 2020" > "$PDIR/supabase/.deploy-manifest.lock"
STAMP_MANIFEST_LOCK_TIMEOUT=10 run_stamp "$PDIR" --env prod --migrations-only \
  > "$PDIR/reuse.log" 2>&1
REUSE_RC=$?

if [ "$REUSE_RC" -eq 0 ] && grep -q 'breaking stale lock' "$PDIR/reuse.log"; then
  ok "pid-reuse-detected — a live PID with a mismatched start time is treated as stale"
else
  bad "pid-reuse-detected — expected the lock to be broken, got exit $REUSE_RC:"
  sed 's/^/         /' "$PDIR/reuse.log"
fi

echo ""
echo "Passed: $PASS  Failed: $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
