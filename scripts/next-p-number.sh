#!/bin/bash
# next-p-number.sh
# Prints the next available P-number for a new feature file.
#
# Rules:
# - Scans features/ including done/ subdirectories
# - Excludes uat/ and archive/ (companion/junk files, must not drive sequence)
# - Returns highest found + 1

FEATURES_DIR="$(cd "$(dirname "$0")/.." && pwd)/features"

highest=$(find "$FEATURES_DIR" -name "p*.md" \
  | grep -v "/uat/" \
  | grep -v "/archive/" \
  | grep -oE '/p[0-9]+' \
  | grep -oE '[0-9]+' \
  | sort -n \
  | tail -1)

if [ -z "$highest" ]; then
  echo 1
else
  echo $((highest + 1))
fi
