#!/bin/bash
# test-git-ops-adopt.sh — P1268
#
# Hermetic coverage of `git-ops.sh adopt`. Builds a REAL throwaway repo with a
# REAL worktree, because adopt's containment reads `git rev-parse --show-toplevel`
# and the slot's checked-out branch — neither of which a faked directory can
# exercise.
#
# Every refusal path is asserted on its exit code, not on its message, so a
# reworded error does not silently turn a refusal into an allow.
#
# Exit 0: all assertions pass.  Exit 1: at least one failed.

set -uo pipefail

# P785 / P1268 — Clear inherited git env vars FIRST. When this script runs inside a
# git pre-commit hook, git sets GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE in the
# environment. Every nested `git init` / `git worktree add` / `git-ops.sh` call below
# would inherit them and operate on the CALLER'S REAL INDEX instead of the scratch
# repo. This is not hypothetical: both suites were written without this line, wired
# into pre-commit-checks.sh, and corrupted the w1 index twice — 1497 staged paths
# against 4 added, with 235 files present on disk reported as deleted. Every sibling
# canary in scripts/ carries this line; these two did not.
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR

# Invariant (P785 pattern): snapshot the OUTER index now and assert it is untouched
# when we finish. A guard nobody checks is a guard that silently stops working.
OUTER_INDEX_PRE=""
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  OUTER_INDEX_PRE="$(git diff --cached --name-only 2>/dev/null | sort || true)"
fi
assert_outer_index_untouched() {
  local post=""
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    post="$(git diff --cached --name-only 2>/dev/null | sort || true)"
  fi
  if [[ "$post" != "$OUTER_INDEX_PRE" ]]; then
    echo "FAIL  this canary LEAKED into the caller's index (see P785 / P1268)" >&2
    echo "  before: $(printf '%s' "$OUTER_INDEX_PRE" | wc -l | tr -d ' ') path(s)" >&2
    echo "  after : $(printf '%s' "$post" | wc -l | tr -d ' ') path(s)" >&2
    return 1
  fi
  return 0
}

REPO_ROOT="$(git rev-parse --show-toplevel)"
GIT_OPS_SRC="$REPO_ROOT/scripts/git-ops.sh"
PASS=0; FAIL=0
green='\033[0;32m'; red='\033[0;31m'; nc='\033[0m'

SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

assert_exit() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" -eq "$expected" ]]; then
    echo -e "${green}PASS${nc}  $label (exit $actual)"; PASS=$((PASS+1))
  else
    echo -e "${red}FAIL${nc}  $label: expected exit $expected, got $actual"; FAIL=$((FAIL+1))
  fi
}
assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo -e "${green}PASS${nc}  $label"; PASS=$((PASS+1))
  else
    echo -e "${red}FAIL${nc}  $label: expected '$expected', got '$actual'"; FAIL=$((FAIL+1))
  fi
}

# --- build a real repo + worktree ------------------------------------------
FAKE="$SCRATCH/repo"
mkdir -p "$FAKE"
git -C "$FAKE" init -q -b main
git -C "$FAKE" config user.email t@t.t
git -C "$FAKE" config user.name t
echo seed > "$FAKE/seed.txt"
git -C "$FAKE" add seed.txt
git -C "$FAKE" commit -qm seed

WT="$FAKE/.claude/worktrees"
mkdir -p "$WT"
git -C "$FAKE" worktree add -q "$WT/w1" -b feature/p9999-scratch main
mkdir -p "$FAKE/scripts"
cp "$GIT_OPS_SRC" "$FAKE/scripts/git-ops.sh"
chmod +x "$FAKE/scripts/git-ops.sh"
GO="$FAKE/scripts/git-ops.sh"

write_lock() {
  # $1=pid $2=start $3=branch $4=heartbeat
  cat > "$WT/w1/.lock" <<LOCK
PID=$1
PID_START_TIME=$2
NONCE=cafebabe00000001
SESSION_ID=scratch
SLOT=w1
BRANCH=$3
P_NUMBER=p9999
CLAIMED_AT=2026-01-01T00:00:00Z
HEARTBEAT=$4
LOCK
}

dead_pid=99999; while kill -0 "$dead_pid" 2>/dev/null; do dead_pid=$((dead_pid-1)); done
live_pid=$$
live_start="$(ps -o lstart= -p $live_pid | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/[[:space:]][[:space:]]*/ /g')"

