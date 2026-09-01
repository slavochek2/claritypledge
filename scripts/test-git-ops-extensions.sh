#!/usr/bin/env bash
# Hermetic canary for scripts/git-ops.sh extensions (P787).
#
# Covers the six subcommands added in P787 T03/T04/T05:
#   gc, abandon, reconcile, commit-to-main, switch-safe, sync
#
# Proves:
#   A. gc --dry-run lists stale branches, refuses to delete without both flags.
#   B. abandon removes lockfile + worktree, preserves branch.
#   C. reconcile detects orphan-lock (lock but no worktree) and orphan-worktree.
#   K. reconcile surfaces stranded ships (lock+worktree present, commits landed,
#      cleanup never ran — previously reported as 'ok') and leftover journals
#      (which silently hard-block every later ship for that P-number).
#   D. commit-to-main acquires main.lock, commits listed files, releases.
#   E. Two concurrent commit-to-main calls serialize — second reports "held by".
#   F. switch-safe refuses when main has uncommitted bystander changes.
#   G. sync refuses on branches with upstream tracking (exit 3).
#   H. sync runs git pull --ff-only on local-only branches.
#   I. All new subcommands' output free of `>`, `<`, `|` (P783 shell-safety).
#   J. All --help outputs reference P781 or P787.
#
# Hermetic: scratch main repo in /tmp, scratch commits, no network.
# Uses a bare origin repo to satisfy sync's upstream-tracking check (G).
#
# IMPORTANT: do not invoke via `eval "$(...)"`. Output is human-readable, not
# shell-evalable. Call as `bash scripts/test-git-ops-extensions.sh`.

set -euo pipefail

# P785 — clear inherited git env vars before any nested git invocation, so the
# outer worktree's index stays untouched.
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR
# Also unset author/committer identity env vars. When this canary runs inside a
# cherry-pick's pre-commit hook, GIT_AUTHOR_{NAME,EMAIL} are set to the original
# commit's author. If those differ from the scratch repo's local user.email,
# `git commit` prints a standalone "Author: Name <email>" line — which contains
# `<` and `>` tokens that would trip invariant I (shell-safety) falsely.
unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_AUTHOR_DATE \
      GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_COMMITTER_DATE

ORIGINAL_CWD="$(pwd)"
OUTER_INDEX_PRE=""
if ( cd "$ORIGINAL_CWD" && git rev-parse --is-inside-work-tree >/dev/null 2>&1 ); then
  OUTER_INDEX_PRE="$(cd "$ORIGINAL_CWD" && git diff --cached --name-only 2>/dev/null || true)"
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
# Resolve the shared scripts dir — when running inside a worktree, the main
# repo's scripts/ is where git-ops.sh lives for copying into the scratch repo.
MAIN_REPO="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

# All human-readable diagnostic output from the test goes to stdout so
# `run_quiet` in pre-commit-checks.sh can capture it.
fail() {
  echo "FAIL: $*" >&2
  exit 1
}

pass() {
  echo "PASS: $*"
}

# -----------------------------------------------------------------------------
# Build scratch repo layout.
# A bare "origin" repo lets us push once to create a tracked branch for sync's G.
# -----------------------------------------------------------------------------

mkdir -p "$SCRATCH/origin.git" \
         "$SCRATCH/main/scripts" \
         "$SCRATCH/main/.claude/worktrees" \
         "$SCRATCH/main/features" \
         "$SCRATCH/main/supabase/migrations"
( cd "$SCRATCH/origin.git" && git init --bare -q )

