#!/bin/bash
# scripts/stamp-deploy-manifest.sh — Update deploy manifest with current state
#
# Called by deploy-functions.sh and migrate.sh after successful deploys.
# Can also be run standalone to snapshot current state.
#
# Usage:
#   ./scripts/stamp-deploy-manifest.sh                          # stamp both (test)
#   ./scripts/stamp-deploy-manifest.sh --env prod               # stamp both (prod)
#   ./scripts/stamp-deploy-manifest.sh --env prod --functions-only
#   ./scripts/stamp-deploy-manifest.sh --env prod --migrations-only
#   ./scripts/stamp-deploy-manifest.sh --allow-dirty            # stamp on top of
#       an uncommitted manifest on purpose (P1173). Without it the script refuses
#       a working tree that differs from HEAD, because it cannot tell your edit
#       from a co-tenant session's on the shared main checkout.
#
# Serializes against other stamp writers via supabase/.deploy-manifest.lock;
# override the 60s wait with STAMP_MANIFEST_LOCK_TIMEOUT.

set -e

# Guard: must run from main repo root, not from inside a worktree
if [[ "$PWD" == *".claude/worktrees"* ]]; then
  echo "ERROR: stamp-deploy-manifest.sh must run from the main repo root, not from a worktree."
  echo "Run: cd ~/Projects/public/claritypledge && ./scripts/stamp-deploy-manifest.sh $*"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MANIFEST="$PROJECT_DIR/supabase/deploy-manifest.json"
FUNCTIONS_DIR="$PROJECT_DIR/supabase/functions"
MIGRATIONS_DIR="$PROJECT_DIR/supabase/migrations"

# --- Parse args ---
ENV_NAME="local"
FUNCTIONS_ONLY=false
MIGRATIONS_ONLY=false
ALLOW_DIRTY=false
prev_arg=""
for arg in "$@"; do
  if [ "$arg" = "--env" ]; then
    :
  elif [ "$prev_arg" = "--env" ]; then
    ENV_NAME="$arg"
  elif [[ "$arg" == --env=* ]]; then
    ENV_NAME="${arg#--env=}"
  elif [ "$arg" = "--functions-only" ]; then
    FUNCTIONS_ONLY=true
  elif [ "$arg" = "--migrations-only" ]; then
    MIGRATIONS_ONLY=true
  elif [ "$arg" = "--allow-dirty" ]; then
    ALLOW_DIRTY=true
  fi
  prev_arg="$arg"
done

ENV_KEY="$ENV_NAME"
[ "$ENV_KEY" = "local" ] && ENV_KEY="test"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# --- P1173: serialize writers -----------------------------------------------
# Every writer of deploy-manifest.json comes through this script (migrate.sh,
# deploy-functions.sh, standalone runs), and several Claude Code sessions share
# one main checkout. Without mutual exclusion two read-merge-write sequences
# interleave and the slower writer silently clobbers the faster one's stamp.
# Same atomic hard-link primitive git-ops.sh uses for main.lock — `ln` fails if
# the target exists, and flock is not available on a stock macOS.
LOCKFILE="$PROJECT_DIR/supabase/.deploy-manifest.lock"
LOCK_TIMEOUT="${STAMP_MANIFEST_LOCK_TIMEOUT:-60}"
LOCK_HELD=false
TMP_LOCK=""
TMP_OUT=""

cleanup() {
  [ "$LOCK_HELD" = true ] && rm -f "$LOCKFILE"
  [ -n "$TMP_LOCK" ] && rm -f "$TMP_LOCK"
  rm -f "$LOCKFILE.stale.$$"
  # An unrenamed TMP_OUT means the merge died before the atomic swap; the real
  # manifest is untouched, so dropping the partial file is the whole recovery.
  [ -n "$TMP_OUT" ] && rm -f "$TMP_OUT"
  return 0
}
trap cleanup EXIT

# Process start time, used to tell a live holder from an unrelated process that
# happens to have inherited the holder's recycled PID. Same signal git-ops.sh
# uses in classify_lock_state.
pid_start_time() {
  ps -o lstart= -p "$1" 2>/dev/null | tr -s ' ' | sed 's/^ *//; s/ *$//'
}

# Live iff the PID exists AND (when recorded) its start time still matches.
lock_holder_is_live() {
  local pid="$1" recorded="$2" now
  kill -0 "$pid" 2>/dev/null || return 1
  [ -n "$recorded" ] || return 0
  now="$(pid_start_time "$pid")"
  [ "$now" = "$recorded" ]
}

