#!/usr/bin/env bash
# P1155 step 0 canary — every alert-only producer must only append to (or close)
# an issue the Actions bot itself created.
#
# Gate 7c: this suite tests the ACCEPT case as well as the REJECT case. A filter that
# rejects everything looks identical to a quiet system, which is the exact defect P1155
# exists to fix — so "no match" is only ever evidence when a known-good input matches.
#
# The jq filter is EXTRACTED from the workflow files rather than restated here. A test
# carrying its own copy of the expression passes while the workflows drift.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

PRODUCERS=(auth-canary csp-smoke db-backup prod-health-smoke stranded-signups
           check-deploy-drift backup-staleness edge-smoke)
BOT="app/github-actions"
fails=0
sites=0

# One canonical filter is expected across all producers; extract and de-duplicate.
# bash 3.2 (macOS default) has no mapfile — read into an array portably.
FILTERS=()
while IFS= read -r line; do
  [ -n "$line" ] && FILTERS+=("$line")
done < <(grep -ho "jq -r --arg t \"\$TITLE\" '.*'" .github/workflows/*.yml \
         | sed -E "s/^jq -r --arg t \"\\\$TITLE\" '//; s/'\$//" | sort -u)

if [ "${#FILTERS[@]}" -ne 1 ]; then
  echo "FAIL: expected exactly ONE canonical jq filter across producers, found ${#FILTERS[@]}:"
  printf '  %s\n' "${FILTERS[@]}"
  exit 1
fi
FILTER="${FILTERS[0]}"
echo "Extracted filter: $FILTER"
echo

run_case() {
  local desc="$1" title="$2" fixture="$3" expect="$4"
  local got
  got=$(printf '%s' "$fixture" | jq -r --arg t "$title" "$FILTER")
  sites=$((sites+1))
  if [ "$got" = "$expect" ]; then
    printf 'PASS  %-58s -> %s\n' "$desc" "${got:-<no match>}"
  else
    printf 'FAIL  %-58s -> got %s, want %s\n' "$desc" "${got:-<no match>}" "${expect:-<no match>}"
    fails=$((fails+1))
  fi
}

T="Deploy drift detected on prod"

# --- ACCEPT case. The one that proves the filter is not simply broken. ---
run_case "genuine bot-authored issue IS matched" "$T" \
  "[{\"number\":11,\"title\":\"$T\",\"author\":{\"login\":\"$BOT\",\"is_bot\":true}}]" "11"

# --- REJECT cases ---
run_case "same title, non-bot author is ignored" "$T" \
  "[{\"number\":99,\"title\":\"$T\",\"author\":{\"login\":\"outsider\",\"is_bot\":false}}]" ""

run_case "decoy first in list does not shadow the real bot issue" "$T" \
  "[{\"number\":99,\"title\":\"$T\",\"author\":{\"login\":\"outsider\",\"is_bot\":false}},
    {\"number\":11,\"title\":\"$T\",\"author\":{\"login\":\"$BOT\",\"is_bot\":true}}]" "11"

run_case "token-overlapping title is ignored (no --search semantics)" "$T" \
  "[{\"number\":98,\"title\":\"Deploy drift detected on prod — please help\",\"author\":{\"login\":\"$BOT\",\"is_bot\":true}}]" ""

run_case "REST-shaped author spelling does not match (CLI shape is authoritative)" "$T" \
  "[{\"number\":97,\"title\":\"$T\",\"author\":{\"login\":\"github-actions[bot]\",\"is_bot\":true}}]" ""

run_case "empty list yields no match" "$T" "[]" ""

echo
echo "--- every producer uses the canonical author-bound lookup ---"
for p in "${PRODUCERS[@]}"; do
  f=".github/workflows/$p.yml"
  n_bound=$(grep -c "author.login==\"$BOT\"" "$f" || true)
  n_lookup=$(grep -c 'existing=$(gh issue list' "$f" || true)
  if [ "$n_bound" -eq "$n_lookup" ] && [ "$n_lookup" -gt 0 ]; then
    printf 'PASS  %-24s %s/%s lookups author-bound\n' "$p" "$n_bound" "$n_lookup"
  else
    printf 'FAIL  %-24s %s/%s lookups author-bound\n' "$p" "$n_bound" "$n_lookup"
    fails=$((fails+1))
  fi
done

echo
if grep -qn 'in:title' .github/workflows/*.yml | grep -v '^\s*#' >/dev/null 2>&1; then :; fi
leftover=$(grep -n 'gh issue list.*--search' .github/workflows/*.yml || true)
if [ -n "$leftover" ]; then
  echo "FAIL  a --search lookup survives:"; echo "$leftover"; fails=$((fails+1))
else
  echo "PASS  no --search issue lookup remains in any producer"
fi

echo
echo "--- every producer title has a byte-exact registry entry ---"
# The registry matches issues by EXACT title (never `gh --search`, which token-matches).
# So a single character of drift between a producer's TITLE= and the registry's
# match_title makes that check a permanent silent no-op: the reader finds nothing,
# reports nothing due, and exits 0 — indistinguishable from a healthy system. No
# fixture test can catch this, because fixtures supply their own titles; the two
# sides only meet in production. Several of these titles contain em-dashes, which
# is exactly the kind of character that survives a copy-paste and not a retype.
producer_titles=$(for p in "${PRODUCERS[@]}"; do
  grep -hoE 'TITLE="[^"]*"' ".github/workflows/$p.yml"
done | sed 's/^TITLE="//; s/"$//' | sort -u)
registry_titles=$(jq -r '.checks[] | select(.kind=="github-issue-age") | .match_title' \
  .github/alert-registry.json | sort -u)
if [ "$producer_titles" = "$registry_titles" ]; then
  printf 'PASS  %s title(s) match byte for byte\n' "$(printf '%s\n' "$producer_titles" | wc -l | tr -d ' ')"
else
  echo "FAIL  producer titles and registry match_titles have drifted:"
  diff <(printf '%s\n' "$producer_titles") <(printf '%s\n' "$registry_titles") \
    | sed 's/^/      /'
  echo "      < = in a producer but not the registry (that alarm is never escalated)"
  echo "      > = in the registry but no producer (that check can never fire)"
  fails=$((fails+1))
fi

echo
if [ "$fails" -gt 0 ]; then
  echo "RESULT: $fails failure(s)"; exit 1
fi
echo "RESULT: all checks passed ($sites filter cases + ${#PRODUCERS[@]} producers)"
