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
SCRIPT_PRE_COMMIT="$MAIN_REPO/scripts/pre-commit-checks.sh"
SCRIPT_PRE_PUSH="$MAIN_REPO/scripts/pre-push-checks.sh"

mkdir -p "$HOOKS_DIR"

ln -sf "$SCRIPT_PRE_COMMIT" "$HOOKS_DIR/pre-commit"
chmod +x "$SCRIPT_PRE_COMMIT"
echo "Pre-commit hook installed → $HOOKS_DIR/pre-commit"

# Pre-push privacy firewall (P917) — tracked source, symlinked like pre-commit so a
# fresh clone / worktree / CI gets the privacy judgment gate, not just the CI secret scan.
ln -sf "$SCRIPT_PRE_PUSH" "$HOOKS_DIR/pre-push"
chmod +x "$SCRIPT_PRE_PUSH"
echo "Pre-push hook installed → $HOOKS_DIR/pre-push"
