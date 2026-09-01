#!/bin/bash
set -e

echo "=== P141 Pre-Migration Validation ==="
echo ""

# Count features (exclude done/, archive/)
echo "Counting features to migrate..."
ACTIVE_COUNT=$(find features -maxdepth 1 -name "p*.md" -type f 2>/dev/null | wc -l | tr -d ' ')

echo "  Active features: $ACTIVE_COUNT"
echo ""

# Save count for post-migration comparison
echo "$ACTIVE_COUNT" > /tmp/migration-count-before.txt

# Capture current ordering
echo "Capturing current feature ordering..."
node -p "
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const STATUS_ORDER = {
  'in-progress': 0, 'today': 1, 'blocked': 2, 'week': 3,
  'backlog': 4, 'done': 5, 'rejected': 6, 'draft': 7,
};

const PRIORITY_ORDER = { 'p0': 0, 'p1': 1, 'p2': 2, 'p3': 3 };

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
    status: fm.status || 'backlog',
    priority: fm.priority,
    sort_order: fm.sort_order,
  };
}).filter(f => f);

features.sort((a, b) => {
  const orderA = a.sort_order ?? 1000000;
  const orderB = b.sort_order ?? 1000000;
  if (orderA !== orderB) return orderA - orderB;

  const statusA = STATUS_ORDER[a.status] ?? 99;
  const statusB = STATUS_ORDER[b.status] ?? 99;
  if (statusA !== statusB) return statusA - statusB;

  const aPri = a.priority ? PRIORITY_ORDER[a.priority] : 99;
  const bPri = b.priority ? PRIORITY_ORDER[b.priority] : 99;
  if (aPri !== bPri) return aPri - bPri;

  return a.id.localeCompare(b.id);
});

JSON.stringify(features.map(f => f.id), null, 2);
" > /tmp/order-before.json

echo "  Saved to /tmp/order-before.json"
echo ""

# Content checksum (for integrity check)
echo "Computing content checksum..."
find features -maxdepth 1 -name "p*.md" -type f 2>/dev/null | \
  xargs cat | \
  shasum -a 256 | \
  awk '{print $1}' > /tmp/content-checksum-before.txt

echo "  Checksum: $(cat /tmp/content-checksum-before.txt)"
echo ""

# Check for features with priority/sort_order
HAS_PRIORITY=$(grep -l "^priority:" features/p*.md 2>/dev/null | wc -l | tr -d ' ')
HAS_SORT_ORDER=$(grep -l "^sort_order:" features/p*.md 2>/dev/null | wc -l | tr -d ' ')

echo "Current state:"
echo "  Features with priority: $HAS_PRIORITY"
echo "  Features with sort_order: $HAS_SORT_ORDER"
echo ""

echo "✓ Pre-migration validation complete"
echo ""
echo "Next steps:"
echo "  1. Review the counts above"
echo "  2. Run: node scripts/migrate-to-rank.js --dry-run"
echo "  3. If dry-run looks good, run: node scripts/migrate-to-rank.js"
