---
status: qa
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
delivery_stage: ship
pipeline_ran: [create-bug, dev, ship]
---

# P1394: Two UI tests fail only under full-suite load, blocking unrelated commits

## Summary

During the P1347 ship (2026-10-02), the pre-commit full test run failed twice on tests unrelated to the change, each passing on its own immediately afterwards: `src/tests/p1364-list-return-cache.test.tsx` ("POP serves the cached list on the same tab with no refetch": expected the fetch mock called 1 time, got 2) and `src/tests/p1366-card-footer.test.tsx` ("menu → Share → close the sheet, twice: … <body> is never left inert").

## Root Cause

Two different causes (reproduced under concurrent load during /dev). Neither is a product race, and no shared module state was involved.

- **p1364 stake POP test: a race in the test.** It failed on `getPointsForStories` (line 301, 1 expected, 2 actual), not on the list fetch. The rows render before the story's linked-points request answers. The test navigated away as soon as the rows were visible. When load delayed that answer past the navigation, the unmount dropped it, the cache held no links, and Back fetched them again. That second fetch is correct product behaviour: the cache holds what the reader left with (P1364). Reproduced every time by delaying the link answer 50ms. Fix: the story-card stub exposes `data-linked`, and the test waits for the footer before leaving, the same way the /feed version of the test already did. It also now asserts the footer comes back on POP.
- **p1366 "twice" test (also p1270, which INBOX-124 names, and p1296's share tests): CPU time against a fixed timeout.** Timing each step showed every wait resolving immediately. The time goes into user-event clicks through Radix and into the full profile-page render in jsdom. Under load that ran past Vitest's 5s test timeout (p1366, p1296) or RTL's 1s `findBy` default (p1270, which was still showing the skeleton). There is no timer to fake. The fix sets named, commented bounds (15s per test, 5s for the profile render), which only stop a hung test. Checked: a missing button still fails with RTL's DOM dump. Two more tests had the same cause and got measured per-test bounds. `p1424-nested-details-only`'s Tab walk takes up to 40 user-event presses, median 3-4s under load, and failed once in 48 loaded runs. `jsx-comment-leak` parses every .tsx with the TypeScript compiler: 0.5s on a quiet machine, a median of about 6s under load and a maximum of 8.7s. It failed in 35 of 48 loaded runs.

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

- [x] Each test passes 20 consecutive full-suite runs under load. Evidence (/dev): 20 full `vitest run` suites, 4 at a time, load average 100-160. Both named tests passed 20/20, and every test in the four touched files passed (p1364 420/420, p1366 1140/1140, p1270 80/80, p1296 460/460). Before the fix, 6 runs at lower load had 8 failures in these files (p1270 4, p1366 twice-test 3, p1364 stake POP 1).
- [x] Neither test is skipped or loosened to get there (fix the timing, not the assertion). Evidence: no assertion was removed or changed, and there is no skip and no retry. The p1364 stake test gained two waits/asserts on the links footer. The CPU-bound tests only got named hang bounds. A control with a missing button still fails with RTL's DOM dump after 5s.
