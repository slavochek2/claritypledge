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
#   U. CURRENT_SPRINT file takes priority: spec lands in CURRENT_SPRINT dir, not
#      alphabetically-latest dir (regression guard for P790 uat/ misrouting fix).
#   U2. Fallback path (no CURRENT_SPRINT): newest date dir wins over non-date siblings
#       (uat/, zzz-archive/) — glob filter [0-9][0-9][0-9][0-9]*/ is load-bearing.
#   V. Self-modifying ship guard (P795): ship refuses if branch touches
#      scripts/git-ops.sh — main HEAD unchanged, no journal file left.
#   W. next-p-number.sh deduplication (P795): deleted P-numbers are not reused —
#      returned number is > any previously-used P-number including deleted specs.
#   X. Untracked spec guard (P796, fresh run): ship refuses if main has an
#      untracked features/pN_*.md — HEAD unchanged, no journal file left.
#   X2. Untracked spec guard (P796, --resume): same guard preserves the existing
#       journal instead of deleting it.
#   Y. Cherry-pick diagnostic (P796): on conflict, ship emits #CP_DIAGNOSTIC_BEGIN
#      sentinel, cherry-pick output, and git status — not just a bare error line.
#   KK. Discard-vs-resolution regression (P1082): a real modify/modify conflict
#       on the spec file, resolved and staged by the operator, must survive
#       `ship --resume` — the kanban-edit discard must not clobber it.
#   LL. P1082 non-regression: genuine kanban noise (no CHERRY_PICK_HEAD) is
#       still discarded before a normal, non-conflicting cherry-pick.
#   MM. P1082 AC5: staged kanban noise present during a legitimately paused
#       pick rides into the --continue commit alongside the real resolution.
#   NN. P1082 AC6: Phase 2 spec-closure refuses when a foreign op is in
#       progress and the pending list is empty (the per-sha loop's own guard
#       never runs in that case).
#   OO. P1082 review follow-up: foreign CHERRY_PICK_HEAD + unstaged (not
#       staged) spec noise + empty pending list still refuses via the AC6
#       guard — noise never silently rides through Phase 2's git mv.
#   PP. P1094 item 1: closing a spec moves it two directories deeper, so its
#       body's relative links must be rewritten to still resolve from
#       features/done/<sprint>/.
#   QQ. P1094 item 2: a --resume after Phase 1 has fully landed must not treat
#       this same run's staged Phase 2 rename as stray kanban noise.
#   RR. P1094 item 1 scoping: the re-base ratchets on links that were already
#       dead before the move, and leaves external / in-page / templated targets
#       and fenced code blocks byte-identical.
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

# Shared reaping helper (P924) — reliably reap the orphaned `bash git-ops.sh ship`
# child the SIGTERM in test M would otherwise leave running (bash 3.2 subshells
# are not exec-optimized, so $SHIP_PID is only the wrapper). Single source of
# truth shared with scripts/test-p924-sigterm-orphan-reap.sh.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/ship-reap.sh
. "$SCRIPT_DIR/lib/ship-reap.sh"

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
  # Clear any leftover git lock — SIGTERM-killed cherry-pick in test M can leave
  # index.lock behind, causing test O's manual cherry-pick to fail.
  rm -f "$SCRATCH/main/.git/index.lock"
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
# Otherwise, interrupt. reap_ship (P924) TERMs the subshell wrapper AND the
# orphaned `bash git-ops.sh ship p102` child it reparents (bash 3.2 does not
# exec-optimize the subshell, so $SHIP_PID is only the wrapper), then polls
# until no ship process survives — so the orphan cannot re-create
# .git/index.lock and race test N's git ops at the M→N boundary.
if kill -0 "$SHIP_PID" 2>/dev/null; then
  reap_ship "$SHIP_PID" "$SCRATCH/main" p102
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
  # Clear any leftover index.lock that SIGTERM may have left if it arrived during
  # a cherry-pick. Must happen before cherry-pick --skip (which also needs the lock).
  rm -f "$SCRATCH/main/.git/index.lock"
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
# Q2: the K output (captured above) must not CLAIM a push happened. P919 D4 added
# staging-hop INSTRUCTIONS that legitimately print `git push origin ...` commands
# for the human to run — those are imperative guidance, not an auto-push. So forbid
# push-CLAIM language (past tense / completion / real `git push` output), not the
# literal `git push` instruction. Q1 above is the real guard: cmd_ship never CALLS
# git push. A genuine accidental auto-push prints `To https://github.com/... -> main`,
# still caught here.
# `^To ` (push destination line) and ` -> ` (ref-update line) are emitted by EVERY
# real git push — local bare remote OR github — and never appear in the hop's
# instruction text, so they catch an accidental auto-push in the scratch-repo tests
# (which have no `To https://github.com` header).
if echo "$K_OUT" | grep -qiE 'pushed to|pushing to main|push (complete|succeeded|done)|to https://github\.com|^to |[[:space:]]->[[:space:]]'; then
  echo "$K_OUT" >&2
  fail "Q: ship output claims a push was performed"
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
# U. CURRENT_SPRINT file takes priority over alphabetically-latest directory.
#    Regression guard: before P790 fix, sort -V ranked uat/ after date dirs,
#    causing specs to ship to features/done/uat/ instead of the current sprint.
# -----------------------------------------------------------------------------

(
  cd "$SCRATCH/main"
  mkdir -p features/done/uat features/done/2026-04-22
  echo "features/done/2026-04-22/" > features/done/CURRENT_SPRINT
  git add features/done/uat features/done/CURRENT_SPRINT
  git commit -qm "chore: add uat dir + CURRENT_SPRINT"

  git checkout -q -b feature/p108-sprint-routing
  echo u1 > p108-u1.txt && git add p108-u1.txt && git commit -qm "p108: commit 1"
  git checkout -q main
) >/dev/null
cat > "$SCRATCH/main/features/p108_sprint_routing.md" <<'EOF'
---
status: qa
type: task
rank: 1
tags: []
---
# p108: CURRENT_SPRINT routing test
EOF
( cd "$SCRATCH/main" && git add features/p108_sprint_routing.md && git commit -qm "chore: add p108" ) >/dev/null

U_OUT="$(cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p108)"
if ! echo "$U_OUT" | grep -qF 'Ready to push'; then
  echo "$U_OUT" >&2
  fail "U: CURRENT_SPRINT ship did not complete"
fi
if [[ ! -f "$SCRATCH/main/features/done/2026-04-22/p108_sprint_routing.md" ]]; then
  fail "U: spec not in CURRENT_SPRINT dir (features/done/2026-04-22/) — check resolve_ship_sprint_dir"
fi
if [[ -f "$SCRATCH/main/features/done/uat/p108_sprint_routing.md" ]]; then
  fail "U: spec incorrectly routed to features/done/uat/ — sort-V regression"
fi
pass "U: CURRENT_SPRINT file routes spec to correct sprint, not uat/"

# -----------------------------------------------------------------------------
# U2. Fallback path: no CURRENT_SPRINT file, non-date siblings present.
#     Exercises the [0-9][0-9][0-9][0-9]*/ glob filter — uat/ and zzz-archive/
#     must be excluded, and the newest date dir wins.
# -----------------------------------------------------------------------------

(
  cd "$SCRATCH/main"
  # Remove CURRENT_SPRINT so ship uses the fallback directory selection (not the
  # CURRENT_SPRINT path tested by U). Before Fix 2, the stale staged deletion from
  # U's spec-close accidentally made this commit non-empty; with Fix 2 the staging
  # area is clean, so we need real content in the new dirs.
  git rm -q features/done/CURRENT_SPRINT
  mkdir -p features/done/zzz-archive features/done/2026-03-01
  touch features/done/zzz-archive/.gitkeep features/done/2026-03-01/.gitkeep
  git add features/done/zzz-archive/.gitkeep features/done/2026-03-01/.gitkeep
  git commit -qm "chore: rm CURRENT_SPRINT; add zzz-archive and 2026-03-01 for U2"

  git checkout -q -b feature/p109-fallback-routing
  echo u2 > p109-u2.txt && git add p109-u2.txt && git commit -qm "p109: commit 1"
  git checkout -q main
) >/dev/null
cat > "$SCRATCH/main/features/p109_fallback_routing.md" <<'EOF'
---
status: qa
type: task
rank: 1
tags: []
---
# p109: fallback routing test (no CURRENT_SPRINT)
EOF
( cd "$SCRATCH/main" && git add features/p109_fallback_routing.md && git commit -qm "chore: add p109" ) >/dev/null

U2_OUT="$(cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p109)"
if ! echo "$U2_OUT" | grep -qF 'Ready to push'; then
  echo "$U2_OUT" >&2
  fail "U2: fallback ship did not complete"
fi
if [[ ! -f "$SCRATCH/main/features/done/2026-04-22/p109_fallback_routing.md" ]]; then
  fail "U2: spec not in newest date dir (2026-04-22/) — glob filter or sort-V regression"
fi
if [[ -f "$SCRATCH/main/features/done/uat/p109_fallback_routing.md" ]] || \
   [[ -f "$SCRATCH/main/features/done/zzz-archive/p109_fallback_routing.md" ]]; then
  fail "U2: spec routed to non-date sibling — [0-9][0-9][0-9][0-9]*/ glob filter broken"
fi
pass "U2: fallback selects newest date dir, ignores uat/ and zzz-archive/"

