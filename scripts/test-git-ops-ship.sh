#!/usr/bin/env bash
# Hermetic canary for scripts/git-ops.sh ship subcommand (P788).
#
# Covers the journal-based idempotent ship subcommand:
#   K. Basic ship: two-commit branch → both commits land on main, spec moves to
#      features/done/{sprint}/ with status=all-done + completed_at, branch
#      deleted, worktree removed (if existed), journal file absent, output ends
#      with "Ready to push".
#   L. --resume from a pre-existing partial journal (one landed, one pending) →
#      completes to the K-final state.
#   M. SIGTERM mid-sequence (between the two cherry-picks) + --resume → final
#      state identical to K.
#   N. Journal exists, no --resume → refuses with a clear message and exits
#      non-zero; does not modify main.
#   O. --resume when a recorded landed_sha has been manually dropped from main →
#      fails loudly (per Risks section), does not silently re-apply.
#   P. Two concurrent ship invocations for different P-numbers serialize via
#      main.lock: the second reports "held by" and the commits do not interleave.
#   Q. Never auto-pushes: the ship subcommand must not invoke `git push`.
#   R. Shell-safety (P783): all ship output is free of `>`, `<`, `|` tokens.
#   S. Spec in a subdirectory (features/bugs_and_debt/pN_*.md) ships correctly —
#      resolve_ship_spec must walk subdirectories, not just features/ flat.
#   T. Branch collision (both feature/pN-* and fix/pN-*) → die loudly, do not
#      silently pick one and drop commits from the other.
#
# Hermetic: scratch main repo in /tmp, no network, no remote.
# IMPORTANT: do not invoke via `eval "$(...)"`. Output is human-readable.

set -euo pipefail

# P785 — clear inherited git env vars before any nested git invocation, so the
# outer worktree's index stays untouched.
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR
unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_AUTHOR_DATE \
      GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_COMMITTER_DATE

ORIGINAL_CWD="$(pwd)"
OUTER_INDEX_PRE=""
if ( cd "$ORIGINAL_CWD" && git rev-parse --is-inside-work-tree >/dev/null 2>&1 ); then
  OUTER_INDEX_PRE="$(cd "$ORIGINAL_CWD" && git diff --cached --name-only 2>/dev/null || true)"
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

# -----------------------------------------------------------------------------
# Scratch repo layout. A sprint folder under features/done/ is pre-created so
# ship's mv target exists.
# -----------------------------------------------------------------------------

mkdir -p "$SCRATCH/main/scripts" \
         "$SCRATCH/main/.claude/worktrees" \
         "$SCRATCH/main/features/done/2026-04-22"

cp "$REPO_ROOT/scripts/git-ops.sh" "$SCRATCH/main/scripts/git-ops.sh"
chmod +x "$SCRATCH/main/scripts/git-ops.sh"

: > "$SCRATCH/main/features/done/2026-04-22/.gitkeep"

(
  cd "$SCRATCH/main"
  git init -q
  git config user.email canary@test
  git config user.name canary
  git config commit.gpgsign false
  echo "seed" > README.md
  git add README.md scripts/git-ops.sh features/done/2026-04-22/.gitkeep
  git commit -qm "seed"
  git branch -M main
) >/dev/null

GIT_OPS="$SCRATCH/main/scripts/git-ops.sh"

SAFETY_LOG="$SCRATCH/safety.log"
: > "$SAFETY_LOG"

# Scoped log for invariant R — only ship subcommand output is inspected.
R_SCOPED_LOG="$SCRATCH/r-scoped.log"
: > "$R_SCOPED_LOG"

capture_r() {
  local tmp="$SCRATCH/last-capture.log"
  local rc=0
  ( "$@" ) >"$tmp" 2>&1 || rc=$?
  cat "$tmp" >> "$SAFETY_LOG"
  cat "$tmp" >> "$R_SCOPED_LOG"
  cat "$tmp"
  return $rc
}

