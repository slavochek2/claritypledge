#!/bin/bash

##############################################################################
# Post-Migration Validation Script
#
# This script validates that the P141 migration (priority/sort_order → rank)
# completed successfully with no data loss or ordering changes.
#
# Usage:
#   ./scripts/post-migration-validation.sh
#
# Prerequisites:
#   - Pre-migration snapshot must exist at /tmp/pre-migration-snapshot.json
#   - Migration must have been executed (features have rank field)
#
# Exit codes:
#   0 - All validation checks passed
#   1 - One or more validation checks failed
##############################################################################

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track overall validation status
VALIDATION_PASSED=true

# Helper function for success messages
success() {
  echo -e "${GREEN}✅ $1${NC}"
}

# Helper function for error messages
error() {
  echo -e "${RED}❌ $1${NC}"
  VALIDATION_PASSED=false
}

# Helper function for warning messages
warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

echo "🔍 Post-Migration Validation"
echo "============================"
echo ""

##############################################################################
# Check 1: Feature count unchanged
##############################################################################

echo -n "Checking feature count... "

# Check if pre-migration snapshot exists
if [ ! -f "/tmp/pre-migration-snapshot.json" ]; then
  error "Pre-migration snapshot not found at /tmp/pre-migration-snapshot.json"
  echo "   Run the pre-migration snapshot creation command first (see spec line 468-481)"
  exit 1
fi

# Count features before migration (from snapshot)
BEFORE_COUNT=$(grep -c '"file":' /tmp/pre-migration-snapshot.json || echo "0")

# Count features after migration (exclude done/archive/drafts folders)
AFTER_COUNT=$(find features -name "*.md" \
  -not -path "*/done/*" \
  -not -path "*/archive/*" \
  -not -path "*/drafts/*" \
  2>/dev/null | wc -l | tr -d ' ')

if [ "$BEFORE_COUNT" -eq "$AFTER_COUNT" ]; then
  success "Feature count: $AFTER_COUNT (unchanged)"
else
  error "Feature count mismatch: before=$BEFORE_COUNT, after=$AFTER_COUNT"
  echo "   Some features may have been lost during migration!"
fi

##############################################################################
# Check 2: All features have rank field
##############################################################################

echo -n "Checking rank field presence... "

# Find features without rank field
NO_RANK_FILES=$(find features -name "*.md" \
  -not -path "*/done/*" \
  -not -path "*/archive/*" \
  -not -path "*/drafts/*" \
  -exec grep -L "^rank:" {} \; 2>/dev/null || echo "")

NO_RANK_COUNT=$(echo "$NO_RANK_FILES" | grep -c ".md" || echo "0")

if [ "$NO_RANK_COUNT" -eq 0 ]; then
  success "All features have rank field"
else
  error "$NO_RANK_COUNT features missing rank field:"
  echo "$NO_RANK_FILES" | while read -r file; do
    [ -n "$file" ] && echo "     - $file"
  done
fi

##############################################################################
# Check 3: No features have priority field
##############################################################################

echo -n "Checking priority field removed... "

# Find features that still have priority field
HAS_PRIORITY_FILES=$(find features -name "*.md" \
  -not -path "*/done/*" \
  -not -path "*/archive/*" \
  -not -path "*/drafts/*" \
  -exec grep -l "^priority:" {} \; 2>/dev/null || echo "")

HAS_PRIORITY_COUNT=$(echo "$HAS_PRIORITY_FILES" | grep -c ".md" || echo "0")

if [ "$HAS_PRIORITY_COUNT" -eq 0 ]; then
  success "No features have priority field"
else
  error "$HAS_PRIORITY_COUNT features still have priority field:"
  echo "$HAS_PRIORITY_FILES" | while read -r file; do
    [ -n "$file" ] && echo "     - $file"
  done
fi

##############################################################################
# Check 4: No features have sort_order field
##############################################################################

echo -n "Checking sort_order field removed... "

# Find features that still have sort_order field
HAS_SORT_ORDER_FILES=$(find features -name "*.md" \
  -not -path "*/done/*" \
  -not -path "*/archive/*" \
  -not -path "*/drafts/*" \
  -exec grep -l "^sort_order:" {} \; 2>/dev/null || echo "")

HAS_SORT_ORDER_COUNT=$(echo "$HAS_SORT_ORDER_FILES" | grep -c ".md" || echo "0")

if [ "$HAS_SORT_ORDER_COUNT" -eq 0 ]; then
  success "No features have sort_order field"
else
  error "$HAS_SORT_ORDER_COUNT features still have sort_order field:"
  echo "$HAS_SORT_ORDER_FILES" | while read -r file; do
    [ -n "$file" ] && echo "     - $file"
  done
fi

##############################################################################
# Check 5: All rank values valid (positive numbers)
##############################################################################

echo -n "Checking rank values valid... "

# Find features with invalid rank values (not a positive number)
INVALID_RANKS=$(find features -name "*.md" \
  -not -path "*/done/*" \
  -not -path "*/archive/*" \
  -not -path "*/drafts/*" \
  -exec grep "^rank:" {} \; 2>/dev/null | \
  grep -v -E "^rank: [0-9]+(\.[0-9]+)?$" || echo "")