# -----------------------------------------------------------------------------
# V. Self-modifying ship guard (P795): ship refuses if branch touches
#    scripts/git-ops.sh. Main HEAD must be unchanged; no journal file left.
# -----------------------------------------------------------------------------

(
  cd "$SCRATCH/main"
  git checkout -q -b feature/p110-self-mod
  echo "# p795 canary patch" >> scripts/git-ops.sh
  git add scripts/git-ops.sh
  git commit -qm "p110: modify git-ops.sh"
  git checkout -q main
) >/dev/null
cat > "$SCRATCH/main/features/p110_demo.md" <<'EOF'
---
status: qa
type: task
rank: 1
tags: []
delivery_stage: fix
pipeline_ran: [fix]
---
# p110: self-mod guard test
EOF
( cd "$SCRATCH/main" && git add "features/p110_demo.md" && git commit -qm "chore: add p110 spec" ) >/dev/null
# Capture HEAD after all setup commits; ship must not advance it further.
V_MAIN_HEAD_PRE="$( cd "$SCRATCH/main" && git rev-parse HEAD )"

set +e
V_OUT="$( cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p110 )"
V_EXIT=$?
set -e
if [[ $V_EXIT -eq 0 ]]; then
  echo "$V_OUT" >&2
  fail "V: ship succeeded on a branch that modifies scripts/git-ops.sh — expected refusal"
fi
if ! echo "$V_OUT" | grep -qF 'modifies scripts/git-ops.sh'; then
  echo "$V_OUT" >&2
  fail "V: refusal message does not contain 'modifies scripts/git-ops.sh'"
fi
V_MAIN_HEAD_POST="$( cd "$SCRATCH/main" && git rev-parse HEAD )"
if [[ "$V_MAIN_HEAD_PRE" != "$V_MAIN_HEAD_POST" ]]; then
  fail "V: main HEAD changed after refusal — expected no change (pre=$V_MAIN_HEAD_PRE post=$V_MAIN_HEAD_POST)"
fi
if [[ -f "$SCRATCH/main/.claude/worktrees/.ship-journal/p110.json" ]]; then
  fail "V: journal file exists after refusal — expected cleanup"
fi
( cd "$SCRATCH/main" && git branch -D feature/p110-self-mod 2>/dev/null ) >/dev/null || true
pass "V: ship refuses branch that modifies scripts/git-ops.sh; main unchanged; no journal left"

# -----------------------------------------------------------------------------
# W. next-p-number.sh deduplication (P795): deleted P-numbers are not reused.
#    Scratch repo: create features/p200_test.md, commit, git-rm, commit deletion.
#    next-p-number.sh must return > 200.
# -----------------------------------------------------------------------------

W_SCRATCH="$(mktemp -d)"
mkdir -p "$W_SCRATCH/scripts" "$W_SCRATCH/features"
cp "$REPO_ROOT/scripts/next-p-number.sh" "$W_SCRATCH/scripts/"
(
  cd "$W_SCRATCH"
  git init -q
  git config user.email canary@test
  git config user.name canary
  git config commit.gpgsign false
  git branch -M main
  echo "seed" > README.md
  git add README.md
  git commit -qm "seed"
  cat > features/p200_test.md <<'SPECEOF'
---
status: qa
type: task
rank: 1
tags: []
---
# p200: deleted spec
SPECEOF
  git add features/p200_test.md
  git commit -qm "chore: add p200"
  git rm -q features/p200_test.md
  git commit -qm "chore: rm p200"
) >/dev/null

W_NUM="$(bash "$W_SCRATCH/scripts/next-p-number.sh")"
if [[ -z "$W_NUM" ]] || (( W_NUM <= 200 )); then
  fail "W: next-p-number returned $W_NUM — expected > 200 (deleted P200 must not be reused)"
fi
rm -rf "$W_SCRATCH"
pass "W: next-p-number skips deleted P200 (returned $W_NUM)"

# X. Untracked spec guard (P796): ship refuses on fresh run when main has an
#    untracked copy of the spec being shipped. Main HEAD must be unchanged;
#    journal must be cleaned up (journal_exists == 0 path).
# Setup: spec committed on feature branch but NOT on main; main has it untracked.
# (scratch_feature always commits the spec to main — cannot be used here.)
# -----------------------------------------------------------------------------

(
  cd "$SCRATCH/main"
  git checkout -q -b feature/p113-demo
  cat > "features/p113_demo.md" <<'SPECEOF'
---
status: qa
type: task
rank: 1
tags: []
delivery_stage: fix
pipeline_ran: [fix]
---
# p113: untracked guard test
SPECEOF
  echo "c1" > p113-c1.txt
  git add features/p113_demo.md p113-c1.txt
  git commit -qm "p113: add spec + content"
  git checkout -q main
) >/dev/null
# Place spec in main working tree as untracked (simulates /create-bug: written
# to disk but not committed to main before /fix picks it up on the branch).
cat > "$SCRATCH/main/features/p113_demo.md" <<'SPECEOF'
---
status: qa
type: task
rank: 1
tags: []
delivery_stage: fix
pipeline_ran: [fix]
---
# p113: untracked guard test
SPECEOF
X_MAIN_HEAD_PRE="$( cd "$SCRATCH/main" && git rev-parse HEAD )"

set +e
X_OUT="$( cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p113 )"
X_EXIT=$?
set -e
if [[ $X_EXIT -eq 0 ]]; then
  echo "$X_OUT" >&2
  fail "X: ship succeeded despite untracked spec file — expected refusal"
fi
if ! echo "$X_OUT" | grep -qF 'untracked'; then
  echo "$X_OUT" >&2
  fail "X: refusal message does not contain 'untracked'"
fi
X_MAIN_HEAD_POST="$( cd "$SCRATCH/main" && git rev-parse HEAD )"
if [[ "$X_MAIN_HEAD_PRE" != "$X_MAIN_HEAD_POST" ]]; then
  fail "X: main HEAD changed after refusal (pre=$X_MAIN_HEAD_PRE post=$X_MAIN_HEAD_POST)"
fi
if [[ -f "$SCRATCH/main/.claude/worktrees/.ship-journal/p113.json" ]]; then
  fail "X: journal file exists after fresh-run refusal — expected cleanup"
fi
rm -f "$SCRATCH/main/features/p113_demo.md"
scratch_reset p113
pass "X: ship refuses untracked spec (fresh run); HEAD unchanged; journal cleaned up"

# X2. Untracked spec guard on --resume: journal must be preserved (not deleted)
#     when guard fires on a resume run (journal_exists == 1 path).
# Setup: same as X (spec on branch, untracked on main) but with a pre-existing
# journal to simulate --resume after a partial ship.
# -----------------------------------------------------------------------------

(
  cd "$SCRATCH/main"
  git checkout -q -b feature/p113-demo
  cat > "features/p113_demo.md" <<'SPECEOF2'
---
status: qa
type: task
rank: 1
tags: []
delivery_stage: fix
pipeline_ran: [fix]
---
# p113: untracked guard test (resume)
SPECEOF2
  echo "c1" > p113-c1.txt
  git add features/p113_demo.md p113-c1.txt
  git commit -qm "p113: add spec + content (resume test)"
  git checkout -q main
) >/dev/null
# Plant a pre-existing journal (simulates a partial ship that was interrupted).
mkdir -p "$SCRATCH/main/.claude/worktrees/.ship-journal"
printf '{"source_branch":"feature/p113-demo","spec_file":"features/p113_demo.md","spec_closed":false,"commits":[]}\n' \
  > "$SCRATCH/main/.claude/worktrees/.ship-journal/p113.json"
# Re-create untracked spec.
cat > "$SCRATCH/main/features/p113_demo.md" <<'SPECEOF'
---
status: qa
type: task
rank: 1
tags: []
delivery_stage: fix
pipeline_ran: [fix]
---
# p113: untracked guard test (resume)
SPECEOF

set +e
X2_OUT="$( cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p113 --resume )"
X2_EXIT=$?
set -e
if [[ $X2_EXIT -eq 0 ]]; then
  echo "$X2_OUT" >&2
  fail "X2: --resume succeeded despite untracked spec — expected refusal"
fi
if [[ ! -f "$SCRATCH/main/.claude/worktrees/.ship-journal/p113.json" ]]; then
  fail "X2: --resume guard deleted journal — journal must be preserved on resume"
fi
rm -f "$SCRATCH/main/features/p113_demo.md"
rm -f "$SCRATCH/main/.claude/worktrees/.ship-journal/p113.json"
scratch_reset p113
pass "X2: untracked spec guard on --resume; journal preserved"

# Y. Cherry-pick diagnostic output (P796): on cherry-pick conflict, ship must
#    emit the cherry-pick output and git status — not just the bare error line.
# -----------------------------------------------------------------------------

# Set up feature branch manually (don't use scratch_feature — it doesn't
# create a file we can conflict with).
(
  cd "$SCRATCH/main"
  git checkout -q -b feature/p114-demo
  echo "branch version" > conflict_y.txt
  git add conflict_y.txt
  git commit -qm "p114: commit 1"
  git checkout -q main
) >/dev/null
# Spec on main (required for ship spec-close):
cat > "$SCRATCH/main/features/p114_demo.md" <<'SPECEOF'
---
status: qa
type: task
rank: 1
tags: []
delivery_stage: fix
pipeline_ran: [fix]
---
# p114: diagnostic output test
SPECEOF
( cd "$SCRATCH/main" && git add "features/p114_demo.md" \
  && git commit -qm "chore: add p114 spec" ) >/dev/null