echo "--- adopt: refusal paths ---"

# 1. no lockfile
rm -f "$WT/w1/.lock"
( cd "$WT/w1" && "$GO" adopt w1 ) >/dev/null 2>&1
assert_exit "no lockfile -> refuse" 1 $?

# 2. slot does not exist
( cd "$WT/w1" && "$GO" adopt w42 ) >/dev/null 2>&1
assert_exit "absent slot -> refuse" 1 $?

# 3. adopting from OUTSIDE the slot (seizure)
write_lock "$dead_pid" "x" "feature/p9999-scratch" "2026-01-01T00:00:00Z"
( cd "$FAKE" && "$GO" adopt w1 ) >/dev/null 2>&1
assert_exit "outside the slot -> refuse (seizure)" 1 $?

# 4. ...but a matching nonce proves ownership and is accepted from anywhere
( cd "$FAKE" && "$GO" adopt w1 --nonce cafebabe00000001 ) >/dev/null 2>&1
assert_exit "outside the slot WITH matching nonce -> allow" 0 $?

# 5. a WRONG nonce from outside is still a refusal
write_lock "$dead_pid" "x" "feature/p9999-scratch" "2026-01-01T00:00:00Z"
( cd "$FAKE" && "$GO" adopt w1 --nonce 0000000000000000 ) >/dev/null 2>&1
assert_exit "outside the slot with WRONG nonce -> refuse" 1 $?

# 6. branch mismatch — lock names a branch the worktree no longer holds
write_lock "$dead_pid" "x" "feature/p1111-somewhere-else" "2026-01-01T00:00:00Z"
( cd "$WT/w1" && "$GO" adopt w1 ) >/dev/null 2>&1
assert_exit "branch mismatch -> refuse" 1 $?

# 7. lock is LIVE under a different, genuinely running process
write_lock "$live_pid" "$live_start" "feature/p9999-scratch" "2026-01-01T00:00:00Z"
( cd "$WT/w1" && "$GO" adopt w1 ) >/dev/null 2>&1
assert_exit "LIVE under another PID, no nonce -> refuse" 1 $?

# 8. ...and the nonce overrides that too (it is the owner returning)
( cd "$WT/w1" && "$GO" adopt w1 --nonce cafebabe00000001 ) >/dev/null 2>&1
assert_exit "LIVE under another PID WITH nonce -> allow" 0 $?

echo "--- adopt: happy path preserves identity, refreshes liveness ---"

write_lock "$dead_pid" "x" "feature/p9999-scratch" "2026-01-01T00:00:00Z"
before_nonce="$(grep '^NONCE=' "$WT/w1/.lock" | cut -d= -f2)"
( cd "$WT/w1" && "$GO" adopt w1 --session hooked-session ) >/dev/null 2>&1
assert_exit "adopt from inside the slot -> allow" 0 $?

get() { grep "^$1=" "$WT/w1/.lock" | cut -d= -f2-; }
if [[ "$(get NONCE)" == "$before_nonce" ]]; then
  echo -e "${red}FAIL${nc}  NONCE rotated on adopt (prior holders must lose the capability)"; FAIL=$((FAIL+1))
elif [[ -z "$(get NONCE)" ]]; then
  echo -e "${red}FAIL${nc}  NONCE rotated on adopt — got an EMPTY nonce"; FAIL=$((FAIL+1))
else
  echo -e "${green}PASS${nc}  NONCE rotated on adopt (was $before_nonce, now $(get NONCE))"; PASS=$((PASS+1))
fi
assert_eq  "CLAIMED_AT preserved" "2026-01-01T00:00:00Z" "$(get CLAIMED_AT)"
assert_eq  "BRANCH preserved" "feature/p9999-scratch" "$(get BRANCH)"
assert_eq  "P_NUMBER preserved" "p9999" "$(get P_NUMBER)"
assert_eq  "SESSION_ID refreshed from --session" "hooked-session" "$(get SESSION_ID)"

if [[ "$(get HEARTBEAT)" == "2026-01-01T00:00:00Z" ]]; then
  echo -e "${red}FAIL${nc}  HEARTBEAT refreshed"; FAIL=$((FAIL+1))
else
  echo -e "${green}PASS${nc}  HEARTBEAT refreshed (was 2026-01-01T00:00:00Z, now $(get HEARTBEAT))"; PASS=$((PASS+1))
