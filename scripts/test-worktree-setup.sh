#!/usr/bin/env bash
# Hermetic canary for scripts/setup-worktree.sh (P783).
#
# Proves three invariants simultaneously:
#   1. The main repo's .env.local and .env.test.local are byte-identical after
#      setup-worktree.sh runs (no concurrent truncation from the script itself).
#   2. No line of setup-worktree.sh's stdout or stderr parses as a shell redirect
#      (`>`, `>>`, `<`, `|`) at word boundaries.
#   3. Capturing setup-worktree.sh's output and passing it to `eval` inside a
#      sandbox does NOT wipe a protected file — proving the re-lex attack that
#      caused the P783 incident is structurally impossible now.
#
# No `git worktree add` — this is a unit test, not an integration test.
# Runs in ~1 second, deterministic, no side effects on the live repo.
#
# IMPORTANT: never invoke this script via `eval "$(bash scripts/test-worktree-setup.sh)"`.
# Always call as `bash scripts/test-worktree-setup.sh`. The script's output is
# human-readable, not shell-evalable.

set -euo pipefail

# P785 — Clear inherited git env vars FIRST. When this script runs inside a git
# pre-commit hook, the hook sets GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE in the
# environment. Nested `git init` / `git add` / `git commit` subshells below would
# inherit them and operate on the OUTER worktree's real index — staging files
# like .env.local into the caller's stage. Unset before any git invocation.
# Invariant 4 below asserts this by snapshotting the outer index pre/post.
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR

# Snapshot outer worktree's staged set BEFORE anything. Invariant 4 (P785) asserts
# it's byte-identical after the canary finishes — any diff means the canary leaked.
ORIGINAL_CWD="$(pwd)"
OUTER_INDEX_PRE=""
if ( cd "$ORIGINAL_CWD" && git rev-parse --is-inside-work-tree >/dev/null 2>&1 ); then
  OUTER_INDEX_PRE="$(cd "$ORIGINAL_CWD" && git diff --cached --name-only 2>/dev/null || true)"
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# Build a fake "main repo" layout. We use the real setup-worktree.sh from the
# current checkout — whatever edit the engineer is about to commit.
mkdir -p "$SCRATCH/main/scripts" \
         "$SCRATCH/main/node_modules" \
         "$SCRATCH/main/supabase/migrations" \
         "$SCRATCH/main/features" \
         "$SCRATCH/worktree" \
         "$SCRATCH/worktree/features" \
         "$SCRATCH/worktree/supabase"

# Seed env files with sentinel content that proves truncation if it happens.
echo "CANARY_KEEP_ME=1" > "$SCRATCH/main/.env.local"
echo "CANARY_TEST=1" > "$SCRATCH/main/.env.test.local"

# Seed a fake feature spec so setup-worktree.sh's features/*.md copy loop has
# something to match — the upstream script uses an unguarded glob and fails on
# empty match. Not a bug this canary is responsible for catching.
echo "---" > "$SCRATCH/main/features/p000_canary.md"
PRE_HASH_LOCAL="$(shasum -a 256 "$SCRATCH/main/.env.local" | awk '{print $1}')"
PRE_HASH_TEST="$(shasum -a 256 "$SCRATCH/main/.env.test.local" | awk '{print $1}')"

# git-init the scratch main so --git-common-dir resolves correctly from inside
# setup-worktree.sh. We need to commit at least one file so HEAD exists.
(
  cd "$SCRATCH/main"
  git init -q
  git -c user.email=canary@test -c user.name=canary add .env.local .env.test.local features/p000_canary.md
  git -c user.email=canary@test -c user.name=canary commit -qm "canary init" \
      -- .env.local .env.test.local features/p000_canary.md
) >/dev/null 2>&1

# Untracked spec — must NOT be copied after the git ls-files fix.
echo "---" > "$SCRATCH/main/features/p001_untracked.md"

# Copy the current setup-worktree.sh under test.
cp "$REPO_ROOT/scripts/setup-worktree.sh" "$SCRATCH/main/scripts/setup-worktree.sh"
chmod +x "$SCRATCH/main/scripts/setup-worktree.sh"

# Run it, capturing combined stdout+stderr to a log. We deliberately capture
# to a file — never to a shell substitution — so the test cannot itself be
# tricked by a malicious output line.
if ! (
  cd "$SCRATCH/main"
  "$SCRATCH/main/scripts/setup-worktree.sh" "$SCRATCH/worktree"
) >"$SCRATCH/out.log" 2>&1; then
  cat "$SCRATCH/out.log" >&2
  fail "setup-worktree.sh exited non-zero"
fi

