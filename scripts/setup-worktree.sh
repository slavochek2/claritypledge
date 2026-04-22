#!/usr/bin/env bash
# Usage: ./scripts/setup-worktree.sh <worktree-path>
# Sets up symlinks in a git worktree so agents can run tests, scripts, and dev servers.
# Symlinks .env.local and node_modules from the main repo into the worktree.
# Idempotent — safe to run multiple times. Removes real directories before symlinking.
#
# SHELL-SAFETY INVARIANT (P783):
# Output from this script MUST NEVER contain tokens parseable as shell redirects
# (`>`, `>>`, `<`, `|`, `>&`) at word boundaries. A caller that accidentally routes
# stderr into eval (e.g. `eval "$(... 2>&1 1>/tmp/...)"`) would otherwise trigger
# in-place truncation of the path named after the redirect token. All status lines
# MUST go through `_safe_echo` — it aborts on any redirect-parseable token.
# See features/p783_env_local_truncation.md and .claude/rules/shell-safety.md.

set -euo pipefail

# Resolve main repo via git --git-common-dir, not relative path from $0.
# --git-common-dir always returns the main repo's .git dir, even from worktrees.
# Using dirname($0)/.. fails when this script is invoked from a worktree's copy,
# creating circular symlinks (node_modules → itself, exit code 194 on all npm commands).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MAIN_REPO="$(dirname "$(cd "$SCRIPT_DIR" && git rev-parse --path-format=absolute --git-common-dir)")"

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <worktree-path>"
  exit 1
fi

WORKTREE="$1"

if [[ ! -d "$WORKTREE" ]]; then
  echo "Error: worktree path does not exist: $WORKTREE"
  exit 1
fi

# L1b — Output-string lint. Aborts if this script emits any `>`, `<`, or `|`
# character that shell could parse as a redirect or pipe under eval. The check
# is deliberately conservative (rejects these characters anywhere in the line)
# because the script's legitimate output never contains them. The P783 bug
# specifically used `->`, where the `>` is preceded by `-` not whitespace — a
# space-bounded regex would have missed it.
_safe_echo() {
  local line="$1"
  if [[ "$line" == *'>'* || "$line" == *'<'* || "$line" == *'|'* ]]; then
    echo "FATAL: setup-worktree.sh attempted unsafe output: $line" >&2
    exit 3
  fi
  echo "$line"
}

# L2 — invariant guard helpers (portable; avoids BSD vs GNU stat differences).
_size() { wc -c < "$1" 2>/dev/null | tr -d ' '; }
_hash() { shasum -a 256 "$1" 2>/dev/null | awk '{print $1}'; }

# Snapshot the main repo's env files BEFORE any work. If either changes during
# this script's run, abort loudly. This does NOT catch concurrent external evals
# of this script's output (the actual P783 failure mode) — that class is closed
# by L1 + L1b. L2 is defense-in-depth for unforeseen regressions.
_PRE_ENV_LOCAL_HASH="$(_hash "$MAIN_REPO/.env.local")"
_PRE_ENV_LOCAL_SIZE="$(_size "$MAIN_REPO/.env.local")"
_PRE_ENV_TEST_HASH="$(_hash "$MAIN_REPO/.env.test.local")"
_PRE_ENV_TEST_SIZE="$(_size "$MAIN_REPO/.env.test.local")"

_guard_verify() {
  local f="$1" pre_size="$2" pre_hash="$3"
  # Skip if the file didn't exist pre-run (size empty or zero) — nothing to protect.
  [[ -z "$pre_size" || "$pre_size" == "0" ]] && return 0
  local post_size post_hash
  post_size="$(_size "$f")"
  post_hash="$(_hash "$f")"
  if [[ -z "$post_size" || "$post_size" -lt "$pre_size" || "$post_hash" != "$pre_hash" ]]; then
    echo "FATAL: $f changed during setup-worktree.sh (pre=$pre_size/$pre_hash post=$post_size/$post_hash)" >&2
    exit 2
  fi
}

symlink() {
  local src="$1"
  local dest="$2"
  local label="$3"

  # Remove existing real directory (ln -sf won't replace a dir, only a symlink)
  if [[ -d "$dest" && ! -L "$dest" ]]; then
    rm -rf "$dest"
  fi

  if ln -sf "$src" "$dest" 2>/dev/null; then
    # L1 — use `:` separator (no shell-metacharacter meaning at word boundary),
    # not `->` (which eval-of-stderr interprets as `-` + `>` redirect).
    _safe_echo "OK  $label: $src"
  else
    _safe_echo "FAIL  $label symlink failed"
    return 1
  fi
}

symlink "$MAIN_REPO/.env.local"              "$WORKTREE/.env.local"              ".env.local"
symlink "$MAIN_REPO/node_modules"           "$WORKTREE/node_modules"           "node_modules"
symlink "$MAIN_REPO/scripts"               "$WORKTREE/scripts"               "scripts"
symlink "$MAIN_REPO/supabase/migrations"   "$WORKTREE/supabase/migrations"   "supabase/migrations"

# .env.test.local is needed for integration tests (Playwright + supabase-admin)
if [[ -f "$MAIN_REPO/.env.test.local" ]]; then
  symlink "$MAIN_REPO/.env.test.local" "$WORKTREE/.env.test.local" ".env.test.local"
fi

# Copy any feature specs that exist on main but not yet in the worktree.
# Agents frequently need a spec that was filed on main to start feature work in a worktree.
for spec in "$MAIN_REPO"/features/p*.md; do
  fname="$(basename "$spec")"
  if [[ ! -f "$WORKTREE/features/$fname" ]]; then
    cp "$spec" "$WORKTREE/features/$fname"
    _safe_echo "Copied  features/$fname"
  fi
done

# L2 — verify main repo env files are intact before exiting. Any mutation
# during this script's run (own bug, concurrent process, caller interference)
# trips the guard here.
_guard_verify "$MAIN_REPO/.env.local"      "$_PRE_ENV_LOCAL_SIZE" "$_PRE_ENV_LOCAL_HASH"
_guard_verify "$MAIN_REPO/.env.test.local" "$_PRE_ENV_TEST_SIZE"  "$_PRE_ENV_TEST_HASH"

# Emit absolute worktree path so agents can use it as the path prefix for Write/Edit calls
_safe_echo "Worktree root: $(cd "$WORKTREE" && pwd)"
