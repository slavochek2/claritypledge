#!/usr/bin/env bash
#
# test-next-rank.sh — canary for scripts/next-rank.sh (P1284, item 1).
#
# Epistemic gate 7: a check you have not seen FAIL is unproven. Every case below
# is driven against a hermetic fixture repo — its own features/ tree in a temp
# dir — so the assertions are on constructed input, never on the live board.
#
# The defect: next-rank.sh was already scoped per column, but each column still
# carries legacy ranks in the 1,000,000 band left by the OLD global max+1. Taking
# max+1 over a column that contains one of those reproduces the very ratchet the
# per-column scoping was meant to end, so every agent-filed spec sorts below
# every hand-ordered one.
#
# Run: ./scripts/test-next-rank.sh

set -uo pipefail
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; DIM=$'\033[2m'; NC=$'\033[0m'
PASSED=0; FAILED=0

# spec <root> <name> <status> <rank>
spec() {
  local root="$1" name="$2" st="$3" rk="$4"
  printf -- '---\nstatus: %s\ntype: task\nrank: %s\n---\n\n# %s\n' "$st" "$rk" "$name" \
    > "$root/features/${name}.md"
}

build_fixture() {
  local root="$1"
  mkdir -p "$root/scripts" "$root/features/bugs_and_debt"
  cp "$REPO/scripts/next-rank.sh" "$root/scripts/next-rank.sh"
  chmod +x "$root/scripts/next-rank.sh"
}

# check <label> <expected> <actual>
check() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    printf '%s✓%s %-62s %s\n' "$GREEN" "$NC" "$label" "$actual"; PASSED=$((PASSED+1))
  else
    printf '%s✗%s %-62s got=%s want=%s\n' "$RED" "$NC" "$label" "$actual" "$expected"; FAILED=$((FAILED+1))
  fi
}

echo "═══ next-rank.sh — the ratchet ═══"

# --- 1. THE DEFECT: a column holding one legacy-band rank ------------------
# 1000062 is the real value observed on the live board for P1212 (inbox entry
# 2026-09-01). Hand-ordered cards sit at 1..11. A correct answer is 12, in the
# hand-ordered scale; the pre-fix script returns 1000063 and buries the card.
t=$(mktemp -d); build_fixture "$t"
spec "$t" p001 week 1
spec "$t" p002 week 5
spec "$t" p003 week 11
spec "$t" p004 week 1000062
check "legacy band in the column does not set the scale" \
      "12" "$(cd "$t" && ./scripts/next-rank.sh week 2>/dev/null)"
rm -rf "$t"

# --- 2. CONTROL: a column with no legacy band is unchanged -----------------
# The fix must not move the answer where the old behaviour was already right.
t=$(mktemp -d); build_fixture "$t"
spec "$t" p001 week 1
spec "$t" p002 week 5
spec "$t" p003 week 11
check "control — dense-only column still returns max+1" \
      "12" "$(cd "$t" && ./scripts/next-rank.sh week 2>/dev/null)"
rm -rf "$t"

# --- 3. CONTROL: per-column scoping is not regressed -----------------------
# A legacy rank in ANOTHER column must not leak into this one either.
t=$(mktemp -d); build_fixture "$t"
spec "$t" p001 week 3
spec "$t" p002 backlog 1000090
check "control — another column's ranks never leak in" \
      "4" "$(cd "$t" && ./scripts/next-rank.sh week 2>/dev/null)"
rm -rf "$t"

# --- 4. An empty column starts at 1 ---------------------------------------
t=$(mktemp -d); build_fixture "$t"
spec "$t" p001 backlog 4
check "empty column starts at 1" \
      "1" "$(cd "$t" && ./scripts/next-rank.sh today 2>/dev/null)"
rm -rf "$t"

# --- 5. EDGE: a column that is ENTIRELY legacy ----------------------------
# There is no dense scale to join, so the value must still not COLLIDE with an
# existing card: fall back to the legacy maximum + 1. Returning 1 here would
# silently promote a fresh agent-filed card to the top of the column.
t=$(mktemp -d); build_fixture "$t"
spec "$t" p001 qa 1000010
spec "$t" p002 qa 1000011
check "all-legacy column falls back to legacy max+1 (never collides)" \
      "1000012" "$(cd "$t" && ./scripts/next-rank.sh qa 2>/dev/null)"
rm -rf "$t"

# --- 5b. EDGE: the dense scale runs right up to the band -------------------
# Found by the P1284 code review (codex, 2026-09-09). The fix's own guarantee is
# "the value can never collide with an existing card", and dense max+1 breaks it
# at exactly one input: a column holding both 999999 and 1000000. max_dense + 1
# IS 1000000, which is another card's rank. The answer must leave the dense scale
# rather than collide, so it falls back to legacy max+1 the same way an
# all-legacy column does.
t=$(mktemp -d); build_fixture "$t"
spec "$t" p001 week 999999
spec "$t" p002 week 1000000
check "dense max+1 landing on the band does not collide" \
      "1000001" "$(cd "$t" && ./scripts/next-rank.sh week 2>/dev/null)"
rm -rf "$t"

# --- 6. bugs_and_debt/ is scanned too -------------------------------------
t=$(mktemp -d); build_fixture "$t"
spec "$t" p001 week 2
printf -- '---\nstatus: week\ntype: bug\nrank: 7\n---\n' > "$t/features/bugs_and_debt/p002.md"
check "bugs_and_debt/ specs count toward the column" \
      "8" "$(cd "$t" && ./scripts/next-rank.sh week 2>/dev/null)"
rm -rf "$t"

# --- 7. usage error still exits non-zero ----------------------------------
t=$(mktemp -d); build_fixture "$t"
(cd "$t" && ./scripts/next-rank.sh >/dev/null 2>&1)
rc=$?
if [[ $rc -ne 0 ]]; then
  printf '%s✓%s %-62s exit=%s\n' "$GREEN" "$NC" "no status argument is a usage error" "$rc"; PASSED=$((PASSED+1))
else
  printf '%s✗%s %-62s exit=%s\n' "$RED" "$NC" "no status argument is a usage error" "$rc"; FAILED=$((FAILED+1))
fi
rm -rf "$t"

echo
if [[ $FAILED -eq 0 ]]; then
  echo "${GREEN}test-next-rank: ${PASSED} passed, 0 failed${NC}"; exit 0
else
  echo "${RED}test-next-rank: ${PASSED} passed, ${FAILED} FAILED${NC}"; exit 1
fi
