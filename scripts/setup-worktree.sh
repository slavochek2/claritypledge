#!/usr/bin/env bash
# Usage: ./scripts/setup-worktree.sh <worktree-path>
# Sets up symlinks in a git worktree so agents can run tests, scripts, and dev servers.
# Symlinks .env.local and node_modules from the main repo into the worktree.
# Idempotent — safe to run multiple times. Removes real directories before symlinking.

set -euo pipefail

MAIN_REPO="/Users/slavochek/Projects/public/claritypledge"

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
