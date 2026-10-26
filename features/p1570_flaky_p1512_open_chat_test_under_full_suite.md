---
status: qa
type: bug
rank: 74
severity: low
workstream: infra
date_reported: 2026-10-26
created_date: 2026-10-26
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [tests, flaky, pre-commit]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-bug, fix, ship]
---

# P1570: P1512 "Open chat" test times out under the full suite, blocking unrelated commits

## Summary

`src/tests/p1512-org-open-chat.test.tsx:88` (`findByRole('button', { name: 'Open chat' })`) failed during the pre-commit full run (658 files, about 390s) and blocked an unrelated P1565 commit. Run on its own, it passes 9/9.

## Root Cause

Hypothesis, unconfirmed: under full-suite load the page's async loads (members, participation, membership mocks) resolve after `findByRole`'s default 1000ms timeout. That would make this a test-timing defect, not an app defect.

## Reproduction Steps

1. Run `npm test` (full suite) or `./scripts/pre-commit-checks.sh` with any build-affecting file staged.
2. Observe: intermittently, 2 failures in `p1512-org-open-chat.test.tsx` (`Unable to find role="button" name "Open chat"`).
3. `npx vitest run src/tests/p1512-org-open-chat.test.tsx` passes.

**Reproduction rate:** intermittent (1 of 2 full runs on 2026-10-26).

## Expected Behavior

The test passes under full-suite load as reliably as it does on its own, and still fails if the button really is missing.

## Actual Behavior

Pre-commit blocks unrelated commits at random.

## Affected Files

- `src/tests/p1512-org-open-chat.test.tsx`: the `findByRole` waits
- Suspected: the page's loading sequence for the group view (which mocks resolve before the button renders)

## Severity

**Low**: no user impact, but it erodes trust in the commit gate and invites retry-until-green.

## Fix Approach

Find what the button waits on. Await that state deterministically (e.g. wait for the mocked service calls to resolve, or raise the specific `findBy` timeout with a comment explaining why). Never weaken the assertion. Prove it by running the file under CPU contention (e.g. `--pool=threads` with high parallelism, or several copies in parallel) before and after.

## Acceptance Criteria

- [x] Sibling `src/tests/p1512-shell.test.tsx` hit the same 5000ms full-suite timeout (passes 81/81 alone) — systemic fix: global `testTimeout: 15000` in `vite.config.ts`; full pre-commit suite passes

- [x] A stress reproduction that fails before the fix is recorded (command plus failure output)
- [x] The same stress command passes after the fix, 5 runs in a row
- [x] Removing the "Open chat" button from the component still makes the test fail (control)

## Evidence

Root cause (confirmed): the first test of the file renders the page tree cold in a fresh worker (module init, JIT). Under load that exceeded `findByRole`'s 1000ms default; in rare runs also the 5000ms test timeout. Only the first test ("a member sees an outline Open chat...") fails; the page's async loads are not the cause.

Stress command (22 `yes` CPU burners + 8 concurrent `npx vitest run src/tests/p1512-org-open-chat.test.tsx`, 11-core machine):
- Before fix: 8 of 8 runs failed, `TestingLibraryElementError: Unable to find role="button" and name "Open chat"`, `Tests 1 failed | 8 passed (9)`.
- After first fix (findBy 8000ms only): 1 failure in ~20 stress rounds, `Error: Test timed out in 5000ms`. So the 5000ms test timeout also had to be raised.
- Final fix (`findOpenChat` helper with 20000ms, describe timeout 30000ms): 14 consecutive stress rounds (8 runs each), all `Tests 9 passed (9)`, zero FAIL.

Control: renamed the button text to `Open chatX` in `org-header.tsx:243`; test failed with `Unable to find role="button" and name "Open chat"` (after 20s). Component restored; `git diff -- src/app` empty.

`npx vitest run src/tests/p1512-org-open-chat.test.tsx`: 9 passed. `npx tsc --noEmit`: no output (clean).
