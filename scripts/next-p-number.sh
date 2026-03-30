#!/bin/bash
# next-p-number.sh
# Prints the next available P-number for a new feature file.
#
# Rules:
# - Scans features/ including done/ subdirectories
# - Also scans .claude/worktrees/*/features/ to avoid P-number collisions
# - Excludes uat/ and archive/ (companion/junk files, must not drive sequence)
# - Returns highest found + 1

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FEATURES_DIR="$REPO_ROOT/features"
WORKTREES_DIR="$REPO_ROOT/.claude/worktrees"

# Scan main features/ AND all worktree features/ directories
scan_dirs="$FEATURES_DIR"
if [ -d "$WORKTREES_DIR" ]; then
  for wt in "$WORKTREES_DIR"/*/features; do
    [ -d "$wt" ] && scan_dirs="$scan_dirs $wt"
  done
fi

highest=$(find $scan_dirs -name "p*.md" 2>/dev/null \
  | grep -v "/uat/" \
  | grep -v "/archive/" \
  | grep -v "_uat\.md" \
  | grep -oE '/p[0-9]+' \
  | grep -oE '[0-9]+' \
  | sort -n \
  | tail -1)

if [ -z "$highest" ]; then
  echo 1
else
  echo $((highest + 1))
fi