# Commit conflicting content to SAME file on main.
echo "main version" > "$SCRATCH/main/conflict_y.txt"
( cd "$SCRATCH/main" && git add conflict_y.txt \
  && git commit -qm "chore: conflict base for Y" ) >/dev/null
Y_MAIN_HEAD_PRE="$( cd "$SCRATCH/main" && git rev-parse HEAD )"

set +e
Y_OUT="$( cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p114 )"
Y_EXIT=$?
set -e
if [[ $Y_EXIT -eq 0 ]]; then
  echo "$Y_OUT" >&2
  fail "Y: ship succeeded despite cherry-pick conflict — expected failure"
fi
# Verify diagnostic output is present (Fix 1).
if ! echo "$Y_OUT" | grep -qF '#CP_DIAGNOSTIC_BEGIN'; then
  echo "$Y_OUT" >&2
  fail "Y: ship output lacks #CP_DIAGNOSTIC_BEGIN sentinel — Fix 1 diagnostic not emitted"
fi
if ! echo "$Y_OUT" | grep -qE 'conflict_y\.txt|git status'; then
  echo "$Y_OUT" >&2
  fail "Y: ship diagnostic does not mention the conflicting file or git status"
fi
# Clean up mid-conflict state — use --skip (not --abort, which is banned) then force-reset.
( cd "$SCRATCH/main" && git cherry-pick --skip >/dev/null 2>&1 ) || true
( cd "$SCRATCH/main" && rm -rf .git/sequencer \
  && git reset --hard "$Y_MAIN_HEAD_PRE" ) >/dev/null 2>&1 || true
rm -f "$SCRATCH/main/conflict_y.txt"
scratch_reset p114
pass "Y: ship emits diagnostic sentinel and conflicting filename on cherry-pick failure"

# -----------------------------------------------------------------------------
# Z2. Co-located spec auto-close (P800): branch touches specs for two P-numbers
#     (p120 primary, p121 co-located). ship p120 must auto-close p121 alongside.
# -----------------------------------------------------------------------------

# p120 spec committed to main (primary — resolve_ship_spec finds this before Phase 1).
cat > "$SCRATCH/main/features/p120_colocated_a.md" <<'EOF'
---
status: qa
type: task
rank: 1
tags: [demo]
delivery_stage: fix
pipeline_ran: [fix]
---
# p120: Co-located A
Problem: co-located test A.
EOF
( cd "$SCRATCH/main" && git add features/p120_colocated_a.md \
  && git commit -qm "chore: add p120 spec" ) >/dev/null

# Feature branch: source commit + p121 spec creation.
# p121 only exists on the branch; Phase 1 cherry-picks bring it to main so
# Phase 2b can resolve and close it.
( cd "$SCRATCH/main" && git checkout -q -b feature/p120-colocated ) >/dev/null
echo "fix_a" > "$SCRATCH/main/p120_fix.txt"
# Use past timestamps so cherry-pick committer dates (current time) produce different
# SHAs — prevents git log main..branch from returning empty when cherry-picks happen
# in the same second as the original commits.
( cd "$SCRATCH/main" && GIT_AUTHOR_DATE="2024-01-01T10:00:00" GIT_COMMITTER_DATE="2024-01-01T10:00:00" \
  git add p120_fix.txt && git commit -qm "p120: fix a" ) >/dev/null
cat > "$SCRATCH/main/features/p121_colocated_b.md" <<'EOF'
---
status: qa
type: task
rank: 2
tags: [demo]
delivery_stage: fix
pipeline_ran: [fix]
---
# p121: Co-located B
Problem: co-located test B.
EOF
( cd "$SCRATCH/main" && GIT_AUTHOR_DATE="2024-01-01T10:01:00" GIT_COMMITTER_DATE="2024-01-01T10:01:00" \
  git add features/p121_colocated_b.md && git commit -qm "p121: add spec" ) >/dev/null
( cd "$SCRATCH/main" && git checkout -q main ) >/dev/null

Z2_OUT="$(cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p120)"

# Primary spec moved.
if [[ ! -f "$SCRATCH/main/features/done/2026-04-22/p120_colocated_a.md" ]]; then
  echo "$Z2_OUT" >&2
  fail "Z2: p120 spec not moved to done/ — primary spec close failed"
fi
# Co-located spec auto-closed.
if [[ ! -f "$SCRATCH/main/features/done/2026-04-22/p121_colocated_b.md" ]]; then
  echo "$Z2_OUT" >&2
  fail "Z2: p121 spec not moved to done/ — co-located auto-close failed"
fi
if [[ -f "$SCRATCH/main/features/p121_colocated_b.md" ]]; then
  echo "$Z2_OUT" >&2
  fail "Z2: p121 spec still in features/ after co-located close"
fi
# Frontmatter rewritten on co-located spec.
if ! grep -q '^status: all-done$' "$SCRATCH/main/features/done/2026-04-22/p121_colocated_b.md"; then
  fail "Z2: p121 status not rewritten to all-done by co-located close"
fi
# Branch deleted.
if ( cd "$SCRATCH/main" && git rev-parse --verify feature/p120-colocated >/dev/null 2>&1 ); then
  echo "$Z2_OUT" >&2
  fail "Z2: feature/p120-colocated branch was not deleted after ship"
fi
pass "Z2: co-located spec p121 auto-closed alongside primary p120 ship"

# -----------------------------------------------------------------------------
# P920: no-branch direct-to-main closure path.
#
#   AA.  Happy path: a qa spec on main with a 'pN ready for QA' stamp commit and
#        NO feature/fix branch → spec closes (moved to done/, status all-done,
#        completed_at set, delivery_stage dropped), exits 0, no journal created,
#        main.lock released, "Ready to push" printed.
#   BB.  False-merge guard (Done-When #2 / epistemic gate 7): a qa spec on main
#        with NO 'ready for QA' stamp commit → STOPs non-zero, spec NOT moved.
#   CC.  No branch AND no resolvable spec → original "no … branch found" error
#        (closure path does not mask a genuinely missing branch).
#   DD.  Status gate: a 'week' spec with no branch → STOPs non-zero (unstarted
#        work is not closable as direct-to-main), independent of the stamp.
# -----------------------------------------------------------------------------

# Create a spec on main at $2 status, optionally with a 'pN ready for QA' stamp
# commit ($3=1), and NO feature/fix branch. Mirrors the direct-to-main case.
scratch_direct_to_main() {
  local pn="$1"; local st="$2"; local with_stamp="$3"
  cat > "$SCRATCH/main/features/${pn}_demo.md" <<EOF
---
status: ${st}
type: task
rank: 1
tags: [demo]
delivery_stage: dev
pipeline_ran: [dev]
---
# ${pn}: Demo direct-to-main

Problem: demo.
EOF
  ( cd "$SCRATCH/main" && git add "features/${pn}_demo.md" \
      && git commit -qm "chore: file ${pn} spec" ) >/dev/null
  if [[ "$with_stamp" == "1" ]]; then
    echo "impl-${pn}" > "$SCRATCH/main/${pn}-impl.txt"
    ( cd "$SCRATCH/main" && git add "${pn}-impl.txt" \
        && git commit -qm "chore: ${pn} ready for QA — direct-to-main impl" ) >/dev/null
  fi
}

# AA. Happy path -------------------------------------------------------------
scratch_direct_to_main p130 qa 1
AA_OUT="$(cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p130)"
if [[ ! -f "$SCRATCH/main/features/done/2026-04-22/p130_demo.md" ]]; then
  echo "$AA_OUT" >&2
  fail "AA: spec not moved to features/done/2026-04-22/ in no-branch closure"
fi
if [[ -f "$SCRATCH/main/features/p130_demo.md" ]]; then
  echo "$AA_OUT" >&2
  fail "AA: spec remains in features/ after no-branch closure"
fi
if ! grep -q '^status: all-done$' "$SCRATCH/main/features/done/2026-04-22/p130_demo.md"; then
  fail "AA: status not set to all-done in no-branch closure"
fi
if ! grep -qE '^completed_at: ' "$SCRATCH/main/features/done/2026-04-22/p130_demo.md"; then
  fail "AA: completed_at not set in no-branch closure"
fi
if grep -q '^delivery_stage:' "$SCRATCH/main/features/done/2026-04-22/p130_demo.md"; then
  fail "AA: delivery_stage not removed in no-branch closure"
fi
# A closure commit landed on main referencing p130. (grep -c reads the whole
# stream — avoids the SIGPIPE that `git log | grep -q` hits under pipefail.)
AA_LANDED="$(cd "$SCRATCH/main" && git log --oneline main 2>/dev/null | grep -c 'close p130 (direct-to-main)' || true)"
if [[ "$AA_LANDED" == "0" ]]; then
  echo "$AA_OUT" >&2
  fail "AA: no 'close p130 (direct-to-main)' commit on main"
fi
# No journal created for the no-branch path.
if [[ -f "$SCRATCH/main/.claude/worktrees/.ship-journal/p130.json" ]]; then
  fail "AA: journal file created for no-branch closure (should be none)"
fi
# main.lock released.
if [[ -f "$SCRATCH/main/.claude/worktrees/main.lock" ]]; then
  fail "AA: main.lock not released after no-branch closure"
