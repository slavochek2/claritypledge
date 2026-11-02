#!/bin/bash
# P1597: one refused dispatch stays quiet, a repeat fires. Runs the real rule out of day-cp.md, so
# the control below proves this test reads the live text and would catch the threshold changing.
cd "$(git rev-parse --show-toplevel)" || exit 2
run() { python3 - "$1" "$2" <<'PY'
import sys
src = open(sys.argv[2]).read()
a = src.index('non_2xx = int('); b = src.index('failing = [j.get', a)
r = {"non_2xx_6h": int(sys.argv[1])}; why = []
exec(src[a:b]); print(len(why))
PY
}
F=.claude/commands/slava/maintain/day-cp.md; fail=0
for pair in 0:0 1:0 2:1 5:1; do
  got=$(run "${pair%:*}" "$F"); [ "$got" = "${pair#*:}" ] && echo "ok   $pair" || { echo "FAIL $pair got $got"; fail=1; }
done
T=$(mktemp); sed 's/if non_2xx >= 2:/if non_2xx >= 3:/' "$F" > "$T"
[ "$(run 2 "$T")" = 0 ] && echo "ok   control: a raised threshold changes the verdict" || { echo "FAIL control"; fail=1; }
rm -f "$T"; grep -q 'why.append("no successful dispatch in 90 minutes")' "$F" || { echo "FAIL silence rule gone"; fail=1; }
exit $fail
