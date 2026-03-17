#!/bin/bash
# Install git hooks — works in both main repo and worktrees
# Called automatically via postinstall in package.json

set -e

GIT_DIR=$(git rev-parse --git-dir 2>/dev/null || echo "")
if [ -z "$GIT_DIR" ]; then
  echo "Not a git repository, skipping hook install"
  exit 0
fi

# git --git-common-dir points to the main .git dir even from a worktree
GIT_COMMON_DIR=$(git rev-parse --git-common-dir 2>/dev/null || echo "$GIT_DIR")
HOOKS_DIR="$GIT_COMMON_DIR/hooks"
# Always point to main repo's copy — survives worktree deletion
MAIN_REPO=$(cd "$GIT_COMMON_DIR/.." && pwd)
SCRIPT="$MAIN_REPO/scripts/pre-commit-checks.sh"

mkdir -p "$HOOKS_DIR"
ln -sf "$SCRIPT" "$HOOKS_DIR/pre-commit"
chmod +x "$SCRIPT"
echo "Pre-commit hook installed → $HOOKS_DIR/pre-commit"