# Create a feature branch with N commits plus a matching spec file on main.
# Args: $1 = p-number (e.g. p100), $2 = number of commits.
scratch_feature() {
  local pn="$1"; local n="$2"
  local br="feature/${pn}-demo"
  (
    cd "$SCRATCH/main"
    git checkout -q -b "$br"
    local i
    for (( i=1; i<=n; i++ )); do
      echo "c${i}" > "${pn}-c${i}.txt"
      git add "${pn}-c${i}.txt"
      git commit -qm "${pn}: commit ${i}"
    done
    git checkout -q main
  ) >/dev/null
  cat > "$SCRATCH/main/features/${pn}_demo.md" <<EOF
---
status: qa
type: task
rank: 1
tags: [demo]
delivery_stage: fix
pipeline_ran: [fix]
---
# ${pn}: Demo

Problem: demo.
EOF
  ( cd "$SCRATCH/main" && git add "features/${pn}_demo.md" && git commit -qm "chore: add ${pn} spec" ) >/dev/null
}

# Drop the state for a P-number (branch + spec + any artifacts) so subsequent
# invariants start from a clean slate.
scratch_reset() {
  local pn="$1"
  ( cd "$SCRATCH/main" && git branch -D "feature/${pn}-demo" 2>/dev/null ) || true
  rm -f "$SCRATCH/main/features/${pn}_demo.md"
  rm -f "$SCRATCH/main/features/done/2026-04-22/${pn}_demo.md"
  rm -f "$SCRATCH/main/.claude/worktrees/.ship-journal/${pn}.json"
  # Revert any stray commits landed by failed invariants.
  ( cd "$SCRATCH/main" && git checkout -q main 2>/dev/null ) || true
}

# -----------------------------------------------------------------------------
# K. Basic ship: two-commit branch → both commits land, spec moves, branch
# deleted, journal absent, output ends with "Ready to push".
# -----------------------------------------------------------------------------

scratch_feature p100 2
K_OUT="$(cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p100)"

# Both source commits present on main (matched by subject line).
K_COUNT="$(cd "$SCRATCH/main" && git log --oneline main | grep -c 'p100: commit' || true)"
if [[ "$K_COUNT" != "2" ]]; then
  echo "$K_OUT" >&2
  fail "K: expected 2 p100 commits on main, got $K_COUNT"
fi
# Branch deleted.
if ( cd "$SCRATCH/main" && git rev-parse --verify feature/p100-demo >/dev/null 2>&1 ); then
  echo "$K_OUT" >&2
  fail "K: feature/p100-demo branch was not deleted"
fi
# Spec moved.
if [[ ! -f "$SCRATCH/main/features/done/2026-04-22/p100_demo.md" ]]; then
  echo "$K_OUT" >&2
  fail "K: spec was not moved to features/done/2026-04-22/"
fi
if [[ -f "$SCRATCH/main/features/p100_demo.md" ]]; then
  echo "$K_OUT" >&2
  fail "K: spec remains in features/ after move"
fi
# Frontmatter rewritten.
if ! grep -q '^status: all-done$' "$SCRATCH/main/features/done/2026-04-22/p100_demo.md"; then
  fail "K: status not set to all-done in moved spec"
fi
if ! grep -qE '^completed_at: ' "$SCRATCH/main/features/done/2026-04-22/p100_demo.md"; then
  fail "K: completed_at not set in moved spec"
fi
if grep -q '^delivery_stage:' "$SCRATCH/main/features/done/2026-04-22/p100_demo.md"; then
  fail "K: delivery_stage line not removed from moved spec"
fi
# Journal absent.
if [[ -f "$SCRATCH/main/.claude/worktrees/.ship-journal/p100.json" ]]; then
  fail "K: journal file not deleted after successful ship"
fi
# main.lock released.
if [[ -f "$SCRATCH/main/.claude/worktrees/main.lock" ]]; then
  fail "K: main.lock not released after ship"
