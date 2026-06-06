#!/bin/bash
# PreToolUse hook (Bash matcher): block piping live Playwright output to tail/head.
#
# Why: piping the live line/list reporter truncates — tail cuts the per-test
# failure detail, head cuts the failed/flaky summary at the end. Either way the
# session misreads results and re-runs the whole suite (P888, P893 — second
# violation despite .claude/rules/tests.md banning it; this hook is the
# mechanical layer for that rule).
#
# Allowed: tail/head of a LOG FILE (e.g. `tail /tmp/pw.log`) — only a pipe
# directly after a playwright invocation is blocked.

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)

[ -z "$CMD" ] && exit 0

if echo "$CMD" | grep -q 'playwright' && echo "$CMD" | grep -qE '\|[[:space:]]*(tail|head)([[:space:]]|$)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "BLOCKED (.claude/rules/tests.md — Reading Playwright Output): piping live Playwright reporter output to tail/head loses failure detail (tail) or the failed/flaky summary (head), forcing a full re-run. Use instead: npx playwright test ... > /tmp/pw.log 2>&1; grep -E \"[0-9]+ (passed|failed|flaky)\" /tmp/pw.log — then read failure sections from /tmp/pw.log directly (tail/head on the log FILE is fine). For ship/fix decisions use the JSON reporter."
    }
  }'
  exit 0
fi

exit 0
