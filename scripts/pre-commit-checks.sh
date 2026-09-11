#!/bin/bash
# Pre-commit checks for Clarity Pledge
# Run manually: ./scripts/pre-commit-checks.sh
# Or install as git hook (see bottom of file)

set -e  # Exit on first error

echo "=== PRE-COMMIT CHECKS ==="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Warn if nothing is staged — gitleaks and other staged-content checks will be vacuously skipped
if git diff --cached --quiet; then
  echo -e "${YELLOW}⚠ Nothing staged. Gitleaks and staged-content checks will be skipped.${NC}"
  echo ""
fi

ERRORS=0
WARNINGS=0

# 0. One-Worktree=One-Branch guard (P781) — block a commit on a feature/fix
# branch checked out in the MAIN repo instead of a worktree. Bare feature
# branches orphan + duplicate onto main and are invisible to kanban (incident
# 2026-06-19). Worktrees are exempt. See scripts/lib/branch-guard.sh.
BRANCH_GUARD_LIB="$(git rev-parse --show-toplevel 2>/dev/null)/scripts/lib/branch-guard.sh"
if [ -f "$BRANCH_GUARD_LIB" ]; then
    # shellcheck source=scripts/lib/branch-guard.sh
    . "$BRANCH_GUARD_LIB"
    _bg_toplevel="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
    _bg_branch="$(git branch --show-current 2>/dev/null || echo "")"
    if ! check_bare_branch "$_bg_toplevel" "$_bg_branch"; then
        echo -e "${RED}✗ Bare feature branch in main checkout: '${_bg_branch}' (P781 one-worktree=one-branch)${NC}"
        echo -e "${YELLOW}  Move to a worktree: ./scripts/create-worktree.sh wN ${_bg_branch}${NC}"
        echo -e "${YELLOW}  Or for trivia: git checkout main && ./scripts/git-ops.sh commit-to-main ...${NC}"
        ERRORS=$((ERRORS + 1))
    fi
fi

# 0. Env-sentinel (P783) — block commits if .env.local or .env.test.local are
# 0 bytes. Earliest possible failure point so a truncation cannot slip past the
# rest of the checks (which might restore/emit these files).
ENV_SENTINEL_LIB="$(git rev-parse --show-toplevel 2>/dev/null)/scripts/lib/env-sentinel.sh"
if [ -f "$ENV_SENTINEL_LIB" ]; then
    # shellcheck source=scripts/lib/env-sentinel.sh
    . "$ENV_SENTINEL_LIB"
    if ! check_env_sentinel; then
        echo -e "${RED}✗ Env file integrity check failed — commit blocked${NC}"
        ERRORS=$((ERRORS + 1))
    else
        echo -e "${GREEN}✓ Env files intact${NC}"
    fi
    echo ""
fi

