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

# 1. Lint
echo ">>> Running ESLint..."
if npm run lint; then
    echo -e "${GREEN}✓ Lint passed${NC}"
else
    echo -e "${RED}✗ Lint failed${NC}"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 2. TypeScript / Build
echo ">>> Running build (TypeScript check)..."
if npm run build; then
    echo -e "${GREEN}✓ Build passed${NC}"
else
    echo -e "${RED}✗ Build failed${NC}"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 3. Tests
echo ">>> Running tests..."
if npm test; then
    echo -e "${GREEN}✓ Tests passed${NC}"
else
    echo -e "${RED}✗ Tests failed${NC}"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 4. Secrets scan (in staged files)
echo ">>> Scanning for secrets..."
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
echo ""

# 5. Bundle size check
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

# 6. Console.log check (in staged files)
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

# 7. TODO/FIXME check (in diff)
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
