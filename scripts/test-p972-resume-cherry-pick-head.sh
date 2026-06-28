#!/usr/bin/env bash
# Canary for P972: `git-ops ship --resume` must converge when the previous run
# left a conflict-paused cherry-pick of the pending commit (CHERRY_PICK_HEAD ==
# pending source sha), instead of issuing a fresh `git cherry-pick <sha>` that
# re-fails with "cherry-pick is already in progress" and loops forever.
#
# Scenario (Z):
#   1. Feature branch p972 with two commits: c1 (clean) + c2 (edits shared.txt).
#   2. main also edits shared.txt after the branch point → c2 conflicts.
#   3. `ship p972` lands c1, then conflicts on c2 → exits non-zero, journal has
#      c1 landed + c2 pending, and .git/CHERRY_PICK_HEAD == c2's source sha.
#   4. Operator resolves shared.txt and `git add`s it, but does NOT run
#      `git cherry-pick --continue` (the in-progress pick stays paused).
#   5. `ship p972 --resume` must call `git cherry-pick --continue` for c2 (its
#      CHERRY_PICK_HEAD matches the pending sha), record the landed sha, close
#      the spec, delete the branch, clear the journal, print "Ready to push".
#
# PRE-FIX: step 5 issues a fresh `git cherry-pick c2` while the sequencer is mid
# cherry-pick → git errors "cherry-pick is already in progress", the conflict
# path fires, exit 1, c2 stays pending → re-running --resume loops.
#
# Hermetic: scratch main repo in /tmp, no network, no remote.
# IMPORTANT: do not invoke via `eval "$(...)"`. Output is human-readable.

set -euo pipefail

# Clear inherited git env vars so the outer worktree's index stays untouched (P785).
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR
unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_AUTHOR_DATE \
      GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_COMMITTER_DATE

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

mkdir -p "$SCRATCH/main/scripts" \
         "$SCRATCH/main/features/done/2026-04-22"
cp "$REPO_ROOT/scripts/git-ops.sh" "$SCRATCH/main/scripts/git-ops.sh"
touch "$SCRATCH/main/features/done/2026-04-22/.gitkeep"

(
  cd "$SCRATCH/main"
  git init -q
  git config user.email canary@test
  git config user.name canary
  git config commit.gpgsign false
  echo "base" > shared.txt
  echo "seed" > README.md
  git add README.md shared.txt scripts/git-ops.sh features/done/2026-04-22/.gitkeep
  git commit -qm "seed"
  git branch -M main
) >/dev/null

GIT_OPS="$SCRATCH/main/scripts/git-ops.sh"

# --- Build feature branch: c1 clean, c2 edits shared.txt --------------------
(
  cd "$SCRATCH/main"
  git checkout -q -b feature/p972-demo
  echo "c1" > p972-c1.txt
  git add p972-c1.txt
  git commit -qm "p972: commit 1 (clean)"
  echo "branch version" > shared.txt
  git add shared.txt
  git commit -qm "p972: commit 2 (edits shared.txt)"
  git checkout -q main
) >/dev/null

# Spec on main (must be tracked — untracked-spec guard X).
cat > "$SCRATCH/main/features/p972_demo.md" <<'EOF'
---
status: qa
type: bug
rank: 1
tags: [demo]
delivery_stage: fix
pipeline_ran: [fix]
---
# p972: Demo

Problem: demo.
EOF
( cd "$SCRATCH/main" && git add features/p972_demo.md && git commit -qm "chore: add p972 spec" ) >/dev/null

# main diverges on shared.txt after the branch point → guarantees c2 conflict.
echo "main version" > "$SCRATCH/main/shared.txt"
( cd "$SCRATCH/main" && git add shared.txt && git commit -qm "chore: main edits shared.txt (conflict base)" ) >/dev/null

# --- Step 3: first ship → lands c1, conflicts on c2 -------------------------
set +e
SHIP1_OUT="$( cd "$SCRATCH/main" && bash "$GIT_OPS" ship p972 2>&1 )"
SHIP1_RC=$?
set -e

if (( SHIP1_RC == 0 )); then
  echo "$SHIP1_OUT" >&2
  fail "Z-setup: first ship unexpectedly succeeded — expected a c2 conflict"
fi

GITDIR="$( cd "$SCRATCH/main" && git rev-parse --absolute-git-dir )"
if [[ ! -e "$GITDIR/CHERRY_PICK_HEAD" ]]; then
  echo "$SHIP1_OUT" >&2
  fail "Z-setup: expected CHERRY_PICK_HEAD after conflict, none present"
