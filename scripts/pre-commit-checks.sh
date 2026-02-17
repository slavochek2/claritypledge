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
    # Use gitleaks for comprehensive secret detection
    # --no-git scans files directly, --staged scans staged changes
    if git diff --cached --quiet 2>/dev/null; then
        # No staged changes, scan git-tracked files only (respects .gitignore)
        GITLEAKS_OUTPUT=$(gitleaks detect --source . --redact -v 2>&1 || true)
    else
        # Scan staged changes
        GITLEAKS_OUTPUT=$(gitleaks protect --staged --redact -v 2>&1 || true)
    fi

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
        SECRETS_FOUND=$(echo "$STAGED_FILES" | xargs grep -l -E '(sk_live|pk_live|SUPABASE_SERVICE|api[_-]?key|apikey|secret[_-]?key|password\s*=|token\s*=)[^a-zA-Z]' 2>/dev/null || true)
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

# 13. Root file pollution check (prevent agent-generated temp files)
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
