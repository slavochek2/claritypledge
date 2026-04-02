#!/bin/bash
# next-t-number.sh
# Prints the next available T-number for a new thinking spec.
# Scans .private/thinking/ for tNNN_*.md files.

THINKING_DIR="$(cd "$(dirname "$0")/.." && pwd)/.private/thinking"

highest=$(find "$THINKING_DIR" -name "t*.md" 2>/dev/null \
  | grep -v "backlog.md" \
  | grep -oE '/t[0-9]+' \
  | grep -oE '[0-9]+' \
  | sort -n \
  | tail -1)

if [ -z "$highest" ]; then
  echo 1
else
  echo $((highest + 1))
fi