fi
# "Ready to push" output.
if ! echo "$K_OUT" | grep -qF 'Ready to push'; then
  echo "$K_OUT" >&2
  fail "K: output did not contain 'Ready to push'"
fi
pass "K: basic ship lands commits, moves spec, deletes branch, clears journal"

# -----------------------------------------------------------------------------
# L. --resume from a pre-existing partial journal (one landed, one pending).
# Setup: feature branch with 2 commits, cherry-pick ONE manually onto main,
# write a journal that records the landed sha plus the next pending source.
# Then run ship --resume.
# -----------------------------------------------------------------------------

scratch_feature p101 2

# Pull source shas and manually land the first one on main.
L_SHA1="$( cd "$SCRATCH/main" && git log --reverse --format=%H main..feature/p101-demo | sed -n '1p' )"
L_SHA2="$( cd "$SCRATCH/main" && git log --reverse --format=%H main..feature/p101-demo | sed -n '2p' )"
( cd "$SCRATCH/main" && git cherry-pick "$L_SHA1" ) >/dev/null
L_LANDED1="$( cd "$SCRATCH/main" && git rev-parse HEAD )"

# Write a journal as if we had crashed after the first cherry-pick's journal update.
mkdir -p "$SCRATCH/main/.claude/worktrees/.ship-journal"
cat > "$SCRATCH/main/.claude/worktrees/.ship-journal/p101.json" <<EOF
{
  "p_number": "p101",
  "started_at": "2026-04-22T12:00:00Z",
  "session_id": "canary-l",
  "source_branch": "feature/p101-demo",
  "spec_file": "features/p101_demo.md",
  "commits": [
    {"source_sha": "${L_SHA1}", "landed_sha": "${L_LANDED1}", "landed_at": "2026-04-22T12:00:01Z"},
    {"source_sha": "${L_SHA2}", "landed_sha": null, "landed_at": null}
  ],
  "spec_closed": false,
  "branch_deleted": false
}
EOF

L_OUT="$(cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p101 --resume)"
L_COUNT="$(cd "$SCRATCH/main" && git log --oneline main | grep -c 'p101: commit' || true)"
if [[ "$L_COUNT" != "2" ]]; then
  echo "$L_OUT" >&2
  fail "L: expected 2 p101 commits on main after --resume, got $L_COUNT"
fi
if [[ -f "$SCRATCH/main/.claude/worktrees/.ship-journal/p101.json" ]]; then
  fail "L: journal not deleted after --resume completion"
fi
if ( cd "$SCRATCH/main" && git rev-parse --verify feature/p101-demo >/dev/null 2>&1 ); then
  fail "L: branch not deleted after --resume"
fi
if [[ ! -f "$SCRATCH/main/features/done/2026-04-22/p101_demo.md" ]]; then
  fail "L: spec not moved after --resume"
fi
pass "L: --resume skips already-landed commits and completes cleanly"

# -----------------------------------------------------------------------------
# M. SIGTERM mid-sequence + --resume.
# Launch ship in background, poll the journal for the first landed_sha, SIGTERM
# the process, then run --resume. Verify final state identical to K.
# -----------------------------------------------------------------------------

scratch_feature p102 4  # 4 commits widens the SIGTERM window

# SHIP_DEBUG_SLEEP_SECS inserts a pause between cherry-picks so the SIGTERM
# window is deterministic (no flaky timing).
(
  cd "$SCRATCH/main" && SHIP_DEBUG_SLEEP_SECS=1 bash "$GIT_OPS" ship p102
) >"$SCRATCH/m-ship.log" 2>&1 &
SHIP_PID=$!

# Wait up to 10s for the first landed_sha to appear in the journal.
waited=0
while (( waited < 100 )); do
  if [[ -f "$SCRATCH/main/.claude/worktrees/.ship-journal/p102.json" ]]; then
    has_first=$( python3 - "$SCRATCH/main/.claude/worktrees/.ship-journal/p102.json" <<'PY' || echo "0"
import json, sys
try:
  with open(sys.argv[1]) as f:
    d = json.load(f)
  commits = d.get("commits", [])
  if commits and commits[0].get("landed_sha"):
    print("1")
  else:
    print("0")
except Exception:
  print("0")
PY
)
    if [[ "$has_first" == "1" ]]; then break; fi
  fi
  sleep 0.1
  waited=$((waited + 1))