# Copy the subject under test (current worktree's git-ops.sh — this is what
# the engineer is about to commit). Copy BEFORE the seed commit so both scripts
# are tracked — hydrate_native in setup-worktree.sh does `git checkout -- scripts/`
# which needs the path in HEAD.
cp "$REPO_ROOT/scripts/git-ops.sh" "$SCRATCH/main/scripts/git-ops.sh"
chmod +x "$SCRATCH/main/scripts/git-ops.sh"
cp "$REPO_ROOT/scripts/setup-worktree.sh" "$SCRATCH/main/scripts/setup-worktree.sh"
chmod +x "$SCRATCH/main/scripts/setup-worktree.sh"
# Seed supabase/migrations and features with placeholders so unguarded globs
# in setup-worktree.sh don't fail on empty matches.
: > "$SCRATCH/main/supabase/migrations/.gitkeep"
echo "---" > "$SCRATCH/main/features/p000_canary.md"
# Placeholder env files so setup-worktree.sh's L2 guards have something to
# snapshot. Dangling symlinks into here are fine.
echo "CANARY_KEEP=1" > "$SCRATCH/main/.env.local"
echo "CANARY_TEST=1" > "$SCRATCH/main/.env.test.local"

(
  cd "$SCRATCH/main"
  git init -q
  git config user.email canary@test
  git config user.name canary
  git config commit.gpgsign false
  git remote add origin "$SCRATCH/origin.git"
  echo "seed" > README.md
  git add README.md scripts/git-ops.sh scripts/setup-worktree.sh \
          supabase/migrations/.gitkeep features/p000_canary.md \
          .env.local .env.test.local
  git commit -qm "seed"
  git branch -M main
  git push -u -q origin main
) >/dev/null

GIT_OPS="$SCRATCH/main/scripts/git-ops.sh"

# Shell-safety collector: any line in any captured output containing `>`, `<`,
# or `|` will fail Invariant I at the end. Each subtest appends its combined
# stdout+stderr to this log.
SAFETY_LOG="$SCRATCH/safety.log"
: > "$SAFETY_LOG"

capture() {
  # Run a command, tee its combined output to the safety log AND echo it, so
  # the caller can grep for matches.
  local tmp="$SCRATCH/last-capture.log"
  ( "$@" ) >"$tmp" 2>&1 || true
  cat "$tmp" >> "$SAFETY_LOG"
  cat "$tmp"
}

# Invariant I is scoped to NEW subcommand outputs only. The existing
# --help output and `claim`'s stderr contain documentation examples of the
# safe-eval pattern (which themselves use `|` and `>` legitimately) — those
# are not routed through eval and pre-date this spec. The attack surface for
# I is the six new subcommands' status output.
I_SCOPED_LOG="$SCRATCH/i-scoped.log"
: > "$I_SCOPED_LOG"

capture_i() {
  # Like capture(), but also appends to the scoped I log for invariant I.
  local tmp="$SCRATCH/last-capture.log"
  ( "$@" ) >"$tmp" 2>&1 || true
  cat "$tmp" >> "$SAFETY_LOG"
  cat "$tmp" >> "$I_SCOPED_LOG"
  cat "$tmp"
}

# -----------------------------------------------------------------------------
# J. --help outputs reference P781 or P787.
# Run this first so a missing subcommand fails fast with a clear message.
# -----------------------------------------------------------------------------

HELP_OUT="$(cd "$SCRATCH/main" && bash "$GIT_OPS" --help 2>&1)"
echo "$HELP_OUT" >> "$SAFETY_LOG"
if ! echo "$HELP_OUT" | grep -qE 'P78[17]'; then
  echo "$HELP_OUT" >&2
  fail "J: git-ops.sh --help does not reference P781 or P787"
fi
# Each new subcommand must have its own documented block starting the line
# (not just listed in a "FUTURE" one-liner). Pattern: 2 spaces + subcommand
# + whitespace or flag-open-bracket.
for sc in gc abandon reconcile commit-to-main switch-safe sync; do
  if ! echo "$HELP_OUT" | grep -qE "^  ${sc}(\$|[[:space:]]|\\[)"; then
    echo "$HELP_OUT" >&2
    fail "J: git-ops.sh --help has no dedicated block for subcommand '$sc'"
  fi
done
pass "J: --help has dedicated blocks for all 6 new subcommands and references P781/P787"

# -----------------------------------------------------------------------------
# A. gc: dry-run lists stale branches, refuses delete without both flags.
# Setup: create two branches on scratch main.
#   - feature/p100-stale : committed, then backdated 60 days, no worktree/lock.
#   - feature/p101-fresh : committed today, no worktree/lock → not stale.
#   - feature/p102-active : has a live worktree/lock via claim → never listed.
# -----------------------------------------------------------------------------