fi

# Confirm c1 landed and c2 is still pending in the journal.
JOURNAL="$SCRATCH/main/.claude/worktrees/.ship-journal/p972.json"
[[ -f "$JOURNAL" ]] || fail "Z-setup: journal missing after partial ship"
PENDING_BEFORE="$( grep -c '"landed_sha": null' "$JOURNAL" || true )"
if [[ "$PENDING_BEFORE" != "1" ]]; then
  echo "$SHIP1_OUT" >&2
  fail "Z-setup: expected exactly 1 pending commit (c2), got $PENDING_BEFORE"
fi

# --- Step 4: operator resolves + stages, but does NOT run --continue --------
echo "resolved (keep main)" > "$SCRATCH/main/shared.txt"
( cd "$SCRATCH/main" && git add shared.txt ) >/dev/null
# CHERRY_PICK_HEAD deliberately left in place — the pick stays paused.
[[ -e "$GITDIR/CHERRY_PICK_HEAD" ]] || fail "Z-setup: CHERRY_PICK_HEAD cleared before resume (test invalid)"

# --- Step 5: resume must converge -------------------------------------------
set +e
RESUME_OUT="$( cd "$SCRATCH/main" && bash "$GIT_OPS" ship p972 --resume 2>&1 )"
RESUME_RC=$?
set -e

if (( RESUME_RC != 0 )); then
  echo "$RESUME_OUT" >&2
  fail "Z: --resume exited non-zero ($RESUME_RC) — re-pick loop on paused cherry-pick (the P972 bug)"
fi

# Both commits present on main.
Z_COUNT="$( cd "$SCRATCH/main" && git log --oneline main | grep -c 'p972: commit' || true )"
if [[ "$Z_COUNT" != "2" ]]; then
  echo "$RESUME_OUT" >&2
  fail "Z: expected 2 p972 commits on main after resume, got $Z_COUNT"
fi

# Journal cleared, branch deleted, spec moved, Ready to push.
[[ -f "$JOURNAL" ]] && { echo "$RESUME_OUT" >&2; fail "Z: journal not deleted after successful resume"; }
if ( cd "$SCRATCH/main" && git rev-parse --verify feature/p972-demo >/dev/null 2>&1 ); then
  fail "Z: feature/p972-demo branch not deleted after resume"
fi
[[ -f "$SCRATCH/main/features/done/2026-04-22/p972_demo.md" ]] || \
  fail "Z: spec not moved to features/done/2026-04-22/ after resume"
if ! echo "$RESUME_OUT" | grep -qF 'Ready to push'; then
  echo "$RESUME_OUT" >&2
  fail "Z: resume output did not contain 'Ready to push'"
fi
# No stale sequencer state left behind.
if [[ -e "$GITDIR/CHERRY_PICK_HEAD" ]]; then
  fail "Z: CHERRY_PICK_HEAD still present after successful resume"
fi

pass "Z: ship --resume continues a paused cherry-pick (CHERRY_PICK_HEAD == pending sha) and converges"

# ============================================================================
# Scenario Z2 (P972 finding #1): crash-window recovery.
#
#   The fix for Z runs `git cherry-pick --continue`, which COMMITS, and only
#   then writes landed_sha to the journal. A SIGKILL between the commit and the
#   journal write leaves: c2 committed on main, CHERRY_PICK_HEAD cleared, journal
#   still pending. On the next --resume there is no CHERRY_PICK_HEAD, so the
#   resume-continue branch does NOT fire — a fresh `git cherry-pick c2` would
#   re-conflict (the operator's resolution differs from c2's tree, so git can't
#   detect "already applied") → diagnostic, exit 1, journal stays pending → loop.
#
#   The fix records pre_pick_head before each pick and, on resume with no
#   CHERRY_PICK_HEAD, detects the already-landed commit by author-identity match
#   (email + author-date + subject — preserved by cherry-pick) in
#   pre_pick_head..HEAD, records it, and converges.
#
# Simulating the crash window: run `ship` to the c2 conflict (this records
# c2.pre_pick_head and leaves CHERRY_PICK_HEAD), then MANUALLY resolve +
# `git cherry-pick --continue` (commits c2, clears CHERRY_PICK_HEAD) WITHOUT
# letting ship record the landed_sha — exactly the post-crash state.
# ============================================================================
SCRATCH2="$(mktemp -d)"
trap 'rm -rf "$SCRATCH" "$SCRATCH2"' EXIT