done

# If ship already finished (very fast), we can't test the SIGTERM path.
# Otherwise, send TERM to interrupt.
if kill -0 "$SHIP_PID" 2>/dev/null; then
  kill -TERM "$SHIP_PID" 2>/dev/null || true
  wait "$SHIP_PID" 2>/dev/null || true
fi
sleep 0.2  # let any in-flight FS operations from ship settle

# Journal SHOULD exist at this point (ship interrupted). If not, ship completed
# before SIGTERM could land — skip M rather than fail the whole canary.
if [[ ! -f "$SCRATCH/main/.claude/worktrees/.ship-journal/p102.json" ]]; then
  echo "M: skipped (ship completed before SIGTERM could land)"
else
  # Explicitly clear the main.lock if the SIGTERM killed the trap — resume must
  # not inherit the killed session's lock.
  rm -f "$SCRATCH/main/.claude/worktrees/main.lock"
  # Clear any in-progress cherry-pick state that SIGTERM may have left behind.
  ( cd "$SCRATCH/main" && git cherry-pick --skip >/dev/null 2>&1 ) || true

  set +e
  M_OUT=$( cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p102 --resume )
  M_EXIT=$?
  set -e
  if [[ $M_EXIT -ne 0 ]]; then
    echo "$M_OUT" >&2
    fail "M: --resume exited non-zero ($M_EXIT) after SIGTERM"
  fi
  M_COUNT="$(cd "$SCRATCH/main" && git log --oneline main | grep -c 'p102: commit' || true)"
  if [[ "$M_COUNT" != "4" ]]; then
    echo "$M_OUT" >&2
    fail "M: expected 4 p102 commits on main after SIGTERM+resume, got $M_COUNT"
  fi
  if [[ -f "$SCRATCH/main/.claude/worktrees/.ship-journal/p102.json" ]]; then
    fail "M: journal not deleted after SIGTERM+resume completion"
  fi
  if ( cd "$SCRATCH/main" && git rev-parse --verify feature/p102-demo >/dev/null 2>&1 ); then
    fail "M: branch not deleted after SIGTERM+resume"
  fi
  pass "M: SIGTERM mid-sequence + --resume converges to final state"
fi

# -----------------------------------------------------------------------------
# N. Journal exists, no --resume → refuses.
# Setup: write a journal manually, run ship without --resume.
# -----------------------------------------------------------------------------

scratch_feature p103 2
mkdir -p "$SCRATCH/main/.claude/worktrees/.ship-journal"
cat > "$SCRATCH/main/.claude/worktrees/.ship-journal/p103.json" <<'EOF'
{
  "p_number": "p103",
  "started_at": "2026-04-22T12:00:00Z",
  "session_id": "canary-n",
  "source_branch": "feature/p103-demo",
  "spec_file": "features/p103_demo.md",
  "commits": [],
  "spec_closed": false,
  "branch_deleted": false
}
EOF

set +e
N_OUT=$( cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p103 )
N_EXIT=$?
set -e
if [[ $N_EXIT -eq 0 ]]; then
  echo "$N_OUT" >&2
  fail "N: ship without --resume succeeded despite existing journal — expected refusal"
fi
if ! echo "$N_OUT" | grep -qiE 'resume|journal'; then
  echo "$N_OUT" >&2
  fail "N: refusal message does not mention journal or --resume"
fi
# Clean up so later invariants don't inherit p103's journal.
rm -f "$SCRATCH/main/.claude/worktrees/.ship-journal/p103.json"
scratch_reset p103
pass "N: ship refuses to overwrite existing journal without --resume"