fi

# The point of the whole feature: the slot now reads LIVE.
state="$( cd "$WT/w1" && "$GO" status w1 2>/dev/null | grep -i '^State' | awk '{print $2}' )"
assert_eq "slot reads LIVE after adopt" "LIVE" "$state"

# And no lock temp files were left behind by the atomic swap.
leftovers="$(find "$WT/w1" -maxdepth 1 -name '.lock.*' | wc -l | tr -d ' ')"
assert_eq "no .lock.XXXX temp files leaked" "0" "$leftovers"

echo "--- adopt: the seizure gate (adversarial review) ---"

# THE finding: a second session that merely cd'd into an occupied slot took it,
# exit 0, and was handed the nonce. Presence in a directory is not ownership.
git -C "$FAKE" worktree add -q "$WT/w1" feature/p9999-scratch 2>/dev/null || true
write_lock "$dead_pid" "x" "feature/p9999-scratch" "$(date -u +%FT%TZ)"   # fresh = LIVE
( cd "$WT/w1" && "$GO" adopt w1 --session "ATTACKER" ) >/dev/null 2>&1
assert_exit "adopt from INSIDE the slot is refused while the lock is LIVE" 1 $?
holder="$(grep '^SESSION_ID=' "$WT/w1/.lock" | cut -d= -f2-)"
assert_eq "the refused adopt did not overwrite SESSION_ID" "scratch" "$holder"

# ...and the legitimate case still works: an unattended slot is adoptable.
write_lock "$dead_pid" "x" "feature/p9999-scratch" "1990-01-01T00:00:00Z"
( cd "$WT/w1" && "$GO" adopt w1 --session "RESUMER" ) >/dev/null 2>&1
assert_exit "an EXPIRED lock is adoptable without a nonce (resume still works)" 0 $?

echo "--- heartbeat: containment ---"

# cmd_heartbeat originally had no containment at all, so any caller anywhere could
# read SESSION_ID out of the lockfile and echo it back to hold the slot open forever.
write_lock "$dead_pid" "x" "feature/p9999-scratch" "1990-01-01T00:00:00Z"
harvested="$(grep '^SESSION_ID=' "$WT/w1/.lock" | cut -d= -f2-)"
( cd "$FAKE" && CP_SESSION_ID="$harvested" "$GO" heartbeat w1 ) >/dev/null 2>&1
state="$( cd "$FAKE" && "$GO" status w1 2>/dev/null | grep -i '^State' | awk '{print $2}' )"
assert_eq "heartbeat from OUTSIDE the slot is a no-op even with a harvested SESSION_ID" "ORPHAN" "$state"

echo "--- adopt: concurrency ---"

# codex finding #3: two adopters both reading the same dead claim, both passing every
# check, both writing — last write wins silently and the loser keeps working under a
# lock that names someone else. The mutex must serialize them.
git -C "$FAKE" worktree add -q "$WT/w1" feature/p9999-scratch 2>/dev/null || true
write_lock "$dead_pid" "x" "feature/p9999-scratch" "2026-01-01T00:00:00Z"
for i in 1 2 3 4 5 6; do
  ( cd "$WT/w1" && "$GO" adopt w1 --session "racer-$i" ) >/dev/null 2>&1 &
done
wait

# Exactly one lockfile, well-formed, and no mutex or temp debris left behind.
lines="$(wc -l < "$WT/w1/.lock" | tr -d ' ')"
assert_eq "concurrent adopts leave ONE well-formed lock (9 fields)" "9" "$lines"
winners="$(grep -c '^SESSION_ID=racer-' "$WT/w1/.lock" | tr -d ' ')"
assert_eq "exactly one SESSION_ID survives (no interleaved write)" "1" "$winners"
debris="$(find "$WT/w1" -maxdepth 1 \( -name '.lock.mutex' -o -name '.lock.??????' \) | wc -l | tr -d ' ')"
assert_eq "no mutex or temp-lock debris left behind" "0" "$debris"

# A refusal must also release the mutex, or the slot is wedged for 30s afterwards.
write_lock "$dead_pid" "x" "feature/p1111-elsewhere" "2026-01-01T00:00:00Z"
( cd "$WT/w1" && "$GO" adopt w1 ) >/dev/null 2>&1
if [[ -d "$WT/w1/.lock.mutex" ]]; then
  echo -e "${red}FAIL${nc}  a REFUSED adopt leaked its mutex (slot wedged)"; FAIL=$((FAIL+1))
