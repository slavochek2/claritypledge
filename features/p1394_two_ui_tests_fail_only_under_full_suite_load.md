---
status: week
type: bug
rank: 19
severity: low
date_reported: '2026-10-02'
created_date: '2026-10-02'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [flaky-test, pre-commit, vitest]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1394: Two UI tests fail only under full-suite load, blocking unrelated commits

## Summary

During the P1347 ship (2026-10-02), the pre-commit full test run failed twice on tests unrelated to the change, each passing on its own immediately afterwards: `src/tests/p1364-list-return-cache.test.tsx` ("POP serves the cached list on the same tab with no refetch": expected the fetch mock called 1 time, got 2) and `src/tests/p1366-card-footer.test.tsx` ("menu → Share → close the sheet, twice: … <body> is never left inert").

## Root Cause

Under investigation. Both pass in isolation (21/21 and 57/57), so the failure depends on load or ordering, not on the P1347 diff. Hypotheses: a timing-sensitive wait (fake timers or animation/transition timing) that loses under CPU contention from parallel workers, or shared module state leaking between files.

## Reproduction Steps

1. On main, run the full suite the way pre-commit does (`./scripts/pre-commit-checks.sh`, or `npm test`) while the machine is busy (other suites or builds running).
2. Repeat several times.
3. Observe: occasionally one of the two tests above fails.

**Reproduction rate:** intermittent (2 of roughly 10 full runs in one session).

## Expected Behavior

Both tests pass on every full-suite run, regardless of machine load.

## Actual Behavior

Intermittent failures block unrelated commits and cherry-picks (each blocked step re-runs the suite for several minutes).

## Affected Files

- `src/tests/p1364-list-return-cache.test.tsx` — refetch-count assertion
- `src/tests/p1366-card-footer.test.tsx` — Share sheet / inert-body sequence

## Severity

**Low** — no user impact; slows and blocks commits.

## Fix Approach

Reproduce under load first (for example `npx vitest run --repeat 20` on the two files together with a busy CPU, or the full suite in a loop), then replace time-dependent waits with state-based `waitFor` conditions and reset any shared module state between tests.

## Acceptance Criteria

- [ ] Each test passes 20 consecutive full-suite runs under load
- [ ] Neither test is skipped or loosened to get there (fix the timing, not the assertion)
