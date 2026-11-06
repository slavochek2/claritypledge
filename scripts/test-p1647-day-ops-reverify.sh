#!/bin/bash
# scripts/test-p1647-day-ops-reverify.sh — tests for day-ops-reverify.sh (P1647).
# Fixtures are inline; equivalents are stubbed through P1647_SUPPLY_CMD / P1647_DRIFT_CMD.
# Exit non-zero on any FAIL.

S="$(cd "$(dirname "$0")" && pwd)/day-ops-reverify.sh"
TMP="$(mktemp -d)"
# the hanging fixture audit records its own pid here, so cleanup stops exactly that process
trap '[ -s "$TMP/audit.pid" ] && kill "$(cat "$TMP/audit.pid")" 2>/dev/null; rm -rf "$TMP"' EXIT
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

echo "== fix 8: matching uses the ORIGINAL title, sanitizing is output-only =="
FIX_H1='[{"number":50,"title":"Deploy drift detected on prod|","labels":[],"createdAt":"2026-11-01T00:00:00Z"},
         {"number":51,"title":"Deploy drift detected on prod ","labels":[],"createdAt":"2026-11-01T00:00:00Z"},
         {"number":52,"title":"Deploy <drift> detected on prod","labels":[],"createdAt":"2026-11-01T00:00:00Z"}]'
run "$FIX_H1" true 'exit 1'
has "trailing pipe is not the drift title" "$OUT" "FILE 50 2026-11-01T00:00:00Z unmatched"
has "trailing space is not the drift title" "$OUT" "FILE 51 2026-11-01T00:00:00Z unmatched"
has "brackets are not the drift title" "$OUT" "FILE 52 2026-11-01T00:00:00Z unmatched"
hasnt "none of them ran the drift check" "$OUT" " dirty "

echo "== fix 9: missing or null createdAt becomes unknown, fields stay aligned =="
FIX_C='[{"number":60,"title":"'"$DRF"'","labels":[]},
        {"number":61,"title":"'"$DRF"'","labels":[],"createdAt":null},
        {"number":62,"title":"'"$DRF"'","labels":null,"createdAt":""},
        {"number":63,"title":"'"$DRF"'","labels":[],"createdAt":"2026-11-01T00:00:00Z"}]'
run "$FIX_C" true true
has "missing key" "$OUT" "CLEAN 60 unknown $DRF"
has "null" "$OUT" "CLEAN 61 unknown $DRF"
has "empty string and null labels" "$OUT" "CLEAN 62 unknown $DRF"
has "a real date still passes through" "$OUT" "CLEAN 63 2026-11-01T00:00:00Z $DRF"
hasnt "never the string None" "$OUT" "None"
FIX_C2='[{"number":64,"title":"Some alert","labels":[]}]'
run "$FIX_C2" true true
has "unmatched with no createdAt keeps its fields" "$OUT" "FILE 64 unknown unmatched Some alert"

echo "== fix 10: a child that reads stdin cannot swallow the issue list =="
FIX_S='[{"number":70,"title":"'"$DRF"'","labels":[],"createdAt":"2026-11-01T00:00:00Z"},
        {"number":71,"title":"'"$DRF"'","labels":[],"createdAt":"2026-11-01T00:00:00Z"},
        {"number":72,"title":"Some other alert","labels":[],"createdAt":"2026-11-01T00:00:00Z"}]'
run "$FIX_S" true 'cat >/dev/null; exit 0'
has "issue 70 processed" "$OUT" "CLEAN 70"
has "issue 71 processed" "$OUT" "CLEAN 71"
has "issue 72 processed" "$OUT" "FILE 72"

