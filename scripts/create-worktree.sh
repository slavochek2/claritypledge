#!/usr/bin/env bash
# Usage: ./scripts/create-worktree.sh <slot> <branch-name>
# Example: ./scripts/create-worktree.sh w3 feature/p590-new-thing
#
# Atomic worktree creation: git worktree add + setup (symlinks .env.local,
# node_modules, .env.test.local) in one step. Impossible to create a
# worktree without env files.
#
# Also verifies no uncommitted src/ changes exist — worktrees only get
# committed code, so uncommitted edits would silently be missing.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MAIN_REPO="$(dirname "$SCRIPT_DIR")"
WORKTREE_DIR="$MAIN_REPO/.claude/worktrees/$1"

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <slot> <branch-name>"
  echo "Example: $0 w3 feature/p590-new-thing"
  exit 1
fi

SLOT="$1"
BRANCH="$2"

# Guard: check for uncommitted src/ changes
DIRTY_SRC="$(cd "$MAIN_REPO" && git status --short -- src/ | head -5)"
if [[ -n "$DIRTY_SRC" ]]; then
  echo "⚠️  Uncommitted src/ changes on main — worktree will be missing them:"
  echo "$DIRTY_SRC"
  echo ""
  echo "Commit first: git add <files> && git commit -m 'wip: ...'"
  echo "Or proceed anyway with: SKIP_SRC_CHECK=1 $0 $*"
  if [[ "${SKIP_SRC_CHECK:-}" != "1" ]]; then
    exit 1
  fi
fi

# Create worktree
git worktree add "$WORKTREE_DIR" -b "$BRANCH"

# Run setup (symlinks .env.local, node_modules, .env.test.local)
"$MAIN_REPO/scripts/setup-worktree.sh" "$WORKTREE_DIR"

echo ""
echo "✅ Ready: $WORKTREE_DIR (branch: $BRANCH)"
echo "   cd $WORKTREE_DIR && npm run dev"