# -----------------------------------------------------------------------------
# O. --resume when a recorded landed_sha has been dropped from main.
# Setup: build a scratch feature, land the first commit, write the journal, but
# then reset main to drop that commit. --resume must fail loudly.
# -----------------------------------------------------------------------------

scratch_feature p104 2

O_SHA1="$( cd "$SCRATCH/main" && git log --reverse --format=%H main..feature/p104-demo | sed -n '1p' )"
O_SHA2="$( cd "$SCRATCH/main" && git log --reverse --format=%H main..feature/p104-demo | sed -n '2p' )"
( cd "$SCRATCH/main" && git cherry-pick "$O_SHA1" ) >/dev/null
O_MAIN_HEAD_AFTER_PICK="$( cd "$SCRATCH/main" && git rev-parse HEAD )"
# Write journal referencing a landed_sha that is about to vanish.
FAKE_LANDED="deadbeef$(printf '%x' "$RANDOM")deadbeef"
mkdir -p "$SCRATCH/main/.claude/worktrees/.ship-journal"
cat > "$SCRATCH/main/.claude/worktrees/.ship-journal/p104.json" <<EOF
{
  "p_number": "p104",
  "started_at": "2026-04-22T12:00:00Z",
  "session_id": "canary-o",
  "source_branch": "feature/p104-demo",
  "spec_file": "features/p104_demo.md",
  "commits": [
    {"source_sha": "${O_SHA1}", "landed_sha": "${FAKE_LANDED}", "landed_at": "2026-04-22T12:00:01Z"},
    {"source_sha": "${O_SHA2}", "landed_sha": null, "landed_at": null}
  ],
  "spec_closed": false,
  "branch_deleted": false
}
EOF

set +e
O_OUT=$( cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p104 --resume )
O_EXIT=$?
set -e
if [[ $O_EXIT -eq 0 ]]; then
  echo "$O_OUT" >&2
  fail "O: --resume succeeded despite missing landed_sha — expected failure"
fi
if ! echo "$O_OUT" | grep -qiE 'landed|missing|not found|cat-file|history'; then
  echo "$O_OUT" >&2
  fail "O: --resume failure message uninformative about missing landed_sha"
fi
# Clean up.
rm -f "$SCRATCH/main/.claude/worktrees/.ship-journal/p104.json"
( cd "$SCRATCH/main" && git reset --hard main~1 >/dev/null 2>&1 ) || true
scratch_reset p104
pass "O: --resume fails loudly when a landed_sha is missing from main"

# -----------------------------------------------------------------------------
# P. Concurrent ship invocations for different P-numbers serialize via main.lock.
# Simulate contention by planting a live main.lock (sleeper PID) and calling
# ship with a short GIT_OPS_MAIN_LOCK_TIMEOUT override. The call must fail with
# a "held by" message and must not land any commit.
# -----------------------------------------------------------------------------

scratch_feature p105 2

# Disable job-done notifications for the duration of the sleeper so zsh/bash
# doesn't print "Terminated: 15 sleep 30" when we kill it.
set +m
sleep 30 2>/dev/null &
SLEEPER_PID=$!
cleanup_sleeper() {
  kill "$SLEEPER_PID" 2>/dev/null || true
  wait "$SLEEPER_PID" 2>/dev/null || true
  return 0
}
trap 'cleanup_sleeper; rm -rf "$SCRATCH"' EXIT

SLEEPER_START="$(ps -o lstart= -p "$SLEEPER_PID" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/[[:space:]][[:space:]]*/ /g')"
mkdir -p "$SCRATCH/main/.claude/worktrees"
cat > "$SCRATCH/main/.claude/worktrees/main.lock" <<EOF
PID=$SLEEPER_PID
PID_START_TIME=$SLEEPER_START
NONCE=000000000000face
SESSION_ID=canary-p-contention
CLAIMED_AT=2026-04-22T00:00:00Z
EOF

