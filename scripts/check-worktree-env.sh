#!/usr/bin/env bash
# Pre-dev guard: ensures worktrees have .env.local and node_modules symlinked.
# No-ops in the main repo. Runs automatically via npm predev hook.

set -euo pipefail

# Worktrees have a .git *file* (not directory) pointing to the main repo's .git/worktrees/
if [[ -d .git ]]; then
  exit 0  # main repo — nothing to check
fi

if [[ ! -f .git ]]; then
  exit 0  # not a git repo at all — skip
fi

# We're in a worktree. Find the main repo.
MAIN_REPO="$(git rev-parse --path-format=absolute --git-common-dir | sed 's|/\.git$||')"

if [[ ! -f .env.local || ! -d node_modules ]]; then
  echo "⚠ Worktree missing .env.local or node_modules — running setup..."
  "$MAIN_REPO/scripts/setup-worktree.sh" "$(pwd)"
fi