(
  cd "$SCRATCH/main"
  git checkout -q -b feature/p100-stale
  echo stale > s.txt && git add s.txt
  GIT_COMMITTER_DATE="2025-01-01T00:00:00Z" \
  GIT_AUTHOR_DATE="2025-01-01T00:00:00Z" \
    git commit -qm "p100 stale commit"
  git checkout -q main

  git checkout -q -b feature/p101-fresh
  echo fresh > f.txt && git add f.txt
  git commit -qm "p101 fresh commit"
  git checkout -q main
) >/dev/null

# Claim a slot for p102 so gc can prove it never touches active branches.
# claim's stdout goes via sentinel; we don't need to parse it, just ensure it
# succeeds.
( cd "$SCRATCH/main" && bash "$GIT_OPS" claim p102 active ) >"$SCRATCH/claim.log" 2>&1 \
  || { cat "$SCRATCH/claim.log" >&2; fail "A-setup: claim p102 active failed"; }
cat "$SCRATCH/claim.log" >> "$SAFETY_LOG"

# Dry-run output — must include p100-stale, must NOT include p101-fresh or p102-active.
GC_DRYRUN="$(cd "$SCRATCH/main" && capture_i bash "$GIT_OPS" gc --dry-run)"
if ! echo "$GC_DRYRUN" | grep -qF 'feature/p100-stale'; then
  echo "$GC_DRYRUN" >&2
  fail "A: gc --dry-run did not list feature/p100-stale"
fi
if echo "$GC_DRYRUN" | grep -qF 'feature/p101-fresh'; then
  echo "$GC_DRYRUN" >&2
  fail "A: gc --dry-run incorrectly listed fresh branch"
fi
if echo "$GC_DRYRUN" | grep -qF 'feature/p102-active'; then
  echo "$GC_DRYRUN" >&2
  fail "A: gc --dry-run incorrectly listed active (worktree-held) branch"
fi

# Stability: running gc --dry-run twice yields identical output.
GC_DRYRUN2="$(cd "$SCRATCH/main" && capture_i bash "$GIT_OPS" gc --dry-run)"
if [[ "$GC_DRYRUN" != "$GC_DRYRUN2" ]]; then
  diff <(echo "$GC_DRYRUN") <(echo "$GC_DRYRUN2") >&2 || true
  fail "A: gc --dry-run output not stable across runs"
fi

# Bare `gc` must be dry-run by default (spec: "Default: dry-run").
GC_DEFAULT="$(cd "$SCRATCH/main" && capture_i bash "$GIT_OPS" gc)"
if ! echo "$GC_DEFAULT" | grep -qF 'feature/p100-stale'; then
  fail "A: gc (no flags) did not list stale branch"
fi

# `--yes` alone must NOT delete (requires both flags per spec).
( cd "$SCRATCH/main" && capture_i bash "$GIT_OPS" gc --yes ) >/dev/null
if ! (
  cd "$SCRATCH/main" && git rev-parse --verify feature/p100-stale >/dev/null 2>&1
); then
  fail "A: gc --yes (without --delete-branches) deleted the branch — should need both flags"
fi
pass "A: gc lists stale branches, stable output, refuses delete without both flags"

# -----------------------------------------------------------------------------
# B. abandon: removes lockfile + worktree, preserves branch.
# Reuse the p102 claim from A-setup. Pull the nonce from the lockfile so the
# ownership check passes (same rule as release: --nonce OR PID match).
# -----------------------------------------------------------------------------

B_NONCE="$(grep '^NONCE=' "$SCRATCH/main/.claude/worktrees/w1/.lock" | cut -d= -f2)"
ABANDON_OUT="$(cd "$SCRATCH/main" && capture_i bash "$GIT_OPS" abandon w1 --nonce "$B_NONCE")"
# Lockfile gone:
if [[ -f "$SCRATCH/main/.claude/worktrees/w1/.lock" ]]; then
  echo "$ABANDON_OUT" >&2
  fail "B: abandon left .lock in place"
