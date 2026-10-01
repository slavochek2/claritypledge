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
# IGNORED files count too (three independent reviewers, 2026-09-16). `.gitignore`
# says "do not commit", not "disposable": a session's notes under `.private/`, or a
# real (non-symlink) `.env.local`, are ignored AND the only copy. Exempt only what is
# regenerated — measured on the live slots that day: dist/, playwright-report/,
# test-results/, and .private/test-auth/ (e2e login state). coverage/ added as the
# same class. __pycache__/ at any depth too (P1381): running any repo python helper
# in a slot writes one, and it kept a fully shipped worktree "dirty" forever.
#
# FAILS TOWARD DIRTY. Callers use this to decide whether destroying or advertising
# a worktree is safe, so anything unreadable — a git error, a quoted filename this
# parser does not unpick — counts as a change. A false "dirty" costs one refusal
# that names --nonce; a false "clean" deletes somebody's work.
worktree_has_user_changes() {
  [[ -n "$(worktree_user_change_lines "$1")" ]]
}

# worktree_user_change_lines <path>
#   prints each porcelain line that counts as a user change (one per line), and
#   nothing when the worktree is clean apart from bookkeeping. The SAME walk the
#   predicate uses, so a "RETAINED" message names exactly what caused it. Before
#   P1381 the message filtered plain `git status` while the decision read
#   `--ignored`, so an ignored culprit produced a retention with an empty list.
#   Fails toward dirty: an unreadable worktree prints a placeholder line.
worktree_user_change_lines() {
  local wt="$1" out line name
  [[ -d "$wt" ]] || { echo "(worktree path missing)"; return 0; }
  out="$(git -C "$wt" status --porcelain --ignored --untracked-files=normal 2>/dev/null)" || { echo "(git status failed)"; return 0; }
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    if [[ "${line:0:3}" == "!! " ]]; then
      name="${line:3}"; name="${name%/}"
      case "$name" in
        dist|playwright-report|test-results|coverage|node_modules|.activity|.activity.*) continue ;;
        __pycache__|*/__pycache__) continue ;;
        .env.local|.env.test.local) [[ -L "$wt/$name" ]] && continue ;;
        .private)
          # Directory reported collapsed; look inside for anything that is not e2e login state.
          if [[ -z "$(find "$wt/.private" \( -type f -o -type l \) ! -path "$wt/.private/test-auth/*" -print 2>/dev/null | awk 'NR==1')" ]]; then
            continue
          fi ;;
      esac
      echo "$line"; continue
    fi
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
    echo "$line"
  done <<< "$out"
  return 0
}
