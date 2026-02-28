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

# 1. TypeScript Check (fastest, most fundamental - fail fast)
echo ">>> Running TypeScript check..."
if npx tsc --noEmit; then
    echo -e "${GREEN}✓ TypeScript passed${NC}"
else
    echo -e "${RED}✗ TypeScript errors found${NC}"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 1.5. Conditional UI reminder (quick visual check)
echo ">>> Checking for conditional UI changes..."
STAGED_FILES=$(git diff --cached --name-only 2>/dev/null || echo "")
if [ -n "$STAGED_FILES" ]; then
    # Check if any staged .tsx files have conditional rendering with text/UI classes
    CONDITIONAL_UI=$(echo "$STAGED_FILES" | grep '\.tsx$' | xargs git diff --cached 2>/dev/null | grep -E '(\?.*:.*<|{.*\?.*className.*(text-|bg-|border-))' || true)
    if [ -n "$CONDITIONAL_UI" ]; then
        echo -e "${YELLOW}⚠ Conditional UI rendering changed${NC}"
        echo -e "${YELLOW}  → Verify BOTH branches render correctly (no duplicate elements)${NC}"
        echo -e "${YELLOW}  → See docs/technical/e2e-testing-guide.md#testing-conditional-rendering${NC}"
        WARNINGS=$((WARNINGS + 1))
    else
        echo -e "${GREEN}✓ No conditional UI changes detected${NC}"
    fi
else
    echo -e "${YELLOW}⚠ No staged files to check${NC}"
fi
echo ""

# 1.8: Auto-fix lint issues before checking (why report what we can fix?)
echo ">>> Auto-fixing lint issues on staged files..."
STAGED_TS=$(git diff --cached --name-only 2>/dev/null | grep -E '\.(ts|tsx|js|jsx)$' || true)
if [ -n "$STAGED_TS" ]; then
  npx eslint --fix $STAGED_TS 2>/dev/null || true
  echo "$STAGED_TS" | xargs git add 2>/dev/null || true
  echo -e "${GREEN}✓ Lint auto-fix applied, files re-staged${NC}"
else
  echo -e "${GREEN}✓ No TS/JS files staged${NC}"
fi
echo ""

# 2. Lint
echo ">>> Running ESLint..."
if npm run lint; then
    echo -e "${GREEN}✓ Lint passed${NC}"
else
    echo -e "${RED}✗ Lint failed${NC}"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 3. Build
echo ">>> Running build..."
if npm run build; then
    echo -e "${GREEN}✓ Build passed${NC}"
else
    echo -e "${RED}✗ Build failed${NC}"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 4. Tests
echo ">>> Running tests..."
if npm test; then
    echo -e "${GREEN}✓ Tests passed${NC}"
else
    echo -e "${RED}✗ Tests failed${NC}"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 5. Secrets scan (using gitleaks if available, fallback to grep)
echo ">>> Scanning for secrets..."
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
    # Fallback to grep-based scan
    echo -e "${YELLOW}(gitleaks not installed, using basic grep scan)${NC}"
    STAGED_FILES=$(git diff --cached --name-only 2>/dev/null || git diff --name-only HEAD~1 2>/dev/null || echo "")
    if [ -n "$STAGED_FILES" ]; then
        SECRETS_FOUND=$(echo "$STAGED_FILES" | xargs grep -l -iE '(sk_live|pk_live|SUPABASE_SERVICE|api[_-]?key|apikey|secret[_-]?key|password\s*=|token\s*=)[^a-zA-Z]' 2>/dev/null || true)
        if [ -n "$SECRETS_FOUND" ]; then
            echo -e "${RED}✗ Possible secrets found in:${NC}"
            echo "$SECRETS_FOUND"
            ERRORS=$((ERRORS + 1))
        else
            echo -e "${GREEN}✓ No secrets detected${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ No staged files to scan${NC}"
    fi
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
echo ">>> Validating doc links..."
if [ -f "./scripts/validate-doc-links.cjs" ]; then
    if ./scripts/validate-doc-links.cjs; then
        echo -e "${GREEN}✓ All doc links valid${NC}"
    else
        echo -e "${RED}✗ Broken doc links found${NC}"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${YELLOW}⚠ Doc link validator not found (expected after P142)${NC}"
fi
echo ""

# 13. Duplicate P-number check (prevents reused P-numbers)
echo ">>> Checking for duplicate P-numbers..."
if [ -f "./scripts/check-duplicate-p-numbers.sh" ]; then
    if ./scripts/check-duplicate-p-numbers.sh; then
        echo -e "${GREEN}✓ No duplicate P-numbers${NC}"
    else
        echo -e "${RED}✗ Duplicate P-numbers found${NC}"
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
    echo -e "${YELLOW}⚠ Duplicate spec(s) found — original still in features/ but also in features/done/:${NC}"
    echo "$DUPLICATE_SPECS" | while read -r f; do
        echo -e "${YELLOW}  → $f (auto-staging removal)${NC}"
        git rm --cached "$f" 2>/dev/null || true
        git rm "$f" 2>/dev/null || true
    done
    echo -e "${YELLOW}  → Staged removal. Re-run commit.${NC}"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✓ No duplicate specs${NC}"
fi
echo ""

# 14. Root file pollution check (prevent agent-generated temp files)
echo ">>> Checking for temporary files in project root..."
ROOT_TEMP_FILES=$(ls -1 /*.md /*.json 2>/dev/null | grep -vE '(CLAUDE|GEMINI|README|CONTRIBUTING|SECURITY|CLA|components\.json|package\.json|package-lock\.json|tsconfig.*\.json|vercel\.json)' || true)

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
    echo -e "${GREEN}✓ No temporary files in project root${NC}"
fi
echo ""

# 14. Migration commit reminder (P270 — prevents P160-class bugs)
# When a migration SQL file is staged, reminds developer to: (1) apply it,
# (2) add an integration test. Cannot check if migration was applied (no
# local Docker required). WARNING only — does not block commit.
echo ">>> Checking for new migrations being committed..."
STAGED_MIGRATIONS=$(git diff --cached --name-only 2>/dev/null | grep '^supabase/migrations/.*\.sql$' || true)
if [ -n "$STAGED_MIGRATIONS" ]; then
    echo -e "${YELLOW}⚠ New migration(s) staged for commit:${NC}"
    echo "$STAGED_MIGRATIONS" | while IFS= read -r mig; do
        echo -e "${YELLOW}  → $mig${NC}"
    done
    echo -e "${YELLOW}  Checklist before merging:${NC}"
    echo -e "${YELLOW}  1. Applied to test DB? (supabase db push OR Supabase dashboard)${NC}"
    echo -e "${YELLOW}  2. Integration test added? (e2e/integration/p{N}-db-schema.spec.ts)${NC}"
    echo -e "${YELLOW}  See docs/technical/e2e-testing-guide.md for the integration test template.${NC}"
    WARNINGS=$((WARNINGS + 1))

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

# 15. Sweep loose done/ files into dated archive folders (silent when nothing to do)
if [ -f "./scripts/sweep-done.sh" ]; then
    if ! ./scripts/sweep-done.sh; then
        echo -e "${YELLOW}⚠ Done archive sweep had an issue (non-blocking)${NC}"
        WARNINGS=$((WARNINGS + 1))
    fi
fi
echo ""

# 16. Privacy check — personal identifiers that must not appear in public files
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

# Summary
echo "=== SUMMARY ==="
if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}✗ $ERRORS error(s) - commit blocked${NC}"
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