fi
if ! echo "$AA_OUT" | grep -qF 'Ready to push'; then
  echo "$AA_OUT" >&2
  fail "AA: output did not contain 'Ready to push'"
fi
if ! echo "$AA_OUT" | grep -qF 'no branch — closing p130'; then
  echo "$AA_OUT" >&2
  fail "AA: output did not log the no-branch closure path"
fi
pass "AA: no-branch closure closes a qa spec with a 'ready for QA' stamp on main"

# BB. False-merge guard (epistemic gate 7) -----------------------------------
scratch_direct_to_main p131 qa 0   # qa status, but NO 'ready for QA' stamp
set +e
BB_OUT=$( cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p131 )
BB_EXIT=$?
set -e
echo "BB exit code: $BB_EXIT"   # evidence for Done-When #2
if [[ $BB_EXIT -eq 0 ]]; then
  echo "$BB_OUT" >&2
  fail "BB: ship closed a spec with NO 'ready for QA' stamp — false-merge guard did not fire"
fi
if ! echo "$BB_OUT" | grep -qF 'ready for QA'; then
  echo "$BB_OUT" >&2
  fail "BB: refusal message does not mention the missing 'ready for QA' stamp"
fi
if [[ ! -f "$SCRATCH/main/features/p131_demo.md" ]]; then
  echo "$BB_OUT" >&2
  fail "BB: spec was moved despite the false-merge guard refusal"
fi
if [[ -f "$SCRATCH/main/features/done/2026-04-22/p131_demo.md" ]]; then
  fail "BB: spec landed in done/ despite the false-merge guard refusal"
fi
pass "BB: false-merge guard STOPs (non-zero) when no 'ready for QA' stamp is on main"

# CC. No branch AND no spec → original error ---------------------------------
set +e
CC_OUT=$( cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p199 )
CC_EXIT=$?
set -e
if [[ $CC_EXIT -eq 0 ]]; then
  echo "$CC_OUT" >&2
  fail "CC: ship succeeded with no branch and no spec — expected the original error"
fi
if ! echo "$CC_OUT" | grep -qF 'no feature/p199-* or fix/p199-* branch found'; then
  echo "$CC_OUT" >&2
  fail "CC: missing-branch-with-no-spec did not produce the original 'no branch found' error"
fi
pass "CC: no branch + no spec still produces the original 'no branch found' error"

# DD. Status gate ------------------------------------------------------------
scratch_direct_to_main p132 week 0
set +e
DD_OUT=$( cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p132 )
DD_EXIT=$?
set -e
if [[ $DD_EXIT -eq 0 ]]; then
  echo "$DD_OUT" >&2
  fail "DD: ship closed a 'week' spec — status gate did not fire"
fi
if ! echo "$DD_OUT" | grep -qiE "status 'week'|not yet implemented|not closable"; then
  echo "$DD_OUT" >&2
  fail "DD: status-gate refusal message missing the expected status diagnostic"
fi
if [[ ! -f "$SCRATCH/main/features/p132_demo.md" ]]; then
  fail "DD: 'week' spec was moved despite the status gate refusal"
fi
pass "DD: status gate STOPs a 'week' spec with no branch"

# EE. in-progress status closes too (the case accepts qa|in-progress) ---------
scratch_direct_to_main p133 in-progress 1
EE_OUT="$(cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p133)"
if [[ ! -f "$SCRATCH/main/features/done/2026-04-22/p133_demo.md" ]]; then
  echo "$EE_OUT" >&2
  fail "EE: in-progress spec not closed (moved to done/) in no-branch closure"
fi
if ! grep -q '^status: all-done$' "$SCRATCH/main/features/done/2026-04-22/p133_demo.md"; then
  fail "EE: in-progress spec status not rewritten to all-done"
fi
EE_LANDED="$(cd "$SCRATCH/main" && git log --oneline main 2>/dev/null | grep -c 'close p133 (direct-to-main)' || true)"
if [[ "$EE_LANDED" == "0" ]]; then
  echo "$EE_OUT" >&2
  fail "EE: no 'close p133 (direct-to-main)' commit on main"
fi
pass "EE: no-branch closure also closes an in-progress spec with a stamp"

# FF. Subject-anchor hardening (P920 adversarial review, gate 7): a commit that
# mentions 'pN ready for QA' only in its BODY (e.g. a sibling spec's stamp, or a
# chat-paste) must NOT qualify as the stamp — only a SUBJECT match counts. The
# bare --grep would match this commit; the post-review subject re-check rejects it.
cat > "$SCRATCH/main/features/p134_demo.md" <<EOF
---
status: qa
type: task
rank: 1
tags: [demo]
delivery_stage: dev
pipeline_ran: [dev]
---
# p134: Demo direct-to-main

Problem: demo.
EOF
( cd "$SCRATCH/main" && git add "features/p134_demo.md" && git commit -qm "chore: file p134 spec" ) >/dev/null
# Tokens ONLY in the body; generic subject (sibling-stamp / chat-paste shape).
echo "x" > "$SCRATCH/main/p134x.txt"
( cd "$SCRATCH/main" && git add p134x.txt \
    && git commit -q -m "chore: unrelated refactor" -m "incidentally p134 ready for QA per chat" ) >/dev/null
set +e
FF_OUT=$( cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p134 )
FF_EXIT=$?
set -e
echo "FF exit code: $FF_EXIT"   # evidence: subject-anchor reject path fires
if [[ $FF_EXIT -eq 0 ]]; then
  echo "$FF_OUT" >&2
  fail "FF: closed off a BODY-only 'ready for QA' mention — subject-anchor hardening did not fire"
fi
if ! echo "$FF_OUT" | grep -qiE "qualifying|stamp|ready for QA"; then
  echo "$FF_OUT" >&2
  fail "FF: refusal message missing the stamp diagnostic"
fi
if [[ ! -f "$SCRATCH/main/features/p134_demo.md" ]]; then
  fail "FF: spec was moved despite the subject-anchor refusal"
fi
pass "FF: a body-only 'ready for QA' mention does NOT qualify as a stamp (subject-anchor)"

# GG. Post-acquire branch race (P920 adversarial review, gate 7): a co-tenant
# creates feature/pN-* AFTER the pre-lock no-branch decision but before closure.
# The post-acquire re-verification must catch it and die (no silent wrong-close of
# the stale spec). Deterministic via SHIP_DEBUG_NOBRANCH_SLEEP_SECS.
scratch_direct_to_main p135 qa 1   # qa spec + stamp, NO branch at start
(
  cd "$SCRATCH/main" && SHIP_DEBUG_NOBRANCH_SLEEP_SECS=3 bash "$GIT_OPS" ship p135
) >"$SCRATCH/gg-ship.log" 2>&1 &
GG_PID=$!
# While ship sleeps inside the lock, a co-tenant creates the branch (the race).
sleep 1
( cd "$SCRATCH/main" && git branch "feature/p135-raced" main ) >/dev/null 2>&1 || true
set +e
wait "$GG_PID"; GG_EXIT=$?
set -e
echo "GG exit code: $GG_EXIT"   # evidence: race guard fires
GG_OUT="$(cat "$SCRATCH/gg-ship.log")"
if [[ $GG_EXIT -eq 0 ]]; then
  echo "$GG_OUT" >&2
  fail "GG: ship closed the spec despite a branch appearing post-lock — race guard did not fire"
fi
if ! echo "$GG_OUT" | grep -qiE "branch.*appeared|take the normal branch path"; then
  echo "$GG_OUT" >&2
  fail "GG: refusal message did not name the appeared-branch race"
fi
if [[ ! -f "$SCRATCH/main/features/p135_demo.md" ]]; then
  echo "$GG_OUT" >&2
  fail "GG: spec was moved despite the post-acquire race guard"
fi
# Lock released even though we died mid-arm.
if [[ -f "$SCRATCH/main/.claude/worktrees/main.lock" ]]; then
  fail "GG: main.lock not released after the race-guard die"
fi
( cd "$SCRATCH/main" && git branch -D feature/p135-raced >/dev/null 2>&1 ) || true
pass "GG: post-acquire re-verification dies safely when a branch appears mid-closure"

# -----------------------------------------------------------------------------
# HH/II/JJ: branch-born spec AA infinite-loop fix (plan v2 seed-to-match).
#
#   HH. Branch-born AA (prevention): spec created on branch, FINAL seeded on
#       main. ship completes cleanly (no AA conflict) after fix; infinite loop
#       on current code.
#   II. Anti-widening guards: (a) non-spec UU still dies; (b) body-mismatch AA
#       (FINAL on main differs from branch-tip) still dies.
#   JJ. Per-iteration op-in-progress guard: a CHERRY_PICK_HEAD matching the
#       current sha is allowed (resume); a foreign MERGE_HEAD dies.
# -----------------------------------------------------------------------------

