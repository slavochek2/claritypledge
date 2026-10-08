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

# run_test <name-filter> [test-file]  → returns vitest's exit code (default file: day.test.ts)
run_test() {
  (cd "$WORK/k" && npx vitest run "${2:-server/__tests__/day.test.ts}" -t "$1" >"$WORK/out.txt" 2>&1)
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
control() { # control <label> <test-filter> <file> <perl-substitution> [test-file]
  fresh
  if ! mutate "$3" "$4"; then
    echo "BROKEN CONTROL  $1 — the mutation did not apply (pattern drifted)"; fails=$((fails + 1)); return
  fi
  if run_test "$2" "${5:-}"; then
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
  src/lib/day.ts 's/const questions = c\.issues\.filter\(\(x\) => x\.option_id === OWN && x\.is_question\)/const questions: typeof c.issues = []/'
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
  server/day.ts "s/(const \{ lines, badLines \} = readDecisions\(dir\)\n)/\$1      void appendDecisionLines(dir, () => [{ kind: 'sent', id: 'x', run_id: 'x', state: 'failed' }])\n/"
control "Rule 6: the fix step comes from the run" "carries the step from the run" \
  server/day.ts 's/if \(step\) out\.step = step/out.step = ((body.decisions as { step?: string }[])[inputs.indexOf(d)]?.step) ?? step/'
control "Rule 9 (Phase A part): non-JSON body refused" "non-JSON content type" \
  server/day.ts 's/if \(!isJson\(req\)\) return/if (false) return/'
control "Privacy: no content in logs" "never reaches the logs" \
  server/day.ts "s/console\.warn\('\[kanban\] day: a run file is not valid JSON'\)/console.warn('[kanban] day: a run file is not valid JSON', text)/"

# Phase B: the renderer (scripts/day-render.ts), guarded by server/__tests__/day-render.test.ts.
R=server/__tests__/day-render.test.ts
D=scripts/day-render.ts
control "Render: a CHECK row's own status is reported" "a registered check reported problem inside a step" \
  $D 's/c = \{ \.\.\.meta, status: row\.status,/c = { ...meta, status: "ok" as CheckStatus,/' $R
control "Render: an unreported check is never ok" "UNREPORTED CHECK" \
  $D "s/status: 'unproven', detail: 'the step ran/status: 'ok', detail: 'the step ran/" $R
control "Render: a failed step is a problem" "STEP MAPPING" \
  $D "s/return \{ \.\.\.base, status: 'problem', detail: \`exited/return { ...base, status: 'ok', detail: \`exited/" $R
control "Render: a failed step with all-ok checks is a problem of its own" "STEP EXIT" \
  $D 's/if \(failed && own\.every/if (false \&\& own.every/' $R
control "Render: phase start is running" "RUN STATE" \
  $D "s/if \(phase === 'start'\) return 'running'/if (false) return 'running'/" $R
control "Render: a missing hard step is incomplete" "RUN STATE" \
  $D "s/    if \(list\.steps\.some\(\(s\) => s\.hard && !ledger\.steps\.has\(s\.id\)\)\) return 'incomplete'\n//" $R
control "Render: a missing step list is incomplete" "step list that has gone missing" \
  $D "s/  if \(registries\.missing > 0\) return 'incomplete'\n//" $R
control "Render: the fingerprint never comes from the title" "FINGERPRINT" \
  $D 's/\$\{side\.check\}:\$\{side\.fault_key\}/\${side.check}:\${side.title.length + side.title.charCodeAt(16)}/' $R
control "Render: the sidecar's first seen counts" "FIRST SEEN" \
  $D 's/if \(sidecarFirst && isoDay\(sidecarFirst\)\)/if (false)/' $R
control "Render: first seen is the earliest earlier report" "FIRST SEEN" \
  $D 's/return dates\.sort\(\)\[0\]/return dates[0]/' $R
control "Render: an earlier report's own first_seen counts" "FIRST SEEN — the minimum" \
  $D 's/if \(isoDay\(issue\.first_seen\)\) dates\.push/if (false) dates.push/' $R
control "Render: Park is never recommended" "Park never recommended|Park is never" \
  $D 's/options\.find\(\(o\) => o\.id === recommend && o\.id !== PARK\) \?\? options\.find\(\(o\) => o\.id !== PARK\)/options.find((o) => o.id === recommend) ?? options[options.length - 1]/' $R
control "Render: a malformed data section is a problem, not dropped" "DATA — a malformed" \
  $D 's/else extra\.push\(\{ id: `day\.data/else if (false) extra.push({ id: `day.data/' $R
control "Render: data sections land as given" "DATA — every section" \
  $D "s/  if \(data\.people\) report\.people = data\.people as DayReport\['people'\]\n//" $R
control "Render: a report that would not validate is not written" "WOULD NOT VALIDATE" \
  $D 's/if \(problems\.length\) \{/if (false) {/' $R
control "Render: the report is mode 0600" "WRITTEN FILE" \
  $D 's/\{ mode: 0o600 \}\)\n    chmodSync\(tmp, 0o600\)/{ mode: 0o644 })\n    chmodSync(tmp, 0o644)/' $R
control "Render: stderr carries no report content" "PRIVACY — in-process" \
  $D 's/say\(`report written \(\$\{report\.state\}\)`\)/say(`report written (\${report.state}) \${JSON.stringify(report)}`)/' $R
control "Render: the card leaves parked issues out" "CARD — ≤ 25 lines" \
  $D "s/return parseDecisions\(readFileSync\(join\(dayDir, 'decisions\.jsonl'\), 'utf-8'\)\)\.lines/return []/" $R
control "Render: the card shows the first six only" "CARD — ≤ 25 lines" \
  $D 's/const CARD_ISSUES = 6/const CARD_ISSUES = 60/' $R
control "Render: the card carries no internal ids" "CARD — ≤ 25 lines" \
  $D 's/\$\{plain\(i\.title\)\}`\)/\${plain(i.title)} (\${i.fp})`)/' $R
control "Render: control characters never reach the terminal" "control characters" \
  $D 's/\.replace\(\/\[\\x00-\\x1f\\x7f-\\x9f\]\/g, . .\)//' $R

control "Render: no phantom checks (an attested or ok step is not a row)" "STEP MAPPING" \
  $D "s/if \(rec\.status === 'ok' \|\| rec\.status === 'attested' \|\| rec\.status === 'skipped'\) return null/if (rec.status === 'ok' || rec.status === 'attested') return { ...base, status: 'ok' }\n  if (rec.status === 'skipped') return null/" $R
control "Render: a gate label reads Daily run gate" "Daily run gate" \
  $D 's/if \(gate\) return `Daily run gate/if (false) return `Daily run gate/' $R
control "Render: trailing parentheticals leave a step label" "trailing parentheticals" \
  $D "s/s = s\.replace\(\/\\\\s\*\\\\\(\[\^\(\)\]\*\\\\\)\\\\s\*\\$\/, ''\)\.trim\(\)/s = s.trim()/" $R
control "Render: a check takes a status only from its own step" "PROVENANCE — a CHECK row from the wrong step" \
  $D 's/\.filter\(\(r\) => r\.step === rc\.step\)\)/)/' $R
control "Render: a status from the wrong place is reported" "PROVENANCE" \
  $D 's/      misplaced \+= \(ledger\.checks\.get\(rc\.id\) \?\? \[\]\)\.filter\(\(r\) => r\.step !== rc\.step\)\.length\n//' $R
control "Render: an agent row cannot overrule a command row" "AGENT CANNOT OVERRULE" \
  $D "s/if \(!best \|\| r\.source === 'cmd' \|\| best\.source !== 'cmd'\) best = r/best = r/" $R
control "Render: phase start closes a killed pass" "KILLED PASS — at phase start" \
  $D "s/if \(args\.phase === 'start'\) \{/if (false) {/" $R
control "Render: a keyed finding without its sidecar is a problem" "KEYED FINDING" \
  $D 's/if \(files\.sidecar === undefined \? row\.keyed : !side\) unusable\+\+/if (files.sidecar !== undefined \&\& !side) unusable++/' $R
control "Render: a missing check list is never complete" "REGISTRY MISSING" \
  $D "s/  if \(registries\.noRegistry\.length > 0\) return 'incomplete'\n//" $R
control "Render: a missing check list is a problem check" "REGISTRY MISSING" \
  $D 's/if \(names\.length\) \{/if (false) {/' $R
control "Render: a review finding's topic is its review" "TOPIC" \
  $D 's/\(side\?\.review \? REVIEW_TOPIC\[side\.review\] : undefined\) \|\| //' $R
control "Render: notes land as given" "DATA — every section" \
  $D "s/  if \(data\.notes\) report\.notes = data\.notes as DayReport\['notes'\]\n//" $R
control "Render: need you = the recommended answer is not the agent's" "CARD — ≤ 25 lines" \
  $D 's/\.filter\(\(i\) => !isAgentWork\(i\)\)\.length/.filter((i) => isAgentWork(i)).length/' $R
control "Render: missing checks read as having no result" "CARD — the first issue line" \
  $D "s/'has' : 'have'\} no result/'has' : 'have'} not run/" $R
control "Render: plurals are right" "plurals are right" \
  $D "s/plural\(view\.issues\.length, 'issue'\)/\`\\\${view.issues.length} issues\`/" $R
control "Render: < > | never reach the terminal" "plurals are right" \
  $D "s/\.replace\(\/\[<>\|\]\/g, ''\)//" $R
control "Render: the card is the only stdout" "PRIVACY — stdout carries only the card" \
  $D 's/say\(`report written \(\$\{report\.state\}\)`\)/io.out(`report written (\${report.state})\\n`)/' $R
control "Render: Park is always offered" "Park, last, never recommended" \
  scripts/day-render.ts 's/  if \(!out\.some\(\(o\) => o\.id === PARK\)\) out\.push\(\{ \.\.\.PARK_OPTION \}\)\n//' "$R"

# Phase C: Start fixing launch (rule 9), guarded by server/__tests__/day-launch.test.ts.
L=server/__tests__/day-launch.test.ts
control "Launch: only the board's origin" "cross-origin POST is refused" \
  server/day.ts 's/if \(!fromBoard\(req\)\) return/if (false) return/' "$L"
control "Launch: JSON only" "text/plain POST is refused" \
  server/day.ts 's/if \(!isJson\(req\)\) return res\.status\(415\)\.json\(\{ error: .JSON only. \}\)\n    const body = req\.body as Record/const body = req.body as Record/' "$L"
control "Launch: the body names the run and nothing else" "carrying prompt text" \
  server/day.ts "s/if \(keys\.length !== 1 \|\| keys\[0\] !== 'run_id' \|\| /if (/" "$L"
control "Launch: at most one a minute" "within a minute does not launch" \
  server/day.ts 's/now\.getTime\(\) - Date\.parse\(l\.at\) < LAUNCH_EVERY_MS/false/' "$L"
control "Launch: after a send only changes go out" "only what changed goes out" \
  server/day.ts 's/const c = collect\(view, sent\.items, ledger\)/const c = collect(view, new Set(), ledger)/' "$L"
control "Launch: a failed launch is recorded as failed and cleaned up" "failed launch records nothing" \
  server/day.ts 's/        cleanup\(\)\n        await appendLine/        await appendLine/' "$L"
control "Launch: the send is reserved before spawning" "reserved \\(pending\\) BEFORE" \
  server/day.ts "s/      await appendLine\(dir, \{ \.\.\.base, state: 'pending'[^\n]*\n//" "$L"
control "Launch: no acknowledgement, no send" "never started Claude is not a send" \
  server/day.ts 's/if \(result\.ok && !\(await waitForAck\(f\.ack, ackWaitMs\(\)\)\)\) result = \{ ok: false \}//' "$L"
control "Launch: irreversible actions need a yes" "carries the safety rules" \
  src/lib/day.ts "s/    'Anything that cannot be undone[^\n]*\n//" "$L"
control "Launch: only the latest run" "only the latest run can be launched" \
  server/day.ts 's/if \(body\.run_id !== latest\.report\.pass_id && body\.run_id !== latest\.id\) \{\n        return res\.status\(409\)/if (false) {\n        return res.status(409)/' "$L"
control "Launch: sent lines are not decisions" "sent lines are not decisions" \
  src/lib/day.ts "s/      if \(o\.kind === 'sent'\) continue\n//" "$L"

# Phase D (founder review round, 2026-10-06): each rule below is broken in the throwaway copy and the
# test that guards it must go red. day.test.ts unless a test file is named.
P=server/__tests__/day-pipeline.test.ts
H=server/__tests__/day-reflection-history.test.ts
L=server/__tests__/day-launch.test.ts
# 1. one custom option
control "Phase D: a trailing ? makes a custom reply a question" "a reply ending in" \
  src/lib/day.ts 's/\.trim\(\)\.endsWith\(.\?.\)/.trim().endsWith("!")/'
control "Phase D: old Ask / Other lines read as the one custom option" "old Ask / Other still read" \
  src/lib/day.ts 's/option_id: OWN, text, is_question/option_id: d.option_id, text, is_question/'
control "Phase D: custom questions go first in the prompt" "the prompt puts questions first and the other custom" \
  src/lib/day.ts 's/const questions = c\.issues\.filter\(\(x\) => x\.option_id === OWN && x\.is_question\)/const questions: typeof c.issues = []/'
# 2. fit, risk, cause
control "Phase D: the prompt carries Fit and the main risk" "the prompt carries" \
  src/lib/day.ts 's/  if \(rating\.length\) out\.push\([^\n]*\n//'
control "Phase D: a risk is one line of at most 200 characters" "risk is read as one trimmed line" \
  src/lib/day.ts 's/return s \? s\.slice\(0, max\) : undefined/return s || undefined/'
control "Phase D: a sidecar's fit is read as the confidence" "a sidecar carries a one-line risk" \
  scripts/day-render.ts 's/\[o\.confidence, o\.fit\]/[o.confidence]/' "$R"
# 3. what Start fixing sends (1B): the OLD collect sent every preselected issue
control "Phase D 1B: the old collect (every preselected issue) is caught" "1B — collect sends" \
  src/lib/day.ts 's/\(x\.written \|\| isAgentWork\(x\.issue\)\) && //'
control "Phase D 1B: Start fixing does not send an unopened founder choice" "1B — Start fixing sends agent work" \
  src/lib/day.ts 's/\(x\.written \|\| isAgentWork\(x\.issue\)\) && //' "$L"
control "Phase D 1B: the run, the prompt and the count follow collect" "1B — the run, the prompt" \
  src/lib/day.ts 's/\(x\.written \|\| isAgentWork\(x\.issue\)\) && //'
control "Phase D 1B: only accepted cards and agent work are written on Start" "pendingPreselected writes agent work" \
  src/lib/day.ts 's/\(accepted\.has\(i\.fp\) \|\| isAgentWork\(i\)\)/true/'
control "Phase D 1B: an answered card is not still yours" "stillYours lists" \
  src/lib/day.ts 's/!i\.decision && !isAgentWork\(i\)/!isAgentWork(i)/'
control "Phase D 1B: the card counts the agent-work split" "CARD — ≤ 25 lines" \
  $D 's/    agentWork && `\$\{agentWork\} an agent can fix`,\n//' $R
# 4. readings link to notes
control "Phase D: a reading's note link must be ID-shaped" "a reading keeps its note id" \
  src/lib/day.ts 's/typeof note === .string. && ID\.test\(note\)/typeof note === "string"/'
# 5. subscriptions history
control "Phase D: quota history has a lower bound (the previous window is out)" "window — " \
  src/lib/day.ts 's/t < resets - WEEK \|\| t > end/t > end/'
control "Phase D: quota history has an upper bound (a later run is out)" "window — " \
  src/lib/day.ts 's/t < resets - WEEK \|\| t > end/t < resets - WEEK/'
control "Phase D: an uncollected quota has no history" "uncollected quotas and readings are skipped" \
  src/lib/day.ts 's/!q\.collected \|\| //'
control "Phase D: the run route carries the quota history" "SUBSCRIPTIONS" \
  server/day.ts 's/        quotaHistory: quotaHistory\([^\n]*\n//'
# 6. plain-language overlay
control "Phase D: the overlay becomes the displayed text" "the overlay becomes the displayed" \
  $D 's/    if \(r\) overlay\(i, r\)/    if (false) overlay(i, r)/' $R
control "Phase D: the original wording is kept in technical" "the overlay becomes the displayed" \
  $D 's/    i\.technical = \{[^\n]*\n//' $R
control "Phase D: an overlay row for an unknown fp is counted" "ignored and counted" \
  $D 's/unmatched: byFp\.size - used\.size - rejected\.size/unmatched: 0/' $R
control "Phase D: a plain row for changed wording is not applied" "PLAIN guard" \
  $D 's/  if \(r\.src !== srcOf\(o\)\) return false/  if (false) return false/' $R
control "Phase D: a plain row may not add a number" "PLAIN guard" \
  $D 's/\.every\(\(n\) => known\.has\(n\)\)/.every(() => true)/' $R
control "Phase D: a malformed overlay is a problem check" "a malformed overlay is a day.data.plain" \
  $D 's/    case .plain.:\n      return readPlain\(v\) !== null/    case "plain":\n      return true/' $R
control "Phase D: the overlay's length limits hold" "a malformed overlay is a day.data.plain" \
  $D 's/PLAIN_TITLE_MAX = 120/PLAIN_TITLE_MAX = 1200/' $R
control "Phase D: a check nobody wrote up takes the overlay too" "a check nobody wrote up is a card" \
  $D 's/if \(unwritten\.length\) \{/if (false) {/' $R
control "Phase D: --phase issues writes nothing" "phase issues prints" \
  $D 's/    return 0\n  \}\n  const \{ report, plainUnmatched, plainRejected \}/  }\n  const { report, plainUnmatched, plainRejected }/' $R
control "Phase D: --phase issues shows the producer's own words" "phase issues prints" \
  $D 's/    dataFiles\.delete\(.plain.\)\n//' $R
control "Phase D: --phase issues cuts the evidence to 600" "phase issues cuts" \
  $D 's/MAX_EVIDENCE_FOR_PLAIN_PASS = 600/MAX_EVIDENCE_FOR_PLAIN_PASS = 6000/' $R
control "Phase D: a cloud key keeps its why, cut to 120" "KEYWHY" \
  src/lib/day.ts 's/const line = oneLine\(why, MAX_KEY_WHY\)/const line = typeof why === "string" ? why : undefined/'
control "Phase D: --phase issues needs no other arguments" "bare runbook invocation" \
  scripts/day-render.ts 's/    ledger: join\(homedir\(\), .\.claude-day-ledger.\),/    ledger: join(homedir(), ".claude-day-ledger-x"),/' "$R"
Q=server/__tests__/day-quota.test.ts
control "Phase D: resets merge only within two hours" "RESETS — two resets within 2 hours" \
  src/components/day/quota.ts 's/l\.resetsAt - g\[0\]\.resetsAt <= MERGE_RESETS_MS/true/' "$Q"
control "Phase D: a merged reset names each time when they differ" "the merged label names each time" \
  src/components/day/quota.ts 's/  if \(sameDay\) return/  if (false) return/' "$Q"
control "Phase D: the technical detail needs a material difference" "Technical detail only" \
  src/lib/day.ts 's/  return novel \? t : null/  return t/'
control "Phase D: a new id, path or number shows the technical detail" "an id, a path or a number" \
  src/lib/day.ts 's/  const novel = specifics/  const novel = false \&\& specifics/'
control "Phase D: the prompt carries the original wording" "original wording" \
  src/lib/day.ts 's/=> i\.technical \?\? \{ title: i\.title/=> undefined ?? { title: i.title/'
control "Phase D: a Phase C send is not repeated" "a Phase C send is not repeated" \
  src/lib/day.ts 's/\(raw !== undefined && raw !== x\.option_id/(false \&\& raw !== x.option_id/'
C=src/lib/__tests__/columnColours.test.ts
control "Phase D: Blocked keeps its own red pill" "COLOURS" \
  src/lib/columnColours.ts 's/\[COLUMN_COLOURS\.red\]: \{ bg: .var\(--status-red-bg\).,/[COLUMN_COLOURS.red]: { bg: "var(--status-yellow-bg)",/' "$C"
control "Phase D: Qualified is not amber" "COLOURS" \
  src/components/PipelinePage.tsx "s/color: '#64748b'/color: '#f59e0b'/" "$C"
# 7. the pipeline funnel
control "Phase D: the pipeline folder is found from any working directory" "the repo root is still found" \
  scripts/day-pipeline.ts 's/process\.env\.KANBAN_PROJECT_ROOT \?\? mainCheckoutRoot\(\)/process.env.KANBAN_PROJECT_ROOT ?? join(process.cwd(), "..", "..")/' "$P"
control "Phase D: an opposite angle is not a repeat" "opposite angle" \
  scripts/day-reflection-history.ts 's/  if \(pa\.size !== pb\.size \|\| \[\.\.\.pa\]\.some\(\(w\) => !pb\.has\(w\)\)\) return 0\n//' "$H"
control "Phase D: closed is not a funnel column" "counts each Pipeline column" \
  scripts/day-pipeline.ts "s/if \(o\.stage !== 'closed'\) counts/if (true) counts/" "$P"
control "Phase D: no or unknown stage counts as unknown, not a real column" "counts each Pipeline column" \
  scripts/day-pipeline.ts "s/\(s as Stage\) : 'unknown'/(s as Stage) : 'contacted'/" "$P"
control "Phase D: an unparseable file is counted, never dropped" "counted as unknown, never dropped" \
  scripts/day-pipeline.ts "s/      out\.push\(\{ stage: 'unknown', name: id, why: [^\n]*\n//" "$P"
control "Pipeline summary: booked is committed or active" "booked = committed" \
  scripts/day-pipeline.ts "s/\['committed', 'active'\]/['active']/" "$P"
control "Pipeline summary: contacted is not a conversation" "unanswered outreach is not a conversation" \
  scripts/day-pipeline.ts "s/\['in-conversation', 'qualified', 'committed', 'active'\]/['contacted', 'in-conversation', 'qualified', 'committed', 'active']/" "$P"
control "Pipeline summary: the board-note line carries no name" "only the detail line may name" \
  scripts/day-pipeline.ts 's/overdue\(opps, today\)\.length\}/overdue(opps, today).map((o) => o.name).join()}/' "$P"
control "Pipeline summary: a filename cannot break the line" "cannot break the one-line contract" \
  scripts/day-pipeline.ts "s/const id = oneLine\(n\.slice\(0, -3\)\)/const id = (n.slice(0, -3))/" "$P"
control "Pipeline summary: target is read from goals.md" "target from goals.md" \
  scripts/day-pipeline.ts "s/m \? Number\(m\[1\]\) : null/m ? 5 : null/" "$P"
control "Pipeline summary: booked and closed are not overdue" "overdue lists open" \
  scripts/day-pipeline.ts "s/o\.stage !== 'closed' && !\(BOOKED as readonly string\[\]\)\.includes\(o\.stage\) && o\.next_date/o.next_date/" "$P"
control "Phase D: a missing folder is none, not zeros" "empty folder is real zeros" \
  scripts/day-pipeline.ts "s/if \(\(err as NodeJS\.ErrnoException\)\.code === 'ENOENT'\) return null/if ((err as NodeJS.ErrnoException).code === 'ENOENT') names = []; else/" "$P"
control "Pipeline summary: an unreadable folder throws, never reads as none" "cannot be read throws" \
  scripts/day-pipeline.ts "s/    throw err\n  \}/    return null\n  }/" "$P"
# 8. reflection memory
control "Phase D: a near-identical statement is a repeat (threshold disabled)" "Jaccard of the word sets" \
  scripts/day-reflection-history.ts 's/const REPEAT_JACCARD = 0\.8/const REPEAT_JACCARD = 2/' "$H"
control "Phase D: a different statement is not a repeat (threshold too low)" "below 0.8 passes" \
  scripts/day-reflection-history.ts 's/const REPEAT_JACCARD = 0\.8/const REPEAT_JACCARD = 0.1/' "$H"
control "Phase D: only an answered statement counts as a repeat" "only an ANSWERED statement" \
  scripts/day-reflection-history.ts 's/\.filter\(\(p\) => p\.position !== undefined\)//' "$H"
control "Phase D: the window bounds what the agent remembers" "only the window" \
  scripts/day-reflection-history.ts 's/started < start \|\| started > end/started > end/' "$H"
control "Phase D: an answer belongs to its own run" "scoped to their run" \
  scripts/day-reflection-history.ts 's/ && d\.run_id === r\.passId//' "$H"

# Rule 10: plant a product import in the board and require the guard to fire.
fresh
printf "import { createClient } from '@supabase/supabase-js'\nexport const probe = createClient\n" >"$WORK/k/src/lib/__probe.ts"
if run_test "imports no product code"; then echo "MISSED          Rule 10: product import guard"; fails=$((fails + 1)); else echo "RED as expected Rule 10: product import guard"; fi

# The unbroken copy must be green.
fresh
if run_test ""; then echo "GREEN           unmodified copy: all day tests pass"; else echo "UNEXPECTED RED  unmodified copy"; tail -30 "$WORK/out.txt"; fails=$((fails + 1)); fi
if run_test "" "$R"; then echo "GREEN           unmodified copy: all day-render tests pass"; else echo "UNEXPECTED RED  unmodified copy (day-render)"; tail -30 "$WORK/out.txt"; fails=$((fails + 1)); fi
for f in server/__tests__/day-launch.test.ts server/__tests__/day-pipeline.test.ts server/__tests__/day-reflection-history.test.ts; do
  if run_test "" "$f"; then echo "GREEN           unmodified copy: $f passes"; else echo "UNEXPECTED RED  unmodified copy ($f)"; tail -30 "$WORK/out.txt"; fails=$((fails + 1)); fi
done

echo
if [ "$fails" -eq 0 ]; then echo "All controls fired."; exit 0; fi
echo "$fails control(s) did not behave."; exit 1