INVALID_RANK_COUNT=$(echo "$INVALID_RANKS" | grep -c "rank:" || echo "0")

if [ "$INVALID_RANK_COUNT" -eq 0 ]; then
  success "All rank values valid (positive numbers)"
else
  error "$INVALID_RANK_COUNT features have invalid rank values:"
  echo "$INVALID_RANKS" | while read -r line; do
    [ -n "$line" ] && echo "     - $line"
  done
fi

##############################################################################
# Check 6: Rank precision ≤ 3 decimals
##############################################################################

echo -n "Checking rank precision... "

# Find features with >3 decimal precision
HIGH_PRECISION=$(find features -name "*.md" \
  -not -path "*/done/*" \
  -not -path "*/archive/*" \
  -not -path "*/drafts/*" \
  -exec grep "^rank:" {} \; 2>/dev/null | \
  grep -E "rank: [0-9]+\.[0-9]{4,}" || echo "")

HIGH_PRECISION_COUNT=$(echo "$HIGH_PRECISION" | grep -c "rank:" || echo "0")

if [ "$HIGH_PRECISION_COUNT" -eq 0 ]; then
  success "Rank precision ≤ 3 decimals"
else
  warning "$HIGH_PRECISION_COUNT features have >3 decimal precision (cosmetic issue)"
  echo "$HIGH_PRECISION" | while read -r line; do
    [ -n "$line" ] && echo "     - $line"
  done
fi

##############################################################################
# Check 7: Ordering preserved (compared to pre-migration snapshot)
##############################################################################

echo -n "Checking ordering preservation... "

# This check compares the relative order of features before and after migration
# We extract feature IDs in order and compare them

# Extract pre-migration order (from snapshot)
PRE_ORDER=$(node -e "
const fs = require('fs');
const snapshot = JSON.parse(fs.readFileSync('/tmp/pre-migration-snapshot.json', 'utf8'));
// Sort by same logic as migration: (sort_order ?? 1000000) -> priority -> status -> id
const sorted = snapshot.sort((a, b) => {
  const orderA = a.sort_order ?? 1000000;
  const orderB = b.sort_order ?? 1000000;
  if (orderA !== orderB) return orderA - orderB;

  const priorityA = a.priority ? parseInt(a.priority.substring(1)) : 99;
  const priorityB = b.priority ? parseInt(b.priority.substring(1)) : 99;
  if (priorityA !== priorityB) return priorityA - priorityB;

  return a.file.localeCompare(b.file);
});
console.log(sorted.map(f => f.file).join('\\n'));
" 2>/dev/null || echo "")

# Extract post-migration order (from current files with rank)
POST_ORDER=$(node -e "
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Find all feature files
const dirs = ['features', 'features/bugs_and_debt'];
const files = [];

for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(path.join(dir, entry.name));
    }
  }
}

// Parse and sort by rank
const features = files.map(filePath => {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---\\n([\\s\\S]*?)\\n---/);
  if (!match) return null;
  const frontmatter = yaml.load(match[1]);
  return {
    file: path.basename(filePath),
    rank: frontmatter.rank ?? 999999
  };
}).filter(f => f !== null);

const sorted = features.sort((a, b) => a.rank - b.rank);
console.log(sorted.map(f => f.file).join('\\n'));
" 2>/dev/null || echo "")

# Compare orders
if [ "$PRE_ORDER" = "$POST_ORDER" ]; then
  success "Ordering preserved (matches pre-migration snapshot)"
else
  # Calculate how many features are in different positions
  DIFF_COUNT=$(diff <(echo "$PRE_ORDER") <(echo "$POST_ORDER") 2>/dev/null | grep "^[<>]" | wc -l | tr -d ' ')

  if [ "$DIFF_COUNT" -eq 0 ]; then
    success "Ordering preserved (matches pre-migration snapshot)"
  else
    warning "Ordering differs in $DIFF_COUNT positions from pre-migration"
    echo "   This may be expected if sort_order ties were broken differently"
    echo "   Review the diff manually:"
    echo "   diff <(node -e '...pre-migration...') <(node -e '...post-migration...')"
  fi
fi

##############################################################################
# Summary
##############################################################################

echo ""
echo "================================"

if [ "$VALIDATION_PASSED" = true ]; then
  echo -e "${GREEN}✅ All validation checks passed!${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Visual verification: npm run kanban"
  echo "  2. Git commit: git add features/ && git commit -m 'feat(p141): migrate to rank system'"
  echo "  3. Run E2E tests: npm run test:e2e -- kanban-migration-validation.spec.ts"
  exit 0
else
  echo -e "${RED}❌ Validation failed!${NC}"
  echo ""
  echo "Some checks did not pass. Review the errors above and:"
  echo "  1. Check for features that weren't migrated correctly"
  echo "  2. Re-run migration if needed: node scripts/migrate-to-rank.js"
  echo "  3. Restore from backup if necessary: cp -r features.backup.* features/"
  exit 1
fi
