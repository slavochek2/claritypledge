#!/bin/bash
# next-p-number.sh
# Prints the next available P-number for a new feature file.
#
# Rules:
# - Scans features/ including done/ subdirectories
# - Also scans .claude/worktrees/*/features/ to avoid P-number collisions
# - Also scans worktree slot locks (.claude/worktrees/*/.lock, P_NUMBER=) — a slot
#   claimed by `git-ops.sh claim pN` owns that number from the moment of the claim,
#   but the claim creates a BRANCH and a lock, not a spec file. Every other source
#   here is a file, so a lock-only claim was invisible and this script re-issued the
#   number (P1279, 2026-09-09: w20 claimed p1279 at 00:24, this script handed the
#   same number to another session 13h later; the duplicate-P-number check could not
#   fire either, since there was only ever one spec FILE). Liveness is deliberately
#   NOT consulted — a dead session's claim still burns the number, exactly as a
#   deleted spec's and a rejected archive spec's do below. Numbers are free; silent
#   reuse is not.
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

# Include P-numbers reserved by worktree slot locks (see header).
#
# BOTH restrictions below are load-bearing; the first version of this had neither
# and a single stray file could have poisoned every future allocation permanently
# (found by review before it shipped):
#
#   1. Only `wN` slot directories. `git-ops.sh` creates slots as w[0-9]+ and nothing
#      else is a claim. Globbing */.lock let ANY directory under .claude/worktrees/
#      count -- a backup dir, an editor's scratch dir, a half-deleted slot.
#   2. The value must be exactly `pNNN`. Anchoring only the KEY (`^P_NUMBER=`) and
#      then grepping digits out of the remainder accepted `oops999999` as a claim on
#      999999, jumping the sequence by a million with no way back. The producer
#      validates `^p[0-9]+$` before writing; a consumer looser than its producer
#      turns any corrupted lock into a permanent allocation defect.
#
# The 1-7 digit bound rejects absurd strings while leaving five orders of magnitude
# of headroom over the current sequence (~1300).
lock_highest=$(
  for _slot in "$WORKTREES_DIR"/w[0-9]*/.lock; do
    [ -f "$_slot" ] || continue
    # tr -d '\r' so a CRLF lock does not defeat the anchored value match.
    grep -h '^P_NUMBER=' "$_slot" 2>/dev/null | tr -d '\r' | sed 's/^P_NUMBER=//'
  done \
  | grep -oiE '^p[0-9]{1,7}$' \
  | grep -oE '[0-9]+' \
  | sort -n | tail -1)

if [[ -n "$lock_highest" ]] && [[ -z "$highest" || "$lock_highest" -gt "$highest" ]]; then
  highest="$lock_highest"
fi

if [ -z "$highest" ]; then
  echo 1
else
  echo $((highest + 1))
fi
