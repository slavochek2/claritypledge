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
if [ -z "${INDEX_MUTATORS+x}" ]; then
    INDEX_MUTATORS=(
        "Agent skills sync (P1151)"
    )
fi

_index_fingerprint() {
    # Read-only by construction (epistemic gate 2b): a guard that writes to the index
    # to check the index destroys the evidence it exists to preserve.
    git diff --cached --name-only 2>/dev/null | shasum | cut -d' ' -f1
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
    local tmpfile rc before after
    tmpfile=$(mktemp)
    before=$(_index_fingerprint)
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
    if [ "$before" != "$after" ] && ! _index_may_mutate "$label"; then
        echo -e "${RED}✗ INDEX INTEGRITY: '$label' changed the staged file list.${NC}"
        echo -e "${YELLOW}  fingerprint before: ${before:0:12}   after: ${after:0:12}${NC}"
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