else
  echo -e "${green}PASS${nc}  a refused adopt releases its mutex"; PASS=$((PASS+1))
fi

echo "--- gate 7c: the workflows that ALREADY EXIST must still pass ---"
#
# A new gate is only half-proven by watching it catch things. The other half is
# confirming it does not refuse work that was always legitimate — and the natural
# blind spot, since a gate you built after a near-miss is one you are motivated to
# see fire, not to see wave things through.
#
# Widening LIVE has a real consequence here: `abandon` gates on state==LIVE, and
# BEFORE P1268 every agent-claimed lock was ORPHAN within milliseconds, so abandon
# never asked for ownership in practice. Now a slot claimed in the last 12h reads
# LIVE and does ask. These assert the documented flows still work.

fresh="$(date -u +%FT%TZ)"

# park.md:66 documents `abandon wN --nonce "$CP_LOCK_NONCE_wN"` — the nonce is
# always passed, so park keeps working against a LIVE (fresh-heartbeat) lock.
git -C "$FAKE" worktree add -q "$WT/w1" feature/p9999-scratch 2>/dev/null || true
write_lock "$dead_pid" "x" "feature/p9999-scratch" "$fresh"
( cd "$FAKE" && "$GO" abandon w1 --nonce cafebabe00000001 ) >/dev/null 2>&1
assert_exit "park flow: abandon --nonce against a fresh-heartbeat lock -> allow" 0 $?

# The regression this widening COULD have caused, pinned deliberately: a dead
# session's slot inside the TTL now needs the nonce. Asserted so the trade-off is
# visible in the suite rather than discovered by a user who lost their nonce.
git -C "$FAKE" worktree add -q "$WT/w1" feature/p9999-scratch 2>/dev/null || true
write_lock "$dead_pid" "x" "feature/p9999-scratch" "$fresh"
( cd "$FAKE" && "$GO" abandon w1 ) >/dev/null 2>&1
assert_exit "abandon without nonce inside the TTL -> refuse (documented trade-off)" 1 $?

# ...and once the heartbeat expires, unattended cleanup works exactly as before.
write_lock "$dead_pid" "x" "feature/p9999-scratch" "1990-01-01T00:00:00Z"
( cd "$FAKE" && "$GO" abandon w1 ) >/dev/null 2>&1
assert_exit "abandon without nonce AFTER the TTL -> allow (unchanged behaviour)" 0 $?

# THE headline assertion, and it must exercise the REAL `claim` path. An earlier
# version of this test hand-wrote a lock with a fresh heartbeat and called status —
# which asserts nothing about claim at all: a regression where claim omits
# HEARTBEAT, writes an unparseable stamp, or writes no lock would still have passed.
# Testing a fixture that resembles the output instead of the output is the exact
# proxy-not-claim failure epistemic.md gate 9 names. Caught by adversarial review.
rm -rf "$WT/w2" 2>/dev/null || true
( cd "$FAKE" && "$GO" claim p9998 realclaim ) >/dev/null 2>&1
claim_rc=$?
assert_exit "claim runs" 0 "$claim_rc"

claimed_slot=""
for cand in "$WT"/w*; do
  [[ -f "$cand/.lock" ]] || continue
  if grep -q '^P_NUMBER=p9998$' "$cand/.lock" 2>/dev/null; then
    claimed_slot="$(basename "$cand")"
  fi
done

if [[ -z "$claimed_slot" ]]; then
  echo -e "${red}FAIL${nc}  claim produced a lockfile"; FAIL=$((FAIL+1))
