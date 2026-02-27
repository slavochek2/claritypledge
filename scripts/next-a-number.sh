#!/bin/bash
# next-a-number.sh
# Prints the next available A-number for a new article file.
#
# Rules:
# - Scans content/articles/ for a*.md files
# - Returns highest found + 1

ARTICLES_DIR="$(cd "$(dirname "$0")/.." && pwd)/content/articles"

highest=$(find "$ARTICLES_DIR" -name "a*.md" 2>/dev/null \
  | grep -oE '/a[0-9]+' \
  | grep -oE '[0-9]+' \
  | sort -n \
  | tail -1)

if [ -z "$highest" ]; then
  echo 1
else
  echo $((highest + 1))
fi