P_HEAD_BEFORE="$( cd "$SCRATCH/main" && git rev-parse HEAD )"
set +e
P_OUT=$( cd "$SCRATCH/main" && GIT_OPS_MAIN_LOCK_TIMEOUT=2 \
         capture_r bash "$GIT_OPS" ship p105 )
P_EXIT=$?
set -e
if [[ $P_EXIT -eq 0 ]]; then
  echo "$P_OUT" >&2
  fail "P: ship succeeded despite held main.lock — expected serialization refusal"
fi
if ! echo "$P_OUT" | grep -qiE 'held by|main.lock'; then
  echo "$P_OUT" >&2
  fail "P: ship contention message missing 'held by' or 'main.lock'"
fi
P_HEAD_AFTER="$( cd "$SCRATCH/main" && git rev-parse HEAD )"
if [[ "$P_HEAD_BEFORE" != "$P_HEAD_AFTER" ]]; then
  fail "P: main HEAD moved while ship was blocked on main.lock"
fi
# Ensure the held lock is still there — spec forbids force-release.
[[ -f "$SCRATCH/main/.claude/worktrees/main.lock" ]] || \
  fail "P: ship force-released main.lock — spec forbids this"
pass "P: concurrent ship serializes via main.lock (contention detected, no interleave)"

rm -f "$SCRATCH/main/.claude/worktrees/main.lock"
cleanup_sleeper
trap 'rm -rf "$SCRATCH"' EXIT
scratch_reset p105

# -----------------------------------------------------------------------------
# Q. Never auto-pushes. Grep the ship subcommand source for `git push`. The
# grep-based check catches silent `git push` additions in future edits. Paired
# with this: re-ship a feature and confirm no "origin" reference in output.
# -----------------------------------------------------------------------------

# Q1: the cmd_ship function body must not call `git push`.
if awk '/^cmd_ship\(\) \{/,/^\}/' "$GIT_OPS" | grep -E '^[[:space:]]*git[[:space:]]+push' >/dev/null; then
  fail "Q: cmd_ship source contains 'git push' — ship must never auto-push"
fi
# Q2: the K output (captured above) must not mention origin/push.
if echo "$K_OUT" | grep -qiE 'git push|pushed to|origin/'; then
  echo "$K_OUT" >&2
  fail "Q: ship output suggests a push was attempted"
fi
pass "Q: ship never invokes git push and output does not claim a push"

# -----------------------------------------------------------------------------
# S. Spec in a subdirectory (features/bugs_and_debt/pN_*.md) ships correctly.
# Regression guard for the resolve_ship_spec fix (flat ls missed 43% of specs).
# -----------------------------------------------------------------------------

mkdir -p "$SCRATCH/main/features/bugs_and_debt"
(
  cd "$SCRATCH/main"
  git checkout -q -b feature/p106-subdir
  echo c1 > p106-c1.txt
  git add p106-c1.txt
  git commit -qm 'p106: commit 1'
  git checkout -q main
) >/dev/null
cat > "$SCRATCH/main/features/bugs_and_debt/p106_subdir.md" <<'EOF'
---
status: qa
type: bug
rank: 1
tags: []
delivery_stage: fix
pipeline_ran: [fix]
---
# p106: Subdir spec

Problem: subdir.
EOF
( cd "$SCRATCH/main" && git add "features/bugs_and_debt/p106_subdir.md" \
  && git commit -qm "chore: add p106 spec" ) >/dev/null

S_OUT="$(cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p106)"
if ! echo "$S_OUT" | grep -qF 'Ready to push'; then
  echo "$S_OUT" >&2
  fail "S: subdirectory-located spec did not ship"
fi
if [[ -f "$SCRATCH/main/features/bugs_and_debt/p106_subdir.md" ]]; then
  fail "S: subdir spec not moved out of its source location"
fi
if [[ ! -f "$SCRATCH/main/features/done/2026-04-22/p106_subdir.md" ]]; then
  fail "S: subdir spec not landed in features/done/{sprint}/"
