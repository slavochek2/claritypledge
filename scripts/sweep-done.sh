#!/usr/bin/env bash
# sweep-done.sh — Move loose features/done/*.md into dated archive subfolders.
#
# Called by pre-commit-checks.sh (section 15). Safe to run manually anytime.
# Naming matches /done skill convention: {N}_{mon}_{yy} (e.g., 6_feb_26)
#
# Why this exists: Kanban drag-to-done and manual git mv bypass the /done skill,
# landing files at features/done/ root. This sweeps them into archive folders so
# the kanban scanner (which skips dated subfolders by design) stays clean.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DONE_DIR="$REPO_ROOT/features/done"

# Find .md files directly at done/ root only (maxdepth 1 excludes subfolders)
LOOSE=()
while IFS= read -r -d '' f; do
  LOOSE+=("$f")
done < <(find "$DONE_DIR" -maxdepth 1 -name "*.md" -print0 2>/dev/null)

[ ${#LOOSE[@]} -eq 0 ] && exit 0

echo ">>> Sweeping ${#LOOSE[@]} loose done/ file(s) into archive..."

# Resolve or create the archive folder for a given YYYY-MM-DD date.
# Matches existing folders like "5_feb_26", "1_nov25", "4_27_jan26".
get_folder() {
  local date_str="$1"
  local yr month mon yy

  yr=$(echo "$date_str" | cut -d'-' -f1)
  month=$(echo "$date_str" | cut -d'-' -f2)

  # macOS date: convert to lowercase 3-letter month abbreviation
  mon=$(date -jf "%Y-%m-%d" "${yr}-${month}-01" "+%b" 2>/dev/null | tr '[:upper:]' '[:lower:]')
  yy="${yr: -2}"  # last 2 digits of year

  # Find existing folder for this month/year (handles "5_feb_26" and "1_feb26")
  local existing
  existing=$(find "$DONE_DIR" -maxdepth 1 -mindepth 1 -type d -iname "*${mon}*${yy}" 2>/dev/null \
    | sort -V | tail -1)

  if [ -n "$existing" ]; then
    echo "$existing"
    return
  fi

  # No folder for this month yet — create next-numbered one
  local max_n
  max_n=$(find "$DONE_DIR" -maxdepth 1 -mindepth 1 -type d 2>/dev/null \
    | while IFS= read -r d; do basename "$d"; done \
    | grep -oE '^[0-9]+' | sort -n | tail -1 || echo "0")
  local next_n=$(( ${max_n:-0} + 1 ))
  local new_dir="${DONE_DIR}/${next_n}_${mon}_${yy}"
  mkdir -p "$new_dir"
  echo "$new_dir"
}

cd "$REPO_ROOT"

for file in "${LOOSE[@]}"; do
  # Extract completed_at — handles 'YYYY-MM-DD', "YYYY-MM-DD", or bare value
  # grep exits 1 when field is absent; `|| true` prevents pipefail from aborting
  completed=$(grep -m1 "^completed_at:" "$file" 2>/dev/null || true \
    | sed "s/^completed_at:[[:space:]]*//" \
    | tr -d "'\"\r\n" \
    | xargs 2>/dev/null || true)

  # Validate YYYY-MM-DD format; fall back to today if absent or malformed
  if [[ ! "$completed" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    completed=$(date "+%Y-%m-%d")
  fi

  folder=$(get_folder "$completed")
  rel_file="${file#$REPO_ROOT/}"
  rel_folder="${folder#$REPO_ROOT/}"
  echo "  → $(basename "$file") → $(basename "$folder")/"

  # git mv for tracked files, mv + git add for untracked (e.g. Kanban-written files)
  if git ls-files --error-unmatch "$rel_file" &>/dev/null; then
    git mv "$rel_file" "$rel_folder/"
  else
    mv "$file" "$folder/"
    git add "$rel_folder/$(basename "$file")"
  fi
done

echo ">>> Sweep complete."
