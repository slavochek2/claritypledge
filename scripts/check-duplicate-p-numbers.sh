#!/bin/bash
# Check for duplicate P-numbers across ALL feature directories
# Usage: ./scripts/check-duplicate-p-numbers.sh
# Exit code: 0 if no duplicates, 1 if duplicates found

set -e

echo ">>> Checking for duplicate P-numbers..."

# Find all p*.md files in features/ and subdirectories
# Extract P-numbers and check for duplicates
p_numbers=$(find features -type f -name "p[0-9]*.md" 2>/dev/null |
  sed -E 's/.*\/p([0-9]+)[_-].*/\1/' |
  sort -n)

if [ -z "$p_numbers" ]; then
  echo "✓ No feature files found"
  exit 0
fi

# Find duplicates
duplicates=$(echo "$p_numbers" | uniq -d)

if [ -z "$duplicates" ]; then
  echo "✓ No duplicate P-numbers found"
  exit 0
fi

# Report duplicates with file paths
echo ""
echo "❌ DUPLICATE P-NUMBERS FOUND:"
echo ""

for dup in $duplicates; do
  echo "  P$dup appears in:"
  find features -type f -name "p${dup}_*.md" -o -name "p${dup}-*.md" |
    sed 's/^/    /'
  echo ""
done

echo "Fix: Delete duplicate or rename to next available P-number"
echo "See: docs/technical/duplicate-prevention.md for resolution protocol"

exit 1
