#!/usr/bin/env bash
# Usage: ./scripts/setup-worktree.sh <worktree-path>
# Sets up symlinks in a git worktree so agents can run tests, scripts, and dev servers.
# Symlinks .env.local and node_modules from the main repo into the worktree.
# Idempotent — safe to run multiple times. Removes real directories before symlinking.

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

symlink() {
  local src="$1"
  local dest="$2"
  local label="$3"

  # Remove existing real directory (ln -sf won't replace a dir, only a symlink)
  if [[ -d "$dest" && ! -L "$dest" ]]; then
    rm -rf "$dest"
  fi

  if ln -sf "$src" "$dest" 2>/dev/null; then
    echo "OK  $label -> $src"
  else
    echo "FAIL  $label symlink failed"
    return 1
  fi
}

symlink "$MAIN_REPO/.env.local"   "$WORKTREE/.env.local"   ".env.local"
symlink "$MAIN_REPO/node_modules" "$WORKTREE/node_modules" "node_modules"
