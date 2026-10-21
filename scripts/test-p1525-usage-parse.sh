#!/usr/bin/env bash
# P1525: supabase-usage-parse.py against the fixtures in scripts/fixtures/p1525/ (usage-over and
# usage-under are the real Usage page's structure with every figure replaced, epistemic gate 7d).
# The last block is the gate-7 control: a deliberately wrong expectation must be reported as FAIL.
set -u
cd "$(dirname "$0")/.."
P=scripts/supabase-usage-parse.py
F=scripts/fixtures/p1525
pass=0; fail=0
ok()  { echo "  ok   $1"; pass=$((pass+1)); }
TMPF=$(mktemp); trap 'rm -f "$TMPF"' EXIT
bad() { echo "  FAIL $1"; fail=$((fail+1)); }

# expect <name> <want-exit> <want-status-word> <fixture-or-dash> [parser args]; stdin text when fixture is '-'
expect() {
  local name=$1 wexit=$2 wword=$3 file=$4; shift 4
  local out code word
  if [ "$file" = "-" ]; then out=$(python3 $P "$@" 2>&1); else out=$(python3 $P "$@" "$file" 2>&1); fi
  code=$?
  word=$(printf '%s\n' "$out" | sed -n 's/^USAGE: \([a-z-]*\).*/\1/p')
  if [ "$code" = "$wexit" ] && [ "$word" = "$wword" ]; then ok "$name"; else bad "$name (exit $code word '$word', want $wexit '$wword')"; fi
  LAST=$out
}
has()  { printf '%s\n' "$LAST" | grep -q -- "$2" && ok "$1" || bad "$1 (missing: $2)"; }
hasnt() { printf '%s\n' "$LAST" | grep -q -- "$2" && bad "$1 (found: $2)" || ok "$1"; }
page() { printf 'Usage Summary\n\n%s\n\n%s\n' "$1" "$2"; }

echo "== fixtures"
expect "over-threshold page is a problem" 1 problem $F/usage-over.txt
has   "worst metric named first" "USAGE: problem Log Ingestion 320%"
has   "UPCOMING suffix stripped from the label" "ROW Log_Ingestion 3.2 1 320 over"
hasnt "no UPCOMING left in any row" "UPCOMING"
has   "banner reported" "BANNER: Your grace period has started"
has   "projects listed" "PROJECTS: claritypledge - test, Clarity Movement - Prod"
has   "comma numbers read" "ROW Monthly_Active_Users 4,210 50,000 8 under"
hasnt "Unavailable in plan ignored" "SSO"
hasnt "no status line holds a redirect character" "USAGE:.*[<>|]"
expect "grace-period banner with every metric under the threshold is still a problem" 1 problem $F/usage-over.txt --warn-pct 1000
has   "grace-period detail says so" "USAGE: problem grace period active"
# Review round 1 (Codex, Gemini): units on both sides, wrong-page ratios, rounding across the boundary.
printf 'Usage Summary\n\nEgress\n\n900 MB / 1 GB (90%%)\n' > "$TMPF"
expect "a unit on the used side is normalised, not dropped" 1 problem "$TMPF"
has   "MB over GB reads as 90 percent" "ROW Egress 900 1 90 over"
printf 'Project Slots\n\n1 / 2\n' > "$TMPF"
expect "a non-Usage page with a ratio is not-run, never ok" 2 not-run "$TMPF"
printf 'Usage Summary\n\nEgress\n\n6.99 / 10 GB\n' > "$TMPF"
expect "69.9 percent stays under a 70 threshold" 0 ok "$TMPF"
has   "the row says under, matching the decision" "ROW Egress 6.99 10 69 under"
expect "under-threshold page is ok" 0 ok $F/usage-under.txt
hasnt "no banner on the quiet page" "BANNER"
expect "non-usage page is not-run" 2 not-run $F/not-usage.txt
expect "empty input is not-run" 2 not-run $F/empty.txt
has   "not-run tells the founder what to do" "sign in at supabase.com/dashboard"

echo "== threshold boundary (7 of 10 GB is exactly 70%)"
P7=$(page "Egress" "7 / 10 GB (70%)")
printf '%s' "$P7" | python3 $P --warn-pct 69 >/dev/null; [ $? = 1 ] && ok "69 warns" || bad "69 warns"
printf '%s' "$P7" | python3 $P --warn-pct 70 >/dev/null; [ $? = 1 ] && ok "70 warns (at the threshold)" || bad "70 warns"
printf '%s' "$P7" | python3 $P --warn-pct 71 >/dev/null; [ $? = 0 ] && ok "71 is ok" || bad "71 is ok"
printf '%s' "$P7" | QUOTA_WARN_PCT=71 python3 $P >/dev/null; [ $? = 0 ] && ok "QUOTA_WARN_PCT honoured" || bad "QUOTA_WARN_PCT honoured"
printf '%s' "$P7" | python3 $P >/dev/null; [ $? = 1 ] && ok "default threshold is 70" || bad "default threshold is 70"

echo "== parsing details"
expect "printed percentage is not trusted" 1 problem - < <(page "Egress" "9 / 10 GB (5%)")
has   "pct computed from used and limit" "ROW Egress 9 10 90"
expect "zero used is ok" 0 ok - < <(page "Egress" "0 / 100 GB")
expect "commas in used and limit" 1 problem - < <(page "Monthly Active Users" "45,000 / 50,000 MAU (90%)")
has   "comma row" "ROW Monthly_Active_Users 45,000 50,000 90"
expect "unavailable in plan alone is not-run" 2 not-run - < <(page "Monthly Active SSO Users" "Unavailable in plan")
TWICE=$(printf 'Usage Summary\n\nEgress\n\n1 / 10 GB (10%%)\n\nEgress\n\n9 / 10 GB (90%%)\n')
expect "only the first occurrence of a label counts" 0 ok - < <(printf '%s' "$TWICE")
has   "first value kept" "ROW Egress 1 10 10 under"

echo "== gate 7 control: a wrong expectation must register as FAIL"
before=$fail
expect "CONTROL (expects ok on the over page)" 0 ok $F/usage-over.txt >/dev/null
if [ "$fail" = "$((before+1))" ]; then fail=$before; pass=$((pass+1)); echo "  ok   control failed as it must"; else echo "  FAIL control did not fail"; fail=$((fail+1)); fi

echo; echo "== $pass passed, $fail failed =="
[ "$fail" = 0 ]
