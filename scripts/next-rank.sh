#!/bin/bash
# next-rank.sh
# Prints the next rank for a new spec, scoped to the kanban column it will land in.
#
# Why per-column and not global: rank only ever orders specs *within* one kanban
# column. A global `max(rank) + 1` therefore ratchets forever — one spec with an
# out-of-scale rank drags every later spec above it, so every agent-filed spec
# sorts below every hand-ordered one regardless of content. That is exactly what
# happened here: 75 of 122 open specs ended up in a 1,000,000 band while the
# hand-ordered ones sat at 1-11, making column order carry no priority signal.
#
# Usage: ./scripts/next-rank.sh <status>
#   e.g. ./scripts/next-rank.sh week   → 9
#
# Scans features/*.md and features/bugs_and_debt/*.md (the open board only —
# done/ and archive/ are not orderable and must not influence the scale).

set -euo pipefail

STATUS="${1:-}"
if [[ -z "$STATUS" ]]; then
  echo "usage: $0 <status>   (backlog|week|today|in-progress|blocked|qa)" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

MAX=$(awk -v want="$STATUS" '
  FNR == 1 { infm = 0; nfm = 0; st = ""; rk = "" }
  /^---[[:space:]]*$/ { nfm++; infm = (nfm == 1); if (nfm == 2) { if (st == want && rk != "") print rk; nextfile } next }
  infm && /^status:[[:space:]]/ { st = $2 }
  infm && /^rank:[[:space:]]/   { rk = $2 }
' "$ROOT"/features/*.md "$ROOT"/features/bugs_and_debt/*.md 2>/dev/null \
  | { grep -E '^[0-9]+(\.[0-9]+)?$' || true; } | sort -n | tail -1)

# %.12g, not %g: the default 6-digit precision renders a 7-digit rank as
# scientific notation ("1.00099e+06"), which is not a valid YAML rank value.
awk -v m="${MAX:-0}" 'BEGIN { printf "%.12g\n", m + 1 }'
