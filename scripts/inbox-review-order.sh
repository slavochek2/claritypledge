#!/usr/bin/env bash
# The /weekly step 2.5 and /monthly step 2 review window: up to 15 open entries of one cadence,
# never-reviewed first (store order), then least-recently-reviewed. "Reviewed" means a
# `Reviewed YYYY-MM-DD (<review>): <verdict> — <evidence>` line, written by
# `./scripts/inbox.sh annotate` after each verdict. Without it every run re-reviewed the same oldest
# 15 entries and the rest were never read (2026-10-16 review; simulated: 197 of 212 never reviewed).
# usage: scripts/inbox-review-order.sh <store-file> <week|month> [limit]
set -euo pipefail
store="$1"; want="$2"; limit="${3:-15}"
[ -f "$store" ] || { echo "inbox-review-order: ABSENT $store" >&2; exit 3; }
awk -v want="$want" '
  function emit() { if (open && due == want) printf "%s\t%05d\t%s\n", last, n, id }
  /^## / { if (id != "") emit(); id = ""; due = "week"; last = "0000-00-00"; open = 0; n++ }
  /^\*\*ID:\*\* / { id = $2 }
  /^\*\*Status:\*\* proposed/ { open = 1 }
  /^\*\*due:\*\* / { due = $2 }
  /^Reviewed [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] / { if ($2 > last) last = $2 }
  END { if (id != "") emit() }' "$store" | sort | awk -F'\t' -v limit="$limit" 'NR <= limit { print $3 "\t" ($1 == "0000-00-00" ? "never reviewed" : "reviewed " $1) }'