# Helper: run a command, suppress output on success, show last 30 lines on failure.
# This keeps total script output under ~5KB for passing runs (vs 100KB+ before).
# P1273: run_quiet and the index-integrity guard live in a lib so the guard itself
# can be canaried (scripts/test-index-integrity-guard.sh). See that file for the defect.
# Resolve the lib next to THIS SCRIPT, not via the worktree root. The pre-commit hook is
# a symlink to the MAIN checkout's copy of this file, so a `--show-toplevel` lookup resolves
# into the committing WORKTREE — and every worktree whose branch predates this lib would
# then fail every commit with the FATAL below. That is the same "the hook's copy is not the
# worktree's copy" confusion that produced P1273 in the first place, so it does not get to
# cause a second outage. Follow the symlink chain to find where this script really lives.
_pcc_self="${BASH_SOURCE[0]}"
while [ -L "$_pcc_self" ]; do
    _pcc_link="$(readlink "$_pcc_self")"
    case "$_pcc_link" in
        /*) _pcc_self="$_pcc_link" ;;
        *)  _pcc_self="$(dirname "$_pcc_self")/$_pcc_link" ;;
    esac
done
RUN_QUIET_LIB="$(cd "$(dirname "$_pcc_self")" && pwd -P)/lib/run-quiet.sh"
if [ -f "$RUN_QUIET_LIB" ]; then
    # shellcheck source=scripts/lib/run-quiet.sh
    . "$RUN_QUIET_LIB"
else
    echo "FATAL: scripts/lib/run-quiet.sh is missing — every check below runs through it." >&2
    exit 1
fi

# T10 (P786): Compute build-affecting staged files once.
# Sections 1 (TypeScript), 3 (Build), and 4 (Tests) are gated behind this.
# Docs-only commits (features/, docs/, .claude/) skip all three.
# Whitelist: TS/JS source, package.json, *.config.*, lockfiles, public/ assets,
# vercel.json (CSP/headers — a CSP-only edit still runs the unit suite, so the
# P805/P863/P865 canaries catch a *known* allowlist host being dropped locally).
BUILD_AFFECTING=$(git diff --cached --name-only | \
  grep -E '\.(ts|tsx|js|jsx)$|^package\.json$|tsconfig.*\.json$|\.config\.(ts|js|mjs|cjs)$|\.lock$|^package-lock\.json$|^deno\.lock$|^public/|^vercel\.json$' \
  || true)

# 1. TypeScript Check (P861) — gate on the undeclared-identifier class (TS2304/
#    2552/2582, the P859 ReferenceError class) in non-test app code. The old
#    `npx tsc --noEmit` resolved the root SOLUTION tsconfig (files: []) and
#    compiled nothing — a no-op that let P859 ship. scripts/typecheck-gate.sh
#    runs the real `tsc -p tsconfig.app.json`. Strategy A->C: docs/decisions.md.
if [ -n "$BUILD_AFFECTING" ]; then
    TYPECHECK_GATE="$(git rev-parse --show-toplevel)/scripts/typecheck-gate.sh"
    if [ ! -x "$TYPECHECK_GATE" ]; then
        echo -e ">>> TypeScript... ${RED}✗ scripts/typecheck-gate.sh missing or not executable — blocking commit${NC}"
        ERRORS=$((ERRORS + 1))
    elif GATE_OUT="$("$TYPECHECK_GATE" 2>&1)"; then
        echo -e ">>> TypeScript... ${GREEN}✓ (no undeclared identifiers in app code)${NC}"
    else
        GATE_RC=$?
        if [ "$GATE_RC" -eq 2 ]; then
            echo -e ">>> TypeScript... ${RED}✗ typecheck gate could not run — blocking commit:${NC}"
        else
            echo -e ">>> TypeScript... ${RED}✗ undeclared identifier(s) in app code — will ReferenceError at runtime:${NC}"
        fi
        echo "$GATE_OUT" | head -20
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e ">>> TypeScript... ${GREEN}skipped (no build-affecting files staged)${NC}"
fi

# Collect staged files for later checks
STAGED_FILES=$(git diff --cached --name-only --diff-filter=d 2>/dev/null || echo "")

# 2. Lint (staged .ts/.tsx files only — full repo lint is npm run lint)
# Runs with --fix first so auto-fixable issues are resolved inline, then re-stages
# the affected files so the committed content matches what ESLint approved.
# This prevents index divergence when the agent manually runs eslint --fix externally.
STAGED_TS=$(echo "$STAGED_FILES" | grep -E '\.(ts|tsx)$' || true)
if [ -n "$STAGED_TS" ]; then
    npx eslint $STAGED_TS --fix --max-warnings 0 --no-warn-ignored > /dev/null 2>&1 || true
    git add $STAGED_TS 2>/dev/null || true
    if ! run_quiet "ESLint" npx eslint $STAGED_TS --max-warnings 0 --no-warn-ignored; then
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e ">>> ESLint... ${GREEN}skipped (no .ts/.tsx staged)${NC}"
fi

# 3. Build
if [ -n "$BUILD_AFFECTING" ]; then
    if ! run_quiet "Build" npm run build; then
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e ">>> Build... ${GREEN}skipped (no build-affecting files staged)${NC}"
fi

# 4. Tests
if [ -n "$BUILD_AFFECTING" ]; then
    if ! run_quiet "Tests" npm test; then
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e ">>> Tests... ${GREEN}skipped (no build-affecting files staged)${NC}"
fi

# 4.1. Cross-feature canary guard (P818 incident prevention)
# Blocks staging edits to src/tests/pN-*.test.* when pN's spec is in-progress
# but the current branch is a DIFFERENT feature. Prevents one agent from
# silently muting another feature's active canary to clear pre-commit.
#
# P825 fix: skip the guard entirely when on a non-feature branch (typically
# main). /reproduce used to commit canaries directly to main, and on main
# BRANCH_PNUM is empty, which made every pN canary look like a "different
# feature" edit and structurally blocked it. The guard still skips on non-feature
# branches for that reason. (2026-09-08: /reproduce no longer commits VITEST
# canaries to main — the Tests step above runs the whole suite on any staged
# build-affecting file, so a deliberately-red src/tests canary can never land
# there; it rides the fix branch instead, per decisions.md 2026-06-27. E2E specs
# are excluded from that run and still commit to main. This guard is unaffected
# either way.)
STAGED_CANARY_TESTS=$(echo "$STAGED_FILES" | grep -E '^src/tests/p[0-9]+' || true)
if [ -n "$STAGED_CANARY_TESTS" ]; then
    CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
    BRANCH_PNUM=$(echo "$CURRENT_BRANCH" | grep -oE 'p[0-9]+' | head -1 || echo "")
    if [ -z "$BRANCH_PNUM" ]; then
        echo -e "${GREEN}✓ Canary guard skipped — non-feature branch (${CURRENT_BRANCH})${NC}"
        echo ""
    else
        CANARY_VIOLATION=0
        while IFS= read -r canary_file; do
            file_pnum=$(basename "$canary_file" | grep -oE '^p[0-9]+' | head -1 || echo "")
            if [ -n "$file_pnum" ] && [ "$file_pnum" != "$BRANCH_PNUM" ]; then
                spec=$(find features -maxdepth 1 -name "${file_pnum}_*.md" 2>/dev/null | head -1)
                if [ -n "$spec" ]; then
                    spec_status=$(grep "^status:" "$spec" 2>/dev/null | head -1 | awk '{print $2}' || echo "")
                    if [ "$spec_status" = "in-progress" ]; then
                        echo -e "${RED}✗ Cross-feature canary edit: $canary_file is $file_pnum (in-progress) but branch is '$CURRENT_BRANCH'${NC}"
                        echo -e "${RED}  Modifying another feature's active canary silently breaks its reproduce/fix gate.${NC}"
                        echo -e "${RED}  Fix: git reset HEAD -- $canary_file${NC}"
                        CANARY_VIOLATION=1
                    fi
                fi
            fi
        done <<< "$STAGED_CANARY_TESTS"
        if [ $CANARY_VIOLATION -eq 1 ]; then
            ERRORS=$((ERRORS + 1))
        else
            echo -e "${GREEN}✓ Canary test edits are on their own feature branch${NC}"
        fi
        echo ""
    fi
fi

# 4.5. Kanban tool tests (catches type/enum regressions like P449 qa-column drop)
KANBAN_STAGED=$(git diff --cached --name-only 2>/dev/null | grep '^tools/kanban/' || true)
if [ -n "$KANBAN_STAGED" ]; then
    # Scope: lib/__tests__ (scanner-rules) + scanner-smoke only.
    # api.test.ts and goals.test.ts are integration tests that depend on
    # runtime state (file I/O, milestone content) — excluded from pre-commit.
    if ! run_quiet "Kanban tests" bash -c 'cd tools/kanban && npm test -- --run lib/__tests__ server/__tests__/scanner-smoke'; then
        ERRORS=$((ERRORS + 1))
    fi
else
    echo ">>> Kanban tests skipped (no kanban files staged)"
fi
echo ""

# 4.6. Worktree setup canary (P783) — runs when any script that touches worktree
# setup or env-file handling is staged. Hermetic, ~1 second. Proves three
# invariants: env files survive the script, no redirect-parseable output,
# adversarial eval cannot wipe a sandbox file.
WORKTREE_SETUP_STAGED=$(echo "$STAGED_FILES" | grep -E '^scripts/(setup-worktree|create-worktree|setup-cloud-worktrees|check-worktree-env|git-ops|lib/env-sentinel|test-worktree-setup|test-git-ops-extensions|pre-flight|test-preflight|test-git-ops-adopt|test-lock-state-parity)\.sh$' || true)
if [ -n "$WORKTREE_SETUP_STAGED" ]; then
    if ! run_quiet "Worktree setup canary (P783)" bash scripts/test-worktree-setup.sh; then
        ERRORS=$((ERRORS + 1))
    fi
    if [ -f "scripts/test-preflight.sh" ]; then
        if ! run_quiet "Pre-flight regression test (P786)" bash scripts/test-preflight.sh; then
            ERRORS=$((ERRORS + 1))
        fi
    fi
    # P1268. Two suites, two different jobs — neither subsumes the other.
    # The parity canary exists because pre-flight.sh carries a DELIBERATE standalone
    # copy of the lock classification (it runs from a scratch copy and cannot source
    # a lib), and the two copies had already drifted once, silently.
    if [ -f "scripts/test-lock-state-parity.sh" ]; then
        if ! run_quiet "Lock-state parity: git-ops vs pre-flight (P1268)" bash scripts/test-lock-state-parity.sh; then
            ERRORS=$((ERRORS + 1))
        fi
    fi
    if [ -f "scripts/test-git-ops-adopt.sh" ]; then
        if ! run_quiet "git-ops adopt/heartbeat canary (P1268)" bash scripts/test-git-ops-adopt.sh; then
            ERRORS=$((ERRORS + 1))
        fi
    fi
else
    echo ">>> Worktree setup canary skipped (no worktree-setup scripts staged)"
fi
echo ""

# 4.65. pre-push Layer 0 canary (P1260) — the ref-class publication refusal. Runs when the
# hook or its canary is staged. Asserts BOTH halves: that the refusal fires on feature/* and
# fix/* (gate 7), and that the repo's own documented ref shapes -- main, staging/doc-*,
# staging/pN, deletions -- still pass it untouched (gate 7c). A refusal whose fixture holds
# only inputs it should reject has an unmeasured false-positive rate.
PREPUSH_STAGED=$(echo "$STAGED_FILES" | grep -E '^scripts/(pre-push-checks|test-pre-push-refclass)\.sh$' || true)
if [ -n "$PREPUSH_STAGED" ]; then
    if [ -f "scripts/test-pre-push-refclass.sh" ]; then
        if ! run_quiet "pre-push ref-class refusal canary (P1260)" bash scripts/test-pre-push-refclass.sh; then
            ERRORS=$((ERRORS + 1))
        fi
    fi
else
    echo ">>> pre-push ref-class canary skipped (no pre-push scripts staged)"
fi
echo ""
# 4.6.5. Alert-producer author-bind canary (P1155) — runs when any alert-only
# workflow or the canary itself is staged. Every producer must only append
# to (or close) an issue the Actions bot created; without that, a producer can be
# induced to append to an issue it did not create, so it never opens its own and
# the alarm is diverted silently. Hermetic (jq against fixtures, no network).
# The canary extracts the jq filter FROM the workflows rather than restating it,
# so a drift between test and code fails rather than passing quietly.
ALERT_PRODUCER_STAGED=$(echo "$STAGED_FILES" | grep -E '^(\.github/workflows/(auth-canary|csp-smoke|db-backup|prod-health-smoke|stranded-signups|check-deploy-drift|backup-staleness|edge-smoke|alert-escalator)\.yml|scripts/(test-producer-author-bind\.sh|alert-escalator\.mjs|send-ops-email\.mjs|test-alert-escalator\.mjs|test-mailgun-send\.mjs|test-escalator-exit-codes\.sh)|\.github/alert-registry\.json)$' || true)
if [ -n "$ALERT_PRODUCER_STAGED" ]; then
    if ! run_quiet "Alert-producer author-bind canary (P1155)" bash scripts/test-producer-author-bind.sh; then
        ERRORS=$((ERRORS + 1))
    fi
    if [ -f "scripts/test-alert-escalator.mjs" ]; then
        if ! run_quiet "Alert-escalator fixture suite (P1155)" node scripts/test-alert-escalator.mjs; then
            ERRORS=$((ERRORS + 1))
        fi
    fi
    # The send layer is the riskiest file in this feature. Exercised against a local
    # fake Mailgun endpoint: request shape, the credential never leaving the
    # Authorization header, a 2xx-without-id counting as SENT (P1256), and both failure
    # modes throwing without echoing the credential.
    if [ -f "scripts/test-mailgun-send.mjs" ]; then
        if ! run_quiet "Mailgun send canary (P1155)" node scripts/test-mailgun-send.mjs; then
            ERRORS=$((ERRORS + 1))
        fi
    fi
    # The fixture suites above import the evaluators and assert on return values, so
    # neither can see the exit code — the only thing the workflow actually dispatches
    # on. A crash exiting 1 would read as "email sent" and the run would go green.
    # This one runs the script as a process with gh stubbed onto PATH.
    if [ -f "scripts/test-escalator-exit-codes.sh" ]; then
        if ! run_quiet "Alert-escalator exit-code canary (P1155)" bash scripts/test-escalator-exit-codes.sh; then
            ERRORS=$((ERRORS + 1))
        fi
    fi
else
    echo ">>> Alert-producer author-bind canary skipped (no alert workflows staged)"
fi

echo ""
# 4.6.6. Edge-function post-deploy smoke canary (P890) — runs when the deploy
# script, the smoke, or the canary itself is staged. Hermetic (throwaway git repo,
# PATH-stubbed supabase CLI, no network). Guards three things that each failed
# silently once: `_shared` is a library the Supabase CLI refuses by name and must
# never be handed to it, a genuinely failed upload must exit non-zero now that the
# status-masking pipe is gone, and the smoke must run after the manifest stamp and
# only over the functions the run actually deployed.
EDGE_SMOKE_STAGED=$(echo "$STAGED_FILES" | grep -E '^scripts/(deploy-functions\.sh|edge-function-smoke\.mjs|test-p890-deploy-smoke\.sh)$' || true)
if [ -n "$EDGE_SMOKE_STAGED" ]; then
    if [ -f "scripts/test-p890-deploy-smoke.sh" ]; then
        if ! run_quiet "Edge-function deploy smoke canary (P890)" bash scripts/test-p890-deploy-smoke.sh; then
            ERRORS=$((ERRORS + 1))
        fi
    fi
else
    echo ">>> Edge-function deploy smoke canary skipped (deploy/smoke scripts not staged)"
fi

# 4.7. git-ops.sh extensions canary (P787) — runs when git-ops.sh or its test
# canary is staged. Hermetic (~3s: 2s contention timeout + setup). Proves the
# six new subcommands (gc, abandon, reconcile, commit-to-main, switch-safe, sync)
# still hold invariants A-J: includes the concurrent commit-to-main serialization
# regression test and shell-safety check on new subcommand outputs.
GIT_OPS_STAGED=$(echo "$STAGED_FILES" | grep -E '^scripts/(git-ops|test-git-ops-extensions|test-git-ops-ship|test-p924-sigterm-orphan-reap|test-p972-resume-cherry-pick-head|lib/ship-reap)\.sh$' || true)
if [ -n "$GIT_OPS_STAGED" ]; then
    if ! run_quiet "git-ops.sh extensions canary (P787)" bash scripts/test-git-ops-extensions.sh; then
        ERRORS=$((ERRORS + 1))
    fi
    if [ -f "scripts/test-git-ops-ship.sh" ]; then
        if ! run_quiet "git-ops.sh ship canary (P788)" bash scripts/test-git-ops-ship.sh; then
            ERRORS=$((ERRORS + 1))
        fi
    fi
    # P924 — reap invariant gate. test M benefits from reap_ship but does not
    # assert "no orphan survives"; this canary does. Keep it in the gate so a
    # future regression to lib/ship-reap.sh or the M-block launch is caught even
    # on an idle machine (where the orphan would finish before test N and hide).
    if [ -f "scripts/test-p924-sigterm-orphan-reap.sh" ]; then
        if ! run_quiet "git-ops.sh ship reap-orphan canary (P924)" bash scripts/test-p924-sigterm-orphan-reap.sh; then
            ERRORS=$((ERRORS + 1))
        fi
    fi
    # P972 — resume-continue invariant. Proves `ship --resume` continues a paused
    # cherry-pick (CHERRY_PICK_HEAD == pending sha) via `git cherry-pick
    # --continue` instead of issuing a fresh pick that re-conflicts and loops.
    if [ -f "scripts/test-p972-resume-cherry-pick-head.sh" ]; then
        if ! run_quiet "git-ops.sh ship resume-continue canary (P972)" bash scripts/test-p972-resume-cherry-pick-head.sh; then
            ERRORS=$((ERRORS + 1))
        fi
    fi
    # P1260 — the gc merged-ness oracle decides whether a branch may be deleted, so a wrong
    # MERGED destroys work. Runs the revert trap in BOTH directions against this repo's real
    # history (KEEP while reverted, MERGED once re-landed); a one-directional test would pass
    # on an oracle hardwired to KEEP.
    if [ -f "scripts/test-git-ops-gc.sh" ]; then
        if ! run_quiet "git-ops.sh gc oracle canary (P1260)" bash scripts/test-git-ops-gc.sh; then
            ERRORS=$((ERRORS + 1))
        fi
    fi
else
    echo ">>> git-ops.sh extensions canary skipped (no git-ops scripts staged)"
fi
echo ""

# 4.7a2. Index-integrity guard canary (P1273). Every check in this file runs through
# run_quiet, so a check that rewrites the index corrupts the very thing the later gates
# judge. Measured 2026-09-09: test-git-ops-gc.sh drove the real repo via `git -C` without
# dropping the hook's exported GIT_DIR/GIT_INDEX_FILE — which override -C — turning a
# 6-path staged commit into 1497 paths mid-hook, while exiting 0. Runs whenever the guard,
# its canary, or this script is staged.
# Deliberately NOT built from $STAGED_FILES: that list is computed with
# --diff-filter=d, so DELETIONS are excluded. `git rm scripts/test-index-integrity-guard.sh`
# would match nothing, the -f test would also fail, and this block would print
# "skipped" while the gate was being deleted. The comment further down in this file
# spells out the same hazard for P1116 and uses a raw listing for exactly this reason;
# this block did not follow it until adversarial review pointed it out.
INDEX_GUARD_RAW=$(git diff --cached --name-only 2>/dev/null || true)
INDEX_GUARD_STAGED=$(echo "$INDEX_GUARD_RAW" | grep -E '^scripts/(lib/run-quiet|test-index-integrity-guard|pre-commit-checks)\.sh$' || true)
# A staged deletion of the guard or its canary is a hard error, never a skip.
INDEX_GUARD_DELETED=$(git diff --cached --name-only --diff-filter=D 2>/dev/null \
    | grep -E '^scripts/(lib/run-quiet|test-index-integrity-guard)\.sh$' || true)
if [ -n "$INDEX_GUARD_DELETED" ]; then
    echo -e "${RED}✗ Removing the index-integrity guard is not a silent operation:${NC}"
    echo "$INDEX_GUARD_DELETED" | sed 's/^/    /'
    echo -e "${YELLOW}  If this is deliberate, say so in the commit and remove this block too.${NC}"
    ERRORS=$((ERRORS + 1))
fi
if [ -n "$INDEX_GUARD_STAGED" ] && [ -f "scripts/test-index-integrity-guard.sh" ]; then
    if ! run_quiet "Index-integrity guard canary (P1273)" bash scripts/test-index-integrity-guard.sh; then
        ERRORS=$((ERRORS + 1))
    fi
else
    echo ">>> Index-integrity guard canary skipped (guard not staged)"
fi
echo ""

# 4.7b. lib-datetime.sh canary — runs when the shared UTC parser or its consumers
# are staged. Proves parse_utc_epoch parses ISO-Z as UTC (not local), guarding the
# `date -j` without `-u` bug that silently hung push-docs + the privacy hook.
DATETIME_STAGED=$(echo "$STAGED_FILES" | grep -E '^scripts/(lib-datetime|test-lib-datetime|git-ops)\.sh$' || true)
if [ -n "$DATETIME_STAGED" ]; then
    if ! run_quiet "lib-datetime.sh UTC-parse canary" bash scripts/test-lib-datetime.sh; then
        ERRORS=$((ERRORS + 1))
    fi
else
    echo ">>> lib-datetime.sh canary skipped (no datetime scripts staged)"
fi
echo ""

# 4.7c. migrate.sh canary (P887) — runs when migrate.sh, its vitest canary, or
# the client-safety checker is staged. Hermetic tmpdir sandbox (stub curl/git/
# security/npx). Proves the three prod gates hold: pending-list ack refusal,
# requires-frontend coupling hard-block, mandatory post-migrate smoke — and
# that test-env behavior stays unchanged.
MIGRATE_STAGED=$(echo "$STAGED_FILES" | grep -E '^(scripts/(migrate|check-migration-client-safety)\.sh|src/tests/p887-reproduce\.test\.ts)$' || true)
if [ -n "$MIGRATE_STAGED" ]; then
    if ! run_quiet "migrate.sh prod-gates canary (P887)" npx vitest run src/tests/p887-reproduce.test.ts; then
        ERRORS=$((ERRORS + 1))
    fi
else
    echo ">>> migrate.sh prod-gates canary skipped (no migrate scripts staged)"
fi
echo ""

# 4.7e. RLS scope gate canary (P1039/P1041) — runs when the unscoped-policy
# checker or either of its tests is staged. Proves the gate still BLOCKS the
# exact P1035 shape (unscoped, role-identity WITH CHECK, non-SELECT) --
# including the P1041 tokenizer-bypass shapes (double-quoted names, block
# comments, dollar-quoting, TO PUBLIC) -- and still ALLOWS scoped, annotated,
# and public-SELECT policies, so it can't silently regress.
RLS_SCOPE_STAGED=$(echo "$STAGED_FILES" | grep -E '^(scripts/check-rls-scope\.py|src/tests/p103[19]-reproduce\.test\.ts)$' || true)
if [ -n "$RLS_SCOPE_STAGED" ]; then
    if ! run_quiet "RLS scope gate canary (P1039/P1041)" npx vitest run src/tests/p1039-reproduce.test.ts src/tests/p1041-reproduce.test.ts; then
        ERRORS=$((ERRORS + 1))
    fi
else
    echo ">>> RLS scope gate canary skipped (no RLS scope check staged)"
fi
echo ""

# 4.7g. RLS drift checker canary (P1138) — runs when the drift checker or its
# self-test is staged. Proves the checker still catches P1046-shape drift, an
# out-of-band policy, AND an unconditional write policy present identically
# across prod/test/files (P1138's own blind-spot leg) — so a future concurrent-
# branch merge on this shared script can't silently ship a semantic break the
# way the P1135/P1138 key-shape merge almost did (git auto-merged clean, no
# conflict markers, but the merged result crashed at runtime).
RLS_DRIFT_STAGED=$(echo "$STAGED_FILES" | grep -E '^scripts/(rls-drift-check|test-rls-drift-check)\.py$' || true)
if [ -n "$RLS_DRIFT_STAGED" ]; then
    if ! run_quiet "RLS drift checker canary (P1138)" python3 scripts/test-rls-drift-check.py; then
        ERRORS=$((ERRORS + 1))
    fi
else
    echo ">>> RLS drift checker canary skipped (no RLS drift checker staged)"
fi
echo ""

# 4.7b. Typecheck gate canary (P861) — runs when the TypeScript gate or its
# canary is staged. Proves scripts/typecheck-gate.sh still BLOCKS an undeclared
# identifier in app code (the P859 ReferenceError class) and ALLOWS clean code,
# so the gate can't silently revert to the old no-op `tsc --noEmit`.
TYPECHECK_GATE_STAGED=$(echo "$STAGED_FILES" | grep -E '^scripts/(typecheck-gate|test-typecheck-gate|pre-commit-checks)\.sh$' || true)
if [ -n "$TYPECHECK_GATE_STAGED" ]; then
    if [ -f "scripts/test-typecheck-gate.sh" ]; then
        if ! run_quiet "Typecheck gate canary (P861)" bash scripts/test-typecheck-gate.sh; then
            ERRORS=$((ERRORS + 1))
        fi
    else
        echo -e ">>> Typecheck gate canary... ${RED}✗ scripts/test-typecheck-gate.sh missing — blocking commit${NC}"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo ">>> Typecheck gate canary skipped (no typecheck-gate scripts staged)"
fi
echo ""

# 4.7c-bis. Push snapshot-pinning canary — runs when git-ops.sh or its canary is
# staged. Proves the push/deploy paths still promote a PINNED snapshot SHA rather
# than the live `main` branch. Without this, the five separate live reads of `main`
# across a 15-20 min run silently come back: on this checkout the median gap between
# watched-path commits is ~16 min, so the reads disagree and the CI poll can never
# match its own staging branch. See scripts/test-push-snapshot-pinning.sh header and
# pp/docs/decisions.md 2026-08-28.
PUSH_PIN_STAGED=$(echo "$STAGED_FILES" | grep -E '^scripts/(git-ops|test-push-snapshot-pinning)\.sh$' || true)
if [ -n "$PUSH_PIN_STAGED" ]; then
    if [ -f "scripts/test-push-snapshot-pinning.sh" ]; then
        if ! run_quiet "Push snapshot-pinning canary" bash scripts/test-push-snapshot-pinning.sh; then
            ERRORS=$((ERRORS + 1))
        fi
    else
        echo -e ">>> Push snapshot-pinning canary... ${RED}✗ scripts/test-push-snapshot-pinning.sh missing — blocking commit${NC}"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo ">>> Push snapshot-pinning canary skipped (git-ops.sh not staged)"
fi
echo ""

# 4.7c-ter. Required-status-check canary (P1290) — runs when git-ops.sh, the required-
# checks library, or the canary itself is staged. Proves the push/deploy paths wait for
# EVERY context main's ruleset marks required, not one hardcoded name. The bug it locks
# down promoted to main while a second required check was still queued, because the
# ruleset gained `disclosure` (P1255) and the poll still waited only on `audit-privacy`.
# The MISSING-file branch blocks the commit deliberately: the library failing open means
# an empty wait-list, and an empty wait-list promotes with no CI verification at all.
# See scripts/test-p1290-required-checks-poll.sh header.
REQ_CHECKS_STAGED=$(echo "$STAGED_FILES" | grep -E '^scripts/(git-ops\.sh|lib-required-checks\.sh|test-p1290-required-checks-poll\.sh)$' || true)
if [ -n "$REQ_CHECKS_STAGED" ]; then
    if [ -f "scripts/test-p1290-required-checks-poll.sh" ] && [ -f "scripts/lib-required-checks.sh" ]; then
        if ! run_quiet "Required-status-check canary (P1290)" bash scripts/test-p1290-required-checks-poll.sh; then
            ERRORS=$((ERRORS + 1))
        fi
    else
        echo -e ">>> Required-status-check canary... ${RED}✗ scripts/lib-required-checks.sh or its canary missing — blocking commit${NC}"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo ">>> Required-status-check canary skipped (git-ops.sh / lib-required-checks.sh not staged)"
fi
echo ""

# 4.7d. Playwright tail-pipe hook canary (P911) — runs when the hook or its canary
# is staged. Proves block-pw-tail-pipe.sh still BLOCKS a live test run piped to
# head/tail (incl. `;`/`&`/`|&` and case variants) and ALLOWS mere mentions, log-file
# reads, vitest, and the canonical redirect pattern — so the narrowing can't silently
# regress into over-broad (false-blocks) or holey (missed footguns, P888 class).
PW_TAIL_HOOK_STAGED=$(echo "$STAGED_FILES" | grep -E '^(\.claude/hooks/block-pw-tail-pipe|scripts/test-block-pw-tail-pipe)\.sh$' || true)
if [ -n "$PW_TAIL_HOOK_STAGED" ]; then
    if [ -f "scripts/test-block-pw-tail-pipe.sh" ]; then
        if ! run_quiet "Playwright tail-pipe hook canary (P911)" bash scripts/test-block-pw-tail-pipe.sh; then
            ERRORS=$((ERRORS + 1))
        fi
    else
        echo -e ">>> Playwright tail-pipe hook canary... ${RED}✗ scripts/test-block-pw-tail-pipe.sh missing — blocking commit${NC}"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo ">>> Playwright tail-pipe hook canary skipped (no pw-tail-pipe hook staged)"
fi
echo ""

# 4.7e. Browser-evidence hook canary (P1221) — runs when either hook that shares the
# browser-tool evidence allowlist is staged, or the canary itself. The suite was written
# for P1116-era work and then wired into nothing: it passed 11/11 on demand and zero times
# on its own, which reads as coverage that does not exist (epistemic.md gate 7). It pins
# BOTH sides of the allowlist — a completion claim with no browser tool BLOCKS, and each
# sanctioned prefix (claude-in-chrome, chrome-devtools, playwright) plus the curl-in-Bash
# path PASSES — so neither hook can regress into a rubber stamp or into a tax on work that
# did verify. Hermetic: only the two hooks, python3 and a mktemp dir.
# Deliberately NOT $STAGED_FILES (built with --diff-filter=d, which excludes deletions):
# `git rm` on a hook would otherwise make the trigger see nothing and pass green with the
# gate silently removed. Same reasoning as 4.7f below.
# _transcript_lib.py is in the trigger because BROWSER_TOOL_PREFIXES — the allowlist both
# hooks import — is defined there, not in either hook. Watching only the two hooks would
# have missed the one edit that actually widens or narrows the allowlist; the failure-path
# proof for this section was written against exactly that file.
BROWSER_EVIDENCE_ALL_STAGED=$(git diff --cached --name-only 2>/dev/null || echo "")
BROWSER_EVIDENCE_STAGED=$(echo "$BROWSER_EVIDENCE_ALL_STAGED" | grep -E '^(\.claude/hooks/(verify-screenshot-before-reedit|verify-before-stop|_transcript_lib)\.py|scripts/test-browser-evidence-hooks\.sh)$' || true)
if [ -n "$BROWSER_EVIDENCE_STAGED" ]; then
    if [ -f "scripts/test-browser-evidence-hooks.sh" ]; then
        if ! run_quiet "Browser-evidence hook canary (P1221)" bash scripts/test-browser-evidence-hooks.sh; then
            ERRORS=$((ERRORS + 1))
        fi
    else
        echo -e ">>> Browser-evidence hook canary... ${RED}✗ scripts/test-browser-evidence-hooks.sh missing — blocking commit${NC}"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo ">>> Browser-evidence hook canary skipped (no browser-evidence hook staged)"
fi
echo ""

# 4.7f. P1116 mechanization canaries — run when a hook, the validator, or one of their
# canaries is staged. Each pins behaviour on BOTH sides: the footgun BLOCKS and the
# near-miss/mention PASSES. Without the second half a guard silently becomes a tax on
# legitimate work — already observed: the push-guard refused P1116's own spec because the
# PROSE quoted a banned command.
# Deliberately NOT $STAGED_FILES: that list is built with --diff-filter=d, which EXCLUDES
# deletions, so `git rm` on a hook or the validator would make this trigger see nothing and
# the commit would pass green with the gate silently removed. Adding settings.json too — the
# registration is as load-bearing as the file. (P1116 adversarial review.)
P1116_ALL_STAGED=$(git diff --cached --name-only 2>/dev/null || echo "")
# Extensions are spelled out PER NAME, not factored out. Factoring them into a trailing
# `\.py` silently dropped test-route-brief.sh — a bash file in a list of Python ones — so
# staging only that canary ran none of the three. Found by code review, not by any canary,
# because a canary cannot detect that it was never invoked. (P1116, 2026-08-19.)
P1116_STAGED=$(echo "$P1116_ALL_STAGED" | grep -E '^(\.claude/(settings\.json|hooks/(block-banned-git\.py|route-brief\.sh))|scripts/(test-block-banned-git\.py|test-p1131-banned-git-canary-env-isolation\.sh|test-route-brief\.sh|test-validate-command-refs\.py|validate-command-refs\.py))$' || true)
if [ -n "$P1116_STAGED" ]; then
    for _p1116 in \
        "Banned-git hook canary (P1116):python3 scripts/test-block-banned-git.py" \
        "Banned-git canary env isolation (P1131):bash scripts/test-p1131-banned-git-canary-env-isolation.sh" \
        "Route-brief hook canary (P1116):bash scripts/test-route-brief.sh" \
        "Command-ref validator canary (P1116):python3 scripts/test-validate-command-refs.py"
    do
        _p1116_name="${_p1116%%:*}"
        _p1116_cmd="${_p1116#*:}"
        _p1116_file=$(echo "$_p1116_cmd" | awk '{print $2}')
        if [ -f "$_p1116_file" ]; then
            if ! run_quiet "$_p1116_name" $_p1116_cmd; then
                ERRORS=$((ERRORS + 1))
            fi
        else
            echo -e ">>> $_p1116_name... ${RED}✗ $_p1116_file missing — blocking commit${NC}"
            ERRORS=$((ERRORS + 1))
        fi
    done
else
    echo ">>> P1116 mechanization canaries skipped (no hook/validator staged)"
fi
echo ""

# 4.8. Edge function secrets parser canary (P834) — runs when any edge
# function .ts file or the check script itself is staged. Pure parse: no
# network, no project lookup. Fails if the parser regresses on a known
# fixture (REQUIRED / REQUIRED-EMPTY / OPTIONAL bucket integrity).
EDGE_FN_STAGED=$(echo "$STAGED_FILES" | grep -E '^(supabase/functions/.*\.ts|scripts/check-edge-function-secrets\.sh)$' || true)
if [ -n "$EDGE_FN_STAGED" ]; then
    if ! run_quiet "Edge function secrets parser canary (P834)" bash scripts/check-edge-function-secrets.sh --self-test; then
        ERRORS=$((ERRORS + 1))
    fi
    if ! run_quiet "Edge function secrets parse-only scan (P834)" bash scripts/check-edge-function-secrets.sh --parse-only; then
        ERRORS=$((ERRORS + 1))
    fi
else
    echo ">>> Edge function secrets parser canary skipped (no edge function files staged)"
fi
echo ""

# 4.8b. CI-secret registration gate (P1267) — every `secrets.NAME` a workflow
# reads must have a row in a credential registry. Runs the canary when the gate
# or its canary is staged, and the real scan when a workflow file is staged.
#
# Registries resolve against the MAIN repo root, not $PWD: .private/ is
# gitignored, so it exists only in the main checkout and a worktree would
# otherwise always take the skip path — and worktrees are where feature work
# happens, which is where the 2026-09-08 incident happened. Same
# --git-common-dir pattern the .finish-reviewed stamp uses.
#
# THIS CONTROL IS LOCAL-ONLY AND FAILS OPEN. The registries are gitignored, so
# a fresh CI checkout has neither file and this check cannot run there. It is
# accident-prevention (git.md: "local hooks are accident-prevention, not the
# boundary"), not a boundary. Do not describe it as one.
P1267_GATE_STAGED=$(printf '%s\n' "$STAGED_FILES" | grep -E '^scripts/(audit-credential-drift|test-credential-workflow-gate)\.sh$' || true)
P1267_WF_STAGED=$(printf '%s\n' "$STAGED_FILES" | grep -E '^\.github/workflows/.*\.(yml|yaml)$' || true)

if [ -n "$P1267_GATE_STAGED" ]; then
    if ! run_quiet "CI-secret registration gate canary (P1267)" bash scripts/test-credential-workflow-gate.sh; then
        ERRORS=$((ERRORS + 1))
    fi
else
    echo ">>> CI-secret gate canary skipped (gate script not staged)"
fi

if [ -n "$P1267_WF_STAGED" ]; then
    P1267_MAIN_ROOT=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
    # An ARRAY, not a string: the repo root comes from git and may contain a
    # space (synced folders, some managed machines). An unquoted string expansion
    # would word-split it into stray tokens, the audit script would exit 2 on an
    # unknown arg, and the printed remediation ("add a registry row") would
    # actively misdescribe the cause — a permanently broken gate on every
    # workflow commit, blamed on the wrong thing.
    P1267_REG_ARGS=()
    for reg in .private/docs/accounts.md .private/docs/edge-function-secrets.md; do
        [ -f "$P1267_MAIN_ROOT/$reg" ] && P1267_REG_ARGS+=(--registry "$P1267_MAIN_ROOT/$reg")
    done
    if [ ${#P1267_REG_ARGS[@]} -eq 0 ]; then
        # Loud, not silent: "could not check" and "checked, clean" must never
        # look alike (the false-clean class this script's siblings were fixed for).
        echo -e "${YELLOW}>>> CI-secret registration gate SKIPPED — no credential registry found under $P1267_MAIN_ROOT/.private/docs/.${NC}"
        echo    "    This check fails OPEN by design (registries are gitignored). Not a pass."
        # Counted as a warning so the SUMMARY line differs from a real pass.
        # Printing the caveat is not enough: anything reading only the exit code
        # or the summary line — a wrapper, a /push chain, future CI — cannot tell
        # "checked, clean" from "could not check", and both were exit 0 with
        # "All checks passed". Not an ERROR: the fail-open is deliberate, and a
        # hard failure would block every commit on a machine without .private/.
        WARNINGS=$((WARNINGS + 1))
    else
        if ! run_quiet "CI-secret registration gate (P1267)" bash scripts/audit-credential-drift.sh --gate-workflows --workflows-dir .github/workflows "${P1267_REG_ARGS[@]}"; then
            echo -e "${RED}✗ A staged workflow reads a secret that no credential registry documents.${NC}"
            echo    "  Add a row to .private/docs/accounts.md (or edge-function-secrets.md) with its"
            echo    "  Location and P1239 half, then re-commit. See features/p1267_*.md."
            ERRORS=$((ERRORS + 1))
        fi
    fi
else
    echo ">>> CI-secret registration gate skipped (no workflow files staged)"
fi
echo ""

# 4.9b. P955 strictness canary — anti-decay guard. Runs when dev.md/fix.md are
# staged. Asserts the softening phrases stay ABSENT and the gate's strictness
# tokens stay PRESENT, so the gate can't silently revert to advisory the way
# P655's did. Reference: features/p955_ui_build_loop.md § AD-5, § Phase 2(g).
DEVFIX_STAGED=$(printf '%s\n' "$STAGED_FILES" | grep -E '^\.claude/commands/slava/build/(dev|fix)\.md$' || true)
if [ -n "$DEVFIX_STAGED" ]; then
    if ! run_quiet "P955 UI-gate strictness canary" npx vitest run src/tests/p955-strictness-canary.test.ts; then
        echo -e "${RED}✗ P955 strictness canary failed — a softening phrase returned to dev.md/fix.md, or the p955-gate reference is missing.${NC}"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo ">>> P955 strictness canary skipped (no dev.md/fix.md staged)"
fi
echo ""

# 4.10. P955 UI gate — deterministic DOM checks on any UI render-path change.
# Fires across every commit path (/dev, /fix, inline, direct) because it lives
# in the pre-commit hook (the choke-point), not in any one skill. Render-path
# detection: scripts/check-ui-render-path.py ("when unsure, fire"). Deterministic
# checks run via scripts/test-p955-ui-gate.sh (vitest+jsdom — Chrome-independent).
# Override: .ui-gate-override (gitignored, FOUNDER-created — the agent never
# creates it) defers ONLY .ts-only changes with a valid expiry; it is
# NON-OVERRIDABLE whenever a .tsx file is in the diff (the P952 case).
# Reference: features/p955_ui_build_loop.md § AD-1, AD-3, AD-4.
_uigate_err=$(mktemp)
UI_GATE_DECISION=$(printf '%s\n' "$STAGED_FILES" | python3 "$(git rev-parse --show-toplevel)/scripts/check-ui-render-path.py" 2>"$_uigate_err" || echo "FIRE")
# Surface the detector's diagnostic (e.g. "internal error (firing toward safety)")
# instead of swallowing it — otherwise manifest-missing vs python-crash vs
# legitimate-.tsx all look identical.
[ -s "$_uigate_err" ] && sed 's/^/    /' "$_uigate_err"
rm -f "$_uigate_err"
if [ "$UI_GATE_DECISION" = "FIRE" ]; then
    TSX_STAGED=$(printf '%s\n' "$STAGED_FILES" | grep -E '^src/.*\.tsx$' || true)
    UI_OVERRIDE_FILE="$(git rev-parse --show-toplevel)/.ui-gate-override"
    UI_GATE_WAIVED=0
    if [ -f "$UI_OVERRIDE_FILE" ]; then
        if [ -n "$TSX_STAGED" ]; then
            echo -e "${RED}✗ UI gate override IGNORED — .tsx files in diff. Override is non-overridable for UI changes (P955 AD-4).${NC}"
        else
            # .ts-only change: honor a valid, unexpired override.
            OVERRIDE_EXPIRY=$(grep -E '^expires:' "$UI_OVERRIDE_FILE" 2>/dev/null | head -1 | sed -E 's/^expires:[[:space:]]*//' || true)
            TODAY=$(date -u +%Y-%m-%d)
            if [ -n "$OVERRIDE_EXPIRY" ] && [[ "$OVERRIDE_EXPIRY" > "$TODAY" || "$OVERRIDE_EXPIRY" == "$TODAY" ]]; then
                echo -e "${YELLOW}⚠ UI gate WAIVED for .ts-only change via .ui-gate-override (expires ${OVERRIDE_EXPIRY}).${NC}"
                UI_GATE_WAIVED=1
            else
                echo -e "${RED}✗ .ui-gate-override present but missing/expired 'expires:' line (found: '${OVERRIDE_EXPIRY:-none}', today ${TODAY}) — not honored.${NC}"
            fi
        fi
    fi
    if [ "$UI_GATE_WAIVED" = "0" ]; then
        if ! run_quiet "P955 UI gate (deterministic DOM checks)" bash "$(git rev-parse --show-toplevel)/scripts/test-p955-ui-gate.sh"; then
            echo -e "${RED}✗ P955 UI gate failed — deterministic UI invariant violated. See output above.${NC}"
            ERRORS=$((ERRORS + 1))
        fi
    fi
