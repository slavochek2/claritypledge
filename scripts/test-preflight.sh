#!/bin/bash
# test-preflight.sh — hermetic regression test for pre-flight.sh
#
# Tests the three lockfile state paths (NO_LOCK, STALE, LIVE) without
# touching any real worktree slot.  Uses a scratch directory and a real
# PID (current shell) with a manipulated PID_START_TIME to simulate PID
# recycling, so no ps-mocking infra is needed.
#
# Exit 0: all assertions pass.
# Exit 1: at least one assertion failed.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
PREFLIGHT="$REPO_ROOT/scripts/pre-flight.sh"
PASS_COUNT=0
FAIL_COUNT=0

green='\033[0;32m'
red='\033[0;31m'
nc='\033[0m'

assert_exit() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$actual" -eq "$expected" ]]; then
    echo -e "${green}PASS${nc}  $label (exit $actual)"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo -e "${red}FAIL${nc}  $label: expected exit $expected, got $actual"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

# -------------------------------------------------------------------------
# Scratch setup: hijack WORKTREES_DIR by writing a patched pre-flight copy
# -------------------------------------------------------------------------

SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

SCRATCH_WORKTREES="$SCRATCH/worktrees"
mkdir -p "$SCRATCH_WORKTREES"

# Patch: replace the WORKTREES_DIR line to point at our scratch dir.
PATCHED_PREFLIGHT="$SCRATCH/pre-flight.sh"
sed "s|WORKTREES_DIR=.*|WORKTREES_DIR=\"$SCRATCH_WORKTREES\"|" \
  "$PREFLIGHT" > "$PATCHED_PREFLIGHT"
chmod +x "$PATCHED_PREFLIGHT"

# -------------------------------------------------------------------------
# Test 1: NO_LOCK — slot directory does not exist
# -------------------------------------------------------------------------

echo "--- Test 1: NO_LOCK (slot w99 missing) ---"
actual_exit=0
"$PATCHED_PREFLIGHT" claim --slot w99 2>/dev/null || actual_exit=$?
assert_exit "claim --slot w99 exits 2 (NO_LOCK)" 2 "$actual_exit"

# -------------------------------------------------------------------------
# Test 2: NO_LOCK — slot directory exists but has no .lock file
# -------------------------------------------------------------------------

echo "--- Test 2: NO_LOCK (slot dir exists, no lockfile) ---"
mkdir -p "$SCRATCH_WORKTREES/w1"
actual_exit=0
"$PATCHED_PREFLIGHT" claim --slot w1 2>/dev/null || actual_exit=$?
assert_exit "claim --slot w1 exits 2 (dir exists, no .lock)" 2 "$actual_exit"

# -------------------------------------------------------------------------
# Test 3: STALE — PID exists but start time was changed (PID recycled)
# -------------------------------------------------------------------------

echo "--- Test 3: STALE (PID recycled — wrong PID_START_TIME) ---"
# Use current shell PID — it is definitely alive (kill -0 will pass).
# Write a wrong start time to trigger the STALE branch.
current_pid=$$
cat > "$SCRATCH_WORKTREES/w1/.lock" <<EOF
PID=$current_pid
PID_START_TIME=Mon Jan 01 00:00:01 1990
NONCE=deadbeef00000000
SESSION_ID=testhost-${current_pid}-0000000000
SLOT=w1
BRANCH=feature/p786-test
P_NUMBER=p786
CLAIMED_AT=1990-01-01T00:00:00Z
HEARTBEAT=1990-01-01T00:00:00Z
EOF

actual_exit=0
"$PATCHED_PREFLIGHT" claim --slot w1 2>/dev/null || actual_exit=$?
assert_exit "claim --slot w1 exits 2 (STALE: PID alive, wrong start time)" 2 "$actual_exit"

# -------------------------------------------------------------------------
# Test 4: ORPHAN — PID does not exist
# -------------------------------------------------------------------------

echo "--- Test 4: ORPHAN (PID does not exist) ---"
# PID 99999 is almost certainly not running on a standard macOS system.
# Use a PID that we confirm is dead.
dead_pid=99999
# Make sure it's really dead; if it somehow exists pick another.
while kill -0 "$dead_pid" 2>/dev/null; do
  dead_pid=$((dead_pid - 1))
done

cat > "$SCRATCH_WORKTREES/w1/.lock" <<EOF
PID=$dead_pid
PID_START_TIME=Mon Jan 01 00:00:01 1990
NONCE=deadbeef00000001
SESSION_ID=testhost-${dead_pid}-0000000000
SLOT=w1
BRANCH=feature/p786-test
P_NUMBER=p786
CLAIMED_AT=1990-01-01T00:00:00Z
HEARTBEAT=1990-01-01T00:00:00Z
EOF

actual_exit=0
"$PATCHED_PREFLIGHT" claim --slot w1 2>/dev/null || actual_exit=$?
assert_exit "claim --slot w1 exits 2 (ORPHAN: PID dead)" 2 "$actual_exit"

# -------------------------------------------------------------------------
# Test 5: LIVE — PID exists AND start time matches
# -------------------------------------------------------------------------

echo "--- Test 5: LIVE (valid lock) ---"
current_pid=$$
# Get the real start time for this shell process.
real_start="$(ps -o lstart= -p $current_pid 2>/dev/null \
  | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/[[:space:]][[:space:]]*/ /g')"

cat > "$SCRATCH_WORKTREES/w1/.lock" <<EOF
PID=$current_pid
PID_START_TIME=$real_start
NONCE=deadbeef00000002
SESSION_ID=testhost-${current_pid}-$(date +%s)
SLOT=w1
BRANCH=feature/p786-test
P_NUMBER=p786
CLAIMED_AT=$(date -u +%FT%TZ)
HEARTBEAT=$(date -u +%FT%TZ)
EOF

actual_exit=0
"$PATCHED_PREFLIGHT" claim --slot w1 2>/dev/null || actual_exit=$?
assert_exit "claim --slot w1 exits 0 (LIVE: valid PID + start time)" 0 "$actual_exit"

# -------------------------------------------------------------------------
# Summary
# -------------------------------------------------------------------------

echo ""
echo "Results: $PASS_COUNT passed, $FAIL_COUNT failed"
if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi
exit 0