mkdir -p "$SCRATCH2/main/scripts" "$SCRATCH2/main/features/done/2026-04-22"
cp "$REPO_ROOT/scripts/git-ops.sh" "$SCRATCH2/main/scripts/git-ops.sh"
touch "$SCRATCH2/main/features/done/2026-04-22/.gitkeep"

(
  cd "$SCRATCH2/main"
  git init -q
  git config user.email canary@test
  git config user.name canary
  git config commit.gpgsign false
  echo "base" > shared.txt
  echo "seed" > README.md
  git add README.md shared.txt scripts/git-ops.sh features/done/2026-04-22/.gitkeep
  git commit -qm "seed"
  git branch -M main
  git checkout -q -b feature/p972-demo
  echo "c1" > p972-c1.txt
  git add p972-c1.txt
  git commit -qm "p972: commit 1 (clean)"
  echo "branch version" > shared.txt
  git add shared.txt
  git commit -qm "p972: commit 2 (edits shared.txt)"
  git checkout -q main
) >/dev/null

GIT_OPS2="$SCRATCH2/main/scripts/git-ops.sh"

cat > "$SCRATCH2/main/features/p972_demo.md" <<'EOF'
---
status: qa
type: bug
rank: 1
tags: [demo]
delivery_stage: fix
pipeline_ran: [fix]
---
# p972: Demo

Problem: demo.
EOF
( cd "$SCRATCH2/main" && git add features/p972_demo.md && git commit -qm "chore: add p972 spec" ) >/dev/null
echo "main version" > "$SCRATCH2/main/shared.txt"
( cd "$SCRATCH2/main" && git add shared.txt && git commit -qm "chore: main edits shared.txt (conflict base)" ) >/dev/null

# First ship → lands c1, conflicts on c2 (records c2.pre_pick_head, leaves CHERRY_PICK_HEAD).
set +e
SHIP2_OUT="$( cd "$SCRATCH2/main" && bash "$GIT_OPS2" ship p972 2>&1 )"
SHIP2_RC=$?
set -e
(( SHIP2_RC == 0 )) && { echo "$SHIP2_OUT" >&2; fail "Z2-setup: first ship unexpectedly succeeded — expected a c2 conflict"; }

GITDIR2="$( cd "$SCRATCH2/main" && git rev-parse --absolute-git-dir )"
[[ -e "$GITDIR2/CHERRY_PICK_HEAD" ]] || { echo "$SHIP2_OUT" >&2; fail "Z2-setup: expected CHERRY_PICK_HEAD after conflict"; }
JOURNAL2="$SCRATCH2/main/.claude/worktrees/.ship-journal/p972.json"
[[ -f "$JOURNAL2" ]] || fail "Z2-setup: journal missing after partial ship"

# Simulate the crash window: operator resolves + manually `--continue` (commits
# c2, clears CHERRY_PICK_HEAD), but ship never records the landed_sha.
echo "resolved (keep main)" > "$SCRATCH2/main/shared.txt"
( cd "$SCRATCH2/main" && git add shared.txt && git cherry-pick --continue --no-edit >/dev/null 2>&1 ) \
  || fail "Z2-setup: manual --continue failed"
[[ -e "$GITDIR2/CHERRY_PICK_HEAD" ]] && fail "Z2-setup: CHERRY_PICK_HEAD should be cleared after manual --continue (test invalid)"
# Capture the actually-landed c2 commit + its source sha for the --mark-landed step.
LANDED_C2="$( cd "$SCRATCH2/main" && git rev-parse HEAD )"
SRC_C2="$( cd "$SCRATCH2/main" && git rev-parse feature/p972-demo )"  # branch tip = c2 source
# Journal must still show c2 pending (the crash lost the landed_sha write).
PENDING_Z2="$( grep -c '"landed_sha": null' "$JOURNAL2" || true )"
[[ "$PENDING_Z2" == "1" ]] || fail "Z2-setup: expected c2 still pending in journal, got $PENDING_Z2 null entries"