# Build a branch-born scenario: spec CREATED on branch (stub commit A + edit
# commit B), FINAL seeded on main (mirrors the recovery prose that triggered AA).
# Post-fix, ship should resolve via seed-to-match (Layer 1) or AA safety net
# (Layer 2) and complete cleanly.
scratch_branch_born_spec() {
  local pn="$1"
  local br="feature/${pn}-bborn"
  (
    cd "$SCRATCH/main"
    git checkout -q -b "$br"
    # Commit A: spec creation (stub)
    cat > "features/${pn}_bborn.md" <<SPECEOF
---
status: in-progress
type: task
rank: 1
tags: [demo]
---
# ${pn}: Branch-born stub

Initial stub.
SPECEOF
    git add "features/${pn}_bborn.md"
    git commit -qm "${pn}: start feature"
    # Commit B: edit to final
    cat > "features/${pn}_bborn.md" <<SPECEOF
---
status: qa
type: task
rank: 1
tags: [demo]
delivery_stage: fix
pipeline_ran: [fix]
---
# ${pn}: Branch-born final

Problem: demo.
SPECEOF
    git add "features/${pn}_bborn.md"
    git commit -qm "chore: ${pn} ready for QA"
    git checkout -q main
  ) >/dev/null
  # Seed FINAL on main (manual recovery as prose says — creates AA without fix).
  cat > "$SCRATCH/main/features/${pn}_bborn.md" <<SPECEOF
---
status: qa
type: task
rank: 1
tags: [demo]
delivery_stage: fix
pipeline_ran: [fix]
---
# ${pn}: Branch-born final

Problem: demo.
SPECEOF
  ( cd "$SCRATCH/main" && git add "features/${pn}_bborn.md" && \
    git commit -qm "seed ${pn} final spec for ship" ) >/dev/null
}

# ── HH: branch-born AA, fixed ───────────────────────────────────────────────
scratch_branch_born_spec p140
HH_OUT="$(cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p140 2>&1)" || true
HH_RC=${PIPESTATUS[0]:-$?}
# After fix: ship completes without AA loop.
if ! echo "$HH_OUT" | grep -qF 'Ready to push'; then
  echo "HH output (ship p140):"
  echo "$HH_OUT"
  fail "HH: ship did not reach 'Ready to push' (AA infinite-loop not fixed or Layer 1 seeding failed)"
fi
if [[ -f "$SCRATCH/main/features/p140_bborn.md" ]]; then
  echo "$HH_OUT" >&2
  fail "HH: spec still in features/ after ship (Phase 2 did not close it)"
fi
if [[ ! -f "$SCRATCH/main/features/done/2026-04-22/p140_bborn.md" ]]; then
  echo "$HH_OUT" >&2
  fail "HH: spec not moved to features/done/2026-04-22/"
fi
if ! grep -q '^status: all-done$' "$SCRATCH/main/features/done/2026-04-22/p140_bborn.md"; then
  fail "HH: status not set to all-done"
fi
if ( cd "$SCRATCH/main" && git rev-parse --verify feature/p140-bborn >/dev/null 2>&1 ); then
  fail "HH: branch not deleted after ship"
fi
if [[ -f "$SCRATCH/main/.claude/worktrees/main.lock" ]]; then
  fail "HH: main.lock not released"
fi
pass "HH: branch-born AA ship completes cleanly (seed-to-match prevention works)"

# ── II: anti-widening — non-spec UU and body-mismatch AA still die ──────────

# II-a: real non-spec UU conflict must not be auto-resolved.
# Create a branch that conflicts on a non-spec file.
(
  cd "$SCRATCH/main"
  git checkout -q -b feature/p141-uu
  echo "branch-version" > "p141-data.txt"
  git add "p141-data.txt"
  git commit -qm "p141: data file"
  git checkout -q main
  echo "main-version" > "p141-data.txt"
  git add "p141-data.txt"
  git commit -qm "seed p141 data file on main (diverged from branch)"
) >/dev/null
cat > "$SCRATCH/main/features/p141_uu.md" <<'SPECEOF'
---
status: qa
type: task
rank: 1
tags: [demo]
---
# p141: UU anti-widen test

Problem: demo.
SPECEOF
( cd "$SCRATCH/main" && git add features/p141_uu.md && git commit -qm "chore: add p141 spec" ) >/dev/null

IIa_RC=0
IIa_OUT="$(cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p141 2>&1)" || IIa_RC=$?
# Must fail (UU on data file is a real conflict, not auto-resolvable).
if [[ $IIa_RC -eq 0 ]]; then
  echo "$IIa_OUT" >&2
  fail "II-a: ship succeeded despite a UU conflict on a non-spec file (Layer 2 widened)"
fi
if ! echo "$IIa_OUT" | grep -qiE 'conflict|cherry-pick'; then
  echo "$IIa_OUT" >&2
  fail "II-a: ship failed but did not emit a conflict diagnostic"
fi
# Clean up sequencer and branch.
( cd "$SCRATCH/main" && git cherry-pick --abort 2>/dev/null || true
  git branch -D feature/p141-uu 2>/dev/null || true
  git checkout -q main 2>/dev/null || true
  rm -f ".claude/worktrees/.ship-journal/p141.json" ) >/dev/null 2>&1 || true
pass "II-a: non-spec UU conflict still dies (Layer 2 did not widen to non-spec paths)"

# II-b: body-mismatch AA on a spec file must not be auto-resolved.
# Branch has CREATION+FINAL; main has a WRONG FINAL (different body).
(
  cd "$SCRATCH/main"
  git checkout -q -b feature/p142-bodymismatch
  cat > "features/p142_bm.md" <<'SPECEOF'
---
status: in-progress
type: task
rank: 1
tags: [demo]
---
# p142: Body-mismatch stub

Initial stub.
SPECEOF
  git add "features/p142_bm.md"
  git commit -qm "p142: start feature"
  cat > "features/p142_bm.md" <<'SPECEOF'
---
status: qa
type: task
rank: 1
tags: [demo]
delivery_stage: fix
pipeline_ran: [fix]
---
# p142: Body-mismatch final

Problem: branch body.
SPECEOF
  git add "features/p142_bm.md"
  git commit -qm "chore: p142 ready for QA"
  git checkout -q main
) >/dev/null
# Seed WRONG content on main (body differs from branch-tip).
cat > "$SCRATCH/main/features/p142_bm.md" <<'SPECEOF'
---
status: qa
type: task
rank: 1
tags: [demo]
---
# p142: Body-mismatch final

Problem: WRONG main body.
SPECEOF
( cd "$SCRATCH/main" && git add "features/p142_bm.md" && \
  git commit -qm "seed p142 wrong final spec" ) >/dev/null

IIb_RC=0
IIb_OUT="$(cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p142 2>&1)" || IIb_RC=$?
if [[ $IIb_RC -eq 0 ]]; then
  echo "$IIb_OUT" >&2
  fail "II-b: ship succeeded despite body mismatch between main and branch-tip (Layer 2 widened)"
fi
if ! echo "$IIb_OUT" | grep -qiE 'conflict|cherry-pick'; then
  echo "$IIb_OUT" >&2
  fail "II-b: ship failed but did not emit a conflict diagnostic"
fi
( cd "$SCRATCH/main" && git cherry-pick --abort 2>/dev/null || true
  git branch -D feature/p142-bodymismatch 2>/dev/null || true
  git checkout -q main 2>/dev/null || true
  rm -f ".claude/worktrees/.ship-journal/p142.json" ) >/dev/null 2>&1 || true
pass "II-b: body-mismatch AA still dies (Layer 2 did not auto-resolve diverged content)"

# ── JJ: per-iteration op-in-progress guard ──────────────────────────────────

# JJ-a: a pre-existing CHERRY_PICK_HEAD matching the current sha is NOT blocked
# (it is the resume case — the guard must exclude self).
# We simulate this via a two-commit branch: the first commit's cherry-pick
# succeeds and the sequencer sets CHERRY_PICK_HEAD for the second; --resume
# must proceed, not die.
(
  cd "$SCRATCH/main"
  git checkout -q -b feature/p143-jj
  echo "c1" > "p143-c1.txt" && git add "p143-c1.txt" && git commit -qm "p143: commit 1"
  echo "c2" > "p143-c2.txt" && git add "p143-c2.txt" && git commit -qm "p143: commit 2"
  git checkout -q main
) >/dev/null
cat > "$SCRATCH/main/features/p143_jj.md" <<'SPECEOF'
---
status: qa
type: task
rank: 1
tags: [demo]
---
# p143: JJ guard test

Problem: demo.
SPECEOF
( cd "$SCRATCH/main" && git add features/p143_jj.md && git commit -qm "chore: add p143 spec" ) >/dev/null

JJ_OUT="$(cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p143 2>&1)"
if ! echo "$JJ_OUT" | grep -qF 'Ready to push'; then
  echo "$JJ_OUT" >&2
  fail "JJ-a: normal two-commit ship failed (per-iteration guard too broad)"
fi
pass "JJ-a: per-iteration guard allows a normal ship (no spurious CHERRY_PICK_HEAD block)"

# JJ-b: a MERGE_HEAD present before cherry-pick must die.
# Set up a branch-born scenario so we can inject MERGE_HEAD before the pick loop.
(
  cd "$SCRATCH/main"
  git checkout -q -b feature/p144-jj-merge
  echo "c1" > "p144-c1.txt" && git add "p144-c1.txt" && git commit -qm "p144: commit 1"
  git checkout -q main
) >/dev/null
cat > "$SCRATCH/main/features/p144_jjb.md" <<'SPECEOF'
---
status: qa
type: task
rank: 1
tags: [demo]
---
# p144: JJ-b guard test

Problem: demo.
SPECEOF
( cd "$SCRATCH/main" && git add features/p144_jjb.md && git commit -qm "chore: add p144 spec" ) >/dev/null
# Inject a fake MERGE_HEAD before running ship.
echo "deadbeef1234567890123456789012345678dead" > "$SCRATCH/main/.git/MERGE_HEAD"
JJb_RC=0
JJb_OUT="$(cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p144 2>&1)" || JJb_RC=$?
rm -f "$SCRATCH/main/.git/MERGE_HEAD"
if [[ $JJb_RC -eq 0 ]]; then
  echo "$JJb_OUT" >&2
  fail "JJ-b: ship succeeded despite a MERGE_HEAD present (per-iteration guard missed it)"
