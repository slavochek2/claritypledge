#!/bin/bash
# P1399 — known-bad controls for the Day page's rules (spec §7, epistemic gate 7).
#
# For each rule: copy the board to a throwaway dir, break the rule there, run the test that
# guards it, and require it to go RED. Then the unbroken copy must be GREEN. The working tree is
# never touched (no git checkout/restore, no in-place edits), so a running board is unaffected.
#
# Usage: ./scripts/day-mutation-controls.sh        exit 0 = every control fired
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/day-mut.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

fresh() {
  rm -rf "$WORK/k"
  mkdir -p "$WORK/k"
  (cd "$HERE" && tar --exclude ./node_modules --exclude ./coverage --exclude ./test-results -cf - .) | (cd "$WORK/k" && tar -xf -)
  ln -s "$HERE/node_modules" "$WORK/k/node_modules"
}

# run_test <name-filter>  → prints PASS/FAIL, returns vitest's exit code
run_test() {
  (cd "$WORK/k" && npx vitest run server/__tests__/day.test.ts -t "$1" >"$WORK/out.txt" 2>&1)
}

# mutate <file> <perl-substitution>  — fails loudly if the pattern did not match
mutate() {
  local f="$WORK/k/$1" before after
  before="$(shasum "$f" | cut -d' ' -f1)"
  perl -0pi -e "$2" "$f"
  after="$(shasum "$f" | cut -d' ' -f1)"
  [ "$before" != "$after" ]
}

fails=0
control() { # control <label> <test-filter> <file> <perl-substitution>
  fresh
  if ! mutate "$3" "$4"; then
    echo "BROKEN CONTROL  $1 — the mutation did not apply (pattern drifted)"; fails=$((fails + 1)); return
  fi
  if run_test "$2"; then
    echo "MISSED          $1 — test stayed green with the rule broken"; fails=$((fails + 1))
  elif perl -pe 's/\e\[[0-9;]*m//g' "$WORK/out.txt" | grep -Eq "Tests +[0-9]+ failed"; then
    echo "RED as expected $1"
  else
    echo "WRONG RED       $1 — the suite failed to load, not the test"; fails=$((fails + 1))
  fi
}

control "Invariant 1: unwritten bad check becomes an issue" "becomes an issue" \
  src/lib/day.ts 's/if \(!NEEDS_ISSUE\(c\.status\) \|\| covered\.has\(c\.id\)\) continue/if (true) continue/'
control "Rule 3: unknown status reads Not proven" "unknown check status" \
  src/lib/day.ts "s/\? \(x\.status as CheckStatus\) : 'unproven'/? (x.status as CheckStatus) : 'ok'/"
control "Rule 3: newer schema → plain text" "newer \\(or older\\) schema" \
  src/lib/day.ts 's/if \(raw\.schema !== DAY_SCHEMA\) return/if (false) return/'
control "Rule 3: malformed rows dropped and counted" "drops malformed rows" \
  src/lib/day.ts 's/drop\.n\+\+\n      continue/continue/'
control "Rule 1: fixed lasts until the fault recurs (v1 behaviour)" "RULE 1" \
  src/lib/day.ts 's/else if \(!now && prior\?\.option_id === PARK\)/else if (!now \&\& prior)/'
control "Rule 1: a later run's decision does not leak back" "LATER run" \
  src/lib/day.ts 's/else if \(Date\.parse\(d\.at\) < started\)/else/'
control "Park is never preselected" "cannot recommend Park" \
  src/lib/day.ts "s/o\.recommended === true && o\.id !== PARK && !recommended/o.recommended === true \&\& !recommended/; s/o\.recommended && o\.id !== PARK\)/o.recommended)/"
control "Rule 7: urgent before important" "sorts urgent\\+important" \
  src/lib/day.ts 's/i\.urgent \? 1 : i\.important \? 2/i.important ? 1 : i.urgent ? 2/'
control "Rule 7: urgent within 72h" "urgent = deadline within 72h" \
  src/lib/day.ts 's/<= 72 \* HOUR/<= 720 * HOUR/'
control "Prompt opens verify-first" "opens with verify-first" \
  src/lib/day.ts "s/'Before fixing anything, check each item is still real\. /'Please fix these. /"
