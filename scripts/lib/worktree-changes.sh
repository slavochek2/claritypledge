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
# P1450 (strict principle, 2026-10-27): UNTRACKED IS NEVER DISPOSABLE. An untracked (`??`)
# entry is a user change at any depth, whatever its name or extension, with exactly one
# exception: a `node_modules` that is a SYMLINK (the hydration symlink; `node_modules/` in
# .gitignore does not match a symlink). Only git-IGNORED (`!!`) entries can be regenerable
# (dist, test-results, playwright-report, coverage, node_modules, __pycache__ and the python
# tool caches), matched on whole literal path COMPONENTS, never substrings and never globs.
# Earlier rules that exempted untracked regenerable names or "hand-written source" extensions
# deleted the only copy of real work (src/coverage/handwritten.js, tools/dist/x.json).
#
# FAILS TOWARD DIRTY. Callers use this to decide whether destroying or advertising
# a worktree is safe, so anything unreadable — a git error, a quoted filename this
# parser does not unpick — counts as a change. A false "dirty" costs one refusal
# that names --nonce; a false "clean" deletes somebody's work.
worktree_has_user_changes() {
  [[ -n "$(worktree_user_change_lines "$1")" ]]
}

# Names of regenerable output. Applied to IGNORED entries only.
_wc_regen_name() {
  case "$1" in
    dist|playwright-report|test-results|coverage|node_modules|__pycache__) return 0 ;;
    .pytest_cache|.ruff_cache|.mypy_cache) return 0 ;;
  esac
  return 1
}

# Ignored path (file or dir): some whole path component is regenerable output. Components are
# split with parameter expansion, never an unquoted word split, so a name containing glob
# characters is compared literally and the caller's IFS and globbing are untouched.
_wc_is_regen_path() {
  local rest="$1" c
  while [[ -n "$rest" ]]; do
    c="${rest%%/*}"
    if [[ "$rest" == */* ]]; then rest="${rest#*/}"; else rest=""; fi
    [[ -n "$c" ]] || continue
    _wc_regen_name "$c" && return 0
  done
  return 1
}

# Untracked directory (git collapses a wholly-untracked dir to one `?? dir/` line): clean only
# when it holds nothing but symlinked node_modules. Any find error, or an empty listing, is work.
_wc_untracked_dir_only_hydration() {
  local wt="$1" rel="$2" listing f any=0
  listing="$(find "$wt/$rel" ! -type d -print 2>/dev/null)" || return 1
  while IFS= read -r f; do
    [[ -n "$f" ]] || continue
    any=1
    [[ -L "$f" && "${f##*/}" == node_modules ]] || return 1
  done <<< "$listing"
  (( any == 1 ))
}

# Ignored real directory whose every non-directory entry is regenerable output.
_wc_dir_only_regenerable() {
  local wt="$1" rel="$2" listing f any=0
  [[ -d "$wt/$rel" && ! -L "$wt/$rel" ]] || return 1
  listing="$(find "$wt/$rel" ! -type d -print 2>/dev/null)" || return 1
  while IFS= read -r f; do
    [[ -n "$f" ]] || continue
    any=1
    _wc_is_regen_path "${f#"$wt"/}" || return 1
  done <<< "$listing"
  (( any == 1 ))
}

# worktree_user_change_lines <path>
#   prints each porcelain line that counts as a user change (one per line), and
#   nothing when the worktree is clean apart from bookkeeping. The SAME walk the
#   predicate uses, so a "RETAINED" message names exactly what caused it.
#   Fails toward dirty: an unreadable worktree prints a placeholder line.
worktree_user_change_lines() {
  local wt="$1" out line name sub errf
  [[ -d "$wt" ]] || { echo "(worktree path missing)"; return 0; }
  # GIT_OPTIONAL_LOCKS=0 (P1450): a probe must not write. `git status` opportunistically rewrites
  # the index, and the index mtime is one of the idle signals `git-ops tidy` reads.
  # Any stderr from git (an unreadable directory it skipped, a warning) means the listing may be
  # incomplete, which counts as a change.
  errf="$(mktemp 2>/dev/null)" || { echo "(cannot probe worktree)"; return 0; }
  out="$(GIT_OPTIONAL_LOCKS=0 git -C "$wt" status --porcelain --ignored --untracked-files=normal 2>"$errf")" \
    || { rm -f "$errf"; echo "(git status failed)"; return 0; }
  if [[ -s "$errf" ]]; then rm -f "$errf"; echo "(git status reported errors: listing may be incomplete)"; return 0; fi
  rm -f "$errf"
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    name="${line:3}"; name="${name%/}"
    # A quoted name (spaces, unicode, control characters) is not unpicked here: it is work.
    if [[ "$name" == \"* ]]; then echo "$line"; continue; fi
    if [[ "${line:0:3}" == "!! " ]]; then
      _wc_is_regen_path "$name" && continue
      _wc_dir_only_regenerable "$wt" "$name" && continue
      case "$name" in
        .activity|.activity.*|.hold|.hold.*) continue ;;
        .env.local|.env.test.local) [[ -L "$wt/$name" ]] && continue ;;
        .private)
          # Directory reported collapsed; look inside for anything that is not e2e login state.
          # A find error is a change, never "nothing found".
          if sub="$(find "$wt/.private" \( -type f -o -type l \) ! -path "$wt/.private/test-auth/*" -print 2>/dev/null)" \
             && [[ -z "$sub" ]]; then
            continue
          fi ;;
      esac
      echo "$line"; continue
    fi
    if [[ "${line:0:3}" == "?? " ]]; then
      case "$name" in
        .lock|.lock.*|.activity|.activity.*|.hold|.hold.*) continue ;;
        .env.local|.env.test.local) [[ -L "$wt/$name" ]] && continue ;;
      esac
      # The one untracked exemption: the hydration symlink.
      if [[ -L "$wt/$name" ]]; then
        [[ "${name##*/}" == node_modules ]] && continue
      elif [[ -d "$wt/$name" ]]; then
        _wc_untracked_dir_only_hydration "$wt" "$name" && continue
      fi
    fi
    echo "$line"
  done <<< "$out"
  return 0
}