echo "== fix 12: the plain issue list is printed too =="
run "$FIX_1106" true true
has "ISSUE 30" "$OUT" "ISSUE 30 $SUP"
has "ISSUE 33" "$OUT" "ISSUE 33 $DRF"
has "ISSUE 41" "$OUT" "ISSUE 41 Prod health smoke gate failing on prod"
has "ISSUE 42" "$OUT" "ISSUE 42 CSP smoke gate failing on prod"
run "$FIX_P1155" true true
has "a passthrough issue is listed as well" "$OUT" "ISSUE 7 Anything at all"

echo "== fix 11: supply-chain export is origin/main after a fetch =="
# Fixture: a bare origin whose main passes the audit; the work clone's LOCAL main fails it.
GOOD='#!/bin/bash
exit 0'
BAD='#!/bin/bash
exit 1'
OR="$TMP/origin.git"; WK="$TMP/work"; WK2="$TMP/work2"
git init -q --bare -b main "$OR"
git clone -q "$OR" "$WK" 2>/dev/null
git -C "$WK" config user.email t@example.com; git -C "$WK" config user.name t
mkdir -p "$WK/scripts"; printf '%s\n' "$GOOD" > "$WK/scripts/dep-audit.sh"
git -C "$WK" add scripts/dep-audit.sh && git -C "$WK" commit -q -m seed && git -C "$WK" branch -M main && git -C "$WK" push -q origin main 2>/dev/null
git -C "$WK" fetch -q origin
printf '%s\n' "$BAD" > "$WK/scripts/dep-audit.sh"; git -C "$WK" commit -q -am "local ahead: failing audit"
SUP1='[{"number":30,"title":"'"$SUP"'","labels":[],"createdAt":"2026-11-01T00:00:00Z"}]'
TD="$TMP/tmpd"; mkdir -p "$TD"
runfix() { OUT="$(printf '%s' "$SUP1" | TMPDIR="$TD" P1647_ROOT="$WK" P1647_TIMEOUT="${1:-20}" "$S" 2>&1)"; RC=$?; }
runfix
has "local main is ahead and failing; origin/main is clean, so the verdict is clean" "$OUT" "CLEAN 30"
# origin moves on (another clone pushes a failing audit); the local clone has NOT fetched
git clone -q "$OR" "$WK2" 2>/dev/null; git -C "$WK2" config user.email t@example.com; git -C "$WK2" config user.name t
printf '%s\n' "$BAD" > "$WK2/scripts/dep-audit.sh"; git -C "$WK2" commit -q -am "origin now failing" && git -C "$WK2" push -q origin main 2>/dev/null
runfix
has "origin moved while local is behind: the fetch makes it dirty" "$OUT" "FILE 30 2026-11-01T00:00:00Z dirty"
git -C "$WK" remote set-url origin "$TMP/does-not-exist.git"
runfix
has "a failed fetch is an error, never clean" "$OUT" "FILE 30 2026-11-01T00:00:00Z error"
hasnt "and not clean" "$OUT" "CLEAN 30"
# Drift: check-deploy-manifest.sh ignores its own failed fetch (P820), so the wrapper fetches first.
printf '%s\n' "$GOOD" > "$WK/scripts/check-deploy-manifest.sh"; chmod +x "$WK/scripts/check-deploy-manifest.sh"
DR1='[{"number":33,"title":"Deploy drift detected on prod","labels":[],"createdAt":"2026-11-01T00:00:00Z"}]'
OUT="$(printf '%s' "$DR1" | P1647_ROOT="$WK" P1647_TIMEOUT=20 "$S" 2>&1)"
has "drift: a failed fetch is an error even when the checker says clean" "$OUT" "FILE 33 2026-11-01T00:00:00Z error"
git -C "$WK" remote set-url origin "$OR"
OUT="$(printf '%s' "$DR1" | P1647_ROOT="$WK" P1647_TIMEOUT=20 "$S" 2>&1)"
has "drift: with a working fetch the checker's clean stands" "$OUT" "CLEAN 33"
# A fetch that stalls is bounded by the same time limit and reads as a timeout, never a hang.
# A stub git on PATH sleeps on `fetch` and passes everything else to the real git.
REALGIT="$(command -v git)"; SB="$TMP/stallbin"; mkdir -p "$SB"
printf '#!/bin/bash\nfor a in "$@"; do [ "$a" = fetch ] && exec sleep 30; done\nexec "%s" "$@"\n' "$REALGIT" > "$SB/git"; chmod +x "$SB/git"
t0=$(date +%s)
OUT="$(printf '%s' "$DR1" | PATH="$SB:$PATH" P1647_ROOT="$WK" P1647_TIMEOUT=2 "$S" 2>&1)"
t1=$(date +%s)
has "drift: a stalled fetch is a timeout" "$OUT" "FILE 33 2026-11-01T00:00:00Z timeout"
[ $((t1-t0)) -lt 15 ] && ok "drift: a stalled fetch returns within the limit ($((t1-t0))s)" || no "stalled fetch took $((t1-t0))s"
OUT="$(printf '%s' "$SUP1" | TMPDIR="$TD" PATH="$SB:$PATH" P1647_ROOT="$WK" P1647_TIMEOUT=2 "$S" 2>&1)"
has "supply: a stalled fetch is a timeout" "$OUT" "FILE 30 2026-11-01T00:00:00Z timeout"
git -C "$WK" remote set-url origin "$OR"
if [ -z "$(ls -A "$TD")" ]; then ok "temp export removed after normal and failed runs"; else no "temp dir left behind: $(ls "$TD")"; fi
# an export that cannot be made (unknown ref) is an error, never an empty-export pass
OUT="$(printf '%s' "$SUP1" | TMPDIR="$TD" P1647_ROOT="$WK" P1647_ARCHIVE_REF=no-such-ref "$S" 2>&1)"
has "a failed git archive is an error" "$OUT" "FILE 30 2026-11-01T00:00:00Z error"
if [ -z "$(ls -A "$TD")" ]; then ok "temp export removed after a failed archive"; else no "temp dir left after failed archive"; fi
# timeout: the audit hangs, the export must still be cleaned
printf '#!/bin/bash\necho $$ > "'"$TMP"'/audit.pid"\nexec sleep 62\n' > "$WK2/scripts/dep-audit.sh"; git -C "$WK2" commit -q -am "hanging audit" && git -C "$WK2" push -q origin main 2>/dev/null
runfix 1
has "a hanging audit is a timeout" "$OUT" "FILE 30 2026-11-01T00:00:00Z timeout"
if [ -z "$(ls -A "$TD")" ]; then ok "temp export removed after a timeout"; else no "temp dir left behind after timeout"; fi
# TERM while the audit runs: the export is removed and nothing is left running
( printf '%s' "$SUP1" | TMPDIR="$TD" P1647_ROOT="$WK" P1647_TIMEOUT=120 "$S" >/dev/null 2>&1 ) &
BG=$!
for _ in $(seq 1 100); do [ -n "$(ls -A "$TD" 2>/dev/null)" ] && break; sleep 0.1; done
[ -n "$(ls -A "$TD" 2>/dev/null)" ] && ok "export dir exists while the audit runs" || no "audit never started"
SCRIPT_PID="$(pgrep -P "$BG" -f day-ops-reverify | head -1)"
[ -n "$SCRIPT_PID" ] && kill -TERM "$SCRIPT_PID"
wait "$BG" 2>/dev/null
sleep 1.5
if [ -z "$(ls -A "$TD")" ]; then ok "TERM removed the temp export"; else no "temp dir left after TERM"; fi
AUDIT_PID="$(cat "$TMP/audit.pid" 2>/dev/null)"
if [ -n "$AUDIT_PID" ] && ! kill -0 "$AUDIT_PID" 2>/dev/null; then ok "the audit process did not survive TERM"; else no "audit process still running or never recorded (pid: $AUDIT_PID)"; fi

echo
echo "== $pass passed, $fail failed =="
[ "$fail" -eq 0 ]