else
    echo ">>> P955 UI gate skipped (no UI render-path changes staged)"
fi
echo ""

# 5. Secrets scan — two layers: gitleaks (rules-based) + grep (pattern-based)
# Both run when gitleaks is installed. Grep is not a fallback — it catches
# patterns gitleaks misses (e.g., connection strings before custom rules exist).
echo ">>> Scanning for secrets..."

# Layer 1: gitleaks (if installed)
if command -v gitleaks &> /dev/null; then
    # Use gitleaks protect --staged: scans only staged diff, not git history.
    # (gitleaks detect scans full git log and would flag old commits with .next/ artifacts)
    GITLEAKS_OUTPUT=$(gitleaks protect --staged --redact -v 2>&1 || true)

    if echo "$GITLEAKS_OUTPUT" | grep -q "no leaks found"; then
        echo -e "${GREEN}✓ No secrets detected (gitleaks)${NC}"
    elif echo "$GITLEAKS_OUTPUT" | grep -q "leaks found"; then
        echo -e "${RED}✗ Secrets detected by gitleaks:${NC}"
        echo "$GITLEAKS_OUTPUT" | grep -A5 "Secret:" || echo "$GITLEAKS_OUTPUT"
        ERRORS=$((ERRORS + 1))
    else
        echo -e "${GREEN}✓ No secrets detected (gitleaks)${NC}"
    fi
else
    echo -e "${YELLOW}(gitleaks not installed — install for rules-based secret detection)${NC}"
fi

