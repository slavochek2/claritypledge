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
# Why per-column was NOT enough (P1277, 2026-09-09): the specs the old global
# scheme pushed into the 1,000,000 band are still open, and they are spread
# across every column. `max + 1` inside a column that holds one of them
# reproduces the identical ratchet — measured on the live board the day this was
# fixed, `next-rank.sh week` returned 1000082 while the hand-ordered cards in
# that same column sat at 1-90. So the scale a new card must join is the DENSE
# scale: ranks below the legacy band. Legacy-band ranks are read (a column made
# entirely of them still gets a non-colliding answer) but they never set the
# scale for a column that has any hand-ordered card at all.
#
# This is a read-only heuristic for where a NEW card enters. It renumbers
# nothing: the legacy-band cards keep their ranks and keep sorting last, which
# is where they already are. Renumbering them is a board decision, not a
# script's.
#
# Usage: ./scripts/next-rank.sh <status>
#   e.g. ./scripts/next-rank.sh week   → 9
#
# Scans features/*.md and features/bugs_and_debt/*.md (the open board only —
# done/ and archive/ are not orderable and must not influence the scale).

set -euo pipefail

# Ranks at or above this were minted by the retired global max+1 scheme. Anything
# a human hand-ordered is far below it (the whole board's dense range is 1-99).
LEGACY_BAND=1000000

STATUS="${1:-}"
if [[ -z "$STATUS" ]]; then
  echo "usage: $0 <status>   (backlog|week|today|in-progress|blocked|qa)" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Enumerate with find, not a glob: an empty features/bugs_and_debt/ leaves the
# unmatched pattern as a literal path, awk exits non-zero on it, and under
# `set -e` the whole script died before printing anything (found by the canary,
# scripts/test-next-rank.sh, on a fixture with no bugs_and_debt files).
FILES=()
while IFS= read -r _f; do [[ -n "$_f" ]] && FILES+=("$_f"); done < <(
  find "$ROOT/features" -maxdepth 1 -name '*.md' -type f 2>/dev/null
  find "$ROOT/features/bugs_and_debt" -maxdepth 1 -name '*.md' -type f 2>/dev/null
)

RANKS=""
if [[ ${#FILES[@]} -gt 0 ]]; then
  RANKS=$(awk -v want="$STATUS" '
    FNR == 1 { infm = 0; nfm = 0; st = ""; rk = "" }
    /^---[[:space:]]*$/ { nfm++; infm = (nfm == 1); if (nfm == 2) { if (st == want && rk != "") print rk; nextfile } next }
    infm && /^status:[[:space:]]/ { st = $2 }
    infm && /^rank:[[:space:]]/   { rk = $2 }
  ' "${FILES[@]}" 2>/dev/null | { grep -E '^[0-9]+(\.[0-9]+)?$' || true; })
fi

# %.12g, not %g: the default 6-digit precision renders a 7-digit rank as
# scientific notation ("1.00099e+06"), which is not a valid YAML rank value.
printf '%s\n' "$RANKS" | awk -v band="$LEGACY_BAND" '
  NF == 0 { next }
  { any = 1; if ($1 + 0 > max_all) max_all = $1 + 0 }
  $1 + 0 < band { dense = 1; if ($1 + 0 > max_dense) max_dense = $1 + 0 }
  END {
    if (dense)     { printf "%.12g\n", max_dense + 1 }   # join the hand-ordered scale
    else if (any)  { printf "%.12g\n", max_all + 1 }     # column is entirely legacy: do not collide
    else           { print 1 }                            # empty column
  }
'