# Invariant 0: spec copy is git-tracking-aware — tracked specs copied, untracked not.
[[ -f "$SCRATCH/worktree/features/p000_canary.md" ]] \
  || fail "tracked spec p000_canary.md was not copied to worktree"
[[ ! -f "$SCRATCH/worktree/features/p001_untracked.md" ]] \
  || fail "untracked spec p001_untracked.md should not be copied to worktree"

# Invariant 1: main repo env files unchanged.
POST_HASH_LOCAL="$(shasum -a 256 "$SCRATCH/main/.env.local" | awk '{print $1}')"
POST_HASH_TEST="$(shasum -a 256 "$SCRATCH/main/.env.test.local" | awk '{print $1}')"
[[ "$PRE_HASH_LOCAL" == "$POST_HASH_LOCAL" ]] || fail ".env.local hash changed (pre=$PRE_HASH_LOCAL post=$POST_HASH_LOCAL)"
[[ "$PRE_HASH_TEST"  == "$POST_HASH_TEST"  ]] || fail ".env.test.local hash changed"

# Invariant 2: no output line contains `>`, `<`, or `|` anywhere. This is
# deliberately stricter than a space-bounded redirect regex because `->`
# (the exact P783 trigger) has `-` before `>` and would slip past a regex
# that requires whitespace-boundaries.
if grep -q '[><|]' "$SCRATCH/out.log"; then
  echo "--- offending lines ---" >&2
  grep -n '[><|]' "$SCRATCH/out.log" >&2
  echo "--- end offending lines ---" >&2
  fail "setup-worktree.sh emitted shell-redirect-parseable output"
fi

# Invariant 3: adversarial eval of the captured output cannot wipe a sandbox
# file. This is the most important invariant — it proves the bug class is
# closed even if Invariant 2 is ever weakened.
SANDBOX="$SCRATCH/sandbox"
mkdir -p "$SANDBOX"
echo "PROTECTED=1" > "$SANDBOX/.env.local"
PRE_HASH_SANDBOX="$(shasum -a 256 "$SANDBOX/.env.local" | awk '{print $1}')"

# Suppress both stdout and stderr and catch any command-not-found errors.
(
  cd "$SANDBOX"
  # shellcheck disable=SC2005
  eval "$(cat "$SCRATCH/out.log")" >/dev/null 2>&1 || true
)

POST_HASH_SANDBOX="$(shasum -a 256 "$SANDBOX/.env.local" | awk '{print $1}')"
[[ "$PRE_HASH_SANDBOX" == "$POST_HASH_SANDBOX" ]] \
  || fail "adversarial eval of setup-worktree.sh output wiped sandbox/.env.local (pre=$PRE_HASH_SANDBOX post=$POST_HASH_SANDBOX)"

# Also verify the sandbox file is still non-empty — a sanity check on top of
# the hash comparison (in case both hashes match "empty file" hashes somehow).
[[ -s "$SANDBOX/.env.local" ]] \
  || fail "adversarial eval left sandbox/.env.local empty"

# Invariant 4 (P785): outer worktree's staged set is byte-identical after the
# canary runs. If it isn't, this script leaked `git add` into the caller's index
# — the exact regression P785 fixed. Running this check last means any inherited
# GIT_DIR that slipped past the `unset` at the top will be caught here.
if [[ -n "$ORIGINAL_CWD" ]] && ( cd "$ORIGINAL_CWD" && git rev-parse --is-inside-work-tree >/dev/null 2>&1 ); then
  OUTER_INDEX_POST="$(cd "$ORIGINAL_CWD" && git diff --cached --name-only 2>/dev/null || true)"
  if [[ "$OUTER_INDEX_PRE" != "$OUTER_INDEX_POST" ]]; then
    # Reset any pollution before failing so the caller's state is recoverable.
    # Null-delimiter `xargs -0` handles filenames with whitespace safely — the AC
    # guarantee is "auto-resets any pollution", so we implement it for all paths.
    DIFF_FILES="$(diff <(echo "$OUTER_INDEX_PRE") <(echo "$OUTER_INDEX_POST") | grep '^>' | sed 's/^> //')"
    if [[ -n "$DIFF_FILES" ]]; then
      ( cd "$ORIGINAL_CWD" && printf '%s\n' "$DIFF_FILES" | tr '\n' '\0' | xargs -0 git reset HEAD -- 2>/dev/null || true )
    fi
    fail "outer worktree index at $ORIGINAL_CWD changed during canary run (P785 regression — added: $DIFF_FILES)"
  fi
fi

echo "PASS: setup-worktree.sh preserves env files, emits only safe output, and does not leak git env"
