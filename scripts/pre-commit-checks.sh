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

ERRORS=0
WARNINGS=0

# Helper: run a command, suppress output on success, show last 30 lines on failure.
# This keeps total script output under ~5KB for passing runs (vs 100KB+ before).
run_quiet() {
    local label="$1"
    shift
    local tmpfile
    tmpfile=$(mktemp)
    echo -n ">>> $label... "
    if "$@" > "$tmpfile" 2>&1; then
        echo -e "${GREEN}✓${NC}"
        rm -f "$tmpfile"
        return 0
    else
        echo -e "${RED}✗${NC}"
        echo "--- Last 30 lines of output ---"
        tail -30 "$tmpfile"
        echo "--- End output ---"
        rm -f "$tmpfile"
        return 1
    fi
}

# 1. TypeScript Check (fastest, most fundamental - fail fast)
if ! run_quiet "TypeScript" npx tsc --noEmit; then
    ERRORS=$((ERRORS + 1))
fi

# Collect staged files for later checks
STAGED_FILES=$(git diff --cached --name-only --diff-filter=d 2>/dev/null || echo "")

# 2. Lint (staged .ts/.tsx files only — full repo lint is npm run lint)
STAGED_TS=$(echo "$STAGED_FILES" | grep -E '\.(ts|tsx)$' || true)
if [ -n "$STAGED_TS" ]; then
    if ! run_quiet "ESLint" npx eslint $STAGED_TS --max-warnings 0; then
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e ">>> ESLint... ${GREEN}skipped (no .ts/.tsx staged)${NC}"
fi

# 3. Build
if ! run_quiet "Build" npm run build; then
    ERRORS=$((ERRORS + 1))
fi

# 4. Tests
if ! run_quiet "Tests" npm test; then
    ERRORS=$((ERRORS + 1))
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
    # Gitleaks (Layer 1) handles src/ and supabase/ with proper rules — grep only scans config/root files
    GREP_SCAN_FILES=$(echo "$SECRETS_STAGED_FILES" | grep -vE '(\.gitleaks\.toml|pre-commit-checks\.sh|docs/decisions\.md|docs/technical/|supabase/functions/|features/|src/|e2e/|\.claude/commands/|\.claude/rules/)' || true)
    SECRETS_FOUND=""
    if [ -n "$GREP_SCAN_FILES" ]; then
        SECRETS_FOUND=$(echo "$GREP_SCAN_FILES" | xargs grep -l -iE '(sk_live|pk_live|SUPABASE_SERVICE|api[_-]?key|apikey|secret[_-]?key|password\s*=|token\s*=)[^a-zA-Z]' 2>/dev/null || true)
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
    BUNDLE_SIZE=$(du -sm dist | cut -f1)
    echo "Bundle size: ${BUNDLE_SIZE}MB"
    if [ "$BUNDLE_SIZE" -gt 20 ]; then
        echo -e "${YELLOW}⚠ Bundle exceeds 20MB baseline (was 16MB)${NC}"
        WARNINGS=$((WARNINGS + 1))
    else
        echo -e "${GREEN}✓ Bundle size OK${NC}"
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