acquire_lock() {
  local waited=0 holder holder_start stale_tmp moved_pid moved_start
  TMP_LOCK="$(mktemp "$PROJECT_DIR/supabase/.deploy-manifest.lock.XXXXXX")" || return 1
  [ -n "$TMP_LOCK" ] || return 1
  printf 'PID=%s\nPID_START_TIME=%s\nSTARTED=%s\n' \
    "$$" "$(pid_start_time "$$")" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$TMP_LOCK"
  while [ "$waited" -lt "$LOCK_TIMEOUT" ]; do
    if ln "$TMP_LOCK" "$LOCKFILE" 2>/dev/null; then
      rm -f "$TMP_LOCK"; TMP_LOCK=""; LOCK_HELD=true; return 0
    fi
    # Break a lock whose holder is gone (a crashed or killed run), never a live
    # one — a wedged lock would otherwise make every later deploy unstampable.
    holder=$(sed -n 's/^PID=//p' "$LOCKFILE" 2>/dev/null || true)
    holder_start=$(sed -n 's/^PID_START_TIME=//p' "$LOCKFILE" 2>/dev/null || true)
    if [ -n "$holder" ] && ! lock_holder_is_live "$holder" "$holder_start"; then
      # Claim the stale file by RENAME before deleting it. rename(2) is atomic,
      # so when several waiters spot the same stale lock only one can win the
      # move; the losers see it already gone and loop. Deleting $LOCKFILE
      # directly here would let a loser delete the *new* lock that the winner
      # had meanwhile acquired.
      stale_tmp="$LOCKFILE.stale.$$"
      if mv "$LOCKFILE" "$stale_tmp" 2>/dev/null; then
        moved_pid=$(sed -n 's/^PID=//p' "$stale_tmp" 2>/dev/null || true)
        moved_start=$(sed -n 's/^PID_START_TIME=//p' "$stale_tmp" 2>/dev/null || true)
        if [ "$moved_pid" = "$holder" ] && ! lock_holder_is_live "$moved_pid" "$moved_start"; then
          echo "stamp-deploy-manifest: breaking stale lock left by dead pid $holder" >&2
          rm -f "$stale_tmp"
        else
          # Not the file we inspected — put it back if the slot is still free.
          ln "$stale_tmp" "$LOCKFILE" 2>/dev/null || true
          rm -f "$stale_tmp"
        fi
      fi
    else
      sleep 1
    fi
    waited=$((waited + 1))
  done
  echo "ERROR: could not acquire $LOCKFILE after ${LOCK_TIMEOUT}s." >&2
  echo "  Holder: $(tr '\n' ' ' < "$LOCKFILE" 2>/dev/null)" >&2
  echo "  Another deploy or migrate is stamping the manifest. Wait for it, or" >&2
  echo "  raise STAMP_MANIFEST_LOCK_TIMEOUT." >&2
  return 1
}

acquire_lock || exit 1

# --- P1173: refuse a merge baseline this run cannot vouch for ----------------
# The on-disk manifest is this script's merge baseline, and migrate.sh stages
# the whole file afterwards. If it already differs from HEAD, that difference
# was written by somebody else — a co-tenant session on the shared checkout, or
# a leftover from an aborted run — and merging it in silently attributes their
# edit to this run's commit (decisions.md 2026-08-23, 2026-08-25).
# --allow-dirty is for a deliberate sequence that stamps twice before
# committing (e.g. functions then migrations); it is never passed by migrate.sh.
if [ "$ALLOW_DIRTY" != true ] && git -C "$PROJECT_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  if ! git -C "$PROJECT_DIR" diff --quiet HEAD -- supabase/deploy-manifest.json 2>/dev/null; then
    HEAD_JSON="$(git -C "$PROJECT_DIR" show HEAD:supabase/deploy-manifest.json 2>/dev/null || echo '{}')"
    # Shape test, not a blanket "differs from HEAD". A staged-but-uncommitted
    # stamp is the state migrate.sh itself creates on purpose (it stages and
    # expects a later commit), so refusing every dirty manifest breaks running
    # migrate.sh twice before committing. Refuse what this tool could not have
    # written — a hand edit, foreign content, unparsable JSON — and let genuine
    # stamp output through, which the merge below preserves rather than drops.
    if python3 -c "
import json, sys
STAMP_KEYS = {'functions', 'functions_deployed_at', 'migrations', 'migrations_deployed_at'}
try:
    head = json.loads(sys.argv[1])
    disk = json.loads(open(sys.argv[2]).read())
except Exception:
    sys.exit(1)
if not isinstance(head, dict) or not isinstance(disk, dict):
    sys.exit(1)
for env in set(head) | set(disk):
    h, d = head.get(env, {}), disk.get(env, {})
    if not isinstance(h, dict) or not isinstance(d, dict):
        sys.exit(1)
    for k in set(h) | set(d):
        if h.get(k) != d.get(k) and k not in STAMP_KEYS:
            sys.exit(1)