# Step A: --resume must DETECT-AND-REFUSE (not silently auto-record + delete the
# branch, which round-2 review proved unsafe). Exit non-zero, name the candidate,
# leave main + journal + branch untouched. NO data loss.
set +e
RESUME2_OUT="$( cd "$SCRATCH2/main" && bash "$GIT_OPS2" ship p972 --resume 2>&1 )"
RESUME2_RC=$?
set -e
(( RESUME2_RC != 0 )) || { echo "$RESUME2_OUT" >&2; fail "Z2-A: --resume should refuse (exit non-zero) on the crash-window state, not auto-converge"; }
echo "$RESUME2_OUT" | grep -qF 'author identity' || { echo "$RESUME2_OUT" >&2; fail "Z2-A: refuse diagnostic missing the unverified 'author identity' framing"; }
echo "$RESUME2_OUT" | grep -qiF 'will NOT auto-record' || { echo "$RESUME2_OUT" >&2; fail "Z2-A: refuse diagnostic should state it will not auto-record"; }
echo "$RESUME2_OUT" | grep -qF "$LANDED_C2" || { echo "$RESUME2_OUT" >&2; fail "Z2-A: refuse diagnostic did not name the candidate $LANDED_C2"; }
# No data loss / no premature teardown: branch + journal still present, c2 still on main.
( cd "$SCRATCH2/main" && git rev-parse --verify feature/p972-demo >/dev/null 2>&1 ) \
  || fail "Z2-A: branch was deleted by a refusing resume (must be untouched)"
[[ -f "$JOURNAL2" ]] || fail "Z2-A: journal was deleted by a refusing resume (must be untouched)"
[[ "$( cat "$SCRATCH2/main/shared.txt" )" == "resolved (keep main)" ]] \
  || fail "Z2-A: main content changed on a refusing resume (data loss)"

# Step B: --mark-landed must refuse a sha that is NOT on main (safety boundary).
set +e
BADMARK_OUT="$( cd "$SCRATCH2/main" && bash "$GIT_OPS2" ship p972 --mark-landed "$SRC_C2" "$SRC_C2" 2>&1 )"
BADMARK_RC=$?
set -e
(( BADMARK_RC != 0 )) || { echo "$BADMARK_OUT" >&2; fail "Z2-B: --mark-landed accepted a sha not on main (must refuse)"; }
echo "$BADMARK_OUT" | grep -qF 'not on main' || { echo "$BADMARK_OUT" >&2; fail "Z2-B: --mark-landed wrong refusal reason"; }

# Step C: operator confirms + marks the real landed sha, then resume converges.
( cd "$SCRATCH2/main" && bash "$GIT_OPS2" ship p972 --mark-landed "$SRC_C2" "$LANDED_C2" >/dev/null 2>&1 ) \
  || fail "Z2-C: --mark-landed of the real landed sha failed"
set +e
RESUME2C_OUT="$( cd "$SCRATCH2/main" && bash "$GIT_OPS2" ship p972 --resume 2>&1 )"
RESUME2C_RC=$?
set -e
(( RESUME2C_RC == 0 )) || { echo "$RESUME2C_OUT" >&2; fail "Z2-C: --resume after --mark-landed exited non-zero ($RESUME2C_RC)"; }

Z2_COUNT="$( cd "$SCRATCH2/main" && git log --oneline main | grep -c 'p972: commit' || true )"
[[ "$Z2_COUNT" == "2" ]] || { echo "$RESUME2C_OUT" >&2; fail "Z2-C: expected 2 p972 commits on main (c2 landed exactly once), got $Z2_COUNT"; }
[[ -f "$JOURNAL2" ]] && { echo "$RESUME2C_OUT" >&2; fail "Z2-C: journal not deleted after successful resume"; }
if ( cd "$SCRATCH2/main" && git rev-parse --verify feature/p972-demo >/dev/null 2>&1 ); then
  fail "Z2-C: feature/p972-demo branch not deleted after resume"
fi
[[ -f "$SCRATCH2/main/features/done/2026-04-22/p972_demo.md" ]] || fail "Z2-C: spec not moved after resume"
echo "$RESUME2C_OUT" | grep -qF 'Ready to push' || { echo "$RESUME2C_OUT" >&2; fail "Z2-C: resume output did not contain 'Ready to push'"; }
[[ -e "$GITDIR2/CHERRY_PICK_HEAD" ]] && fail "Z2-C: CHERRY_PICK_HEAD still present after successful resume"

pass "Z2: crash-window --resume refuses safely (names candidate, no data loss); --mark-landed converges"
echo "ALL P972 CANARY CHECKS PASSED"
