#!/bin/bash
# Check for duplicate P-numbers across ALL feature folders
# Part of sustainable feature file organization (DUPLICATE_PREVENTION_ANALYSIS.md)

set -e

echo ">>> Checking for duplicate P-numbers..."

# Find all P-numbers in feature files (including done, archive, dated folders)
# Extract just the number from filenames like "p139_name.md" or "p134.md"
p_numbers=$(find features -name "p[0-9]*.md" -type f 2>/dev/null |
  sed -E 's/.*\/p([0-9]+)[_-].*/\1/' |
  sort -n)

# Check for duplicates using uniq -d (prints only duplicate lines)
duplicates=$(echo "$p_numbers" | uniq -d)

if [ -n "$duplicates" ]; then
  echo ""
  echo "❌ DUPLICATE P-NUMBERS FOUND:"
  echo ""
  echo "$duplicates" | while read -r num; do
    echo "  P$num appears in:"
    find features -name "p${num}_*.md" -o -name "p${num}.md" 2>/dev/null | sed 's/^/    /'
    echo ""
  done
  echo "Fix: Delete duplicate or rename to next available P-number"
  echo "See: DUPLICATE_PREVENTION_ANALYSIS.md for resolution protocol"
  exit 1
fi

echo "✓ No duplicate P-numbers found"
exit 0