sys.exit(0)
" "$HEAD_JSON" "$MANIFEST"; then
      echo "Note: manifest already carries uncommitted stamp changes; merging on top of them." >&2
    else
      echo "ERROR: supabase/deploy-manifest.json carries uncommitted changes this tool did not write — refusing to stamp." >&2
      echo "" >&2
      echo "  The working-tree manifest differs from HEAD outside the fields a stamp" >&2
      echo "  writes (or is not valid JSON). Merging it in would fold somebody else's" >&2
      echo "  edit into the manifest and stage it under this run's name." >&2
      echo "" >&2
      git -C "$PROJECT_DIR" --no-pager diff HEAD -- supabase/deploy-manifest.json >&2 || true
      echo "" >&2
      echo "  Resolve first, then re-run:" >&2
      echo "    - if the edit is yours and correct: commit it" >&2
      echo "        ./scripts/git-ops.sh commit-to-main --message 'chore: stamp deploy manifest' \\" >&2
      echo "          --files supabase/deploy-manifest.json" >&2
      echo "    - if it belongs to another session: leave it alone and let that session commit it" >&2
      echo "    - to stamp on top of it deliberately: re-run with --allow-dirty" >&2
      exit 1
    fi
  fi
fi

# --- Read existing manifest or create empty ---
if [ -f "$MANIFEST" ]; then
  EXISTING=$(cat "$MANIFEST")
else
  EXISTING='{}'
fi

# --- Build functions section ---
build_functions_json() {
  local result="{"
  local first=true
  for dir in "$FUNCTIONS_DIR"/*/; do
    [ -d "$dir" ] || continue
    local fn_name
    fn_name=$(basename "$dir")
    local main_file="$dir/index.ts"
    local hash=""
    if [ -f "$main_file" ]; then
      hash=$(shasum -a 256 "$main_file" | cut -d' ' -f1)
    fi
    if [ "$first" = true ]; then first=false; else result+=","; fi
    result+="\"$fn_name\":\"$hash\""
  done
  result+="}"
  echo "$result"
}

# --- Build migrations section ---
build_migrations_json() {
  local result="["
  local first=true
  for f in "$MIGRATIONS_DIR"/*.sql; do
    [ -f "$f" ] || continue
    local bn
    bn=$(basename "$f")
    # Skip non-versioned files
    echo "$bn" | grep -qE '^[0-9]' || continue
    local version
    version=$(echo "$bn" | sed -E 's/^([0-9]+)[_.]?.*/\1/')
    if [ "$first" = true ]; then first=false; else result+=","; fi
    result+="\"$version\""
  done
  result+="]"
  echo "$result"
}

# --- Merge into manifest (atomic: build beside the target, then rename) ---
TMP_OUT="$(mktemp "$MANIFEST.XXXXXX")"
python3 -c "
import json, sys

existing = json.loads(sys.argv[1])
env_key = sys.argv[2]
now = sys.argv[3]
functions_only = sys.argv[4] == 'true'
migrations_only = sys.argv[5] == 'true'
functions_json = sys.argv[6]
migrations_json = sys.argv[7]

env = existing.get(env_key, {})

if not migrations_only:
    env['functions'] = json.loads(functions_json)
    env['functions_deployed_at'] = now

if not functions_only:
    # NO DEDUPE, DELIBERATELY. The list tracks by BARE VERSION, so two migration files
    # sharing a 14-digit prefix legitimately produce two entries — that is both halves
    # reported as applied, not one stamped twice. Three such pairs are grandfathered in
    # supabase/migrations/.duplicate-version-allowlist, which explains why renumbering them
    # would be the more dangerous option.
    #
    # Deduping here is a KNOWN ERROR with a written record: decisions.md 2026-08-25 documents
    # a first pass that deduped exactly this and thereby silently under-reported that both
    # had actually been applied, caught only by diffing against main own copy. Its Decision
    # is to check ls supabase/migrations/ | grep '^<timestamp>' before treating a repeat as
    # a bug. I added a sorted(set(...)) here on 2026-09-04 without running that check, which
    # would have made the documented error permanent and automatic. Reverted the same day.
    env['migrations'] = json.loads(migrations_json)
    env['migrations_deployed_at'] = now

existing[env_key] = env

print(json.dumps(existing, indent=2))
" "$EXISTING" "$ENV_KEY" "$NOW" "$FUNCTIONS_ONLY" "$MIGRATIONS_ONLY" \
  "$(build_functions_json)" "$(build_migrations_json)" > "$TMP_OUT"

# P1173: rename, never redirect. `python3 ... > "$MANIFEST"` truncated the file
# to zero bytes BEFORE python ran, so any merge failure (malformed JSON on disk,
# a partial write from a concurrent stamp) destroyed the manifest outright.
# rename(2) is atomic, so a reader sees either the old file or the new one.
chmod 644 "$TMP_OUT"
mv "$TMP_OUT" "$MANIFEST"
TMP_OUT=""
