#!/bin/bash
# Hermetic canary for .claude/hooks/block-pw-tail-pipe.sh (P911 adversarial review).
#
# The hook blocks piping a LIVE Playwright *test run* to head/tail (truncates the
# reporter → misread pass/fail, incident P888). This canary pins its behaviour on both
# sides: real footguns BLOCK, legitimate "mentions playwright" / log-file / vitest /
# canonical-pattern commands PASS. Run manually or wire into CI:
#   bash scripts/test-block-pw-tail-pipe.sh   # exit 0 = all green, 1 = a case regressed
#
# Why a canary: the regex has non-obvious edge cases (truncator trailing boundary,
# `|&`, case, npm wrappers) that an adversarial review surfaced and that are easy to
# silently regress. Epistemic gate #7 — a gate you have not seen FAIL is unproven.

set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Optional arg: path to the hook under test (defaults to the installed one). Lets the
# canary's own failure path be exercised against a deliberately-broken copy.
HOOK="${1:-$ROOT/.claude/hooks/block-pw-tail-pipe.sh}"
FAILURES=0

check() { # $1=expected(BLOCK|PASS) $2=command
  local out rc got
  # BLOCK = deny JSON on stdout OR exit 2. Exit 2 is Claude Code's blocking error: a hook
  # that dies with a bash syntax error exits 2 and blocks EVERY Bash call, which a
  # stdout-only "deny" check would score as PASS.
  out=$(printf '%s' "$2" | jq -Rs '{tool_input:{command:.}}' | bash "$HOOK" 2>/dev/null); rc=$?
  if [[ "$out" == *'"deny"'* || $rc -eq 2 ]]; then got=BLOCK; else got=PASS; fi
  if [ "$got" = "$1" ]; then
    echo "  ok   $got  | $2"
  else
    echo "  FAIL expected $1 got $got | $2"
    FAILURES=$((FAILURES + 1))
  fi
}

echo "== SHOULD BLOCK: real test-run footguns =="
check BLOCK 'npx playwright test e2e/foo.spec.ts | tail'
check BLOCK 'playwright test | head -5'
check BLOCK 'npm run test:e2e | tail'
check BLOCK 'npm run smoke:prod | head'
check BLOCK 'npx playwright test foo | tee /tmp/x.log | tail'

echo "== SHOULD BLOCK: edge-case holes (P911 adversarial review) =="
check BLOCK 'playwright test | tail; echo done'      # ; after pipe — pipe binds tighter, still truncates
check BLOCK 'playwright test | head && echo next'    # && after pipe
check BLOCK 'playwright test | TAIL'                 # case
check BLOCK 'PLAYWRIGHT TEST | tail'                 # case (run word)
check BLOCK 'npm run test:e2e |& tail'               # bash stderr-merge pipe
check BLOCK 'cd e2e && playwright test | tail'       # compound

echo "== SHOULD BLOCK: grouped runs piped as a unit (2026-09-29 statement-split rewrite) =="
check BLOCK '{ npx playwright test; } | tail -5'     # brace group output is the live reporter
check BLOCK '(npx playwright test) | tail'           # subshell, same
check BLOCK 'out=$(npx playwright test | tail)'      # inside command substitution

echo "== SHOULD PASS: mentions / log-file / vitest / canonical pattern =="
check PASS 'cat playwright.config.ts | head -60'
check PASS 'ls -d node_modules/playwright node_modules/@playwright/test | head'
check PASS 'git commit -m "fix: file sits below playwright.config.ts" -- a.ts | tail -15'
check PASS 'grep -niE "(landing|overflow|playwright|baseurl)" docs/decisions.md | head'
check PASS 'npx playwright test e2e/foo.spec.ts > /tmp/pw.log 2>&1'
check PASS 'playwright test > /tmp/pw.log 2>&1 ; grep -E "passed" /tmp/pw.log'
check PASS 'tail /tmp/pw.log'
check PASS 'npm test | tail'                         # vitest, not playwright
check PASS 'ls'                                      # plain command: catches a hook that blocks everything

echo "== SHOULD PASS: measured false positives of the old whole-string AND (2026-09-29) =="
check PASS "pgrep -fl \"playwright test\" | cut -d' ' -f1; lsof -i:9323 | head -1"
check PASS 'npx playwright test e2e/x.spec.ts > /tmp/l.txt 2>&1; grep -n FAIL /tmp/l.txt | head -5'
check PASS 'npx playwright test --reporter=json > r.json; jq .stats r.json | head'   # the repo's own JSON remedy
check PASS $'npx playwright test > /tmp/l.txt 2>&1\ntail -40 /tmp/l.txt'          # newline-separated
check PASS 'npx playwright test > /tmp/l.txt 2>&1 & tail -f /tmp/l.txt'           # & separates statements
check PASS $'cat <<\'EOF\' > notes.md\nnpx playwright test | tail\nEOF'           # heredoc body is text, not a run
check BLOCK $'cat <<EOF > notes.md\nx\nEOF\nnpx playwright test | tail'           # ...but a real run after it is not

echo "== FORMER RESIDUAL, flipped deliberately: trigger text only inside a quoted arg =="
# Pre-2026-09-29 this row was pinned as BLOCK ("known residual" of the whole-string grep).
# Quoted strings are now blanked before matching, so text that merely CONTAINS the run is
# not a run. Trade-off accepted: `bash -c "playwright test | tail"` also passes now.
check PASS "echo 'playwright test | tail' | cat"

echo "---"
if [ "$FAILURES" -eq 0 ]; then
  echo "PASS: all hook cases behave as expected"
  exit 0
else
  echo "FAIL: $FAILURES case(s) regressed — block-pw-tail-pipe.sh behaviour changed"
  exit 1
fi