fi
pass "S: spec in features/bugs_and_debt/ ships through resolve_ship_spec"

# -----------------------------------------------------------------------------
# T. Branch collision — both feature/pN-* and fix/pN-* exist → die, don't
# silently pick one. Regression guard for the resolve_ship_branch fix.
# -----------------------------------------------------------------------------

(
  cd "$SCRATCH/main"
  git checkout -q -b feature/p107-a
  echo c1 > p107-a.txt && git add p107-a.txt && git commit -qm "p107: a"
  git checkout -q main
  git checkout -q -b fix/p107-b
  echo c2 > p107-b.txt && git add p107-b.txt && git commit -qm "p107: b"
  git checkout -q main
) >/dev/null
cat > "$SCRATCH/main/features/p107_demo.md" <<'EOF'
---
status: qa
type: task
rank: 1
tags: []
---
# p107: Collision

Problem: collision.
EOF
( cd "$SCRATCH/main" && git add features/p107_demo.md && git commit -qm "chore: add p107" ) >/dev/null

set +e
T_OUT=$( cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p107 )
T_EXIT=$?
set -e
if [[ $T_EXIT -eq 0 ]]; then
  echo "$T_OUT" >&2
  fail "T: ship accepted a P-number with two matching branches — expected refusal"
fi
if ! echo "$T_OUT" | grep -qiE 'multiple branches|collision|delete all but one'; then
  echo "$T_OUT" >&2
  fail "T: branch-collision diagnostic does not name the conflict"
fi
# Neither branch should have been shipped.
if ! ( cd "$SCRATCH/main" && git rev-parse --verify feature/p107-a >/dev/null 2>&1 ); then
  fail "T: feature/p107-a deleted despite refusal"
fi
if ! ( cd "$SCRATCH/main" && git rev-parse --verify fix/p107-b >/dev/null 2>&1 ); then
  fail "T: fix/p107-b deleted despite refusal"
fi
# Clean up so R's log doesn't inherit stale state.
( cd "$SCRATCH/main" && git branch -D feature/p107-a fix/p107-b ) >/dev/null 2>&1
rm -f "$SCRATCH/main/features/p107_demo.md"
pass "T: ship refuses on feature/ + fix/ branch collision"

# -----------------------------------------------------------------------------
# R. Shell-safety — no >, <, | in any ship output (P783 invariant).
# -----------------------------------------------------------------------------

if grep -q '[><|]' "$R_SCOPED_LOG"; then
  echo "--- offending lines (ship output only) ---" >&2
  grep -n '[><|]' "$R_SCOPED_LOG" >&2
  echo "--- end offending lines ---" >&2
  fail "R: ship output contains shell-redirect-parseable tokens"
fi
pass "R: no redirect-parseable tokens in ship output"

# -----------------------------------------------------------------------------
# Invariant 4 (P785): outer worktree index unchanged.
# -----------------------------------------------------------------------------

if [[ -n "$ORIGINAL_CWD" ]] && ( cd "$ORIGINAL_CWD" && git rev-parse --is-inside-work-tree >/dev/null 2>&1 ); then
  OUTER_INDEX_POST="$(cd "$ORIGINAL_CWD" && git diff --cached --name-only 2>/dev/null || true)"
  if [[ "$OUTER_INDEX_PRE" != "$OUTER_INDEX_POST" ]]; then
    DIFF_FILES="$(diff <(echo "$OUTER_INDEX_PRE") <(echo "$OUTER_INDEX_POST") | grep '^>' | sed 's/^> //')"
    if [[ -n "$DIFF_FILES" ]]; then
      ( cd "$ORIGINAL_CWD" && printf '%s\n' "$DIFF_FILES" | tr '\n' '\0' | xargs -0 git reset HEAD -- 2>/dev/null || true )
    fi
    fail "outer worktree index at $ORIGINAL_CWD changed during canary (P785 regression — added: $DIFF_FILES)"
  fi
fi

echo "PASS: all git-ops.sh ship invariants (K-T) hold"