else
  echo -e "${green}PASS${nc}  claim produced a lockfile ($claimed_slot)"; PASS=$((PASS+1))

  hb="$(grep '^HEARTBEAT=' "$WT/$claimed_slot/.lock" | cut -d= -f2-)"
  if [[ -n "$hb" ]] && TZ=UTC date -j -f "%Y-%m-%dT%H:%M:%SZ" "$hb" +%s >/dev/null 2>&1; then
    echo -e "${green}PASS${nc}  claim wrote a PARSEABLE HEARTBEAT ($hb)"; PASS=$((PASS+1))
  else
    echo -e "${red}FAIL${nc}  claim wrote no usable HEARTBEAT (got '${hb}')"; FAIL=$((FAIL+1))
  fi

  # The defect in one line: before P1268 this read ORPHAN milliseconds after claim,
  # because claim stamps the PID of a process that has already exited.
  state="$( cd "$FAKE" && "$GO" status "$claimed_slot" 2>/dev/null | grep -i '^State' | awk '{print $2}' )"
  assert_eq "a REALLY-claimed slot reads LIVE, not ORPHAN (the P1268 defect)" "LIVE" "$state"

  # And the claiming PID really is dead — proving LIVE came from the heartbeat,
  # not from the PID accidentally still being alive, which would make the
  # assertion above pass for the wrong reason.
  claim_pid="$(grep '^PID=' "$WT/$claimed_slot/.lock" | cut -d= -f2-)"
  if kill -0 "$claim_pid" 2>/dev/null; then
    echo -e "${red}FAIL${nc}  claiming PID $claim_pid is still alive — LIVE may be a false positive"; FAIL=$((FAIL+1))
  else
    echo -e "${green}PASS${nc}  claiming PID $claim_pid is dead, so LIVE came from HEARTBEAT"; PASS=$((PASS+1))
  fi
fi

echo "--- heartbeat: a long session must not age back into ORPHAN ---"

# codex finding #1: adopt fires once at session start, so without an activity-driven
# refresh a session outliving the TTL goes ORPHAN while its owner is still working.
if [[ -n "$claimed_slot" ]]; then
  sess="hb-test-session"
  # Age FIRST: adopt now refuses a LIVE lock without a nonce, and `claim` leaves one
  # LIVE. Taking over a slot requires it to be genuinely unattended.
  sed -i '' "s|^HEARTBEAT=.*|HEARTBEAT=1990-01-01T00:00:00Z|" "$WT/$claimed_slot/.lock"
  ( cd "$WT/$claimed_slot" && "$GO" adopt "$claimed_slot" --session "$sess" ) >/dev/null 2>&1
  sed -i '' "s|^HEARTBEAT=.*|HEARTBEAT=1990-01-01T00:00:00Z|" "$WT/$claimed_slot/.lock"
  state="$( cd "$FAKE" && "$GO" status "$claimed_slot" 2>/dev/null | grep -i '^State' | awk '{print $2}' )"
  assert_eq "an expired heartbeat reads ORPHAN (precondition)" "ORPHAN" "$state"

  ( cd "$WT/$claimed_slot" && CP_SESSION_ID="$sess" "$GO" heartbeat "$claimed_slot" ) >/dev/null 2>&1
  state="$( cd "$FAKE" && "$GO" status "$claimed_slot" 2>/dev/null | grep -i '^State' | awk '{print $2}' )"
  assert_eq "heartbeat by the OWNING session restores LIVE" "LIVE" "$state"

  # ...and a stranger cannot hold someone else's claim open.
  sed -i '' "s|^HEARTBEAT=.*|HEARTBEAT=1990-01-01T00:00:00Z|" "$WT/$claimed_slot/.lock"
  ( cd "$WT/$claimed_slot" && CP_SESSION_ID="someone-else" "$GO" heartbeat "$claimed_slot" ) >/dev/null 2>&1
  state="$( cd "$FAKE" && "$GO" status "$claimed_slot" 2>/dev/null | grep -i '^State' | awk '{print $2}' )"
  assert_eq "heartbeat by a NON-owning session is a no-op (stays ORPHAN)" "ORPHAN" "$state"

  # heartbeat must never CREATE a lock — that would forge a claim nobody made.
  rm -f "$WT/$claimed_slot/.lock"
  ( cd "$WT/$claimed_slot" && CP_SESSION_ID="x" "$GO" heartbeat "$claimed_slot" ) >/dev/null 2>&1
  if [[ -f "$WT/$claimed_slot/.lock" ]]; then
    echo -e "${red}FAIL${nc}  heartbeat CREATED a lockfile where none existed"; FAIL=$((FAIL+1))
  else
    echo -e "${green}PASS${nc}  heartbeat never creates a lock (no claim is forged)"; PASS=$((PASS+1))
  fi
fi

echo
if assert_outer_index_untouched; then
  echo -e "${green}PASS${nc}  the canary did not touch the caller's index"
  PASS=$((PASS + 1))
else
  FAIL=$((FAIL + 1))
fi

echo "passed: $PASS  failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