fi
if ! echo "$JJb_OUT" | grep -qiE 'MERGE_HEAD|operation in progress|merge'; then
  echo "$JJb_OUT" >&2
  fail "JJ-b: ship failed but diagnostic did not mention MERGE_HEAD"
fi
( cd "$SCRATCH/main" && git cherry-pick --abort 2>/dev/null || true
  git branch -D feature/p144-jj-merge 2>/dev/null || true
  git checkout -q main 2>/dev/null || true
  rm -f ".claude/worktrees/.ship-journal/p144.json" ) >/dev/null 2>&1 || true
pass "JJ-b: per-iteration guard kills ship on foreign MERGE_HEAD before cherry-pick"

# -----------------------------------------------------------------------------
# KK. P1082 regression: kanban-edit discard must not clobber a resolved+staged
#     cherry-pick conflict on --resume. Build a REAL modify/modify conflict on
#     the spec file itself (main and branch each diverge from a common base),
#     resolve it with content distinguishable from BOTH sides, stage it, then
#     run --resume. The final spec content (post spec-close) must be the
#     operator's staged resolution — never main's stale pre-pick value.
# -----------------------------------------------------------------------------

(
  cd "$SCRATCH/main"
  cat > "features/p1082_demo.md" <<'SPECEOF'
---
status: qa
type: task
rank: 1
tags: [demo]
delivery_stage: fix
pipeline_ran: [fix]
---
# p1082: P1082 regression fixture

BASE - do not diverge.
SPECEOF
  git add "features/p1082_demo.md"
  git commit -qm "chore: add p1082 spec (base)"
  git checkout -q -b feature/p1082-demo
  cat > "features/p1082_demo.md" <<'SPECEOF'
---
status: qa
type: task
rank: 1
tags: [demo]
delivery_stage: fix
pipeline_ran: [fix]
---
# p1082: P1082 regression fixture

BRANCH RESOLVED VALUE - should never reach main verbatim.
SPECEOF
  echo "other-file-content" > p1082-other.txt
  git add "features/p1082_demo.md" p1082-other.txt
  git commit -qm "p1082: commit 1 (spec + other file)"
  git checkout -q main
  cat > "features/p1082_demo.md" <<'SPECEOF'
---
status: qa
type: task
rank: 1
tags: [demo]
delivery_stage: fix
pipeline_ran: [fix]
---
# p1082: P1082 regression fixture

MAIN DIVERGED VALUE - stale pre-pick content.
SPECEOF
  git add "features/p1082_demo.md"
  git commit -qm "chore: diverge p1082 spec on main"
) >/dev/null

KK_RC=0
KK_OUT="$(cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p1082 2>&1)" || KK_RC=$?
if [[ $KK_RC -eq 0 ]]; then
  echo "$KK_OUT" >&2
  fail "KK: fresh ship succeeded despite an intended spec-file conflict — fixture is not conflicting"
fi
if [[ ! -e "$SCRATCH/main/.git/CHERRY_PICK_HEAD" ]]; then
  echo "$KK_OUT" >&2
  fail "KK: no CHERRY_PICK_HEAD after conflict — expected a real paused cherry-pick"
fi

# Operator resolves with content distinct from BOTH main's stale value and the
# branch's raw value — proves the STAGED resolution (not "theirs") survives.
cat > "$SCRATCH/main/features/p1082_demo.md" <<'SPECEOF'
---
status: qa
type: task
rank: 1
tags: [demo]
delivery_stage: fix
pipeline_ran: [fix]
---
# p1082: P1082 regression fixture

RESOLVED-BY-OPERATOR - the actual merge decision.
SPECEOF
( cd "$SCRATCH/main" && git add "features/p1082_demo.md" ) >/dev/null

KK2_RC=0
KK2_OUT="$(cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p1082 --resume 2>&1)" || KK2_RC=$?
if [[ $KK2_RC -ne 0 ]]; then
  echo "$KK2_OUT" >&2
  fail "KK: --resume exited non-zero ($KK2_RC) after a clean resolution was staged"
fi
if ! echo "$KK2_OUT" | grep -qF 'Ready to push'; then
  echo "$KK2_OUT" >&2
  fail "KK: --resume output did not contain 'Ready to push'"
fi
KK_FINAL="$SCRATCH/main/features/done/2026-04-22/p1082_demo.md"
if [[ ! -f "$KK_FINAL" ]]; then
  echo "$KK2_OUT" >&2
  fail "KK: spec was not moved to features/done/2026-04-22/ after --resume"
fi
if ! grep -qF 'RESOLVED-BY-OPERATOR' "$KK_FINAL"; then
  cat "$KK_FINAL" >&2
  fail "KK: landed spec content is NOT the operator's staged resolution — discard clobbered it (P1082)"
fi
if grep -qF 'MAIN DIVERGED VALUE' "$KK_FINAL"; then
  cat "$KK_FINAL" >&2
  fail "KK: landed spec content is main's stale pre-pick value — discard clobbered the resolution (P1082)"
fi
if [[ "$(cd "$SCRATCH/main" && git log --oneline main -- p1082-other.txt | wc -l | tr -d ' ')" == "0" ]]; then
  fail "KK: p1082-other.txt never landed — cherry-pick did not apply cleanly"
fi
scratch_reset p1082
rm -f "$SCRATCH/main/p1082-other.txt" "$SCRATCH/main/features/done/2026-04-22/p1082_demo.md"
pass "KK: --resume preserves a resolved+staged spec-file conflict (P1082 regression)"

# -----------------------------------------------------------------------------
# LL. P1082 non-regression: genuine kanban noise (no CHERRY_PICK_HEAD present)
#     must still be discarded before a normal, non-conflicting cherry-pick.
# -----------------------------------------------------------------------------

scratch_feature p150 1
# Simulate a stray kanban write: dirty, uncommitted, unstaged edit to main's
# copy of the spec — no conflict pending, no CHERRY_PICK_HEAD.
echo "kanban-stray-noise" >> "$SCRATCH/main/features/p150_demo.md"

LL_OUT="$(cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p150)"
if ! echo "$LL_OUT" | grep -qF 'discarding uncommitted kanban edits'; then
  echo "$LL_OUT" >&2
  fail "LL: ship did not discard stray kanban edit when no CHERRY_PICK_HEAD is present"
fi
if ! echo "$LL_OUT" | grep -qF 'Ready to push'; then
  echo "$LL_OUT" >&2
  fail "LL: ship did not complete successfully after discarding genuine kanban noise"
fi
LL_FINAL="$SCRATCH/main/features/done/2026-04-22/p150_demo.md"
if [[ ! -f "$LL_FINAL" ]]; then
  fail "LL: spec was not moved to features/done/2026-04-22/ after ship"
fi
if grep -qF 'kanban-stray-noise' "$LL_FINAL"; then
  fail "LL: stray kanban noise survived into landed spec — genuine-noise discard regressed (P1082 fix over-widened)"
fi
scratch_reset p150
pass "LL: genuine kanban noise (no CHERRY_PICK_HEAD) is still discarded before cherry-pick"

# -----------------------------------------------------------------------------
# MM. P1082 AC5: staged kanban noise present during a legitimately paused pick
#     rides into the --continue commit ALONGSIDE the real conflict resolution
#     (documented trade-off — the discard is file-granular and cannot tell the
#     resolution's bytes from noise bytes staged in the same file).
# -----------------------------------------------------------------------------

(
  cd "$SCRATCH/main"
  cat > "features/p1092_demo.md" <<'SPECEOF'
---
status: qa
type: task
rank: 1
tags: [demo]
delivery_stage: fix
pipeline_ran: [fix]
---
# p1092: P1082 AC5 fixture

BASE - do not diverge.
SPECEOF
  git add "features/p1092_demo.md"
  git commit -qm "chore: add p1092 spec (base)"
  git checkout -q -b feature/p1092-demo
  cat > "features/p1092_demo.md" <<'SPECEOF'
---
status: qa
type: task
rank: 1
tags: [demo]
delivery_stage: fix
pipeline_ran: [fix]
---
# p1092: P1082 AC5 fixture

BRANCH RESOLVED VALUE - should never reach main verbatim.
SPECEOF
  git add "features/p1092_demo.md"
  git commit -qm "p1092: commit 1"
  git checkout -q main
  cat > "features/p1092_demo.md" <<'SPECEOF'
---
status: qa
type: task
rank: 1
tags: [demo]
delivery_stage: fix
pipeline_ran: [fix]
---
# p1092: P1082 AC5 fixture

MAIN DIVERGED VALUE - stale pre-pick content.
SPECEOF
  git add "features/p1092_demo.md"
  git commit -qm "chore: diverge p1092 spec on main"
) >/dev/null

MM_RC=0
MM_OUT="$(cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p1092 2>&1)" || MM_RC=$?
if [[ $MM_RC -eq 0 ]]; then
  echo "$MM_OUT" >&2
  fail "MM: fresh ship succeeded despite an intended spec-file conflict — fixture is not conflicting"
fi

