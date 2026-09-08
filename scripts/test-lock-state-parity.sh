#!/bin/bash
# test-lock-state-parity.sh — P1268
#
# `scripts/pre-flight.sh` carries a deliberate standalone copy of git-ops.sh's
# lock classification (it runs from a scratch copy in test-preflight.sh and so
# cannot source a shared lib). Duplication without a check is drift with a delay:
# before P1268 the two had already diverged silently — pre-flight's load_lockfile
# did not parse HEARTBEAT at all, so any heartbeat rule added to one would have
# been invisible in the other.
#
# This asserts the two implementations return the SAME verdict for the same
# lockfile, across a matrix that includes every state and both fail-closed edges.
#
# Exit 0: all fixtures agree and match the expected verdict.
# Exit 1: a disagreement or a wrong verdict.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
PASS=0
FAIL=0
green='\033[0;32m'; red='\033[0;31m'; nc='\033[0m'

SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

# Harness: source each script's helpers in isolation. Both guard their main
# dispatch behind a `main "$@"`-style entrypoint, so we re-implement the read by
# extracting the functions rather than executing the scripts.
extract_fns() {
  # $1 = source script, $2 = destination
  awk '
    /^LOCK_TTL_SECONDS=/          { print; next }
    /^(iso_to_epoch|heartbeat_fresh|pid_alive|pid_start_time|load_lockfile|classify_lock_state)\(\)/ { inf=1 }
    inf { print }
    inf && /^}/                   { inf=0 }
  ' "$1" > "$2"
}

extract_fns "$REPO_ROOT/scripts/git-ops.sh"   "$SCRATCH/gitops-fns.sh"
extract_fns "$REPO_ROOT/scripts/pre-flight.sh" "$SCRATCH/preflight-fns.sh"

for f in "$SCRATCH/gitops-fns.sh" "$SCRATCH/preflight-fns.sh"; do
  for fn in iso_to_epoch heartbeat_fresh pid_alive pid_start_time load_lockfile classify_lock_state; do
    grep -q "^${fn}()" "$f" || { echo "FATAL: ${fn} not extracted from $f"; exit 1; }
  done
done

classify_with() {
  # $1 = extracted-fns file, $2 = lockfile
  bash -c '
    set -euo pipefail
    source "$1"
    load_lockfile "$2" || true
    classify_lock_state
  ' _ "$1" "$2"
}

now_iso() { date -u +%FT%TZ; }
old_iso() { echo "1990-01-01T00:00:00Z"; }

live_pid=$$
live_start="$(ps -o lstart= -p $live_pid | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/[[:space:]][[:space:]]*/ /g')"
dead_pid=99999
while kill -0 "$dead_pid" 2>/dev/null; do dead_pid=$((dead_pid - 1)); done

make_lock() {
  # $1=path $2=pid $3=start $4=heartbeat
  cat > "$1" <<LOCK
PID=$2
PID_START_TIME=$3
NONCE=deadbeef00000000
SESSION_ID=parity-test
SLOT=w1
BRANCH=feature/p1268-parity
P_NUMBER=p1268
CLAIMED_AT=$(old_iso)
HEARTBEAT=$4
LOCK
}

check() {
  local label="$1" expected="$2" lockfile="$3"
  local a b
  a="$(classify_with "$SCRATCH/gitops-fns.sh"   "$lockfile")"
  b="$(classify_with "$SCRATCH/preflight-fns.sh" "$lockfile")"
  if [[ "$a" != "$b" ]]; then
    echo -e "${red}FAIL${nc}  $label: DISAGREE — git-ops=$a pre-flight=$b"
    FAIL=$((FAIL + 1)); return
  fi
  if [[ "$a" != "$expected" ]]; then
    echo -e "${red}FAIL${nc}  $label: both said $a, expected $expected"
    FAIL=$((FAIL + 1)); return
  fi
  echo -e "${green}PASS${nc}  $label (both: $a)"
  PASS=$((PASS + 1))
}

L="$SCRATCH/.lock"

echo "--- lock-state parity matrix ---"

make_lock "$L" "$live_pid" "$live_start" "$(old_iso)"
check "live PID + matching start, stale heartbeat -> LIVE (fast path)" LIVE "$L"

make_lock "$L" "$live_pid" "Mon Jan 01 00:00:01 1990" "$(old_iso)"
check "live PID + wrong start + stale heartbeat -> STALE" STALE "$L"

make_lock "$L" "$live_pid" "Mon Jan 01 00:00:01 1990" "$(now_iso)"
check "live PID + wrong start + FRESH heartbeat -> LIVE" LIVE "$L"

make_lock "$L" "$dead_pid" "Mon Jan 01 00:00:01 1990" "$(old_iso)"
check "dead PID + stale heartbeat -> ORPHAN" ORPHAN "$L"

make_lock "$L" "$dead_pid" "Mon Jan 01 00:00:01 1990" "$(now_iso)"
check "dead PID + FRESH heartbeat -> LIVE (the P1268 case)" LIVE "$L"

# Fail-closed edges: a heartbeat that cannot be trusted must never read as fresh.
make_lock "$L" "$dead_pid" "Mon Jan 01 00:00:01 1990" ""
check "dead PID + EMPTY heartbeat -> ORPHAN (fail closed)" ORPHAN "$L"

make_lock "$L" "$dead_pid" "Mon Jan 01 00:00:01 1990" "not-a-timestamp"
check "dead PID + UNPARSEABLE heartbeat -> ORPHAN (fail closed)" ORPHAN "$L"

make_lock "$L" "$dead_pid" "Mon Jan 01 00:00:01 1990" "2099-01-01T00:00:00Z"
check "dead PID + far-FUTURE heartbeat -> ORPHAN (clock skew is not life)" ORPHAN "$L"

echo "PID=" > "$L"; echo "SLOT=w1" >> "$L"
check "empty PID -> NO_LOCK" NO_LOCK "$L"

echo
echo "passed: $PASS  failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
