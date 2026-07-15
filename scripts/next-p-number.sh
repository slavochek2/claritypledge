#!/bin/bash
# next-p-number.sh
# Prints the next available P-number for a new feature file.
#
# Rules:
# - Scans features/ including done/ subdirectories
# - Also scans .claude/worktrees/*/features/ to avoid P-number collisions
# - Also scans supabase/migrations/ filenames for pNNN tokens — a migration
#   (e.g. p975) can ship without a matching features/ spec, and it shares the
#   same P-number space, so it must drive the sequence too (else /create-spec
#   would re-issue an already-used number and collide).
# - Excludes uat/ companions only (features/uat/*.md, *_uat.md — share their
#   spec's P-number, must not drive sequence). archive/ IS scanned: a rejected
#   spec permanently owns its number, so the archive must drive the sequence
#   too, or the next filed spec silently reissues it (P996). uat companions
#   that live inside archive/ (e.g. uat_p617.md) are still excluded by the
#   filename-pattern filters below, not by directory.
# - Returns highest found + 1

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FEATURES_DIR="$REPO_ROOT/features"
WORKTREES_DIR="$REPO_ROOT/.claude/worktrees"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"

# Scan main features/ AND all worktree features/ directories
scan_dirs="$FEATURES_DIR"
if [ -d "$WORKTREES_DIR" ]; then
  for wt in "$WORKTREES_DIR"/*/features; do
    [ -d "$wt" ] && scan_dirs="$scan_dirs $wt"
  done
fi

highest=$(find $scan_dirs -name "p*.md" 2>/dev/null \
  | grep -v "/uat/" \
  | grep -v "_uat\.md" \
  | grep -oE '/p[0-9]+' \
  | grep -oE '[0-9]+' \
  | sort -n \
  | tail -1)

# Include P-numbers from deleted specs so they can't be reused.
git_highest=$(git -C "$REPO_ROOT" log --all --diff-filter=D --name-only --format="" \
  -- 'features/[pP]*.md' 'features/done/[pP]*.md' 'features/done/*/[pP]*.md' 2>/dev/null \
  | grep -oiE '[pP][0-9]+' | grep -oE '[0-9]+' \
  | sort -n | tail -1)

if [[ -n "$git_highest" ]] && [[ -z "$highest" || "$git_highest" -gt "$highest" ]]; then
  highest="$git_highest"
fi

# Include P-numbers embedded in migration filenames. A single migration may
# reference multiple specs (e.g. 20260605..._p886_reapply_p877_...), so match
# every pNNN token, not just the first. Strip the directory first so the repo
# path can never contribute a stray token.
migration_highest=$(find "$MIGRATIONS_DIR" -name '*.sql' 2>/dev/null \
  | sed 's@.*/@@' \
  | grep -oiE 'p[0-9]+' \
  | grep -oE '[0-9]+' \
  | sort -n | tail -1)

if [[ -n "$migration_highest" ]] && [[ -z "$highest" || "$migration_highest" -gt "$highest" ]]; then
  highest="$migration_highest"
fi

if [ -z "$highest" ]; then
  echo 1
else
  echo $((highest + 1))
fi