# Layer 2: grep-based scan (always runs — defense in depth)
SECRETS_STAGED_FILES=$(git diff --cached --name-only 2>/dev/null || git diff --name-only HEAD~1 2>/dev/null || echo "")
if [ -n "$SECRETS_STAGED_FILES" ]; then
    # 2a. Known secret patterns (API keys, tokens, password assignments)
    # Exclude files that legitimately discuss secret patterns (scanner config, docs, decisions log)
    # Gitleaks (Layer 1) handles src/, supabase/, scripts/, and services/ with proper rules — grep only scans config/root files
    # .agents/skills/ is byte-identical to .claude/commands/ (P1151 projects it as symlinks). Excluded for the
    # same reason and no other: those files DISCUSS secret patterns as subject matter. Layer 1 scans all staged
    # files with no path exclusion, so real coverage of both paths is unchanged by this entry.
    GREP_SCAN_FILES=$(echo "$SECRETS_STAGED_FILES" | grep -vE '(\.gitleaks\.toml|pre-commit-checks\.sh|docs/decisions\.md|docs/technical/|supabase/functions/|supabase/migrations/|supabase/config\.toml|features/|src/|api/|e2e/|\.claude/commands/|\.agents/skills/|\.claude/rules/|\.claude/_archive/|scripts/|services/)' || true)
    SECRETS_FOUND=""
    if [ -n "$GREP_SCAN_FILES" ]; then
        # Flag a file only if a secret-pattern line is an actual VALUE, not a bare env-var
        # reference (process.env.X / import.meta.env.X are NAMES, common in config files like
        # playwright.config.ts — they tripped a false positive). This keeps EVERY config file
        # in scope (no file-level hole when gitleaks is absent) while filtering the env-name FP.
        #
        # `${{ secrets.X }}` is the same class in GitHub Actions syntax: a NAME the runner
        # substitutes at execution time, never a value in the file. .github/workflows/ is not
        # in the path-exclusion list above (deliberately — a workflow can leak a real value),
        # so without this a workflow could not reference a secret whose NAME happens to match
        # a pattern above. P1257: stranded-signups.yml needs PROD_SUPABASE_SERVICE_ROLE_KEY,
        # which matches `SUPABASE_SERVICE`.
        #
        # LIMIT, stated precisely because an earlier version of this comment overstated it:
        # every exclusion here applies PER LINE, so a hardcoded value sharing a line with a
        # legitimate reference is filtered out along with it and NOT caught by this layer.
        # That is equally true of the pre-existing process.env / import.meta.env exclusions —
        # it is a property of the design, not of this addition. Layer 1 (gitleaks) is the
        # real backstop for a same-line value; treat Layer 2 as defence in depth, not proof.
        #
        # Do NOT reintroduce `-q` on the second grep. The agent shell's grep is ugrep,
        # where `-vq` exits 1 whenever ANY line matches the pattern — not "no line was
        # selected". A file holding one benign reference AND one hardcoded secret was
        # therefore reported CLEAN. That was a live hole in this scanner under the
        # original process.env-only filter; found 2026-09-07 while adding the secrets.
        # case, by running a mixed known-good+known-bad file through the pipeline.
        # Testing the filtered OUTPUT for emptiness is correct under every grep.
        # A shell variable as the WHOLE value is the same class once more: `apikey: $SUPABASE_ANON_KEY` names
        # a variable the step's env block defines, and the value, if any, sits on that other line, where this
        # scan still reads it. Matched strictly and CASE-SENSITIVELY, as its own grep: the value must be
        # exactly one UPPERCASE reference ($NAME or ${NAME}) followed only by a closing quote, whitespace, a
        # line-continuation backslash or the end of the line. So `apikey="$ENV"literal` and a JSON literal
        # such as "$ecretvalue" are still caught (codex, 2026-09-11). P1283: cron-health.yml sends the public
        # publishable key as a header. Proved on eight cases, good, bad and mixed, before landing.
        for f in $GREP_SCAN_FILES; do
            if [ -n "$(grep -iE '(sk_live|pk_live|SUPABASE_SERVICE|api[_-]?key|apikey|secret[_-]?key|password\s*=|token\s*=)[^a-zA-Z]' "$f" 2>/dev/null \
                 | grep -ivE '(process\.env\.|import\.meta\.env\.|\$\{\{ *secrets\.)' \
                 | grep -vE '([Aa][Pp][Ii][_-]?[Kk][Ee][Yy]|[Ss][Ee][Cc][Rr][Ee][Tt][_-]?[Kk][Ee][Yy]|[Pp][Aa][Ss][Ss][Ww][Oo][Rr][Dd]|[Tt][Oo][Kk][Ee][Nn])"?[[:space:]]*[:=][[:space:]]*"?\$(\{[A-Z_][A-Z0-9_]*\}|[A-Z_][A-Z0-9_]*)"?([[:space:]]|\\|$)')" ]; then
                SECRETS_FOUND="${SECRETS_FOUND}${f}"$'\n'
            fi
        done
        SECRETS_FOUND=$(printf '%s' "$SECRETS_FOUND" | sed '/^$/d')
    fi
    if [ -n "$SECRETS_FOUND" ]; then
        echo -e "${RED}✗ Possible secrets found in:${NC}"
        echo "$SECRETS_FOUND"
        ERRORS=$((ERRORS + 1))
    fi

    # 2b. Connection strings with embedded credentials (postgresql://, mongodb://, etc.)
    # Matches: scheme://user:password@host — where password is 8+ chars (not a placeholder)
    CONNSTR_HITS=$(echo "$SECRETS_STAGED_FILES" | xargs grep -nE '(postgres(ql)?|mongodb(\+srv)?|mysql|redis|amqp)://[^:/?#]+:[^@/?#]{8,}@' 2>/dev/null || true)
    if [ -n "$CONNSTR_HITS" ]; then
        # Filter out placeholder patterns (YOUR_, CHANGE_ME, [PASSWORD], PASSWORD_HERE, xxx)
        REAL_CONNSTR_HITS=$(echo "$CONNSTR_HITS" | grep -viE '(YOUR_|CHANGE_ME|\[PASSWORD\]|PASSWORD_HERE|xxx{2,}|example\.com)' || true)
        if [ -n "$REAL_CONNSTR_HITS" ]; then
            echo -e "${RED}✗ Database connection string with embedded credentials:${NC}"
            echo "$REAL_CONNSTR_HITS" | head -5
            ERRORS=$((ERRORS + 1))
        fi
    fi

    if [ -z "$SECRETS_FOUND" ] && [ -z "$REAL_CONNSTR_HITS" ]; then
        echo -e "${GREEN}✓ No secrets detected (grep)${NC}"
    fi
else
    echo -e "${YELLOW}⚠ No staged files to scan${NC}"
fi
echo ""

# 6. Bundle size check
echo ">>> Checking bundle size..."
if [ -d "dist" ]; then
    # Measure only what browsers actually download: JS+CSS, excluding *.map
    # (source maps are 'hidden' — uploaded to Sentry, never referenced by served JS).
    SHIPPED_KB=$(find dist -type f \( -name "*.js" -o -name "*.css" \) ! -name "*.map" -exec du -k {} + | awk '{s+=$1} END {print s+0}')
    SHIPPED_MB=$((SHIPPED_KB / 1024))
    MAPS_MB=$(find dist -name "*.map" -exec du -k {} + | awk '{s+=$1} END {print int(s/1024)}')
    echo "Shipped payload (JS+CSS, no maps): ${SHIPPED_MB}MB  |  source maps (Sentry-only): ${MAPS_MB}MB"
    # Threshold is on the shipped payload, not raw dist. Baseline ~5MB (2026-07).
    if [ "$SHIPPED_MB" -gt 7 ]; then
        echo -e "${YELLOW}⚠ Shipped payload exceeds 7MB baseline — check for a new static import in the initial chunk${NC}"
        WARNINGS=$((WARNINGS + 1))
    else
        echo -e "${GREEN}✓ Shipped payload OK${NC}"
    fi
else
    echo -e "${YELLOW}⚠ No dist folder (run build first)${NC}"
fi
echo ""

# 7. Console.log check (in staged files)
echo ">>> Checking for console.log..."
if [ -n "$STAGED_FILES" ]; then
    # Filter to only .ts and .tsx files
    TS_FILES=$(echo "$STAGED_FILES" | grep -E '\.(ts|tsx)$' || true)
    if [ -n "$TS_FILES" ]; then
        CONSOLE_LOGS=$(echo "$TS_FILES" | xargs grep -n 'console\.log' 2>/dev/null || true)
        if [ -n "$CONSOLE_LOGS" ]; then
            echo -e "${YELLOW}⚠ console.log found:${NC}"
            echo "$CONSOLE_LOGS"
            WARNINGS=$((WARNINGS + 1))
        else
            echo -e "${GREEN}✓ No console.log in staged .ts/.tsx files${NC}"
        fi
    else
        echo -e "${GREEN}✓ No TypeScript files staged${NC}"
    fi
else
    echo -e "${YELLOW}⚠ No staged files to check${NC}"
fi
echo ""

# 8. TODO/FIXME check (in diff)
echo ">>> Checking for new TODOs/FIXMEs..."
NEW_TODOS=$(git diff --cached 2>/dev/null | grep -E '^\+.*(/[/*]|#)\s*(TODO|FIXME|XXX|HACK)' || true)
if [ -n "$NEW_TODOS" ]; then
    echo -e "${YELLOW}⚠ New TODO/FIXME comments added:${NC}"
    echo "$NEW_TODOS"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✓ No new TODOs added${NC}"
fi
echo ""

# 8b. Ungated prototype route guard (P872) — REACHABILITY heuristic, warning-only.
# A /tree, /_proto or /_preview route added to App.tsx without a same-line
# import.meta.env.DEV gate would render in production. Scope: staged added lines
# of src/App.tsx only (never re-flags existing routes). The guidance status lines
# avoid <, >, | per shell-safety.md; the matched-route echo prints raw JSX as data
# (like the TODO check above) — this hook's stdout is never eval'd.
echo ">>> Checking for ungated prototype routes in src/App.tsx..."
APP_PROTO_ADDED=$(git diff --cached -- src/App.tsx 2>/dev/null | grep '^+' | grep -v '^+++' || true)
UNGATED_PROTO_ROUTES=$(echo "$APP_PROTO_ADDED" | grep -E 'path="(/tree[/"]|/_proto[/"]|/_preview[/"])' | grep -v 'import.meta.env.DEV' | grep -v 'PROD-REACHABLE' || true)
if [ -n "$UNGATED_PROTO_ROUTES" ]; then
    echo -e "${YELLOW}⚠ Prototype route(s) added without a same-line DEV gate or PROD-REACHABLE marker:${NC}"
    echo "$UNGATED_PROTO_ROUTES"
    echo -e "${YELLOW}  Dev-gate on the SAME line: wrap the Route in  {import.meta.env.DEV && ... }${NC}"
    echo -e "${YELLOW}  or, if deliberately prod-reachable, add a  PROD-REACHABLE: reason  comment on the route line.${NC}"
    echo -e "${YELLOW}  Heuristic, same-line only: a multi-line gate or a composed path string can slip past it.${NC}"
    echo -e "${YELLOW}  Warning only (never blocks); does NOT cover static-import bundle bloat — see /dev step 9.6 / decisions.md 5098.${NC}"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✓ No ungated prototype routes added to App.tsx${NC}"
fi
echo ""

# 9. @ts-ignore / @ts-expect-error check (in staged files)
echo ">>> Checking for TypeScript escape hatches..."
if [ -n "$TS_FILES" ]; then
    TS_IGNORES=$(echo "$TS_FILES" | xargs grep -n '@ts-ignore\|@ts-expect-error\|@ts-nocheck' 2>/dev/null || true)
    if [ -n "$TS_IGNORES" ]; then
        echo -e "${YELLOW}⚠ TypeScript suppressions found:${NC}"
        echo "$TS_IGNORES"
        WARNINGS=$((WARNINGS + 1))
    else
        echo -e "${GREEN}✓ No @ts-ignore or @ts-expect-error${NC}"
    fi
else
    echo -e "${GREEN}✓ No TypeScript files to check${NC}"
fi
echo ""

# 10. debugger statement check (in staged files)
echo ">>> Checking for debugger statements..."
if [ -n "$TS_FILES" ]; then
    DEBUGGERS=$(echo "$TS_FILES" | xargs grep -n '^\s*debugger' 2>/dev/null || true)
    if [ -n "$DEBUGGERS" ]; then
        echo -e "${RED}✗ debugger statements found:${NC}"
        echo "$DEBUGGERS"
        ERRORS=$((ERRORS + 1))
    else
        echo -e "${GREEN}✓ No debugger statements${NC}"
    fi
else
    echo -e "${GREEN}✓ No TypeScript files to check${NC}"
fi
echo ""

# 11. Check for 'any' type in new code (stricter type safety)
echo ">>> Checking for new 'any' types..."
if [ -n "$STAGED_FILES" ]; then
    # Only check staged TypeScript files, excluding test files
    NON_TEST_TS=$(echo "$STAGED_FILES" | grep -E '\.(ts|tsx)$' | grep -v '\.test\.' | grep -v '/tests/' || true)
    if [ -n "$NON_TEST_TS" ]; then
        # Look for ': any' patterns in the diff (new additions)
        ANY_TYPES=$(git diff --cached -- $NON_TEST_TS 2>/dev/null | grep -E '^\+.*:\s*any(\s|,|;|\)|>|$)' || true)
        if [ -n "$ANY_TYPES" ]; then
            echo -e "${YELLOW}⚠ New 'any' types added (consider using specific types):${NC}"
            echo "$ANY_TYPES"
            WARNINGS=$((WARNINGS + 1))
        else
            echo -e "${GREEN}✓ No new 'any' types${NC}"
        fi
    else
        echo -e "${GREEN}✓ No non-test TypeScript files staged${NC}"
    fi
else
    echo -e "${YELLOW}⚠ No staged files to check${NC}"
fi
echo ""

# 12. Doc links validation — relative markdown links in the files being committed.
# Scoped to staged files on purpose: the repo carries pre-existing dead links
# (specs moved to features/done/ without their referrers rewritten), and failing
# on all of them would block every commit. Repo-wide view: --report.
# Bulk repair of the mechanical ones: ./scripts/fix-doc-links.cjs
if [ -f "./scripts/validate-doc-links.cjs" ]; then
    if ! run_quiet "Doc links" ./scripts/validate-doc-links.cjs; then
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${YELLOW}⚠ Doc link validator not found${NC}"
fi

# 12b. Command-ref validation (P1116) — every /command named in CLAUDE.md or
# .claude/rules/*.md must resolve to a command that exists. Root-cause fix for the
# dead-pointer class: P1113 remapped a routing line after its target had been archived and
# nothing caught it. Deliberately NOT scoped to staged files, unlike the doc-links check
# above — the defect this catches is a command being archived, where the *referring* file
# is never touched and a staged-file scan would see nothing. Full scan costs ~0.05s.
if [ -f "./scripts/validate-command-refs.py" ]; then
    if ! run_quiet "Command refs" python3 ./scripts/validate-command-refs.py; then
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${RED}✗ scripts/validate-command-refs.py missing — blocking commit${NC}"
    echo -e "${YELLOW}  A gate that vanishes silently is worse than no gate. Restore it, or"
    echo -e "  remove section 12b deliberately in its own commit.${NC}"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 12c. Disclosure field on NEWLY ADDED specs (P1255).
#
# Every new spec must declare `disclosure: public | embargo` -- whether it
# describes a live, unfixed defect and must therefore stay branch-born until the
# fix is confirmed on prod. The judgement is the author's; this check only
# enforces that the judgement was made. It is deliberately NOT a content
# detector -- see docs/decisions.md 2026-07-15 [security], which rejects that
# class outright.
#
# --diff-filter=A (not AM, unlike the migration checks at ~L1226/1290): the
# A-only scope IS the grandfathering mechanism. The 163 specs that predate this
# field will show as M for the rest of their lives and must never trip this
# gate; widening to AM would flag every one of them on the next unrelated edit.
#
# The `[^/]*` in the pattern excludes features/done/** and features/archive/**
# on purpose. /ship `git mv`s a spec into features/done/DATE/, and when git does
# not pair that as a rename (content is rewritten in the same commit) the
# destination lands as A -- which would block shipping every legacy spec. A
# closed spec is past the point this gate protects, so top-level only.
# Single implementation, shared with the server-side required check
# (.github/workflows/disclosure-gate.yml) so the local hook and the boundary
# cannot drift. Local hooks are accident-prevention, not the boundary
# (.claude/rules/git.md) — this call is the former.
if [ -f "./scripts/check-disclosure.sh" ]; then
    if ! run_quiet "Disclosure field" ./scripts/check-disclosure.sh; then
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${RED}✗ scripts/check-disclosure.sh missing — blocking commit${NC}"
    echo -e "${YELLOW}  A gate that vanishes silently is worse than no gate.${NC}"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 13. Duplicate P-number check (prevents reused P-numbers)
if [ -f "./scripts/check-duplicate-p-numbers.sh" ]; then
    if ! run_quiet "Duplicate P-numbers" ./scripts/check-duplicate-p-numbers.sh; then
        echo -e "${YELLOW}  → See docs/technical/duplicate-prevention.md for resolution${NC}"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${YELLOW}⚠ Duplicate P-number checker not found${NC}"
fi
echo ""

# 13b. UAT scorecard gate — warn if feature moved to done/ with ALL scenarios untested
# 13a2. Spec intent gate (P1246) — a NEW spec must carry the founder's verbatim
# framing. This is the second of two layers; .claude/hooks/spec-intent-gate.py is
# the first. The hook only sees the Write tool, so a spec created with a heredoc
# or `cat >` walks straight past it — this layer closes that, because it reads
# the git INDEX and does not care which tool produced the bytes.
#
# NEW files only (--diff-filter=A). The ~890 existing specs are never re-gated:
# 87 of them would fail, all created before the rule existed (2026-08-26), and
# retro-fitting framing onto them is not this gate's job.
#
# Not a boundary — a local hook is forgeable by whoever it binds. The boundary is
# the same check re-run server-side in .github/workflows/closure-gate.yml.
echo ">>> Checking new specs carry the founder's verbatim framing (P1246)..."
INTENT_BLOCKED=0
NEW_SPECS=$(git diff --cached --name-only --diff-filter=A 2>/dev/null | grep -E '^features/p[0-9]+[^/]*\.md$' || true)
if [ -n "$NEW_SPECS" ] && [ -x scripts/spec-intent-gate.sh ]; then
    while IFS= read -r spec_path; do
        [ -z "$spec_path" ] && continue
        # Read the STAGED blob, not the working tree — they can differ, and the
        # commit is made of the index.
        _tmp_spec="$(mktemp -t specintent)"
        if git show ":${spec_path}" > "$_tmp_spec" 2>/dev/null; then
            if bash scripts/spec-intent-gate.sh "$_tmp_spec" > /tmp/intent-gate.txt 2>&1; then
                echo -e "${GREEN}✓ ${spec_path}: framing present${NC}"
            else
                echo -e "${RED}✗ ${spec_path}: no verbatim founder framing${NC}"
                sed "s#$_tmp_spec#$spec_path#g" /tmp/intent-gate.txt | sed 's/^/    /'
                INTENT_BLOCKED=$((INTENT_BLOCKED + 1))
            fi
        fi
        rm -f "$_tmp_spec"
    done <<< "$NEW_SPECS"
fi
if [ "$INTENT_BLOCKED" -gt 0 ]; then
    ERRORS=$((ERRORS + INTENT_BLOCKED))
elif [ -z "$NEW_SPECS" ]; then
    echo -e "${GREEN}✓ No new specs in this commit${NC}"
fi
echo ""

echo ">>> Checking UAT coverage for features moving to done/..."
STAGED_DONE_FILES=$(git diff --cached --name-only 2>/dev/null | grep -E '^features/done/' | grep -oE '[^/]+\.md$' | grep -E '^p[0-9]+' || true)
UAT_WARNING_COUNT=0

if [ -n "$STAGED_DONE_FILES" ]; then
    while IFS= read -r done_basename; do
        # Extract P-number (e.g. p144, p272) from filename like p144_name.md
        P_NUM=$(echo "$done_basename" | grep -oE '^p[0-9]+')
        if [ -z "$P_NUM" ]; then
            continue
        fi

        # Same class as goal-gate.sh CHECK 4 (fixed 2026-08-20): features.md:28 says
        # the UAT file "always moves" alongside its spec into features/done/{sprint}/uat/
        # once shipped — a later edit to an already-closed spec re-stages it under
        # features/done/, re-triggering this advisory check, and a properly-moved UAT
        # file would otherwise report a false "No UAT file found". Scoped to the same
        # two sanctioned locations, first match wins (advisory-only, so ambiguity here
        # just warns rather than failing the commit).
        UAT_FILE="features/uat/${P_NUM}.md"
        if [ ! -f "$UAT_FILE" ]; then
            _uat_done_hit=$(find features/done -mindepth 1 -maxdepth 3 -path "*/uat/${P_NUM}.md" 2>/dev/null | head -1)
            [ -n "$_uat_done_hit" ] && UAT_FILE="$_uat_done_hit"
        fi
        if [ -f "$UAT_FILE" ]; then
            # Count only table rows ("| UAT-..." rows) to avoid false positives from
            # Legend lines and Success Criteria bullets that also contain ⬜/✅.
            # Use || true (not || echo 0) because grep -c always outputs a count,
            # but exits with code 1 when count is 0; || echo 0 would double the output.
            UNTESTED=$(grep -cE '^\| UAT-.*\| ⬜' "$UAT_FILE" 2>/dev/null || true)
            TESTED=$(grep -cE '^\| UAT-.*\| ✅' "$UAT_FILE" 2>/dev/null || true)
            UNTESTED=${UNTESTED:-0}
            TESTED=${TESTED:-0}
            if [ "$TESTED" -eq 0 ] && [ "$UNTESTED" -gt 0 ]; then
                echo -e "${YELLOW}⚠ UAT for ${P_NUM} has ${UNTESTED} untested scenario(s) (all ⬜). Run manual acceptance tests before marking done. See ${UAT_FILE}${NC}"
                UAT_WARNING_COUNT=$((UAT_WARNING_COUNT + 1))
            fi
        else
            echo -e "${YELLOW}⚠ No UAT file found for ${P_NUM} (looked for ${UAT_FILE}). Consider running /generate-uat before marking done.${NC}"
            UAT_WARNING_COUNT=$((UAT_WARNING_COUNT + 1))
        fi
    done <<< "$STAGED_DONE_FILES"
fi

if [ "$UAT_WARNING_COUNT" -eq 0 ]; then
    if [ -n "$STAGED_DONE_FILES" ]; then
        echo -e "${GREEN}✓ UAT coverage OK for all features moving to done/${NC}"
    else
        echo -e "${GREEN}✓ No features moving to done/ in this commit${NC}"
    fi
else
    WARNINGS=$((WARNINGS + UAT_WARNING_COUNT))
fi
echo ""

# 13b3. Goal-gate closure choke-point — a GOALIFIED spec may not be closed unless its
# gate passes. "Goalified" is decided by the contract pin on main
# (features/verification/pN/contract.sha256), never by anything on the branch: a run
# cannot duck the gate by deleting its own contract, because it cannot delete a file
# that lives on main.
#
# This is ACCIDENT PREVENTION, not the boundary. A local hook is forgeable by the actor
# it binds; the real gate is the required `goal-gate` check on main
# (.github/workflows/goal-gate.yml). Both exist for the same reason audit-privacy does.
echo ">>> Checking goal-gate for goalified specs moving to done/..."
GOAL_GATE_BLOCKED=0
if [ -n "$STAGED_DONE_FILES" ] && [ -f scripts/goal-gate.sh ]; then
    while IFS= read -r done_basename; do
        P_NUM=$(echo "$done_basename" | grep -oE '^p[0-9]+')
        [ -z "$P_NUM" ] && continue
        PIN="features/verification/${P_NUM}/contract.sha256"
        # Pin resolved from main, not the working tree.
        if git cat-file -e "origin/main:${PIN}" 2>/dev/null || git cat-file -e "main:${PIN}" 2>/dev/null; then
            if bash scripts/goal-gate.sh "$P_NUM" --tier ci >/tmp/goal-gate-${P_NUM}.txt 2>&1; then
                echo -e "${GREEN}✓ goal-gate ${P_NUM} passed (ci tier)${NC}"
            else
                echo -e "${RED}✗ goal-gate ${P_NUM} FAILED — a goalified spec cannot be closed on a red gate${NC}"
                tail -20 /tmp/goal-gate-${P_NUM}.txt | sed 's/^/    /'
                GOAL_GATE_BLOCKED=$((GOAL_GATE_BLOCKED + 1))
            fi
        fi
    done <<< "$STAGED_DONE_FILES"
fi
if [ "$GOAL_GATE_BLOCKED" -gt 0 ]; then
    ERRORS=$((ERRORS + GOAL_GATE_BLOCKED))
else
    echo -e "${GREEN}✓ No goalified spec closing on a red gate${NC}"
fi
echo ""

# 13b2. /live runtime coverage canary — warn when /live runtime changes ship without an E2E
# Two-party UI bugs only show on the initiator side; unit tests cannot catch them.
# See .claude/rules/live.md and features/p827_live_preload_on_story_switch.md.
echo ">>> Checking /live runtime coverage..."
LIVE_FILES_STAGED=$(echo "$STAGED_FILES" | grep -E '^(src/app/pages/clarity-live|src/app/components/partners/live-|src/app/components/live-meeting/|src/app/contexts/live-session-|src/app/hooks/use-live|src/app/lib/live-state-merge|src/app/data/sessions-service|src/app/data/live-)' || true)

# Content-based fallback: any staged source file that writes live_state
LIVE_STATE_WRITERS=""
if [ -n "$STAGED_FILES" ]; then
    while IFS= read -r f; do
        [ -z "$f" ] && continue
        [ ! -f "$f" ] && continue
        case "$f" in
            src/*.ts|src/*.tsx) ;;
            *) continue ;;
        esac
        if grep -lE 'updateLiveState|patchClaritySessionLiveState|updateClaritySessionLiveState' "$f" >/dev/null 2>&1; then
            LIVE_STATE_WRITERS="${LIVE_STATE_WRITERS}${f}\n"
        fi
    done <<< "$STAGED_FILES"
fi

if [ -n "$LIVE_FILES_STAGED" ] || [ -n "$LIVE_STATE_WRITERS" ]; then
    E2E_STAGED=$(echo "$STAGED_FILES" | grep -E '^e2e/.*\.spec\.ts$' || true)
    CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
    if [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "master" ] && [ -z "$E2E_STAGED" ] && [ -z "$CP_ALLOW_NO_E2E" ]; then
        # Lookback: any e2e commit on this branch since main?
        BRANCH_E2E_COMMITS=$(git log main..HEAD --name-only --pretty=format: 2>/dev/null | grep -E '^e2e/.*\.spec\.ts$' | head -1 || true)
        if [ -z "$BRANCH_E2E_COMMITS" ]; then
            echo -e "${YELLOW}⚠ /live runtime file changed but no E2E test in this commit or branch.${NC}"
            echo -e "${YELLOW}  Two-party UI bugs only show on the initiator side; unit tests cannot catch them.${NC}"
            echo -e "${YELLOW}  Template: e2e/p827-picker-real-flow.spec.ts${NC}"
            echo -e "${YELLOW}  Suppress with: CP_ALLOW_NO_E2E=1 git commit ...${NC}"
            WARNINGS=$((WARNINGS + 1))
        else
            echo -e "${GREEN}✓ /live coverage: branch has e2e/*.spec.ts since main${NC}"
        fi
    else
        echo -e "${GREEN}✓ /live coverage check skipped (main branch, E2E staged, or override set)${NC}"
    fi
else
    echo -e "${GREEN}✓ No /live runtime changes in this commit${NC}"
fi
echo ""

# 13c. Duplicate spec check — detect features/p*.md that also exist in features/done/
# Prevents the "Write instead of git mv" failure mode where closure copies but doesn't remove original.
echo ">>> Checking for duplicate feature specs (original + done/ copy)..."
DUPLICATE_SPECS=$(find features -maxdepth 1 -name 'p*.md' 2>/dev/null | while read -r orig; do
    basename=$(basename "$orig")
    pnum=$(echo "$basename" | grep -oE '^p[0-9]+')
    if [ -n "$pnum" ] && find features/done -name "${pnum}_*.md" 2>/dev/null | grep -q .; then
        echo "$orig"
    fi
done || true)

if [ -n "$DUPLICATE_SPECS" ]; then
    echo -e "${RED}✗ Duplicate spec(s) found — original still in features/ but also in features/done/:${NC}"
    echo "$DUPLICATE_SPECS" | while read -r f; do
        echo -e "${RED}  → $f${NC}"
        echo -e "${RED}    Fix: git rm $f${NC}"
    done
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✓ No duplicate specs${NC}"
fi
echo ""

# 13d. Nav-route consistency — every nav link must have a matching Route in App.tsx
if [ -f "./scripts/check-nav-route-consistency.sh" ]; then
    if ! run_quiet "Nav-route consistency" ./scripts/check-nav-route-consistency.sh; then
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${YELLOW}⚠ Nav-route consistency checker not found${NC}"
fi
echo ""

# 13e. SINGLE-VALUE slot canary — WARN when a single-valued strategy-doc slot
# (page hero, active channel, active market focus — each tagged
# "<!-- SINGLE-VALUE: X -->") accumulates 2+ competing unreconciled dated
# directive callouts. Same logic as /docs-strategy-update Gate 8, run at commit
# time (bypassable with --no-verify, like every hook). WARN not BLOCK: a hard block would stop
# legitimate quick fixes; the WARN surfaces exactly the silent accumulation that
# shipped the §UVP drift (2026-07-04 + 2026-07-11 both "lead the page"). The
# echoed finding prints raw doc text as data (like the TODO check) — never eval'd.
echo ">>> Checking SINGLE-VALUE strategy-doc slots..."
SV_STAGED=$(echo "$STAGED_FILES" | grep -E '^docs/(lean-canvas|hypotheses|theory-of-change|definitions|progress)\.md$' || true)
if [ -n "$SV_STAGED" ]; then
    SV_TMP=""; SV_SKIP_OK=""
    # Hardcoded, never env-overridable: an inherited SV_SCRIPT pointing at any .py
    # that exits 0 would turn this gate green with a positive checkmark and no trace.
    SV_SCRIPT="$(git rev-parse --show-toplevel)/scripts/check-single-value-slots.py"
    if [ ! -f "$SV_SCRIPT" ]; then
        # A missing canary must fail LOUD. Without this guard python3 itself exits 2,
        # which the rc=2 branch below would print as a real SINGLE-VALUE finding.
        echo -e "${RED}✗ SINGLE-VALUE canary script not found: $SV_SCRIPT${NC}"
        echo -e "${RED}  A dead gate is not a passing gate. Restore it, or remove this check deliberately.${NC}"
        ERRORS=$((ERRORS + 1))
    else
        # Scan the STAGED content, not the working tree (same reason as the Gate D/F
        # block below uses `git show ":$doc"`): goals.md and the strategy docs have
        # automated writers, and the main checkout's index is shared across sessions.
        SV_TMP=$(mktemp -d) || SV_TMP=""
    fi
    if [ -f "$SV_SCRIPT" ] && [ -z "$SV_TMP" ]; then
        echo -e "${RED}✗ SINGLE-VALUE canary could not create a temp dir — check not run${NC}"
        ERRORS=$((ERRORS + 1))
    elif [ -f "$SV_SCRIPT" ]; then
        # shellcheck disable=SC2064 — expand SV_TMP now, not at trap time
        trap "rm -rf '$SV_TMP'" EXIT
        SV_ARGS=()
        SV_MISSED=""
        while IFS= read -r sv_doc; do
            [ -z "$sv_doc" ] && continue
            mkdir -p "$SV_TMP/$(dirname "$sv_doc")"
            # Unmerged paths (a conflicted merge — exactly when competing directives
            # land) are in the index but not at stage 0, so `git show ":$doc"` fails.
            # Losing a doc silently would leave the staged file unscanned.
            if ! git show ":$sv_doc" > "$SV_TMP/$sv_doc" 2>/dev/null; then
                SV_MISSED="$SV_MISSED $sv_doc"
                continue
            fi
            SV_ARGS+=("$SV_TMP/$sv_doc")
        done <<< "$SV_STAGED"
        if [ -n "$SV_MISSED" ]; then
            echo -e "${RED}✗ SINGLE-VALUE canary could not read staged content for:$SV_MISSED${NC}"
            echo -e "${RED}  (unmerged path?) Those docs were NOT scanned — resolve, then re-run.${NC}"
            ERRORS=$((ERRORS + 1))
        fi
        if [ ${#SV_ARGS[@]} -eq 0 ]; then
            # Zero args makes the script print its usage and exit 1; without this
            # guard that lands in the generic branch below as an ignorable WARN,
            # i.e. a staged doc goes unscanned and the commit sails through.
            SV_RC=0; SV_OUT=""; SV_SKIP_OK=1
        else
            SV_OUT=$(python3 "$SV_SCRIPT" "${SV_ARGS[@]}" 2>&1) && SV_RC=0 || SV_RC=$?
            # Bash substitution, not sed: a temp path containing a sed metacharacter
            # (#, \, &) would abort the whole suite under `set -e`, discarding a real
            # finding computed one line earlier and skipping every later check.
            SV_OUT=${SV_OUT//"$SV_TMP"\//}
        fi
        rm -rf "$SV_TMP"
        trap - EXIT
        # rc=2 counts as a finding ONLY if the output has the shape of one; a python
        # traceback also exits 2 and must not be dressed up as a reconciliation warning.
        if [ "$SV_RC" -eq 2 ] && [ "${SV_OUT#SINGLE-VALUE slot}" != "$SV_OUT" ]; then
            echo -e "${YELLOW}⚠ Competing single-valued directive(s) — reconcile to ONE lead (or tag the loser SUPERSEDED/FALLBACK):${NC}"
            echo "$SV_OUT"
            echo -e "${YELLOW}  Same check as /docs-strategy-update Gate 8. WARN only — never blocks.${NC}"
            WARNINGS=$((WARNINGS + 1))
        elif [ "$SV_RC" -eq 0 ]; then
            [ -n "$SV_SKIP_OK" ] || echo -e "${GREEN}✓ SINGLE-VALUE slots each hold one lead${NC}"
        else
            # A canary that cannot RUN is the same class of failure as one that is
            # not there (see the missing-script guard above) — so it blocks too.
            # Anything else here is a green commit with a yellow decoration.
            echo -e "${RED}✗ SINGLE-VALUE canary could not run (rc=$SV_RC) — the check did NOT happen:${NC}"
            echo "$SV_OUT"
            ERRORS=$((ERRORS + 1))
        fi
    fi
else
    echo -e "${GREEN}✓ No strategy docs staged (SINGLE-VALUE check skipped)${NC}"
fi
echo ""

# 14. Root file pollution check (prevent agent-generated temp files and stray images)
echo ">>> Checking for temporary files in project root..."

# Check for PNG/JPG/JPEG images dumped to root (browser automation artifacts)
ROOT_IMAGES=$(ls -1 ./*.png ./*.jpg ./*.jpeg 2>/dev/null || true)
if [ -n "$ROOT_IMAGES" ]; then
    echo -e "${RED}✗ Image files found in project root (browser automation artifacts):${NC}"
    echo "$ROOT_IMAGES" | while read -r file; do
        echo -e "${RED}  → $file${NC}"
    done
    echo -e "${RED}  Screenshots must go to ~/Screenshots/{date}/{feature}/, not project root.${NC}"
    echo -e "${RED}  See docs/technical/browser-tools.md — 'Screenshot Path Rule'.${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check for unexpected .md / .json files in project root
ROOT_TEMP_FILES=$(ls -1 ./*.md ./*.json 2>/dev/null | grep -vE '(CLAUDE|AGENTS|GEMINI|README|CONTRIBUTING|SECURITY|CLA|components\.json|package\.json|package-lock\.json|tsconfig.*\.json|vercel\.json)' || true)

if [ -n "$ROOT_TEMP_FILES" ]; then
    # Check if any match agent-generated patterns
    AGENT_FILES=$(echo "$ROOT_TEMP_FILES" | grep -E '(_AUDIT|_ANALYSIS|_SUMMARY|FIXES|DUPLICATE|-results\.json|-report\.json|-audit.*\.json|TEST_)' || true)

    if [ -n "$AGENT_FILES" ]; then
        echo -e "${YELLOW}⚠ Agent-generated files found in project root:${NC}"
        echo "$AGENT_FILES" | while read -r file; do
            echo -e "${YELLOW}  → $file${NC}"
        done
        echo -e "${YELLOW}  See CLAUDE.md (File Creation Discipline) and docs/technical/file-locations.md${NC}"
        WARNINGS=$((WARNINGS + 1))
    elif [ -n "$ROOT_TEMP_FILES" ]; then
        echo -e "${YELLOW}⚠ Unexpected files in project root:${NC}"
        echo "$ROOT_TEMP_FILES" | while read -r file; do
            echo -e "${YELLOW}  → $file${NC}"
        done
        WARNINGS=$((WARNINGS + 1))
    fi
else
    if [ -z "$ROOT_IMAGES" ]; then
        echo -e "${GREEN}✓ No temporary files in project root${NC}"
    fi
fi
echo ""

# 14b–14d. Repo-structure order gate (P1221). Check 14 only sees *.md/*.json/images
# in the root; nothing caught a new top-level directory, a docs/ page nothing
# links to, or a multi-MB asset. The 2026-09-01 inventory found all three
# ungated (a `.claire/` typo dir tracked since April, four 0-ref docs, 3 copies
# of one 224KB font). Allowlists are derived from HEAD, not hardcoded, so the
# gate has no false positives on the tree as committed (epistemic.md gate 7c)
# and flags exactly what is NEW. Rename-aware (a `git mv` into a new root dir or
# of a large file is still an arrival at the destination path), NUL-safe (paths
# with spaces), and fail-closed (a git probe that errors counts as a violation,
# never as an empty inventory). Overrides are PATH-SPECIFIC and always printed:
#   P1221_ALLOW_NEW_ROOT=dir1:dir2       (new top-level entries, by name)
#   P1221_ALLOW_ORPHAN_DOC=docs/a.md:... (page linked in a later commit)
#   P1221_ALLOW_LARGE=public/x.png:...   (asset >500KB that must ship in-repo)
echo ">>> Checking repo structure (new root entries / orphan docs / large files)..."
p1221_allowed() {  # $1 = colon-separated allowlist, $2 = candidate
    case ":$1:" in *":$2:"*) return 0;; esac; return 1
}
P1221_PROBE_FAILED=0
# NUL-separated list goes through a temp file: $(...) silently drops NUL bytes.
P1221_ARRIVALS_FILE=$(mktemp)
git diff --cached -z --name-only --diff-filter=ACMR > "$P1221_ARRIVALS_FILE" 2>/dev/null || P1221_PROBE_FAILED=1
HEAD_ROOT_ENTRIES=$(git ls-tree --name-only HEAD 2>/dev/null) || P1221_PROBE_FAILED=1
if [ "$P1221_PROBE_FAILED" = "1" ]; then
    echo -e "${RED}✗ Repo-structure gate: git probe failed (diff --cached / ls-tree HEAD) — failing closed${NC}"
    ERRORS=$((ERRORS + 1))
else
    NEW_ROOT_ENTRIES=""; ORPHAN_DOCS=""; LARGE_STAGED=""; WAIVED=""
    while IFS= read -r -d '' f; do
        [ -z "$f" ] && continue
        top="${f%%/*}"
        if ! printf '%s\n' "$HEAD_ROOT_ENTRIES" | grep -qxF -- "$top"; then
            if p1221_allowed "${P1221_ALLOW_NEW_ROOT:-}" "$top"; then
                WAIVED="${WAIVED}  new root entry: $top (P1221_ALLOW_NEW_ROOT)"$'\n'
            else
                NEW_ROOT_ENTRIES="${NEW_ROOT_ENTRIES}  $top"$'\n'
            fi
        fi
        case "$f" in
            docs/*.md)
                # Only NEW arrivals (A or R destination) need an inbound reference; an
                # edited page (M) already has whatever links it has.
                if git diff --cached -z --name-only --diff-filter=AR 2>/dev/null | grep -qzxF -- "$f"; then
                    base=$(basename "$f")
                    if ! git grep --cached -q -F -e "$base" -e "${base// /%20}" -- ":(exclude)$f" 2>/dev/null; then
                        if p1221_allowed "${P1221_ALLOW_ORPHAN_DOC:-}" "$f"; then
                            WAIVED="${WAIVED}  orphan doc: $f (P1221_ALLOW_ORPHAN_DOC)"$'\n'
                        else
                            ORPHAN_DOCS="${ORPHAN_DOCS}  $f"$'\n'
                        fi
                    fi
                fi;;
        esac
        # Exempt files that are large BY DESIGN and must ship in-repo. decisions.md is an
        # append-only log, 4.1MB and growing — the gate blocked every /kdd commit on its first
        # real use (2026-09-03), because the fixture only ever contained files it should reject.
        case "$f" in
            package-lock.json|docs/decisions.md) P1221_SIZE_EXEMPT=1;;
            *) P1221_SIZE_EXEMPT=0;;
        esac
        if [ "$P1221_SIZE_EXEMPT" = "0" ]; then
            if ! sz=$(git cat-file -s ":$f" 2>/dev/null); then
                echo -e "${RED}✗ Repo-structure gate: could not size staged blob for $f — failing closed${NC}"
                ERRORS=$((ERRORS + 1)); continue
            fi
            if [ "$sz" -gt 512000 ]; then
                if p1221_allowed "${P1221_ALLOW_LARGE:-}" "$f"; then
                    WAIVED="${WAIVED}  large file: $f ($((sz / 1024))KB, P1221_ALLOW_LARGE)"$'\n'
                else
                    LARGE_STAGED="${LARGE_STAGED}  $f ($((sz / 1024))KB)"$'\n'
                fi
            fi
        fi
    done < "$P1221_ARRIVALS_FILE"
    NEW_ROOT_ENTRIES=$(printf '%s' "$NEW_ROOT_ENTRIES" | sort -u)
    if [ -n "$NEW_ROOT_ENTRIES" ]; then
        echo -e "${RED}✗ New top-level entry not in the tree at HEAD:${NC}"
        echo "$NEW_ROOT_ENTRIES"
        echo -e "${RED}  Every root entry is a location agents will imitate. Put it under an existing dir${NC}"
        echo -e "${RED}  (docs/technical/file-locations.md) or, if deliberate, P1221_ALLOW_NEW_ROOT=<name>.${NC}"
        ERRORS=$((ERRORS + 1))
    fi
    if [ -n "$ORPHAN_DOCS" ]; then
        echo -e "${RED}✗ New docs/ page with no inbound reference in the staged tree:${NC}"
        printf '%s' "$ORPHAN_DOCS"
        echo -e "${RED}  Link it from CHARTER.md, CLAUDE.md, a rule, a skill or the doc that routes to it${NC}"
        echo -e "${RED}  (docs/CHARTER.md: one fact, one home) — or P1221_ALLOW_ORPHAN_DOC=<path> if the link lands next.${NC}"
        ERRORS=$((ERRORS + 1))
    fi
    if [ -n "$LARGE_STAGED" ]; then
        echo -e "${RED}✗ Staged file over 500KB:${NC}"
        printf '%s' "$LARGE_STAGED"
        echo -e "${RED}  Compress it, host it externally, or P1221_ALLOW_LARGE=<path> if it must ship in the repo.${NC}"
        ERRORS=$((ERRORS + 1))
    fi
    if [ -n "$WAIVED" ]; then
        echo -e "${YELLOW}⚠ Repo-structure gate waived by explicit override:${NC}"
        printf '%s' "$WAIVED"
        WARNINGS=$((WARNINGS + 1))
    fi
    if [ -z "$NEW_ROOT_ENTRIES" ] && [ -z "$ORPHAN_DOCS" ] && [ -z "$LARGE_STAGED" ] && [ -z "$WAIVED" ]; then
        echo -e "${GREEN}✓ Repo structure: no new root entries, orphan docs, or large files${NC}"
    fi
fi
rm -f "${P1221_ARRIVALS_FILE:-}"
echo ""

# 14.9. Client-breaking migration annotation gate (P887 — prevents P886-class
# outages at authoring time). A newly staged migration containing client-breaking
# SQL shapes (REVOKE from anon/authenticated, DROP POLICY, DROP COLUMN, column
# type change) must carry "-- requires-frontend: <sha>" (migrate.sh hard-blocks
# the prod apply until that commit is deployed) or "-- client-safe: <reason>".
#
# --diff-filter=AM (not just A): a migration fixed -- or broken -- in a second
# commit on the same branch must still be scanned. P1039's spec said "new/
# modified migration files"; the original wiring only checked "new", so
# editing a migration across commits (normal in this repo's iterate-then-ship
# workflow) silently skipped both this check and the P1039/P1041 RLS-scope
# check below, which share this variable (P1041).
echo ">>> Checking new/modified migrations for client-breaking shapes (P887)..."
NEW_MIGRATIONS=$(git diff --cached --name-only --diff-filter=AM 2>/dev/null | grep '^supabase/migrations/.*\.sql$' || true)
if [ -n "$NEW_MIGRATIONS" ]; then
    # shellcheck disable=SC2086 — word-splitting on filenames is intended (no spaces in migration names)
    if ./scripts/check-migration-client-safety.sh $NEW_MIGRATIONS; then
        echo -e "${GREEN}✓ Client-safety annotations OK${NC}"
    else
        echo -e "${RED}✗ Client-breaking migration(s) lack a coupling annotation (see above)${NC}"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${GREEN}✓ No new migrations staged${NC}"
fi
echo ""

# 14.95. Unscoped RLS policy gate (P1039 — prevents P1035-class recurrence).
# A newly staged or modified migration containing a non-SELECT policy whose
# USING/WITH CHECK looks role-scoped (literal true or a role-identity
# function) but has no TO <role> clause (or a TO clause including PUBLIC)
# defaults to PUBLIC, including unauthenticated. Must carry
# "-- intentionally-public: <reason>" or an explicit non-public TO clause.
echo ">>> Checking new/modified migrations for unscoped RLS policies (P1039)..."
if [ -n "$NEW_MIGRATIONS" ]; then
    # shellcheck disable=SC2086 — word-splitting on filenames is intended (no spaces in migration names)
    if python3 ./scripts/check-rls-scope.py $NEW_MIGRATIONS; then
        echo -e "${GREEN}✓ RLS policy scoping OK${NC}"
    else
        echo -e "${RED}✗ Unscoped RLS policy/policies found (see above)${NC}"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${GREEN}✓ No new migrations staged${NC}"
fi
echo ""

# 14b. Edge function caller gate (P1207 / D-1)
# deploy-functions.sh auto-discovers every directory under supabase/functions/,
# so a function nobody calls is still deployed and still publicly reachable.
# verify_jwt does not close that: the public anon key is a valid JWT and ships
# in the browser bundle. Runs whenever an edge function file is staged.
echo ">>> Checking edge functions for a caller gate (P1207)..."
if echo "$STAGED_FILES" | grep -q '^supabase/functions/'; then
    if python3 ./scripts/check-edge-function-auth.py; then
        echo -e "${GREEN}✓ Edge function caller gates OK${NC}"
    else
        echo -e "${RED}✗ Edge function with no caller gate (see above)${NC}"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${GREEN}✓ No edge function files staged${NC}"
fi
echo ""

# 15. Migration commit gate (P270 — prevents P160-class bugs)
# When a migration SQL file is staged, verifies it was applied to test DB via
# deploy-manifest.json (updated by ./scripts/migrate.sh after successful push).
# (1) applied to test DB — verified via deploy-manifest, (2) integration test added.
# 14.95. Duplicate migration version prefix gate (P1042 — authoring-time half).
# schema_migrations is keyed on the version prefix alone, so two files sharing one can
# never both be recorded: whichever applies first wins and the other is reported
# "(already applied, skipping)" forever while its SQL never runs — silently, on prod too.
# Scoped to STAGED migrations: this blocks the commit that INTRODUCES a collision without
# holding unrelated commits hostage to a pre-existing one that is still being repaired.
# The whole-tree check at apply time lives in scripts/migrate.sh.
echo ">>> Checking staged migrations for duplicate version prefixes (P1042)..."
STAGED_MIGRATION_FILES=$(git diff --cached --name-only --diff-filter=AM 2>/dev/null | grep '^supabase/migrations/.*\.sql$' || true)
if [ -n "$STAGED_MIGRATION_FILES" ]; then
    # shellcheck disable=SC2086 — word-splitting on filenames is intended (no spaces in migration names)
    if ./scripts/lib/check-duplicate-migration-versions.sh supabase/migrations \
         --label "staged for commit" --touching $STAGED_MIGRATION_FILES; then
        echo -e "${GREEN}✓ No duplicate version prefixes among staged migrations${NC}"
    else
        echo -e "${RED}✗ Staged migration(s) share a version prefix with an existing file (P1042)${NC}"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${GREEN}✓ No migrations staged${NC}"
fi

echo ""
echo ">>> Checking for new migrations being committed..."
# --diff-filter=ACMR: a DELETED migration must not be checked for "is it applied".
# Removing a migration file also removes it from deploy-manifest.json, so the check
# could never pass — it demanded ./scripts/migrate.sh for a file that no longer
# exists, and re-running migrate.sh cannot re-add a migration whose file is gone.
# Found when a branch removed a migration it had superseded before shipping (P1264).
STAGED_MIGRATIONS=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null | grep '^supabase/migrations/.*\.sql$' || true)
DEPLOY_MANIFEST="supabase/deploy-manifest.json"
if [ -n "$STAGED_MIGRATIONS" ]; then
    UNAPPLIED=0
    while IFS= read -r mig; do
        mig_base=$(basename "$mig" .sql)
        applied=false
        if [ -f "$DEPLOY_MANIFEST" ]; then
            # Check if migration version prefix (first 14 chars of timestamp) is in test.migrations
            if python3 -c "
import json, sys
with open('$DEPLOY_MANIFEST') as f:
    manifest = json.load(f)
test_migrations = manifest.get('test', {}).get('migrations', [])
mig = '$mig_base'
found = any(str(m) == mig or mig.startswith(str(m)) for m in test_migrations)
sys.exit(0 if found else 1)
" 2>/dev/null; then
                applied=true
            fi
        fi
        if $applied; then
            echo -e "${GREEN}  ✓ $mig_base applied (in deploy-manifest)${NC}"
        else
            echo -e "${RED}  ✗ $mig_base not applied — run: ./scripts/migrate.sh${NC}"
            UNAPPLIED=$((UNAPPLIED + 1))
        fi
    done <<< "$STAGED_MIGRATIONS"

    if [ "$UNAPPLIED" -gt 0 ]; then
        echo -e "${RED}✗ Staged migration(s) not yet applied to test DB.${NC}"
        echo -e "${RED}  Run ./scripts/migrate.sh, then re-stage deploy-manifest.json.${NC}"
        echo -e "${RED}  Integration test: e2e/integration/p{N}-db-schema.spec.ts${NC}"
        echo -e "${RED}  See docs/technical/e2e-testing-guide.md for the integration test template.${NC}"
        ERRORS=$((ERRORS + 1))
    else
        echo -e "${GREEN}✓ All staged migrations applied to test DB${NC}"
    fi

    # P270 enforcement: check that each staged migration has a corresponding integration test.
    # WARNING only (not hard error) — many existing migrations predate this rule.
    MISSING_TESTS=0
    while IFS= read -r mig; do
        # Extract basename without path and extension for matching
        mig_base=$(basename "$mig" .sql)

        # Extract P-number if present: matches p123 or p_123 patterns (case-insensitive)
        p_num=$(echo "$mig_base" | grep -oiE 'p_?[0-9]+' | head -1 | tr '[:upper:]' '[:lower:]' | tr -d '_')

        test_found=0

        if [ -n "$p_num" ]; then
            # Check for any integration test matching pNNN (e.g. p272-anything.spec.ts)
            if ls e2e/integration/${p_num}*.spec.ts 2>/dev/null | grep -q .; then
                test_found=1
            fi
        fi

        # If no P-number match (or no P-number), check for a file named after the
        # migration base name first (exact filename match), then fall back to
        # content search (covers non-P-numbered migrations either way)
        if [ "$test_found" -eq 0 ]; then
            if ls "e2e/integration/${mig_base}.spec.ts" 2>/dev/null | grep -q .; then
                test_found=1
            elif grep -rl "$mig_base" e2e/integration/ 2>/dev/null | grep -q .; then
                test_found=1
            fi
        fi

        if [ "$test_found" -eq 0 ]; then
            MISSING_TESTS=$((MISSING_TESTS + 1))
            if [ -n "$p_num" ]; then
                suggested="e2e/integration/${p_num}-db-schema.spec.ts"
            else
                suggested="e2e/integration/${mig_base}.spec.ts"
            fi
            echo -e "${YELLOW}  ⚠ No integration test found for: $mig${NC}"
            echo -e "${YELLOW}    → Create: $suggested${NC}"
            echo -e "${YELLOW}    → Template: e2e/integration/migration-template.spec.ts${NC}"
        fi
    done <<< "$STAGED_MIGRATIONS"

    if [ "$MISSING_TESTS" -gt 0 ]; then
        echo -e "${YELLOW}  P270 rule: every migration MUST have an integration test.${NC}"
        echo -e "${YELLOW}  See docs/technical/e2e-testing-guide.md#integration-tests-p270--db-migration-layer${NC}"
        # Already counted in WARNINGS above; no additional increment needed
    fi

    # CREATE OR REPLACE FUNCTION diff annotation check.
    # PL/pgSQL defers symbol resolution — a broken function body applies cleanly and fails at
    # call time. Any migration redefining an existing function must include a header comment
    # proving the author diffed against the prior version. New functions use "-- new function".
    # See decisions.md: "PL/pgSQL defers symbol resolution" (2026-04-18).
    UNDIFFED=0
    while IFS= read -r mig; do
        if grep -qiE 'CREATE OR REPLACE FUNCTION' "$mig" 2>/dev/null; then
            if ! grep -qiE 'diffed against:|-- new function' "$mig" 2>/dev/null; then
                echo -e "${RED}  ✗ $mig redefines a function but has no diff annotation.${NC}"
                echo -e "${RED}    Add to the migration header:${NC}"
                echo -e "${RED}      -- diffed against: <prior-migration-filename>.sql${NC}"
                echo -e "${RED}    Or for a brand-new function:${NC}"
                echo -e "${RED}      -- new function${NC}"
                UNDIFFED=$((UNDIFFED + 1))
            fi
        fi
    done <<< "$STAGED_MIGRATIONS"
    if [ "$UNDIFFED" -gt 0 ]; then
        echo -e "${RED}✗ $UNDIFFED migration(s) redefine functions without a diff annotation (hard block).${NC}"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${GREEN}✓ No new migrations staged${NC}"
fi
echo ""

# 16. .claude/ changes on non-main branch — warn that skills/rules won't reach main until /ship
CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "")
if [ "$CURRENT_BRANCH" != "main" ] && [ -n "$CURRENT_BRANCH" ]; then
    CLAUDE_STAGED=$(git diff --cached --name-only | grep "^\.claude/" || true)
    if [ -n "$CLAUDE_STAGED" ]; then
        echo ""
        echo -e "${YELLOW}⚠ .claude/ changes staged on branch '$CURRENT_BRANCH':${NC}"
        echo "$CLAUDE_STAGED" | sed 's/^/  /'
        echo -e "${YELLOW}  These skills/rules/agents won't be available on main or other worktrees until /ship runs.${NC}"
        # Prompt only when /dev/tty is accessible (human terminal, not agent/CI)
        if { read -r _TTY_TEST </dev/tty; } 2>/dev/null <<< ""; then
            echo -n "  Proceed with commit? (y/N) "
            read -r REPLY </dev/tty
            if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
                echo -e "${RED}✗ Commit aborted — consider committing .claude/ changes to main separately first${NC}"
                exit 1
            fi
        else
            WARNINGS=$((WARNINGS + 1))
        fi
    fi
fi
echo ""

# 17. Privacy check — personal identifiers that must not appear in public files
echo ">>> Privacy check (personal identifiers)..."
STAGED_FILES_ALL=$(git diff --cached --name-only 2>/dev/null || echo "")
AUDIT_SCRIPT="$(git rev-parse --show-toplevel)/scripts/audit-privacy.sh"
if [ ! -x "$AUDIT_SCRIPT" ]; then
    echo -e "${RED}✗ scripts/audit-privacy.sh missing or not executable — blocking commit${NC}"
    ERRORS=$((ERRORS + 1))
elif ! "$AUDIT_SCRIPT" --staged > /tmp/cp-pii-commit.log 2>&1; then
    echo -e "${RED}✗ Personal identifiers found in staged changes:${NC}"
    head -15 /tmp/cp-pii-commit.log
    echo -e "${RED}  → Move personal data to .private/docs/ (gitignored)${NC}"
    echo -e "${RED}  → Or add path to .privacy-allowlist if it's a known-safe historical reference${NC}"
    if [ -z "${CP_ALLOW_PII_COMMIT:-}" ]; then
        echo -e "${RED}  → One-off override: CP_ALLOW_PII_COMMIT=1 git commit ...${NC}"
        ERRORS=$((ERRORS + 1))
    else
        echo -e "${YELLOW}  → CP_ALLOW_PII_COMMIT=1 set — proceeding (WARN)${NC}"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo -e "${GREEN}✓ No personal identifiers in staged changes${NC}"
fi

if [ -n "$STAGED_FILES_ALL" ]; then
    SOFT_FILES=$(echo "$STAGED_FILES_ALL" | grep -E '^(docs/|features/|\.claude/commands/)' || true)
    if [ -n "$SOFT_FILES" ]; then
        # Portable: no \b, use [[:<:]]...[[:>:]] via grep -E
        NAMED_HITS=$(echo "$SOFT_FILES" | xargs -I{} git diff --cached -- {} 2>/dev/null | \
            grep -E '^[+]' | grep -v '^+++' | \
            grep -iE '[[:<:]](slavochek|googlemail)[[:>:]]' || true)
        if [ -n "$NAMED_HITS" ]; then
            echo -e "${YELLOW}⚠ Possible personal identifier in docs/features — run /maintain:privacy:${NC}"
            echo "$NAMED_HITS" | head -3
            WARNINGS=$((WARNINGS + 1))
        fi
        # Remind when touching docs after a conversation-synthesis session
        CONV_SOURCED=$(echo "$STAGED_FILES_ALL" | grep -E '^(docs/decisions|docs/hypotheses|docs/lean-canvas|docs/theory-of-change)' || true)
        if [ -n "$CONV_SOURCED" ]; then
            echo -e "${YELLOW}ℹ Strategic docs changed — if source was claude-conversations, run /maintain:privacy before git push${NC}"
        fi
    fi
fi
echo ""

# 17c. Per-person .private/ file paths must not be referenced from public files.
# Files in business/{founders,coaches,partners}/ are named <person>-<company>.md by
# convention, so the PATH ITSELF is a real name + company. Section 17 scans for
# identifier *content* (emails/phones) and cannot catch a *reference* leak — a real
# miss on 2026-07-29, where three such paths passed a green privacy check.
# Referencing the DIRECTORY is fine and is the fix the error message points to.
echo ">>> Checking for per-person .private/ paths in public files..."
STAGED_PUBLIC_DOCS=$(echo "$STAGED_FILES_ALL" | grep -E '^(docs/|features/|content/|src/|README\.md|CLAUDE\.md)' || true)
if [ -n "$STAGED_PUBLIC_DOCS" ]; then
    # Same idiom as 17b: -E '^\+' then -vF '+++' (BSD basic-regex chokes on '^\+\+\+'
    # and the resulting error + '|| true' silently empties the var — see 17b comment).
    PERSON_PATH_HITS=$(echo "$STAGED_PUBLIC_DOCS" | xargs -I{} git diff --cached -- {} 2>/dev/null | \
        grep -E '^\+' | grep -vF '+++' | \
        grep -oE '\.private/docs/business/(founders|coaches|partners)/[A-Za-z0-9_.-]+\.(md|txt)' || true)
    if [ -n "$PERSON_PATH_HITS" ]; then
        echo -e "${RED}✗ Public file references a per-person private file (the filename is a real name + company):${NC}"
        echo "$PERSON_PATH_HITS" | sort -u | head -5
        echo -e "${RED}  → Cite the directory instead, e.g. '.private/docs/business/founders/'${NC}"
        echo -e "${RED}  → Public repo: a name welded to a commercial assessment is the leak, and a push makes it permanent${NC}"
        ERRORS=$((ERRORS + 1))
    else
        echo -e "${GREEN}✓ No per-person private paths in public files${NC}"
    fi
else
    echo -e "${GREEN}✓ No public docs staged (per-person path check skipped)${NC}"
fi
echo ""

# 17d. Private-repo paths must not appear in ANY file of this public repo (pp p48).
# Distinct from 17c in BOTH pattern and scope, and the scope is the load-bearing half:
# 17c watches docs/|features/|content/|src/|README|CLAUDE.md, so it is structurally blind
# to .claude/commands/ and scripts/ — which is exactly where the 2026-08-28 leak landed and
# passed a green privacy check. /day had accreted 15 private references over months, plus a
# hardcoded deep private-repo path as a default inside the (now relocated) day-gates.sh.
# Nothing caught any of them, because nothing was looking at those directories.
#
# NOTE TO WHOEVER EDITS THIS: write private paths as ~/Projects/private/<repo>/ when you need
# to describe one. A literal deep path in this very comment made the guard block the commit
# that installed it — caught by running the guard against its own change before shipping it.
#
# Referencing the private ROOT is deliberately allowed — a rule that says "no
# ~/Projects/private/ paths here" has to be able to name the thing it forbids, and the same
# carve-out is what 17c does one section up. What is blocked is a path that reaches INTO a
# private repo: one or more segments past private/.
echo ">>> Checking for private-repo paths in public files..."
STAGED_NONPRIVATE=$(echo "$STAGED_FILES_ALL" | grep -v '^\.private/' || true)
if [ -n "$STAGED_NONPRIVATE" ]; then
    # Same -E '^\+' then -vF '+++' idiom as 17b/17c (BSD basic-regex chokes on '^\+\+\+').
    PRIVATE_PATH_HITS=$(echo "$STAGED_NONPRIVATE" | xargs -I{} git diff --cached -- {} 2>/dev/null | \
        grep -E '^\+' | grep -vF '+++' | \
        grep -oE '(~|\$HOME|/Users/[A-Za-z0-9_.-]+)/Projects/private/[A-Za-z0-9_.-]+' || true)
    if [ -n "$PRIVATE_PATH_HITS" ]; then
        echo -e "${RED}✗ Public file references a path inside a PRIVATE repo:${NC}"
        echo "$PRIVATE_PATH_HITS" | sort -u | head -5
        echo -e "${RED}  → This repo is public. A private path here names a repo, a project, or a person's data.${NC}"
        echo -e "${RED}  → If the thing you are adding is personal, it belongs in ~/.claude/commands/day.md${NC}"
        echo -e "${RED}    (or another private home), not in a ClarityPledge file. See pp tasks/p48.${NC}"
        echo -e "${RED}  → Naming the private ROOT alone (~/Projects/private/) is allowed. To DESCRIBE a${NC}"
        echo -e "${RED}    private path in prose, use a placeholder segment: ~/Projects/private/<repo>/${NC}"
        ERRORS=$((ERRORS + 1))
    else
        echo -e "${GREEN}✓ No private-repo paths in public files${NC}"
    fi
else
    echo -e "${GREEN}✓ Only .private/ files staged (private-path check skipped)${NC}"
fi
echo ""

# 17b. Broad email check in feature specs — catch any real user email that slipped in
echo ">>> Checking feature specs for unrecognized email addresses..."
STAGED_FEATURE_FILES=$(echo "$STAGED_FILES_ALL" | grep -E '^features/.*\.md$' || true)
if [ -n "$STAGED_FEATURE_FILES" ]; then
    # -vF (fixed string): the prior ERE-escaped form '^\+\+\+' ran under BSD basic-regex
    # (no -E on this grep), errored "repetition-operator operand invalid", and || true
    # emptied FEATURE_DIFF — the email check passed vacuously on every commit (P887 KDD).
    FEATURE_DIFF=$(echo "$STAGED_FEATURE_FILES" | xargs -I{} git diff --cached -- {} 2>/dev/null | \
        grep -E '^\+' | grep -vF '+++' || true)

    # Match email-like patterns, then exclude known safe ones
    SUSPICIOUS_EMAILS=$(echo "$FEATURE_DIFF" | \
        grep -oE '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}' | \
        grep -viE '@claritypledge\.com|@example\.com|@supabase\.co' | \
        grep -viE '^e2e-' | \
        sort -u || true)

    if [ -n "$SUSPICIOUS_EMAILS" ]; then
        echo -e "${YELLOW}⚠ Possible user email(s) in feature spec — verify safe to publish:${NC}"
        echo "$SUSPICIOUS_EMAILS" | while read -r addr; do
            echo -e "${YELLOW}  → $addr${NC}"
        done
        echo -e "${YELLOW}  → Move to .private/docs/ if this is a real user's address${NC}"
        WARNINGS=$((WARNINGS + 1))
    else
        echo -e "${GREEN}✓ No unrecognized emails in feature specs${NC}"
    fi
else
    echo -e "${GREEN}✓ No feature specs staged${NC}"
fi
echo ""

# 18. One-time scripts outside archive/ — warn if staged directly in scripts/ root
echo ">>> Checking for one-time scripts not yet archived..."
ONE_TIME_STAGED=$(git diff --cached --name-only | \
    grep -E '^scripts/[^/]+\.(cjs|mjs|ts|sh|js|py)$' | \
    grep -iE '(migrate|reclassify|convert|rewrite|backfill|patch|seed)' | \
    grep -vE '(migrate\.sh|pre-migration|post-migration)' || true)
if [ -n "$ONE_TIME_STAGED" ]; then
    echo -e "${YELLOW}⚠ One-time script(s) staged in scripts/ root — archive after use:${NC}"
    echo "$ONE_TIME_STAGED" | sed 's/^/  /'
    echo -e "${YELLOW}  → git mv <script> scripts/archive/ when done${NC}"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✓ No one-time scripts in scripts/ root${NC}"
fi
echo ""

# 18b. decisions.md line-number citations — refuse NEW ones (P1171)
#
# docs/decisions.md is prepend-newest, so every "decisions.md:1234" reference
# rots the moment another entry lands — often the same day, sometimes within
# the same session. Measured 2026-08-27: all 6 such citations in p1171's spec
# pointed at unrelated entries hours after being written, one of them at an
# entry added later that same afternoon.
#
# SCOPE IS ADDED LINES ONLY, BY DESIGN (epistemic.md gate 7c). 68 of these
# already exist across 22 files, most of them closed specs in features/done/.
# A repo-wide check would refuse every commit that touches one of those files
# for an unrelated reason. This refuses only citations being INTRODUCED.
echo ">>> Checking for new decisions.md line-number citations..."
NEW_LINE_CITES=$(git diff --cached -U0 -- '*.md' \
    | grep -E '^\+' | grep -v '^+++' \
    | grep -oE 'decisions\.md:[0-9]+' || true)
if [ -n "$NEW_LINE_CITES" ]; then
    echo -e "${RED}✗ New line-number citation(s) into decisions.md:${NC}"
    echo "$NEW_LINE_CITES" | sort -u | sed 's/^/  /'
    echo -e "${RED}  decisions.md is prepend-newest — line numbers rot within hours.${NC}"
    echo -e "${RED}  Cite by date + tag + title instead:${NC}"
    echo -e "${RED}    decisions.md 2026-08-25 [product], \"YouTube search matches words, not stances\"${NC}"
    echo -e "${RED}  Resolve an existing one with:${NC}"
    echo -e "${RED}    sed -n '1,<LINE>p' docs/decisions.md | grep '^## ' | tail -1${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✓ No new decisions.md line-number citations${NC}"
fi
echo ""

# 18c. Early-pipe-close under pipefail (P1260) — a SUCCESS reported as a failure.
#
# `producer | grep -q X` exits 141 when it MATCHES: grep stops at the first hit and closes its
# read end, the producer takes SIGPIPE, and `set -o pipefail` promotes that to the pipeline's
# status. The condition then reads "not found" on exactly the inputs it was meant to find.
#
# Measured 2026-09-08, with controls, because the deciding factor is NOT what people assume:
#   printf 'a\nb\nMATCH\nc\n' | grep -q MATCH          -> 0    (safe)
#   {for i in $(seq 1 200000); do echo ...; done} | grep -q  -> 141  (a BUILTIN races)
#   yes hello | grep -q hello                          -> 141
# It is OUTPUT SIZE against the pipe buffer, not builtin-vs-process. So this check does NOT try
# to exempt printf/echo producers: that heuristic is safe only by accident of output size and
# would wave through a large builtin loop.
#
# Recurrence is why this is mechanical rather than prose. The repo has hit this family five
# times — scripts/test-push-snapshot-pinning.sh (a suite returning 26/1, 26/1, 27/0 on three
# consecutive runs), scripts/test-git-ops-ship.sh, scripts/git-ops.sh, and twice in
# docs/decisions.md (2026-06-27 ship-gates.sh exiting 141 with zero output; the typecheck-gate
# note) — and every fix was a comment in the file it bit. Nothing carried.
#
# ADDED LINES ONLY, and WARN not block. ~156 such pipelines already exist and the overwhelming
# majority are safe small producers; refusing them would be a gate-7c violation (a new refusal
# whose false-positive population was never measured). This flags only what is being written now.
echo ">>> Checking for early-pipe-close pipelines (pipefail + grep -q / head)..."
SIGPIPE_HITS=""
# `while read` not `for f in $(...)`: a staged path containing a space would word-split into
# several nonexistent paths and be silently skipped (Codex review, 2026-09-08).
while IFS= read -r f; do
    [ -n "$f" ] || continue
    case "$f" in *.sh) ;; *) continue ;; esac
    # Read pipefail from the STAGED blob, not the working tree. With a partially staged file the
    # two disagree, so testing the worktree can both miss a real hit and invent a false one
    # (Codex review, 2026-09-08 — the one HIGH finding).
    git show ":$f" 2>/dev/null | grep -qE 'set +-[a-zA-Z]*o +pipefail|set +-o +pipefail' || continue
    ADDED=$(git diff --cached -U0 -- "$f" | grep -E '^\+' | grep -v '^+++' || true)
    [ -n "$ADDED" ] || continue
    # Right-hand sides that stop reading early. `grep -c` DRAINS the stream and is safe, so the
    # pattern must not match it. Covers -q, -qE, --quiet and -m N, all confirmed to return 141
    # against an unbounded producer.
    #
    # KNOWN LIMITS, accepted because this is advisory: a pipeline split across lines with a
    # trailing backslash is missed (line-by-line matching), and `sed q` / `awk '...exit'` /
    # `read` consumers are equally dangerous but too easily confused with safe uses to flag.
    BAD=$(printf '%s\n' "$ADDED" \
        | grep -nE '\|[[:space:]]*(grep([[:space:]]+-[a-zA-Z]*q[a-zA-Z]*|[[:space:]]+--quiet|[[:space:]]+-m([[:space:]]*[0-9]))|head([[:space:]]|$))' || true)
    if [ -n "$BAD" ]; then
        SIGPIPE_HITS="${SIGPIPE_HITS}${f}:"$'\n'"${BAD}"$'\n'
    fi
done <<< "$STAGED_FILES"
if [ -n "$SIGPIPE_HITS" ]; then
    echo -e "${YELLOW}⚠ New pipeline(s) that can report a MATCH as a failure:${NC}"
    printf '%s\n' "$SIGPIPE_HITS" | sed 's/^/  /'
    echo -e "${YELLOW}  Under pipefail these exit 141 when they SUCCEED, if the producer is${NC}"
    echo -e "${YELLOW}  still writing. Prefer reading from a process substitution:${NC}"
    echo -e "${YELLOW}    grep -q PATTERN < <(producer)${NC}"
    echo -e "${YELLOW}  or grep -c, which drains the stream. sed q, awk with exit, and a read${NC}"
    echo -e "${YELLOW}  consumer are equally unsafe but are not matched here. Ignore this if${NC}"
    echo -e "${YELLOW}  the producer's${NC}"
    echo -e "${YELLOW}  output is always small. See .claude/rules/epistemic.md gate 7${NC}"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✓ No new early-pipe-close pipelines${NC}"
fi
echo ""

# 19. Zombie Vite server check — detect dev servers from deleted worktrees
echo ">>> Checking for leaked vite/playwright processes..."
# P1284: this check used to enumerate LISTENING node sockets and flag only a
# vite whose cwd had been deleted. It reported CLEAN through a measured leak of
# 8 vite servers (oldest 11 days) and 59 playwright processes, for three
# reasons: it never looked at playwright at all; an orphan whose cwd still
# exists was invisible; and its port pattern `5[1-7]00` matched only round
# hundreds, so the default 5173 was outside the range it scanned.
#
# The classifier now lives in one place — scripts/reap-e2e-zombies.sh — so the
# detector and the reaper cannot disagree about what counts as a zombie. Warn
# only: killing something is never this hook's decision.
ZOMBIE_COUNT=0
if [ -x "./scripts/reap-e2e-zombies.sh" ]; then
    ZOMBIE_LIST=$(./scripts/reap-e2e-zombies.sh --list 2>/dev/null || true)
    if [ -n "$ZOMBIE_LIST" ]; then
        while IFS= read -r zline; do
            [ -z "$zline" ] && continue
            Z_PID=$(echo "$zline" | cut -d: -f2)
            Z_KIND=$(echo "$zline" | cut -d: -f3)
            Z_WHY=$(echo "$zline" | cut -d: -f4-)
            echo -e "${YELLOW}⚠ Leaked $Z_KIND process: PID $Z_PID — $Z_WHY${NC}"
            ZOMBIE_COUNT=$((ZOMBIE_COUNT + 1))
        done <<< "$ZOMBIE_LIST"
        echo -e "${YELLOW}  → Review with ./scripts/reap-e2e-zombies.sh, then ./scripts/reap-e2e-zombies.sh --kill${NC}"
    fi
fi
if [ "$ZOMBIE_COUNT" -gt 0 ]; then
    WARNINGS=$((WARNINGS + ZOMBIE_COUNT))
else
    echo -e "${GREEN}✓ No leaked vite/playwright processes${NC}"
fi
echo ""

# 20. Binary files check — prevent committing images/PDFs to docs/ or project root
# (was section 19 — renumbered after zombie check insertion)
echo ">>> Checking for binary files being staged..."
BINARY_STAGED=$(git diff --cached --name-only | \
    grep -iE '\.(pdf|png|jpg|jpeg|gif|bmp|tiff|psd|ai|sketch|mp4|mov|zip|tar|gz)$' | \
    grep -vE '^public/' || true)
if [ -n "$BINARY_STAGED" ]; then
    echo -e "${YELLOW}⚠ Binary file(s) staged outside public/ — use .private/ or external storage:${NC}"
    echo "$BINARY_STAGED" | sed 's/^/  /'
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✓ No binary files staged outside public/${NC}"
fi
echo ""

# 21. Skill frontmatter check — warn when staged skill files lack required fields
STAGED_SKILLS=$(echo "$STAGED_FILES" | grep -E '^\.claude/commands/slava/.*\.md$' | \
    grep -vE '(PRINCIPLES|shortcuts|sifter-definitions|/agent\.md|/synthesizer\.md|archive/)' || true)
if [ -n "$STAGED_SKILLS" ]; then
    echo ">>> Checking skill frontmatter..."
    SKILL_ISSUES=""
    while IFS= read -r skill_file; do
        [ -z "$skill_file" ] && continue
        FIRST_LINE=$(head -1 "$skill_file" 2>/dev/null || echo "")
        if [ "$FIRST_LINE" != "---" ]; then
            SKILL_ISSUES="${SKILL_ISSUES}  ${skill_file}: missing frontmatter\n"
        elif ! grep -q '^name:' "$skill_file" 2>/dev/null; then
            SKILL_ISSUES="${SKILL_ISSUES}  ${skill_file}: missing name field\n"
        elif ! grep -qE '^description:\s*.+' "$skill_file" 2>/dev/null; then
            SKILL_ISSUES="${SKILL_ISSUES}  ${skill_file}: missing or empty description\n"
        fi
    done <<< "$STAGED_SKILLS"
    if [ -n "$SKILL_ISSUES" ]; then
        echo -e "${YELLOW}⚠ Skill frontmatter issues (run python3 scripts/fix-skill-frontmatter.py):${NC}"
        echo -e "$SKILL_ISSUES"
        WARNINGS=$((WARNINGS + 1))
    else
        echo -e "${GREEN}✓ Staged skill files have valid frontmatter${NC}"
    fi
    echo ""
fi

# 22. Agent-skills sync gate (P1151) — .agents/skills/ is a generated, committed
# projection of .claude/commands/slava/**/*.md for non-Claude harnesses (DSH,
# Codex, ...). VERIFY ONLY — never regenerate before checking here. A
# regenerate-then-check step would be vacuous by construction: the generator's
# job is to make the check pass, so the failure branch would be unreachable.
# Scoped to the staged set since P1284 (--staged-only). It used to run against
# the whole WORKING TREE, which meant any co-tenant session's in-progress,
# unstaged edit under .claude/commands/slava/ failed every other session's
# unrelated commit — three recorded occurrences, each "resolved" by polling
# `git status` until a stranger stopped typing, and `commit-to-main`'s lock is
# no help because it serializes committers, not editors. The defect this gate
# catches is unchanged: a skill source added/edited/removed without
# regenerating, in EITHER direction (source staged, projection stale; or
# projection staged, source not) — both are in scope, because scoping is by
# skill name across both trees. Drift in a skill this commit does not touch is
# now someone else's commit to fix. D4/D8/D9 hard fails stay repo-wide.
if [ -f "./scripts/sync-agent-skills.sh" ]; then
    # P1284 follow-up: the pre-commit hook is a symlink to the MAIN checkout's copy of
    # THIS file, but ./scripts/sync-agent-skills.sh resolves inside the committing
    # WORKTREE. A worktree whose branch predates P1284 has a copy that does not know
    # --staged-only, and rejects it with exit 2 — blocking every commit in that worktree
    # with "unknown argument". Measured 2026-09-09 across w3, w5 and w10 immediately
    # after P1284 landed. Probe for support and fall back to the repo-wide --check,
    # which is exactly what those branches ran before P1284 anyway.
    SYNC_SCOPE_FLAG="--staged-only"
    # Anchor on the case ARM, not the bare string: the script's own usage comment
    # names the flag too, so a bare grep would pass a script that merely documents
    # it and still cannot parse it. Raised by the P1283 agent against the first
    # version of this probe.
    if ! grep -qE '^[[:space:]]*--staged-only\)' ./scripts/sync-agent-skills.sh 2>/dev/null; then
        SYNC_SCOPE_FLAG=""
    fi
    # shellcheck disable=SC2086
    if ! run_quiet "Agent skills sync (P1151)" ./scripts/sync-agent-skills.sh --check $SYNC_SCOPE_FLAG; then
        echo -e "${YELLOW}  → Run ./scripts/sync-agent-skills.sh (no flag) to regenerate, then re-stage .agents/skills/${NC}"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${YELLOW}⚠ scripts/sync-agent-skills.sh not found — skipping agent-skills sync gate${NC}"
fi
echo ""

# Codex lifecycle-hook gate (P1157). These hooks decide whether a completion
# claim is allowed to stand, so a silent regression here disables a safety gate
# without anything going red. Self-contained: fixtures only, no $HOME, no
# network. Ungated until 2026-08-26, which is how a fail-open browser branch
# survived three green runs.
if [ -f "./scripts/test-codex-native-hooks.sh" ]; then
    if ! run_quiet "Codex lifecycle hooks (P1157)" ./scripts/test-codex-native-hooks.sh; then
        echo -e "${YELLOW}  → Run ./scripts/test-codex-native-hooks.sh to see which case regressed${NC}"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${YELLOW}⚠ scripts/test-codex-native-hooks.sh not found — skipping Codex hook gate${NC}"
fi
echo ""

# Multi-harness routing contract 2, Tier A only (P1247 Phase 1). Contract 2's
# canary (scripts/test-multi-harness-routing.sh) was deliberately NOT wired
# (P1221) because most of its 31 assertions read per-machine $HOME files no CI
# runner or second machine has, and it makes a live `dsh` call. P1247 split it:
# Tier A is the 2 assertions whose subject is a repo file (.codex/config.toml,
# .codex/hooks/route-brief.sh) -- no $HOME dependency, no network, never skips.
# Tiers B/C/D stay off the commit path; run them via
# `./scripts/test-multi-harness-routing.sh {b|c|d|all}` for machine-local or
# integration verification.
if [ -f "./scripts/test-multi-harness-routing.sh" ]; then
    if ! run_quiet "Multi-harness routing, Tier A (P1247)" ./scripts/test-multi-harness-routing.sh a; then
        echo -e "${YELLOW}  → Run ./scripts/test-multi-harness-routing.sh a to see which case regressed${NC}"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${YELLOW}⚠ scripts/test-multi-harness-routing.sh not found — skipping multi-harness Tier A gate${NC}"
fi
echo ""

# CLAUDE.md line budget check
if echo "$STAGED_FILES" | grep -q "^CLAUDE.md$"; then
    CLAUDE_LINES=$(git show :CLAUDE.md 2>/dev/null | wc -l)
    if [ "$CLAUDE_LINES" -gt 350 ]; then
        echo -e "${RED}✗ CLAUDE.md is $CLAUDE_LINES lines (max 350). Remove content before adding.${NC}"
        ERRORS=$((ERRORS + 1))
    else
        echo -e "${GREEN}✓ CLAUDE.md within budget ($CLAUDE_LINES/350 lines)${NC}"
    fi
fi

# CORS helper enforcement — staged edge functions must not declare local corsHeaders
STAGED_EDGE_FNS=$(echo "$STAGED_FILES" | grep -E '^supabase/functions/[^/]+/index\.ts$' | grep -v '_shared' || true)
if [ -n "$STAGED_EDGE_FNS" ]; then
  echo ">>> Checking edge function CORS pattern..."
  CORS_VIOLATIONS=()
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if grep -qE "const corsHeaders[[:space:]]*=[[:space:]]*\{" "$f"; then
      CORS_VIOLATIONS+=("$f")
    fi
  done <<< "$STAGED_EDGE_FNS"
  if [ ${#CORS_VIOLATIONS[@]} -gt 0 ]; then
    echo -e "${RED}✗ CORS: staged edge functions declare a local corsHeaders without importing buildCorsHeaders:${NC}"
    for v in "${CORS_VIOLATIONS[@]}"; do
      echo -e "${RED}    $v${NC}"
    done
    echo -e "${RED}  Fix: import { buildCorsHeaders } from '../_shared/cors.ts' and use it per-request.${NC}"
    ERRORS=$((ERRORS + 1))
  else
    echo -e "${GREEN}✓ Edge function CORS pattern OK${NC}"
  fi
fi

# Deno type check — staged edge function files
STAGED_EDGE_FNS_DENO=$(echo "$STAGED_FILES" | grep -E '^supabase/functions/[^/]+/index\.ts$' | grep -v '_shared' || true)
if [ -n "$STAGED_EDGE_FNS_DENO" ]; then
  if command -v deno &> /dev/null; then
    echo ">>> Deno type check on staged edge functions..."
    DENO_ERRORS=0
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      if ! deno check "$f" > /dev/null 2>&1; then
        echo -e "${RED}  ✗ deno check failed: $f${NC}"
        DENO_ERRORS=$((DENO_ERRORS + 1))
      fi
    done <<< "$STAGED_EDGE_FNS_DENO"
    if [ "$DENO_ERRORS" -gt 0 ]; then
      echo -e "${RED}✗ $DENO_ERRORS edge function(s) failed deno check — type errors above${NC}"
      ERRORS=$((ERRORS + 1))
    else
      echo -e "${GREEN}✓ Deno type check OK${NC}"
    fi
  else
    echo -e "${YELLOW}⚠ deno not installed — edge function type check skipped (install: brew install deno)${NC}"
    WARNINGS=$((WARNINGS + 1))
  fi
fi

# Strategy-doc integrity (docs-strategy-update gates D + F)
# Surfaces the two MECHANICAL anti-drift gates from /slava:maintain:docs-strategy-update
# so discipline alone can't skip them (the 2026-05-22 line-ref rule failed as a pure
# convention and the strategy docs went stale). Gate F: fragile line-number cross-refs.
# Gate D: net-added dated framings without a matching prune. Both WARN (hygiene, not
# correctness) — the skill runs the judgment gates.
STAGED_STRATEGY_DOCS=$(echo "$STAGED_FILES" | grep -E '^docs/(lean-canvas|hypotheses|theory-of-change|definitions)\.md$' || true)
if [ -n "$STAGED_STRATEGY_DOCS" ]; then
    while IFS= read -r doc; do
        [ -z "$doc" ] && continue
        # Gate F — fragile line-number cross-refs (file.md:NNN); use quoted-phrase anchors.
        REFS=$(git show ":$doc" 2>/dev/null | grep -noE '[a-z0-9_/-]+\.md:[0-9]+' || true)
        if [ -n "$REFS" ]; then
            echo -e "${YELLOW}⚠ $doc has fragile line-number cross-ref(s) — use quoted-phrase anchors (2026-05-22 rule):${NC}"
            echo "$REFS" | head -5 | sed 's/^/    /'
            WARNINGS=$((WARNINGS + 1))
        fi
        # Gate D — net-added dated reference LINES. Coarse: counts lines, not blocks, so a
        # single new dated block adds 1-3 lines; only a net jump of +3 trips this, to avoid
        # crying wolf on normal edits. WARN-only hygiene signal — the skill judges true bloat.
        NEW_DATED=$(git show ":$doc" 2>/dev/null | grep -cE '\(20[0-9]{2}-[0-9]{2}' || true)
        OLD_DATED=$(git show "HEAD:$doc" 2>/dev/null | grep -cE '\(20[0-9]{2}-[0-9]{2}' || true)
        NEW_DATED=${NEW_DATED:-0}; OLD_DATED=${OLD_DATED:-0}
        if [ "$((NEW_DATED - OLD_DATED))" -ge 3 ]; then
            echo -e "${YELLOW}⚠ $doc adds $((NEW_DATED - OLD_DATED)) dated reference line(s) (now $NEW_DATED). If a new block supersedes an old one, delete or merge the old (gate D). Coarse signal — run /slava:maintain:docs-strategy-update audit to judge.${NC}"
            WARNINGS=$((WARNINGS + 1))
        fi
    done <<< "$STAGED_STRATEGY_DOCS"
fi

# Large changeset review reminder
STAGED_COUNT=$(echo "$STAGED_FILES" | grep -c '.' || true)
if [ "$STAGED_COUNT" -ge 5 ]; then
    echo -e "${YELLOW}ℹ Large changeset ($STAGED_COUNT files) — if this was a bulk/automated change, confirm /review-all ran${NC}"
fi

# Summary
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
echo "=== SUMMARY === (branch: $CURRENT_BRANCH)"
if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}✗ $ERRORS error(s) - commit blocked${NC}"
    echo -e "${YELLOW}  Branch: $CURRENT_BRANCH${NC}"
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}⚠ $WARNINGS warning(s) - review before committing${NC}"
    exit 0
else
    echo -e "${GREEN}✓ All checks passed${NC}"
    exit 0
fi

# ============================================
# To install as git hook:
# ln -sf ../../scripts/pre-commit-checks.sh .git/hooks/pre-commit
# (adjust path if using worktrees)
# ============================================
