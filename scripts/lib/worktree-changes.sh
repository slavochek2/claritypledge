#!/bin/bash
# worktree-changes.sh — P1326
#
# worktree_has_user_changes <path>
#   exit 0  the worktree holds changes a person or session made (tracked edits,
#           staged changes, or untracked files that are not slot bookkeeping)
#   exit 1  clean apart from the slot's own bookkeeping
#
# Why this exists: `git status --porcelain` is never empty in a claimed slot — every
# slot shows `?? .lock` and `?? node_modules` (the hydration symlink, which the
# `node_modules/` ignore pattern does not match). A naive "is it dirty" check is
# therefore always true, and would mark every slot in-flight forever.
#
# Bookkeeping = the lockfile and its temp/mutex siblings, the activity marker and
# its temp siblings, and the SYMLINKS scripts/setup-worktree.sh hydrates
# (node_modules, .env.local, .env.test.local). Only those names, and only when they
# are symlinks: a symlink a session created is work, and exempting every untracked
# symlink made `abandon` delete it (adversarial review, 2026-09-16).
#
# FAILS TOWARD DIRTY. Callers use this to decide whether destroying or advertising
# a worktree is safe, so anything unreadable — a git error, a quoted filename this
# parser does not unpick — counts as a change. A false "dirty" costs one refusal
# that names --nonce; a false "clean" deletes somebody's work.
worktree_has_user_changes() {
  local wt="$1" out line name
  [[ -d "$wt" ]] || return 0
  out="$(git -C "$wt" status --porcelain --untracked-files=normal 2>/dev/null)" || return 0
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    if [[ "${line:0:3}" == "?? " ]]; then
      name="${line:3}"
      name="${name%/}"
      case "$name" in
        .lock|.lock.*|.activity|.activity.*) continue ;;
      esac
      case "$name" in
        node_modules|.env.local|.env.test.local) [[ -L "$wt/$name" ]] && continue ;;
      esac
    fi
    return 0
  done <<< "$out"
  return 1
}
