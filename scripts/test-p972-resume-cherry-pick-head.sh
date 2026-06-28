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
echo "ALL P972 CANARY CHECKS PASSED"