# 12. Doc links validation (for P142 information architecture)
if [ -f "./scripts/validate-doc-links.cjs" ]; then
    if ! run_quiet "Doc links" ./scripts/validate-doc-links.cjs; then
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${YELLOW}⚠ Doc link validator not found (expected after P142)${NC}"
fi

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

        UAT_FILE="features/uat/${P_NUM}.md"
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
ROOT_TEMP_FILES=$(ls -1 ./*.md ./*.json 2>/dev/null | grep -vE '(CLAUDE|GEMINI|README|CONTRIBUTING|SECURITY|CLA|components\.json|package\.json|package-lock\.json|tsconfig.*\.json|vercel\.json)' || true)

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

# 15. Migration commit gate (P270 — prevents P160-class bugs)
# When a migration SQL file is staged, verifies it was applied to test DB via
# deploy-manifest.json (updated by ./scripts/migrate.sh after successful push).
# (1) applied to test DB — verified via deploy-manifest, (2) integration test added.
echo ">>> Checking for new migrations being committed..."
STAGED_MIGRATIONS=$(git diff --cached --name-only 2>/dev/null | grep '^supabase/migrations/.*\.sql$' || true)
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
found = any(str(m) == mig or mig.startswith(str(m)) or str(m).startswith(mig[:8]) for m in test_migrations)
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

        # If no P-number match (or no P-number), also check for any integration test
        # that references the migration base name (covers non-P-numbered migrations)
        if [ "$test_found" -eq 0 ]; then
            if grep -rl "$mig_base" e2e/integration/ 2>/dev/null | grep -q .; then
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
if [ -n "$STAGED_FILES_ALL" ]; then
    # Patterns: owner's personal email addresses (project emails like ops@/slava@ are OK)
    # Add new patterns here if owner acquires new personal addresses
    STAGED_DIFF=$(echo "$STAGED_FILES_ALL" | xargs -I{} git diff --cached -- {} 2>/dev/null | \
        grep -E '^\+' | grep -v '^\+\+\+' || true)

    # Hard: personal email addresses (project emails ops@/slava@claritypledge are OK)
    PII_HITS=$(echo "$STAGED_DIFF" | grep -iE '(slavochek@|@inguro\.com|@googlemail\.com)' || true)
    if [ -n "$PII_HITS" ]; then
        echo -e "${YELLOW}⚠ Personal email address found in staged changes:${NC}"
        echo "$PII_HITS" | head -5
        echo -e "${YELLOW}  → Personal identifiers belong in .private/docs/ (gitignored), not public files${NC}"
        echo -e "${YELLOW}  → Replace with: \"see .private/docs/accounts.md\"${NC}"
        WARNINGS=$((WARNINGS + 1))
    else
        echo -e "${GREEN}✓ No personal email addresses detected${NC}"
    fi

    # Soft: docs/features/.claude only — named individuals or personal context from conversations
    SOFT_FILES=$(echo "$STAGED_FILES_ALL" | grep -E '^(docs/|features/|\.claude/commands/)' || true)
    if [ -n "$SOFT_FILES" ]; then
        # Flag if changes to these files came from a claude-conversations synthesis session
        # (mechanical patterns only — nuanced review requires /maintain:privacy)
        NAMED_HITS=$(echo "$SOFT_FILES" | xargs -I{} git diff --cached -- {} 2>/dev/null | \
            grep -E '^\+' | grep -v '^\+\+\+' | \
            grep -iE '\b(slavochek|googlemail|experiment fails because [A-Z][a-z]+ (has|have|doesn|didn))\b' || true)
        if [ -n "$NAMED_HITS" ]; then
            echo -e "${YELLOW}⚠ Possible named individual in docs/features — run /maintain:privacy before pushing:${NC}"
            echo "$NAMED_HITS" | head -3
            WARNINGS=$((WARNINGS + 1))
        fi
        # Remind when touching docs after a conversation-synthesis session
        CONV_SOURCED=$(echo "$STAGED_FILES_ALL" | grep -E '^(docs/decisions|docs/hypotheses|docs/lean-canvas|docs/theory-of-change)' || true)
        if [ -n "$CONV_SOURCED" ]; then
            echo -e "${YELLOW}ℹ Strategic docs changed — if source was claude-conversations, run /maintain:privacy before git push${NC}"
        fi
    fi
else
    echo -e "${GREEN}✓ No staged files${NC}"
fi
echo ""

# 17b. Broad email check in feature specs — catch any real user email that slipped in
echo ">>> Checking feature specs for unrecognized email addresses..."
STAGED_FEATURE_FILES=$(echo "$STAGED_FILES_ALL" | grep -E '^features/.*\.md$' || true)
if [ -n "$STAGED_FEATURE_FILES" ]; then
    FEATURE_DIFF=$(echo "$STAGED_FEATURE_FILES" | xargs -I{} git diff --cached -- {} 2>/dev/null | \
        grep -E '^\+' | grep -v '^\+\+\+' || true)

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

# 19. Zombie Vite server check — detect dev servers from deleted worktrees
echo ">>> Checking for zombie Vite dev servers..."
ZOMBIE_COUNT=0
# Check all Vite-range ports (5001, 5100-5700, 5800-5899)
VITE_PIDS=$(lsof -i -P -n 2>/dev/null | grep 'LISTEN' | grep 'node' | awk '{print $2, $9}' | grep -E ':(50[0-9]{2}|5[1-7]00|58[0-9]{2})$' || true)
if [ -n "$VITE_PIDS" ]; then
    while IFS= read -r line; do
        PID=$(echo "$line" | awk '{print $1}')
        PORT_INFO=$(echo "$line" | awk '{print $2}')
        CWD=$(lsof -p "$PID" 2>/dev/null | grep cwd | awk '{print $NF}' || true)
        if [ -n "$CWD" ] && [ ! -d "$CWD" ]; then
            echo -e "${YELLOW}⚠ Zombie Vite server: PID $PID on $PORT_INFO (cwd $CWD no longer exists)${NC}"
            echo -e "${YELLOW}  → Kill with: kill $PID${NC}"
            ZOMBIE_COUNT=$((ZOMBIE_COUNT + 1))
        fi
    done <<< "$VITE_PIDS"
fi
if [ "$ZOMBIE_COUNT" -gt 0 ]; then
    WARNINGS=$((WARNINGS + ZOMBIE_COUNT))
else
    echo -e "${GREEN}✓ No zombie Vite servers${NC}"
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
