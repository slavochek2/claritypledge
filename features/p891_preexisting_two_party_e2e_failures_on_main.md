---
status: week
type: bug
rank: 1000781
severity: medium
workstream: C1
date_reported: '2026-06-04'
created_date: '2026-06-04'
tags: [e2e, live, test-debt, two-party]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P891: 8 pre-existing two-party /live e2e failures on main (p398 / p525 / p562 suites)

## Summary

Three two-party /live e2e suites fail on main — 8 tests total across `e2e/p398-session-history-summary.spec.ts` (3), `e2e/p525-celebration-race.spec.ts` (2), `e2e/p562-free-mode.spec.ts` (3) — confirmed identical failures on main and on `feature/p879-free-mode-rounds-not-recorded` during the P879 blast-radius check.

## Root Cause

Under investigation. Symptom sample: `expect(locator).toBeVisible() failed — element(s) not found`. The failures span three suites that all exercise the celebration / free-mode / session-history screens, suggesting a shared cause: UI drift in those screens (copy, structure, or selector changes shipped without updating these older suites) or drift in the two-party flow helpers (`e2e/helpers/test-session.ts`, `test-realtime.ts`). Not caused by P879 — the same 8 tests fail on main without the fix.

## Reproduction Steps

1. Check out `main` in a clean worktree.
2. Run: `npx playwright test e2e/p562-free-mode.spec.ts e2e/p525-celebration-race.spec.ts e2e/p398-session-history-summary.spec.ts`
3. Observe: 8 of 9 tests fail with element-not-found assertion errors.

**Reproduction rate:** 100% (reproduced twice on 2026-06-04: once from `feature/p879-*` worktree, once from main).

## Expected Behavior

All three suites pass on main — they are regression coverage for celebration race (P525), free-mode flow (P562), and session-history summary (P398).

## Actual Behavior

8 tests fail with `expect(locator).toBeVisible()` / `element(s) not found`. Failing tests include:
- p398: round summary opens → Back restores idle; partner starts a new round; skipped round entry has no chevron
- p525: both users clicking Continue → both advance; skip clears selectedStoryData
- p562: full free-mode round flow; sealed bids hidden until both submit; 10/10 auto-completes to success

## Affected Files

- `e2e/p398-session-history-summary.spec.ts` — 3 failing tests
- `e2e/p525-celebration-race.spec.ts` — 2 failing tests
- `e2e/p562-free-mode.spec.ts` — 3 failing tests
- Suspected: UI components for celebration/free-mode/round-summary screens, or `e2e/helpers/test-session.ts` / `test-realtime.ts`

## Severity

**Medium** — no user-facing breakage, but 8 dead regression tests mean the celebration/free-mode/session-history surfaces are unprotected, and every future branch inherits red tests that mask new failures.

## Fix Approach

Run one failing test headed (`--headed --debug`) to see which screen diverges from the selector. Classify: (a) UI drift → update selectors/assertions to current UI per tests-are-specs rules (with user approval, since assertions change), or (b) genuine product regression → file/fix the product bug. Check `git log` on the affected screens since the suites last passed to find the drift commit.

## Acceptance Criteria

- [ ] `npx playwright test e2e/p398-session-history-summary.spec.ts e2e/p525-celebration-race.spec.ts e2e/p562-free-mode.spec.ts` passes on main (9/9)
- [ ] Each previously failing test's cause is classified (UI drift vs product regression) in this spec
- [ ] No console errors during the affected flows