control "Prompt puts questions first" "opens with verify-first" \
  src/lib/day.ts 's/(  const questions = c\.issues\.filter\(\(x\) => x\.option_id === ASK\)\n)/  const questions: typeof c.issues = []\n/'
control "Rule 2: unreadable newest is still the latest" "unreadable newest" \
  server/day.ts "s/\.filter\(\(r\): r is LoadedRun => r !== null\)/.filter((r): r is LoadedRun => r !== null \&\& r.parsed.kind === 'ok')/"
control "Rule 2: newest by started_at, running included" "state running is the latest" \
  server/day.ts 's/runs\.sort\(\(a, b\) => b\.sortKey\.localeCompare\(a\.sortKey\) \|\| b\.id\.localeCompare\(a\.id\)\)/runs.sort((a, b) => Number(b.parsed.kind === "ok" \&\& b.parsed.report.state === "complete") - Number(a.parsed.kind === "ok" \&\& a.parsed.report.state === "complete") || b.sortKey.localeCompare(a.sortKey))/'
control "Rule 2: unreadable (permissions) newest still sorts first" "cannot be read \\(permissions\\)" \
  server/day.ts "s/return \\{ id, sortKey: mtime, startedAt: null, parsed: \\{ kind: 'unreadable' \\}/return { id, sortKey: '', startedAt: null, parsed: { kind: 'unreadable' }/"
control "Rule 1: came back only after a gap" "only when a run in between" \
  src/lib/day.ts 's/if \(gap\) issue\.came_back = true/if (true) issue.came_back = true/'
control "Synthesised issue dated from history" "dated by the first earlier run" \
  src/lib/day.ts 's/if \(seen\) issue\.first_seen = seen\.slice\(0, 10\)/if (false) issue.first_seen = ""/'
control "Empty checks list is never clean" "empty checks list" \
  src/lib/day.ts 's/if \(report\.checks\.length === 0 && !fps\.has\(NO_CHECKS\)\)/if (false)/'
control "Budget raise must exceed the current budget" "a target must exist in the run" \
  src/lib/day.ts 's/\(d\.amount \?\? 0\) > current/true/'
control "Rule 4: only the latest run accepts decisions" "not the latest" \
  server/day.ts 's/if \(body\.run_id !== report\.pass_id && body\.run_id !== latest\.id\) return/if (false) return/'
control "Rule 4: a target must exist in the run" "not the latest" \
  server/day.ts 's/if \(!inputs\.every\(\(d\) => decisionTargetExists\(report, d\)\)\) return/if (false) return/'
control "Rule 5: reading writes nothing" "writes nothing" \
  server/day.ts "s/(const \{ lines, badLines \} = readDecisions\(dir\)\n)/\$1      appendFileSync(join(dir, 'decisions.jsonl'), '')\n/"
control "Rule 6: the fix step comes from the run" "carries the step from the run" \
  server/day.ts 's/if \(step\) out\.step = step/out.step = ((body.decisions as { step?: string }[])[inputs.indexOf(d)]?.step) ?? step/'
control "Rule 9 (Phase A part): non-JSON body refused" "non-JSON content type" \
  server/day.ts 's/if \(!isJson\(req\)\) return/if (false) return/'
control "Privacy: no content in logs" "never reaches the logs" \
  server/day.ts "s/console\.warn\('\[kanban\] day: a run file is not valid JSON'\)/console.warn('[kanban] day: a run file is not valid JSON', text)/"

# Rule 10: plant a product import in the board and require the guard to fire.
fresh
printf "import { createClient } from '@supabase/supabase-js'\nexport const probe = createClient\n" >"$WORK/k/src/lib/__probe.ts"
if run_test "imports no product code"; then echo "MISSED          Rule 10: product import guard"; fails=$((fails + 1)); else echo "RED as expected Rule 10: product import guard"; fi

# The unbroken copy must be green.
fresh
if run_test ""; then echo "GREEN           unmodified copy: all day tests pass"; else echo "UNEXPECTED RED  unmodified copy"; tail -30 "$WORK/out.txt"; fails=$((fails + 1)); fi

echo
if [ "$fails" -eq 0 ]; then echo "All controls fired."; exit 0; fi
echo "$fails control(s) did not behave."; exit 1
