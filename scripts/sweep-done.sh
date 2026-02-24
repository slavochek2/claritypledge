#!/usr/bin/env bash
# sweep-done.sh — Move loose features/done/*.md into a dated archive subfolder.
# Called by pre-commit-checks.sh. Safe to run manually anytime.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DONE_DIR="$REPO_ROOT/features/done"

# Find loose .md files at done/ root (not in subfolders)
# Exclude INDEX.md — it's a permanent root-level reference file, not an archive
LOOSE=()
while IFS= read -r -d '' f; do
  [[ "$(basename "$f")" == "INDEX.md" ]] && continue
  LOOSE+=("$f")
done < <(find "$DONE_DIR" -maxdepth 1 -name "*.md" -print0 2>/dev/null)

[ ${#LOOSE[@]} -eq 0 ] && exit 0

# Target: current month's folder (find existing or create next-numbered one)
MON=$(date "+%b" | tr '[:upper:]' '[:lower:]')
YY=$(date "+%y")
FOLDER=$(find "$DONE_DIR" -maxdepth 1 -mindepth 1 -type d -iname "*${MON}*${YY}" 2>/dev/null | sort -V | tail -1)
if [ -z "$FOLDER" ]; then
  MAX_N=$(find "$DONE_DIR" -maxdepth 1 -mindepth 1 -type d 2>/dev/null \
    | while IFS= read -r d; do basename "$d"; done \
    | grep -oE '^[0-9]+' | sort -n | tail -1 || echo "0")
  FOLDER="${DONE_DIR}/$(( ${MAX_N:-0} + 1 ))_${MON}_${YY}"
  mkdir -p "$FOLDER"
fi

echo ">>> Sweeping ${#LOOSE[@]} loose done/ file(s) into $(basename "$FOLDER")/"

cd "$REPO_ROOT"

for f in "${LOOSE[@]}"; do
  rel="${f#$REPO_ROOT/}"
  dest="${FOLDER#$REPO_ROOT/}"
  echo "  → $(basename "$f")"
  git mv "$rel" "$dest/" 2>/dev/null \
    || { mv "$f" "$FOLDER/"; git add "$FOLDER/$(basename "$f")"; }
done

echo ">>> Sweep complete."
