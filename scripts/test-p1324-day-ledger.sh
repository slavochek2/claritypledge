#!/usr/bin/env bash
# test-p1324-day-ledger.sh — the ClarityPledge half of P1324's step ledger.
#
# The dispatcher's own suites (~/.claude/scripts/day-step.test.sh, day-gates.test.sh,
# day-pass-guard.test.sh) cover the runner, the finish gate and the blocking Stop hook. This
# file covers the three things that live in THIS repo and would otherwise be checked by nobody:
#
#   1. scripts/day-cp-steps.tsv is well formed
#   2. it and day-cp.md describe the same set of steps — in BOTH directions
#   3. day-cp.md still names no home-directory path
#
# (3) is the contract, not a style rule. day-cp.md is a public-repo file whose own table says
# "no personal state is read in this file", and the split that produced it (pp p48, 2026-08-28)
# happened because a personal daily driver had accreted 15 private references simply by being
# edited where it already sat. Wiring the sub-day into a ledger that lives under $HOME is
# exactly the pressure that does that again, which is why the runner arrives as $DAY_STEP.
#
# Gate 7: every assertion here has been watched failing — see the CONTROLS section, which runs
# a known-bad fixture through the same check and requires it to be caught. A suite whose checks
# have only ever passed proves that they run, not that they work.
#
# Exit 0: all assertions held. Exit 1: at least one did not.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/scripts/day-cp-steps.tsv"
SKILL="$ROOT/.claude/commands/slava/maintain/day-cp.md"
DAY_STEP="${DAY_STEP_BIN:-$HOME/.claude/scripts/day-step.sh}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0

ok()   { echo "  ok   $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL $1"; fail=$((fail+1)); }
want() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 — expected $3, got $2"; fi; }
SCANNER="$(dirname "${BASH_SOURCE[0]}")/lib/day-cp-home-path-scan.py"
_scan()  { python3 "$SCANNER" "$1"; }
_scount(){ _scan "$1" | grep -c . | tr -d ' '; }

echo "== the manifest is well formed =="
if [ -f "$MANIFEST" ]; then ok "scripts/day-cp-steps.tsv exists"; else bad "manifest missing"; fi
rows="$(grep -v '^[[:space:]]*#' "$MANIFEST" | grep -v '^[[:space:]]*$')"
n="$(printf '%s\n' "$rows" | wc -l | tr -d ' ')"
want "every row has exactly 4 TAB fields" \
     "$(printf '%s\n' "$rows" | awk -F'\t' '{print NF}' | sort -u | tr -d '\n')" "4"
want "every kind is cmd, attest or gate" \
     "$(printf '%s\n' "$rows" | cut -f2 | sort -u | grep -vcE '^(cmd|attest|gate)$' | tr -d ' ')" "0"
want "every policy is hard or skippable" \
     "$(printf '%s\n' "$rows" | cut -f3 | sort -u | grep -vcE '^(hard|skippable)$' | tr -d ' ')" "0"
want "step ids are unique" \
     "$(printf '%s\n' "$rows" | cut -f1 | sort | uniq -d | wc -l | tr -d ' ')" "0"
echo "       (${n} steps declared)"

echo
echo "== the manifest and the skill file describe the same steps =="
if [ ! -x "$DAY_STEP" ]; then
  # Never a silent pass: this suite's whole job is the pair, and without the runner it checks
  # nothing. Loud and red beats green-because-absent.
  bad "day-step.sh not found at ${DAY_STEP} — the sync check could NOT run, treat as unverified"
else
  if out="$("$DAY_STEP" check-sync "$MANIFEST" "$SKILL" 2>&1)"; then
    ok "check-sync: $out"
  else
    bad "check-sync reported drift:"; printf '%s\n' "$out" | sed 's/^/         /'
  fi
fi

echo
echo "== day-cp.md never EXECUTES anything from the home directory (the contract) =="
# The contract forbids READING OR RUNNING personal state here, not mentioning it. day-cp.md
# refers to the dispatcher and its markers in prose on purpose — marker ownership, the list of
# dispatcher steps still owed, the note that weekly/monthly still read their own. Flagging those
# was this check's first draft and it failed on 8 pre-existing, CORRECT lines. So the check is
# scoped to what actually violates the contract: a home path on an EXECUTABLE line inside a bash
# fence. A comment inside a fence is prose too.
viol="$(_scan "$SKILL")"
if [ -z "$viol" ]; then
  ok "no home path on an executable line in any bash block"
else
  bad "day-cp.md executes something from the home directory:"; printf '%s\n' "$viol" | sed 's/^/         /'
fi
want "the runner is referenced as \$DAY_STEP" \
     "$(grep -c '"\$DAY_STEP"' "$SKILL" | tr -d ' ' | awk '{print ($1>0)?"yes":"no"}')" "yes"

echo
echo "== CONTROLS: the checks above are watched CATCHING a known-bad input =="
# Without these, every assertion above is consistent with a check that cannot fail at all.
if [ -x "$DAY_STEP" ]; then
  printf 'ctl.one\tcmd\thard\tRecorded\nctl.two\tcmd\thard\tNever recorded\n' > "$TMP/man.tsv"
  printf 'a doc that records only one of them:\n"$DAY_STEP" run ctl.one\n' > "$TMP/doc.md"
  "$DAY_STEP" check-sync "$TMP/man.tsv" "$TMP/doc.md" >/dev/null 2>&1
  want "sync catches a manifest step the file never records" "$?" "1"

  printf '"$DAY_STEP" run ctl.one\n"$DAY_STEP" run ctl.two\n"$DAY_STEP" run ctl.ghost\n' > "$TMP/doc2.md"
  "$DAY_STEP" check-sync "$TMP/man.tsv" "$TMP/doc2.md" >/dev/null 2>&1
  want "sync catches a recorded step no manifest requires" "$?" "1"

  printf '"$DAY_STEP" run ctl.one\n"$DAY_STEP" run ctl.two\n' > "$TMP/doc3.md"
  "$DAY_STEP" check-sync "$TMP/man.tsv" "$TMP/doc3.md" >/dev/null 2>&1
  want "sync PASSES a matching pair (no false positive)" "$?" "0"
fi

# Controls for the contract check, run through the SAME scanner — one file that violates it
# (an executable home path inside a bash fence) and one that only mentions the path in prose and
# in a fenced comment, which must NOT be flagged. Without the second, a scanner that flags
# everything would score identically here.
printf 'prose about ~/.claude is fine\n\n```bash\n$HOME/.claude/scripts/day-step.sh run x\n```\n' > "$TMP/bad-path.md"
want "the contract check catches an executable home path" "$(_scount "$TMP/bad-path.md")" "1"
printf 'prose naming ~/.claude/commands/day.md\n\n```bash\n# a comment about ~/.claude/scripts/day-gates.sh\n"$DAY_STEP" run x\n```\n' > "$TMP/ok-path.md"
want "and does NOT flag prose or a fenced comment (no false positive)" "$(_scount "$TMP/ok-path.md")" "0"

echo
echo "== ${pass} passed, ${fail} failed =="
[ "$fail" -eq 0 ]