# Operator resolves the real conflict AND, in the same staged file, a kanban
# write lands too (rank bump — a field neither side's commit touched).
cat > "$SCRATCH/main/features/p1092_demo.md" <<'SPECEOF'
---
status: qa
type: task
rank: 77
tags: [demo]
delivery_stage: fix
pipeline_ran: [fix]
---
# p1092: P1082 AC5 fixture

RESOLVED-BY-OPERATOR-MM - the actual merge decision.
SPECEOF
( cd "$SCRATCH/main" && git add "features/p1092_demo.md" ) >/dev/null

MM2_RC=0
MM2_OUT="$(cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p1092 --resume 2>&1)" || MM2_RC=$?
if [[ $MM2_RC -ne 0 ]]; then
  echo "$MM2_OUT" >&2
  fail "MM: --resume exited non-zero ($MM2_RC) after a clean resolution+noise was staged"
fi
MM_FINAL="$SCRATCH/main/features/done/2026-04-22/p1092_demo.md"
if [[ ! -f "$MM_FINAL" ]]; then
  fail "MM: spec was not moved to features/done/2026-04-22/ after --resume"
fi
if ! grep -qF 'RESOLVED-BY-OPERATOR-MM' "$MM_FINAL"; then
  cat "$MM_FINAL" >&2
  fail "MM: the real merge resolution did not survive --resume"
fi
if ! grep -qE '^rank: 77$' "$MM_FINAL"; then
  cat "$MM_FINAL" >&2
  fail "MM: kanban noise staged alongside the resolution did not ride into the --continue commit (AC5)"
fi
( cd "$SCRATCH/main" && git branch -D feature/p1092-demo 2>/dev/null ) || true
rm -f "$SCRATCH/main/features/p1092_demo.md" "$MM_FINAL" \
      "$SCRATCH/main/.claude/worktrees/.ship-journal/p1092.json"
pass "MM: staged kanban noise rides alongside a real conflict resolution into --continue (P1082 AC5)"

# -----------------------------------------------------------------------------
# NN. P1082 AC6: Phase 2 spec-closure gets its own op-in-progress guard. A
#     foreign CHERRY_PICK_HEAD with an EMPTY pending list (all commits already
#     landed per journal) must die before the spec-close mv+commit — the
#     per-sha loop's own foreign-op guard never fires when pending is empty.
# -----------------------------------------------------------------------------

scratch_feature p1091 1
NN_SHA1="$( cd "$SCRATCH/main" && git log --reverse --format=%H main..feature/p1091-demo | sed -n '1p' )"
( cd "$SCRATCH/main" && git cherry-pick "$NN_SHA1" ) >/dev/null
NN_LANDED1="$( cd "$SCRATCH/main" && git rev-parse HEAD )"
mkdir -p "$SCRATCH/main/.claude/worktrees/.ship-journal"
cat > "$SCRATCH/main/.claude/worktrees/.ship-journal/p1091.json" <<EOF
{
  "p_number": "p1091",
  "started_at": "2026-08-16T12:00:00Z",
  "session_id": "canary-nn",
  "source_branch": "feature/p1091-demo",
  "spec_file": "features/p1091_demo.md",
  "commits": [
    {"source_sha": "${NN_SHA1}", "landed_sha": "${NN_LANDED1}", "landed_at": "2026-08-16T12:00:01Z"}
  ],
  "spec_closed": false,
  "branch_deleted": false
}
EOF
# Inject a foreign CHERRY_PICK_HEAD — simulates a co-tenant session's paused
# pick on an unrelated P-number sharing the same repo checkout.
echo "deadbeef1234567890123456789012345678dead" > "$SCRATCH/main/.git/CHERRY_PICK_HEAD"

NN_RC=0
NN_OUT="$(cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p1091 --resume 2>&1)" || NN_RC=$?
rm -f "$SCRATCH/main/.git/CHERRY_PICK_HEAD"
if [[ $NN_RC -eq 0 ]]; then
  echo "$NN_OUT" >&2
  fail "NN: --resume succeeded despite a foreign CHERRY_PICK_HEAD with empty pending list (AC6 guard missing)"
fi
if ! echo "$NN_OUT" | grep -qiE 'operation in progress'; then
  echo "$NN_OUT" >&2
  fail "NN: --resume failed but diagnostic did not mention 'operation in progress'"
fi
if [[ -f "$SCRATCH/main/features/done/2026-04-22/p1091_demo.md" ]]; then
  fail "NN: spec was moved to features/done/ despite the op-in-progress guard — Phase 2 ran unguarded"
fi
if [[ ! -f "$SCRATCH/main/features/p1091_demo.md" ]]; then
  fail "NN: spec is missing from features/ (git mv partially applied despite guard)"
fi
if [[ ! -f "$SCRATCH/main/.claude/worktrees/.ship-journal/p1091.json" ]]; then
  fail "NN: journal was deleted despite the guard refusing to close the spec"
fi
( cd "$SCRATCH/main" && git branch -D feature/p1091-demo 2>/dev/null ) || true
rm -f "$SCRATCH/main/features/p1091_demo.md" \
      "$SCRATCH/main/.claude/worktrees/.ship-journal/p1091.json" \
      "$SCRATCH/main/.claude/worktrees/main.lock"
pass "NN: Phase 2 spec-close refuses when a foreign op is in progress and pending list is empty (P1082 AC6)"

# -----------------------------------------------------------------------------
# OO. P1082 code-review follow-up: the CHERRY_PICK_HEAD discard-skip is
#     file-agnostic (any paused pick, not just one touching this pn's spec).
#     Combined with unstaged (not staged) kanban noise on the spec file and an
#     empty pending list, review flagged that noise could theoretically ride
#     unnoticed through Phase 2's `git mv`. It does NOT: the AC6 guard (test NN)
#     already dies with "operation in progress" before Phase 2 runs, so the
#     dirty noise is left untouched on disk — never discarded, never moved,
#     never committed. This canary pins down that end-to-end outcome.
# -----------------------------------------------------------------------------

scratch_feature p1093 1
OO_SHA1="$( cd "$SCRATCH/main" && git log --reverse --format=%H main..feature/p1093-demo | sed -n '1p' )"
( cd "$SCRATCH/main" && git cherry-pick "$OO_SHA1" ) >/dev/null
OO_LANDED1="$( cd "$SCRATCH/main" && git rev-parse HEAD )"
mkdir -p "$SCRATCH/main/.claude/worktrees/.ship-journal"
cat > "$SCRATCH/main/.claude/worktrees/.ship-journal/p1093.json" <<EOF
{
  "p_number": "p1093",
  "started_at": "2026-08-16T12:00:00Z",
  "session_id": "canary-oo",
  "source_branch": "feature/p1093-demo",
  "spec_file": "features/p1093_demo.md",
  "commits": [
    {"source_sha": "${OO_SHA1}", "landed_sha": "${OO_LANDED1}", "landed_at": "2026-08-16T12:00:01Z"}
  ],
  "spec_closed": false,
  "branch_deleted": false
}
EOF
# Unstaged (dirty, un-git-added) kanban noise — distinct from KK/MM's staged
# noise. Not part of any conflict; nothing about p1093's own pick touches it.
echo "kanban-unstaged-noise" >> "$SCRATCH/main/features/p1093_demo.md"
# Foreign CHERRY_PICK_HEAD — an unrelated co-tenant session's paused pick.
echo "deadbeef1234567890123456789012345678dead" > "$SCRATCH/main/.git/CHERRY_PICK_HEAD"

OO_RC=0
OO_OUT="$(cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p1093 --resume 2>&1)" || OO_RC=$?
rm -f "$SCRATCH/main/.git/CHERRY_PICK_HEAD"
if [[ $OO_RC -eq 0 ]]; then
  echo "$OO_OUT" >&2
  fail "OO: --resume succeeded despite a foreign CHERRY_PICK_HEAD + unstaged spec noise (should refuse, not silently mv)"
fi
if ! echo "$OO_OUT" | grep -qiE 'operation in progress'; then
  echo "$OO_OUT" >&2
  fail "OO: --resume failed but not via the AC6 op-in-progress guard"
fi
if [[ -f "$SCRATCH/main/features/done/2026-04-22/p1093_demo.md" ]]; then
  fail "OO: spec was moved to features/done/ — unstaged noise rode through Phase 2's git mv unguarded"
fi
if ! grep -qF 'kanban-unstaged-noise' "$SCRATCH/main/features/p1093_demo.md"; then
  fail "OO: unstaged noise vanished (unexpectedly discarded) instead of being left untouched"
fi
( cd "$SCRATCH/main" && git branch -D feature/p1093-demo 2>/dev/null ) || true
rm -f "$SCRATCH/main/features/p1093_demo.md" \
      "$SCRATCH/main/.claude/worktrees/.ship-journal/p1093.json" \
      "$SCRATCH/main/.claude/worktrees/main.lock"
pass "OO: foreign CHERRY_PICK_HEAD + unstaged spec noise refuses at Phase 2 — noise never rides through git mv"

# -----------------------------------------------------------------------------
# PP. P1094 item 1 (link depth): closing a spec moves it from features/ into
#     features/done/<sprint>/ — two directories deeper — so a body link written
#     as `../docs/x.md` now resolves to features/done/docs/x.md and is dead.
#     Nothing in ship rewrites relative links on move, so the doc-link gate in
#     pre-commit-checks.sh blocks the close commit ITSELF, after the code has
#     already landed on main.
#
#     Asserted symptom-side: every relative link in the moved spec must resolve
#     from its NEW directory. The scratch repo has no doc-link hook installed,
#     so this checks the property directly rather than proxying it through the
#     gate that happens to catch it in production.
# -----------------------------------------------------------------------------

