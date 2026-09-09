#!/bin/bash
# run_quiet + the index-integrity guard (P1273).
#
# WHY THIS IS A LIB: the guard needs a canary, and a canary cannot reach a function
# defined inline in pre-commit-checks.sh. Extracted so scripts/test-index-integrity-guard.sh
# can source and exercise the real implementation rather than a copy of it.
#
# THE DEFECT IT CATCHES (2026-09-09, P1273):
# git exports GIT_DIR and GIT_INDEX_FILE to its hooks, and those OVERRIDE `git -C <path>`.
# A canary that drives a scratch repo without unsetting them therefore writes into the
# COMMITTING worktree's index. scripts/test-git-ops-gc.sh did exactly this: a 6-path staged
# commit became 1497 paths mid-hook, reconstructing an old tree whose spec files exist in no
# current ref, and the later gates refused the commit over files it had never touched.
# The canary exited 0 throughout. Four sessions eliminated index corruption, branch staleness,
# untracked leftovers and a backwards diff range before the index was simply measured.

# Colors — only if the caller has not already defined them.
: "${RED:=$'\033[0;31m'}"
: "${GREEN:=$'\033[0;32m'}"
: "${YELLOW:=$'\033[1;33m'}"
: "${NC:=$'\033[0m'}"

# Steps ALLOWED to leave the index different from how they found it. Exact label match.
# Everything else doing so is a bug, not a style question.
# Must test for a real ARRAY. `${INDEX_MUTATORS+x}` is also non-empty for an exported
# SCALAR of that name (environment variables cannot be arrays), which silently discarded
# the default allowlist — measured by adversarial review.
if ! declare -p INDEX_MUTATORS 2>/dev/null | grep -q 'declare -a'; then
    INDEX_MUTATORS=(
        "Agent skills sync (P1151)"
    )
fi

# `--raw`, not `--name-only`. The name list is blind to anything that preserves the
# paths: restaging DIFFERENT content under an already-staged name, a mode-only restage,
# and a stage-then-unstage round trip all passed the earlier version (each reproduced by
# adversarial review). That blindness hides the WORSE half of this defect family — a step
# that inherits the hook's exported GIT_INDEX_FILE and runs `git add -A` stages unreviewed
# content under names the author did approve. A changed file LIST is loud, because the
# later gates refuse it, which is how P1273 surfaced at all; changed CONTENT is silent all
# the way into the commit. --raw carries blob shas and modes, so it sees both.
# It costs nothing on today's steps: the one legitimate restage in pre-commit-checks.sh
# (`git add $STAGED_TS` after eslint --fix) sits OUTSIDE run_quiet, so the `before` sample
# is taken after it. I had argued the blindness was a deliberate trade for that step; that
# was wrong, and the review corrected it.
_index_fingerprint() {
    # Read-only by construction (epistemic gate 2b): a guard that writes to the index
    # to check the index destroys the evidence it exists to preserve.
    git diff --cached --raw 2>/dev/null | shasum | cut -d' ' -f1
}

# What actually changed, for the diagnostic. Two shasum prefixes tell the reader nothing
# recoverable — in the P1273 incident that left 1497 paths staged and no record of the 6.
_index_listing() {
    git diff --cached --raw 2>/dev/null
}

_index_may_mutate() {
    local label="$1" allowed
    for allowed in ${INDEX_MUTATORS+"${INDEX_MUTATORS[@]}"}; do
        [ "$label" = "$allowed" ] && return 0
    done
    return 1
}

run_quiet() {
    local label="$1"
    shift
    local tmpfile rc before after before_list after_list
    tmpfile=$(mktemp)
    before=$(_index_fingerprint)
    before_list=$(_index_listing)
    echo -n ">>> $label... "
    if "$@" > "$tmpfile" 2>&1; then
        echo -e "${GREEN}✓${NC}"
        rc=0
    else
        echo -e "${RED}✗${NC}"
        echo "--- Last 30 lines of output ---"
        tail -30 "$tmpfile"
        echo "--- End output ---"
        rc=1
    fi
    rm -f "$tmpfile"

    # Passing is not the same as being harmless. The P1273 instance exited 0 while
    # rewriting its caller's index from 6 paths to 1497.
    after=$(_index_fingerprint)
    after_list=$(_index_listing)
    if [ "$before" != "$after" ] && ! _index_may_mutate "$label"; then
        echo -e "${RED}✗ INDEX INTEGRITY: '$label' changed the staged file list.${NC}"
        echo -e "${YELLOW}  What changed in the index (staged before -> staged after):${NC}"
        diff <(printf '%s\n' "$before_list") <(printf '%s\n' "$after_list") \
            | sed 's/^/    /' | head -40
        echo -e "${YELLOW}  If this step is long-running (a build or a test suite), a CONCURRENT${NC}"
        echo -e "${YELLOW}  session staging on the shared main checkout can also produce this — the${NC}"
        echo -e "${YELLOW}  pre-commit hook is exactly the window main.lock does not cover (P1279).${NC}"
        echo -e "${YELLOW}  Check that before blaming the step named above.${NC}"
        echo -e "${YELLOW}  A check may not stage or unstage anything. The usual cause is a canary${NC}"
        echo -e "${YELLOW}  driving a scratch repo without dropping the hook's exported git${NC}"
        echo -e "${YELLOW}  environment, which silently redirects it at THIS index. Add near the top:${NC}"
        echo -e "${YELLOW}      unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR${NC}"
        echo -e "${YELLOW}  If the step is legitimately supposed to stage, add its exact label to${NC}"
        echo -e "${YELLOW}  INDEX_MUTATORS in scripts/lib/run-quiet.sh.${NC}"
        rc=1
    fi
    return $rc
}
