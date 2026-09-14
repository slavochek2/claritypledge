#!/usr/bin/env bash
# Assert the main checkout is NOT configured bare.
#
# Why this exists
# ---------------
# Twice in two days (decisions.md 2026-09-07 [technical], 2026-09-08 [process])
# `core.bare` was set to `true` on a repository that plainly has a work tree. That
# silently disables the work tree for EVERY session on the shared checkout while
# leaving all files on disk, and it presents as an unrelated argument error from
# whatever tool you happen to be running -- the first symptom on 2026-09-08 was a
# repo script rejecting its own arguments, and four canaries failing for a reason
# that had nothing to do with their subject.
#
# The recognisable shape, worth keeping: a git tool complaining it is "not in a
# repo" from a directory that obviously is one means the config, not the command.
#
# Where this runs, and why it is in two places
# --------------------------------------------
# Measured 2026-09-14 on a throwaway repo, both directions:
#
#   - IN THE MAIN CHECKOUT, a pre-commit check could never fire. With
#     core.bare=true, `git add` and `git commit` both die with "fatal: this
#     operation must be run in a work tree" BEFORE git runs any hook. A check
#     placed there alone would run green forever and be structurally incapable of
#     catching the one thing it was written for -- the failure this repo already
#     has a decision about (decisions.md 2026-09-08 [process], P1155: "a check
#     that exists, runs, and can never fire is indistinguishable from a quiet
#     system").
#
#   - IN A LINKED WORKTREE, git keeps working and the pre-commit hook DOES run,
#     even while the shared main checkout is bare. Verified: `git commit` in a
#     worktree succeeded, hook and all, with core.bare=true on its main checkout.
#
# Worktrees are this repo's default for /dev and /fix, so most commits happen
# where the hook does fire -- which is why pre-commit-checks.sh calls this too.
# The SessionStart hook covers the gap that leaves: the main checkout itself, and
# any session that never commits.
#
# `git config` and `git rev-parse` keep working in the broken state, which is what
# makes detection possible at all.
#
# Exit codes:
#   0  core.bare is false or unset on the main checkout
#   1  core.bare is true -- the checkout is broken for every session
#   2  could not determine (never reported as healthy)
set -uo pipefail

FIX=0
[[ "${1:-}" == "--fix" ]] && FIX=1

# Resolve the MAIN checkout's config regardless of which worktree we stand in:
# worktrees share the main .git via --git-common-dir, and core.bare lives there.
common="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || {
    echo "check-core-bare: cannot resolve --git-common-dir (not a git repo?)" >&2
    exit 2
}
[[ -n "$common" && -f "$common/config" ]] || {
    echo "check-core-bare: no config at ${common:-<empty>}/config" >&2
    exit 2
}

# Read the on-disk config file directly rather than `git config --get`, which
# answers for the CURRENT context and can differ from what the main checkout holds.
bare="$(git config --file "$common/config" --get core.bare 2>/dev/null || true)"

if [[ "$bare" != "true" ]]; then
    exit 0
fi

# A checkout whose work tree is present on disk is definitionally not bare.
worktree_root="$(dirname "$common")"

if (( FIX )); then
    git config --file "$common/config" core.bare false || exit 2
    echo "check-core-bare: REPAIRED — core.bare set back to false on $worktree_root"
    exit 0
fi

cat >&2 <<MSG
=============================================================================
BROKEN REPO STATE: core.bare = true on the main checkout
  $worktree_root

Every git command on that checkout — in EVERY concurrent session, not just this
one — will fail with "fatal: this operation must be run in a work tree", while
all your files sit untouched on disk. Nothing is lost; the config is wrong.

Repair (safe, in place, touches no working-tree file):
  ./scripts/check-core-bare.sh --fix
or equivalently:
  git config --file "$common/config" core.bare false

Recurred within a day of first being documented — see docs/decisions.md
2026-09-07 [technical] and 2026-09-08 [process]. If it happens again, the thing
worth capturing is WHAT WROTE .git/config, not the repair.
=============================================================================
MSG
exit 1
