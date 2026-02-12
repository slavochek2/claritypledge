#!/bin/bash
set -e

echo "=== P141 Post-Migration Validation ==="
echo ""

# Count features (should match pre-migration)
ACTIVE_COUNT=$(find features -maxdepth 1 -name "p*.md" -type f 2>/dev/null | wc -l | tr -d ' ')

echo "Feature count: $ACTIVE_COUNT"

BEFORE_COUNT=$(cat /tmp/migration-count-before.txt 2>/dev/null || echo "0")
if [ "$ACTIVE_COUNT" != "$BEFORE_COUNT" ]; then
  echo "❌ FAIL: Feature count mismatch! Before: $BEFORE_COUNT, After: $ACTIVE_COUNT"
  exit 1
else
  echo "✓ Feature count unchanged"
fi
echo ""

# Check all features have rank field
echo "Checking rank field presence..."
MISSING_RANK=$(grep -L "^rank:" features/p*.md 2>/dev/null | wc -l | tr -d ' ')

if [ "$MISSING_RANK" -gt 0 ]; then
  echo "❌ FAIL: $MISSING_RANK features missing rank field"
  grep -L "^rank:" features/p*.md 2>/dev/null
  exit 1
else
  echo "✓ All features have rank field"
fi
echo ""

# Check no features have old fields
echo "Checking for old fields..."
OLD_PRIORITY=$(grep -l "^priority:" features/p*.md 2>/dev/null | wc -l | tr -d ' ')
OLD_SORT=$(grep -l "^sort_order:" features/p*.md 2>/dev/null | wc -l | tr -d ' ')

if [ "$OLD_PRIORITY" -gt 0 ] || [ "$OLD_SORT" -gt 0 ]; then
  echo "❌ FAIL: Old fields still present (priority: $OLD_PRIORITY, sort_order: $OLD_SORT)"
  if [ "$OLD_PRIORITY" -gt 0 ]; then
    echo "Files with priority:"
    grep -l "^priority:" features/p*.md 2>/dev/null
  fi
  if [ "$OLD_SORT" -gt 0 ]; then
    echo "Files with sort_order:"
    grep -l "^sort_order:" features/p*.md 2>/dev/null
  fi
  exit 1
else
  echo "✓ No old fields (priority, sort_order) found"
fi
echo ""

# Check ordering preserved
echo "Checking feature ordering..."
node -p "
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const before = JSON.parse(fs.readFileSync('/tmp/order-before.json', 'utf8'));

const files = fs.readdirSync('features')
  .filter(f => f.endsWith('.md') && f.match(/\bp\d+/))
  .map(f => path.join('features', f));

const features = files.map(file => {
  const content = fs.readFileSync(file, 'utf8');
  const match = content.match(/^---\n([\s\S]+?)\n---/);
  if (!match) return null;
  const fm = yaml.load(match[1]);
  return {
    id: path.basename(file, '.md'),
    rank: fm.rank ?? 1000000,
  };
}).filter(f => f);

features.sort((a, b) => a.rank - b.rank);

const after = features.map(f => f.id);

if (JSON.stringify(before) === JSON.stringify(after)) {
  'ORDER_MATCH';
} else {
  'ORDER_MISMATCH';
}
" > /tmp/order-check.txt

ORDER_CHECK=$(cat /tmp/order-check.txt)
if [ "$ORDER_CHECK" != "ORDER_MATCH" ]; then
  echo "❌ FAIL: Feature ordering changed after migration!"
  echo "Before: $(cat /tmp/order-before.json | head -5)"
  echo "After: (check /tmp/order-check.txt)"
  exit 1
else
  echo "✓ Feature ordering preserved"
fi
echo ""

# Verify rank values are valid (> 0 or = 0, numeric)
echo "Checking rank values..."
INVALID_RANKS=$(grep "^rank:" features/p*.md | grep -v "rank: [0-9]\+\(\.[0-9]\+\)\?$" | wc -l | tr -d ' ')

if [ "$INVALID_RANKS" -gt 0 ]; then
  echo "❌ FAIL: $INVALID_RANKS features have invalid rank values"
  grep "^rank:" features/p*.md | grep -v "rank: [0-9]\+\(\.[0-9]\+\)\?$"
  exit 1
else
  echo "✓ All rank values are valid (positive numbers)"
fi
echo ""

echo "✓ Post-migration validation complete"
echo ""
echo "Next steps:"
echo "  1. Test kanban UI: npm run kanban"
echo "  2. Verify focus tab shows correct ordering"
echo "  3. Test drag-and-drop (rank should update)"
echo "  4. If all good, commit changes"
