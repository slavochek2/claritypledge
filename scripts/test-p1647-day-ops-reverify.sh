#!/bin/bash
# scripts/test-p1647-day-ops-reverify.sh — tests for day-ops-reverify.sh (P1647).
# Fixtures are inline; equivalents are stubbed through P1647_SUPPLY_CMD / P1647_DRIFT_CMD.
# Exit non-zero on any FAIL.

S="$(cd "$(dirname "$0")" && pwd)/day-ops-reverify.sh"
pass=0; fail=0
ok() { echo "PASS $1"; pass=$((pass+1)); }
no() { echo "FAIL $1"; fail=$((fail+1)); }
has() { if printf '%s\n' "$2" | grep -qF -- "$3"; then ok "$1"; else no "$1 (missing: $3)"; echo "$2" | sed 's/^/    /'; fi; }
hasnt() { if printf '%s\n' "$2" | grep -qF -- "$3"; then no "$1 (unexpected: $3)"; else ok "$1"; fi; }

SUP="Supply-chain audit: FINDING or INCOMPLETE on main"
DRF="Deploy drift detected on prod"
FIX_1106='[
 {"number":30,"title":"'"$SUP"'","labels":[],"createdAt":"2026-11-01T06:00:00Z"},
 {"number":33,"title":"'"$DRF"'","labels":[],"createdAt":"2026-11-04T06:00:00Z"},
 {"number":41,"title":"Prod health smoke gate failing on prod","labels":[],"createdAt":"2026-11-05T06:00:00Z"},
 {"number":42,"title":"CSP smoke gate failing on prod","labels":[],"createdAt":"2026-11-05T07:00:00Z"}
]'
FIX_CLEAN='[
 {"number":30,"title":"'"$SUP"'","labels":[],"createdAt":"2026-11-01T06:00:00Z"},
 {"number":33,"title":"'"$DRF"'","labels":[],"createdAt":"2026-11-04T06:00:00Z"}
]'
FIX_DRIFT_ONLY='[{"number":33,"title":"'"$DRF"'","labels":[],"createdAt":"2026-11-04T06:00:00Z"}]'
FIX_P1155='[{"number":7,"title":"Anything at all","labels":[{"name":"p1155-signups"}],"createdAt":"2026-11-01T06:00:00Z"}]'

# run <fixture> <supply-cmd> <drift-cmd> [timeout]; sets OUT and RC
run() {
  OUT="$(printf '%s' "$1" | P1647_SUPPLY_CMD="$2" P1647_DRIFT_CMD="$3" P1647_TIMEOUT="${4:-5}" "$S" 2>&1)"; RC=$?
}

echo "== 2026-11-06 shape, both stubs clean =="
run "$FIX_1106" true true
has "supply issue CLEAN" "$OUT" "CLEAN 30 2026-11-01T06:00:00Z $SUP"
has "drift issue CLEAN" "$OUT" "CLEAN 33 2026-11-04T06:00:00Z $DRF"
has "smoke 41 FILE unmatched" "$OUT" "FILE 41 2026-11-05T06:00:00Z unmatched Prod health smoke gate failing on prod"
has "smoke 42 FILE unmatched" "$OUT" "FILE 42 2026-11-05T07:00:00Z unmatched CSP smoke gate failing on prod"
hasnt "no FILE for 30" "$OUT" "FILE 30"
hasnt "no FILE for 33" "$OUT" "FILE 33"
has "status problem" "$OUT" "OPS-STATUS problem"
[ "$RC" -eq 0 ] && ok "exit 0 even with FILE lines" || no "exit was $RC"

echo "== dirty drift stub =="
run "$FIX_1106" true 'exit 1'
has "drift FILE dirty" "$OUT" "FILE 33 2026-11-04T06:00:00Z dirty $DRF"
has "supply still CLEAN" "$OUT" "CLEAN 30"

echo "== dirty supply stub =="
run "$FIX_1106" 'exit 1' true
has "supply FILE dirty" "$OUT" "FILE 30 2026-11-01T06:00:00Z dirty $SUP"

echo "== erroring stub (exit 7) is never clean =="
run "$FIX_DRIFT_ONLY" true 'exit 7'
has "drift FILE error" "$OUT" "FILE 33 2026-11-04T06:00:00Z error $DRF"
has "status problem on error" "$OUT" "OPS-STATUS problem"

echo "== hanging stub times out =="
run "$FIX_DRIFT_ONLY" true 'sleep 30' 1
has "drift FILE timeout" "$OUT" "FILE 33 2026-11-04T06:00:00Z timeout $DRF"

echo "== p1155-labelled issue passes through =="
run "$FIX_P1155" 'exit 1' 'exit 1'
has "PASSTHROUGH 7" "$OUT" "PASSTHROUGH 7"
hasnt "p1155 not filed" "$OUT" "FILE 7"
hasnt "p1155 not clean" "$OUT" "CLEAN 7"
has "passthrough alone leaves status ok" "$OUT" "OPS-STATUS ok"

echo "== all-clean fixture =="
run "$FIX_CLEAN" true true
has "OPS-STATUS ok" "$OUT" "OPS-STATUS ok"
hasnt "no FILE lines" "$OUT" "FILE "
hasnt "no truncation line" "$OUT" "TRUNCATION-POSSIBLE"

echo "== 50-row fixture =="
FIX_50="$(python3 -c '
import json
print(json.dumps([{"number":i,"title":"Some alert %d" % i,"labels":[],"createdAt":"2026-11-01T00:00:00Z"} for i in range(1,51)]))')"
run "$FIX_50" true true
has "TRUNCATION-POSSIBLE 50" "$OUT" "TRUNCATION-POSSIBLE 50"
run "$FIX_CLEAN" true true
hasnt "2 rows: no truncation line" "$OUT" "TRUNCATION-POSSIBLE"

echo "== output has no pipe or angle brackets, even from hostile titles =="
FIX_HOSTILE='[{"number":9,"title":"a | b > c < d","labels":[],"createdAt":"2026-11-01T00:00:00Z"}]'
run "$FIX_HOSTILE" true true
if printf '%s' "$OUT" | grep -q '[|<>]'; then no "unsafe characters in output"; else ok "output is redirect-safe"; fi

echo "== malformed JSON =="
run 'not json {' true true
[ "$RC" -eq 2 ] && ok "exit 2 on malformed JSON" || no "exit was $RC"
run '{"a":1}' true true
[ "$RC" -eq 2 ] && ok "exit 2 on non-list JSON" || no "exit was $RC"

echo
echo "== $pass passed, $fail failed =="
[ "$fail" -eq 0 ]