mkdir -p "$SCRATCH/main/docs"
echo "# decisions" > "$SCRATCH/main/docs/decisions.md"
( cd "$SCRATCH/main" && git add docs/decisions.md && \
    git commit -qm "seed docs/decisions.md" ) >/dev/null

scratch_feature p160 1
# The link must be COMMITTED: an uncommitted body edit is stray kanban noise to
# the discard block and would be reverted before Phase 1 ever runs.
cat >> "$SCRATCH/main/features/p160_demo.md" <<'EOF'

See [decisions](../docs/decisions.md) for the rationale.
EOF
( cd "$SCRATCH/main" && git add features/p160_demo.md && \
    git commit -qm "p160: add relative doc link" ) >/dev/null

PP_RC=0
PP_OUT="$(cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p160 2>&1)" || PP_RC=$?
PP_FINAL="$SCRATCH/main/features/done/2026-04-22/p160_demo.md"
if [[ ! -f "$PP_FINAL" ]]; then
  echo "$PP_OUT" >&2
  fail "PP: spec was not moved to features/done/2026-04-22/ (rc=$PP_RC)"
fi
PP_DIR="$(dirname "$PP_FINAL")"
PP_DEAD=""
while IFS= read -r PP_TARGET; do
  [[ -z "$PP_TARGET" ]] && continue
  if [[ ! -e "$PP_DIR/$PP_TARGET" ]]; then
    PP_DEAD="$PP_DEAD $PP_TARGET"
  fi
done < <(grep -o '](\.\.[^)]*)' "$PP_FINAL" | sed 's/^](//; s/)$//')
if [[ -n "$PP_DEAD" ]]; then
  echo "$PP_OUT" >&2
  fail "PP: relative link(s) dead after move —$PP_DEAD (resolved from $PP_DIR) (P1094 item 1)"
fi
scratch_reset p160
rm -f "$SCRATCH/main/features/done/2026-04-22/p160_demo.md"
pass "PP: relative links in a closed spec still resolve from features/done/<sprint>/ (P1094 item 1)"

# -----------------------------------------------------------------------------
# QQ. P1094 item 2 (retry reverts the rename): once Phase 1 has fully landed,
#     CHERRY_PICK_HEAD is gone, so a --resume falls into the discard block's
#     unconditional else-branch. That branch cannot distinguish "this same ship
#     run's in-flight Phase 2 rename, staged moments ago" from stray kanban
#     noise: the pathspec features/pN_*.md matches the rename's staged SOURCE
#     deletion (it does NOT match the nested destination), so `git checkout --`
#     resurrects the old path and the retry then dies at `git mv` with
#     "destination exists". The operator's recovery destroys the work it was
#     meant to recover.
#
#     The blocking gate here is deliberately UNRELATED to the link bug (item 1)
#     so this canary keeps failing on its own merits once item 1 is fixed. The
#     hook fires only when a features/done/ path is staged, leaving Phase 1's
#     cherry-picks untouched.
# -----------------------------------------------------------------------------

scratch_feature p161 1

cat > "$SCRATCH/main/.git/hooks/pre-commit" <<'EOF'
#!/usr/bin/env bash
if [ -e "$(git rev-parse --show-toplevel)/.qq-fail-gate" ] && \
   git diff --cached --name-only | grep -q '^features/done/'; then
  echo "pre-commit: simulated gate failure on spec-close commit" >&2
  exit 1
fi
exit 0
EOF
chmod +x "$SCRATCH/main/.git/hooks/pre-commit"
: > "$SCRATCH/main/.qq-fail-gate"

QQ_RC=0
QQ_OUT="$(cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p161 2>&1)" || QQ_RC=$?
if [[ "$QQ_RC" == "0" ]]; then
  echo "$QQ_OUT" >&2
  fail "QQ: setup invalid — ship succeeded despite a blocking pre-commit gate"
fi
# Precondition: we are actually in the window under test — Phase 1 landed and
# the Phase 2 rename sits staged (source deleted in the index).
QQ_STAGED="$(cd "$SCRATCH/main" && git diff --cached --name-status)"
if ! echo "$QQ_STAGED" | grep -q 'features/p161_demo.md'; then
  echo "$QQ_STAGED" >&2
  echo "$QQ_OUT" >&2
  fail "QQ: setup invalid — Phase 2 rename is not staged after the gate failure"
fi

# The operator fixes the gate and retries. This is the documented recovery.
rm -f "$SCRATCH/main/.qq-fail-gate"
QQ2_RC=0
QQ2_OUT="$(cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p161 --resume 2>&1)" || QQ2_RC=$?
rm -f "$SCRATCH/main/.git/hooks/pre-commit" "$SCRATCH/main/.qq-fail-gate"

if echo "$QQ2_OUT" | grep -qF 'discarding uncommitted kanban edits'; then
  echo "$QQ2_OUT" >&2
  fail "QQ: --resume discarded this run's OWN in-flight Phase 2 rename as kanban noise (P1094 item 2)"
fi
if [[ "$QQ2_RC" != "0" ]]; then
  echo "$QQ2_OUT" >&2
  fail "QQ: --resume after an unrelated gate failure did not complete (rc=$QQ2_RC) (P1094 item 2)"
fi
if [[ -f "$SCRATCH/main/features/p161_demo.md" ]]; then
  fail "QQ: source spec path was resurrected — the staged rename got reverted (P1094 item 2)"
fi
if [[ ! -f "$SCRATCH/main/features/done/2026-04-22/p161_demo.md" ]]; then
  fail "QQ: spec not closed at features/done/2026-04-22/ after --resume"
fi
scratch_reset p161
rm -f "$SCRATCH/main/features/done/2026-04-22/p161_demo.md"
pass "QQ: --resume preserves this run's own staged Phase 2 rename (P1094 item 2)"

# -----------------------------------------------------------------------------
# RR. P1094 item 1, scoping. The re-base is deliberately narrow, and each of
#     these four rules is a decision that would otherwise be invisible to a
#     later reader and easy to "simplify" away:
#       - ratchet, not threshold: a link that was ALREADY dead before the move
#         is re-based like any other but must NOT block the close (the repo
#         carries pre-existing dead links by design — decisions.md 2026-08-15);
#       - external / in-page / templated targets are left byte-identical;
#       - fenced code blocks are skipped, matching validate-doc-links.cjs, so
#         an example link inside a fence is not silently rewritten.
#     Scoping to exactly what the gate judges is the point: a wider rewrite
#     would edit prose the gate never reads.
# -----------------------------------------------------------------------------

scratch_feature p162 1
cat >> "$SCRATCH/main/features/p162_demo.md" <<'EOF'

Live: [d](../docs/decisions.md)
Already dead: [x](../docs/never-existed.md)
External: [e](https://example.com/a.md)
Anchor: [a](#section)
Templated: [t](${VAR}/x.md)

```
Fenced: [f](../docs/decisions.md)
```
EOF
( cd "$SCRATCH/main" && git add features/p162_demo.md && \
    git commit -qm "p162: link-scoping fixture" ) >/dev/null

RR_RC=0
RR_OUT="$(cd "$SCRATCH/main" && capture_r bash "$GIT_OPS" ship p162 2>&1)" || RR_RC=$?
RR_FINAL="$SCRATCH/main/features/done/2026-04-22/p162_demo.md"
if [[ "$RR_RC" != "0" ]]; then
  echo "$RR_OUT" >&2
  fail "RR: a pre-existing dead link blocked the close (rc=$RR_RC) — re-base must ratchet, not threshold (P1094 item 1)"
fi
if [[ ! -f "$RR_FINAL" ]]; then
  echo "$RR_OUT" >&2
  fail "RR: spec was not moved to features/done/2026-04-22/"
fi
if ! grep -qF '](../../../docs/decisions.md)' "$RR_FINAL"; then
  cat "$RR_FINAL" >&2
  fail "RR: the live link was not re-based for the new depth (P1094 item 1)"
fi
if ! grep -qF '](../../../docs/never-existed.md)' "$RR_FINAL"; then
  cat "$RR_FINAL" >&2
  fail "RR: the already-dead link was not re-based — deadness is not a reason to skip it (P1094 item 1)"
fi
for RR_UNTOUCHED in '](https://example.com/a.md)' '](#section)' '](${VAR}/x.md)'; do
  if ! grep -qF "$RR_UNTOUCHED" "$RR_FINAL"; then
    cat "$RR_FINAL" >&2
    fail "RR: non-filesystem target was rewritten: $RR_UNTOUCHED (P1094 item 1)"
  fi
done
if ! grep -qF 'Fenced: [f](../docs/decisions.md)' "$RR_FINAL"; then
  cat "$RR_FINAL" >&2
  fail "RR: a link inside a fenced code block was rewritten — scope must match validate-doc-links.cjs (P1094 item 1)"
fi
scratch_reset p162
rm -f "$RR_FINAL"
pass "RR: re-base ratchets on pre-existing dead links and leaves external/anchor/templated/fenced targets alone (P1094 item 1)"

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

echo "PASS: all git-ops.sh ship invariants (K-Y, Z2, AA-JJ, KK, LL, MM, NN, OO, PP, QQ, RR) hold"