fi
# Worktree dir gone:
if [[ -d "$SCRATCH/main/.claude/worktrees/w1" ]]; then
  echo "$ABANDON_OUT" >&2
  fail "B: abandon left worktree directory"
fi
# Branch preserved:
if ! ( cd "$SCRATCH/main" && git rev-parse --verify feature/p102-active >/dev/null 2>&1 ); then
  echo "$ABANDON_OUT" >&2
  fail "B: abandon deleted branch feature/p102-active (should preserve)"
fi
pass "B: abandon removes lockfile + worktree, preserves branch"

# -----------------------------------------------------------------------------
# C. reconcile: orphan-lock and orphan-worktree detection.
# Build three scenarios under .claude/worktrees:
#   w1 — lockfile only (no worktree entry) → orphan-lock, exit 2
#   w2 — worktree only (no lockfile)       → orphan-worktree, exit 2
#   w3 — both (live lockfile, real worktree) → OK (claim takes next free slot)
# Order matters: create w1+w2 first so claim picks w3.
# -----------------------------------------------------------------------------

# w1: manual dir with lockfile but no git-worktree entry → orphan-lock.
mkdir -p "$SCRATCH/main/.claude/worktrees/w1"
cat > "$SCRATCH/main/.claude/worktrees/w1/.lock" <<EOF
PID=$$
PID_START_TIME=$(ps -o lstart= -p $$ | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/[[:space:]][[:space:]]*/ /g')
NONCE=deadbeefcafef00d
SESSION_ID=canary-reconcile
SLOT=w1
BRANCH=feature/p200-orphan-lock
P_NUMBER=p200
CLAIMED_AT=2026-04-22T00:00:00Z
HEARTBEAT=2026-04-22T00:00:00Z
EOF

# w2: raw git worktree add (no lockfile) → orphan-worktree.
( cd "$SCRATCH/main" && git worktree add -q "$SCRATCH/main/.claude/worktrees/w2" \
    -b feature/p202-orphan-worktree main ) >/dev/null 2>&1 || \
  fail "C-setup: raw git worktree add for w2 failed"

# w3: via claim (takes next free slot, which is w3 since w1 and w2 exist).
( cd "$SCRATCH/main" && bash "$GIT_OPS" claim p201 reconcile-ok ) >"$SCRATCH/claim2.log" 2>&1 \
  || { cat "$SCRATCH/claim2.log" >&2; fail "C-setup: claim p201 failed"; }
cat "$SCRATCH/claim2.log" >> "$SAFETY_LOG"

RECONCILE_OUT="$(cd "$SCRATCH/main" && bash "$GIT_OPS" reconcile 2>&1; echo "__EXIT=$?")"
echo "$RECONCILE_OUT" >> "$SAFETY_LOG"
echo "$RECONCILE_OUT" >> "$I_SCOPED_LOG"
RECONCILE_EXIT="$(echo "$RECONCILE_OUT" | tail -n1 | sed -e 's/__EXIT=//')"
RECONCILE_BODY="$(echo "$RECONCILE_OUT" | sed '$d')"

if [[ "$RECONCILE_EXIT" != "2" ]]; then
  echo "$RECONCILE_BODY" >&2
  fail "C: reconcile exit was $RECONCILE_EXIT, expected 2 (orphans present)"
fi
if ! echo "$RECONCILE_BODY" | grep -qE 'orphan-lock.*w1|w1.*orphan-lock'; then
  echo "$RECONCILE_BODY" >&2
  fail "C: reconcile did not report orphan-lock for w1"
fi
if ! echo "$RECONCILE_BODY" | grep -qE 'orphan-worktree.*w2|w2.*orphan-worktree'; then
  echo "$RECONCILE_BODY" >&2
  fail "C: reconcile did not report orphan-worktree for w2"
fi
pass "C: reconcile detects orphan-lock, orphan-worktree, exits 2"

# Clean up C setup so later tests start fresh.
rm -f "$SCRATCH/main/.claude/worktrees/w1/.lock"
rmdir "$SCRATCH/main/.claude/worktrees/w1" 2>/dev/null || true
( cd "$SCRATCH/main" && git worktree remove -f "$SCRATCH/main/.claude/worktrees/w2" 2>/dev/null ) || true
( cd "$SCRATCH/main" && git worktree remove -f "$SCRATCH/main/.claude/worktrees/w3" 2>/dev/null ) || true
rm -rf "$SCRATCH/main/.claude/worktrees/w1" \
       "$SCRATCH/main/.claude/worktrees/w2" \
       "$SCRATCH/main/.claude/worktrees/w3"
# Drop the now-unused branches too (clean slate for later assertions).
( cd "$SCRATCH/main" && git branch -D feature/p201-reconcile-ok 2>/dev/null ) || true
( cd "$SCRATCH/main" && git branch -D feature/p202-orphan-worktree 2>/dev/null ) || true
( cd "$SCRATCH/main" && git branch -D feature/p102-active 2>/dev/null ) || true

# -----------------------------------------------------------------------------
# D. commit-to-main: acquires main.lock, commits listed files, releases.
# -----------------------------------------------------------------------------

echo "d-file-contents" > "$SCRATCH/main/d-file.txt"
D_OUT="$(cd "$SCRATCH/main" && capture_i bash "$GIT_OPS" commit-to-main \
          --message "d: test commit" --files d-file.txt)"
# Commit landed:
if ! ( cd "$SCRATCH/main" && git log --oneline -1 | grep -qF 'd: test commit' ); then
  echo "$D_OUT" >&2
  fail "D: commit-to-main did not land the commit"
fi
# main.lock released:
if [[ -f "$SCRATCH/main/.claude/worktrees/main.lock" ]]; then
  echo "$D_OUT" >&2
  fail "D: commit-to-main did not release main.lock"
fi
# File contents correct in HEAD:
FILE_IN_HEAD="$(cd "$SCRATCH/main" && git show HEAD:d-file.txt)"
[[ "$FILE_IN_HEAD" == "d-file-contents" ]] || fail "D: committed file contents wrong"
pass "D: commit-to-main commits listed files and releases main.lock"

# -----------------------------------------------------------------------------
# E. Two concurrent commit-to-main calls serialize — second reports "held by".
# Simulate contention by planting a live main.lock manually (PID=$$ of a real
# sleeping process), then invoking commit-to-main with a short override timeout.
# -----------------------------------------------------------------------------

# Spawn a sleeper whose PID will be the lock holder. We use a long sleep so the
# PID stays alive for the duration of the test (killed in cleanup).
sleep 30 &
SLEEPER_PID=$!
cleanup_sleeper() { kill "$SLEEPER_PID" 2>/dev/null || true; }
trap 'cleanup_sleeper; rm -rf "$SCRATCH"' EXIT

SLEEPER_START="$(ps -o lstart= -p "$SLEEPER_PID" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/[[:space:]][[:space:]]*/ /g')"
mkdir -p "$SCRATCH/main/.claude/worktrees"
cat > "$SCRATCH/main/.claude/worktrees/main.lock" <<EOF
PID=$SLEEPER_PID
PID_START_TIME=$SLEEPER_START
NONCE=000000000000dead
SESSION_ID=canary-contention
CLAIMED_AT=2026-04-22T00:00:00Z
EOF

echo "e-file-contents" > "$SCRATCH/main/e-file.txt"
# Run commit-to-main with 2-second timeout override (env var) to force the
# contention path without making the test take 120s.
set +e
E_OUT=$( cd "$SCRATCH/main" && GIT_OPS_MAIN_LOCK_TIMEOUT=2 \
         bash "$GIT_OPS" commit-to-main --message "e: should not land" \
              --files e-file.txt 2>&1 )
E_EXIT=$?
set -e
echo "$E_OUT" >> "$SAFETY_LOG"
echo "$E_OUT" >> "$I_SCOPED_LOG"

if [[ $E_EXIT -eq 0 ]]; then
  echo "$E_OUT" >&2
  fail "E: commit-to-main succeeded despite held main.lock — expected non-zero"
fi
if ! echo "$E_OUT" | grep -qiE 'held by'; then
  echo "$E_OUT" >&2
  fail "E: commit-to-main contention message missing 'held by'"
fi
# No interleaved writes: the commit must NOT have landed.
if ( cd "$SCRATCH/main" && git log --oneline | grep -qF 'e: should not land' ); then
  fail "E: commit-to-main landed a commit while main.lock was held"
fi
# Ensure the held lock is still there (we never force-release per spec).
[[ -f "$SCRATCH/main/.claude/worktrees/main.lock" ]] || \
  fail "E: commit-to-main force-released main.lock — spec forbids this"
pass "E: concurrent commit-to-main serializes via main.lock (contention detected, no interleave)"

# Release the held lock and kill the sleeper for the next test.
rm -f "$SCRATCH/main/.claude/worktrees/main.lock"
cleanup_sleeper
trap 'rm -rf "$SCRATCH"' EXIT

# -----------------------------------------------------------------------------
# F. switch-safe refuses when main has uncommitted bystander changes.
# -----------------------------------------------------------------------------

echo "bystander" > "$SCRATCH/main/bystander.txt"
( cd "$SCRATCH/main" && git add bystander.txt )

set +e
F_OUT=$( cd "$SCRATCH/main" && bash "$GIT_OPS" switch-safe main 2>&1 )
F_EXIT=$?
set -e
echo "$F_OUT" >> "$SAFETY_LOG"
echo "$F_OUT" >> "$I_SCOPED_LOG"
if [[ $F_EXIT -eq 0 ]]; then
  echo "$F_OUT" >&2
  fail "F: switch-safe accepted dirty main — expected refusal"
fi
if ! echo "$F_OUT" | grep -qiE 'uncommitted|bystander|refus|dirty'; then
  echo "$F_OUT" >&2
  fail "F: switch-safe refusal message not informative"
fi
# Clean up the bystander so subsequent tests start clean.
( cd "$SCRATCH/main" && git reset -q HEAD -- bystander.txt && rm bystander.txt )
pass "F: switch-safe refuses dirty main"

# -----------------------------------------------------------------------------
# G. sync refuses on a branch with upstream tracking (exit 3).
# main already tracks origin/main from the seed `git push` above.
# -----------------------------------------------------------------------------

set +e
G_OUT=$( cd "$SCRATCH/main" && bash "$GIT_OPS" sync 2>&1 )
G_EXIT=$?
set -e
echo "$G_OUT" >> "$SAFETY_LOG"
echo "$G_OUT" >> "$I_SCOPED_LOG"
if [[ $G_EXIT -ne 3 ]]; then
  echo "$G_OUT" >&2
  fail "G: sync on tracked branch exit was $G_EXIT, expected 3"
fi
if ! echo "$G_OUT" | grep -qiE 'publish|human|push'; then
  echo "$G_OUT" >&2
  fail "G: sync refusal message does not explain the policy"
fi
pass "G: sync refuses on branch with upstream tracking, exit 3"

# -----------------------------------------------------------------------------
# H. sync runs git pull --ff-only on local-only branches.
# Create a branch with no origin counterpart.
# -----------------------------------------------------------------------------

( cd "$SCRATCH/main" && git checkout -q -b feature/p300-local-only ) >/dev/null
set +e
H_OUT=$( cd "$SCRATCH/main" && bash "$GIT_OPS" sync 2>&1 )
H_EXIT=$?
set -e
echo "$H_OUT" >> "$SAFETY_LOG"
echo "$H_OUT" >> "$I_SCOPED_LOG"
# A local-only branch has no upstream, so `git pull --ff-only` either errors
# with "no upstream" or succeeds as a no-op. Assertions:
#   - sync did NOT exit 3 (would mean it treated the branch as tracked)
#   - sync DID emit a "local-only" status line (confirms the code path, not
#     a vacuous exit-code-only check)
if [[ $H_EXIT -eq 3 ]]; then
  echo "$H_OUT" >&2
  fail "H: sync on local-only branch exited 3 (treated as tracked)"
fi
if ! echo "$H_OUT" | grep -qiE 'local-only'; then
  echo "$H_OUT" >&2
  fail "H: sync on local-only branch did not emit 'local-only' status line (path not confirmed)"
fi
# Return to main so later assertions are on a known branch.
( cd "$SCRATCH/main" && git checkout -q main ) >/dev/null
pass "H: sync on local-only branch does not refuse as tracked (local-only path confirmed)"

# -----------------------------------------------------------------------------
# I. Shell-safety — the combined output of ALL new subcommands must be free of
# `>`, `<`, `|`. Strict per P783; redirect tokens in eval-adjacent output are
# how P783's .env.local wipe happened.
# -----------------------------------------------------------------------------

if grep -q '[><|]' "$I_SCOPED_LOG"; then
  echo "--- offending lines (new subcommand outputs only) ---" >&2
  grep -n '[><|]' "$I_SCOPED_LOG" >&2
  echo "--- end offending lines ---" >&2
  if [[ -n "${CANARY_DEBUG:-}" ]]; then
    echo "--- FULL I_SCOPED_LOG ---" >&2
    cat -n "$I_SCOPED_LOG" >&2
    echo "--- end FULL I_SCOPED_LOG ---" >&2
  fi
  fail "I: new subcommand output contains shell-redirect-parseable tokens"
fi
pass "I: no redirect-parseable tokens in new subcommand output"

# -----------------------------------------------------------------------------
# K. reconcile surfaces stranded ships and stale journals.
#    Passes 1-2 classify a slot by lock x worktree, so a ship that landed
#    commits on main and then aborted before Phase 3 — lock present AND worktree
#    present — fell through to the `ok` arm and was reported as HEALTHY. That is
#    the p1057/w1 state. Eight such journals accumulated in the real repo over
#    ~88 days while reconcile called every one of them fine.
#    Two classes must be reported and must exit 2:
#      stranded-ship — branch still exists, cleanup never ran → resume it
#      stale-journal — branch gone (ship finished out of band) → residue, and it
#                      HARD-BLOCKS every later `ship pN`, which is what drives
#                      the next out-of-band finish. Self-sustaining otherwise.
# -----------------------------------------------------------------------------

mkdir -p "$SCRATCH/main/.claude/worktrees/.ship-journal"

# A stranded ship: real branch, real worktree, commits landed, cleanup not done.
( cd "$SCRATCH/main" && git worktree add -q "$SCRATCH/main/.claude/worktrees/w5" \
    -b feature/p210-stranded main ) >/dev/null 2>&1 \
  || fail "K-setup: git worktree add for w5 failed"
cat > "$SCRATCH/main/.claude/worktrees/w5/.lock" <<EOF
PID=$$
NONCE=deadbeefcafef00d
SESSION_ID=canary-k
SLOT=w5
BRANCH=feature/p210-stranded
P_NUMBER=p210
EOF
K_SHA="$( cd "$SCRATCH/main" && git rev-parse HEAD )"
cat > "$SCRATCH/main/.claude/worktrees/.ship-journal/p210.json" <<EOF
{
  "p_number": "p210",
  "source_branch": "feature/p210-stranded",
  "spec_file": "features/p210_demo.md",
  "commits": [{"source_sha": "aaa", "landed_sha": "${K_SHA}", "landed_at": "x"}],
  "spec_closed": true,
  "branch_deleted": false
}
EOF
# Residue: the branch is long gone, but the journal blocks `ship p211` forever.
cat > "$SCRATCH/main/.claude/worktrees/.ship-journal/p211.json" <<EOF
{
  "p_number": "p211",
  "source_branch": "feature/p211-long-gone",
  "spec_file": "features/p211_demo.md",
  "commits": [{"source_sha": "bbb", "landed_sha": "${K_SHA}", "landed_at": "x"}],
  "spec_closed": true,
  "branch_deleted": false
}
EOF

K_OUT="$(cd "$SCRATCH/main" && bash "$GIT_OPS" reconcile 2>&1; echo "__EXIT=$?")"
echo "$K_OUT" >> "$SAFETY_LOG"
echo "$K_OUT" >> "$I_SCOPED_LOG"
K_EXIT="$(echo "$K_OUT" | tail -n1 | sed -e 's/__EXIT=//')"
K_BODY="$(echo "$K_OUT" | sed '$d')"

if ! echo "$K_BODY" | grep -q 'stranded-ship .*p210'; then
  echo "$K_BODY" >&2
  fail "K: reconcile did not report p210 as a stranded ship — lock+worktree both present, so it falls through to the 'ok' arm and is called healthy"
fi
if ! echo "$K_BODY" | grep -q 'p210 --resume'; then
  echo "$K_BODY" >&2
  fail "K: stranded-ship line does not name the converge command"
fi
if ! echo "$K_BODY" | grep -q 'stale-journal .*p211'; then
  echo "$K_BODY" >&2
  fail "K: reconcile did not report p211's leftover journal — it silently hard-blocks every later 'ship p211'"
fi
if [[ "$K_EXIT" != "2" ]]; then
  echo "$K_BODY" >&2
  fail "K: reconcile exit was $K_EXIT, expected 2 (stranded ship + stale journal present)"
fi
pass "K: reconcile reports stranded ships and stale journals instead of calling them ok"

rm -f "$SCRATCH/main/.claude/worktrees/w5/.lock" \
      "$SCRATCH/main/.claude/worktrees/.ship-journal/p210.json" \
      "$SCRATCH/main/.claude/worktrees/.ship-journal/p211.json"
( cd "$SCRATCH/main" && git worktree remove -f "$SCRATCH/main/.claude/worktrees/w5" 2>/dev/null ) || true
rm -rf "$SCRATCH/main/.claude/worktrees/w5"
( cd "$SCRATCH/main" && git branch -D feature/p210-stranded 2>/dev/null ) || true

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

# -----------------------------------------------------------------------------
# L. commit-to-main stages NOTHING when any requested path is invalid (2026-09-01).
#    The old single loop staged as it went and aborted on the first bad path,
#    leaving its partial work in the shared index. The caller then fixes the one
#    filename, re-runs, and commits their paths PLUS the leftovers. A real spec
#    close hit this and produced a commit recording only that spec's deletion.
# -----------------------------------------------------------------------------

( cd "$SCRATCH/main" && git checkout -q main )
echo "good" > "$SCRATCH/main/l_good.txt"
L_PRE="$( cd "$SCRATCH/main" && git diff --cached --name-only --no-renames | sort )"

set +e
L_OUT=$( cd "$SCRATCH/main" && bash "$GIT_OPS" commit-to-main \
  --message "L: should not commit" \
  --files l_good.txt l_does_not_exist.txt 2>&1 )
L_EXIT=$?
set -e
echo "$L_OUT" >> "$SAFETY_LOG"

if [[ $L_EXIT -eq 0 ]]; then
  echo "$L_OUT" >&2
  fail "L: commit-to-main accepted a nonexistent path — expected refusal"
fi

L_POST="$( cd "$SCRATCH/main" && git diff --cached --name-only --no-renames | sort )"
if [[ "$L_PRE" != "$L_POST" ]]; then
  echo "$L_OUT" >&2
  echo "  index before: ${L_PRE:-<empty>}" >&2
  echo "  index after:  ${L_POST:-<empty>}" >&2
  ( cd "$SCRATCH/main" && git reset -q HEAD -- l_good.txt 2>/dev/null || true )
  rm -f "$SCRATCH/main/l_good.txt"
  fail "L: a rejected call left paths staged in the shared index"
fi

# The valid path must be genuinely stageable, or the test proves nothing: a path
# that could never have been staged would pass this assertion trivially.
( cd "$SCRATCH/main" && git add -- l_good.txt )
if [[ -z "$( cd "$SCRATCH/main" && git diff --cached --name-only -- l_good.txt )" ]]; then
  fail "L: control failed — l_good.txt is not stageable, so the assertion above is vacuous"
fi
( cd "$SCRATCH/main" && git reset -q HEAD -- l_good.txt )
rm -f "$SCRATCH/main/l_good.txt"
pass "L: a rejected commit-to-main leaves the index untouched"

echo "PASS: all git-ops.sh extension invariants (A-L) hold"
