---
status: week
type: bug
rank: 1000967.0
severity: medium
date_reported: '2026-08-10'
created_date: '2026-08-10'
tags: [testing, playwright, e2e, coverage-rot]
pipeline_ran: [create-bug]
---

# P1043: Repair E2E tests that rotted while the full suite was uncollectable

## Summary

E2E tests have been failing for months against assertions that no longer match the shipped app or
schema — invisible because a single invalid fixture parameter made `npx playwright test` (no path
filter) abort collection for the entire suite until P1033 fixed it on 2026-08-10.

## Root Cause

P1033: `e2e/p591-story-supporting-images.spec.ts:358` destructured an unknown Playwright fixture
(`_page`), and Playwright validates fixture signatures at collection time — before `.skip()` is
applied — so one bad parameter aborted collection for all 401 spec files. Any unfiltered
full-suite run exited 1 with zero tests executed, locally and in CI.

The consequence is not the crash itself (P1033 fixed that) but what the crash concealed: for as
long as it was in place, **no run existed that would have flagged a rotted test**. Path-filtered
runs still worked, so tests kept passing in the narrow slices people happened to run, while
untouched files drifted out of sync with the app and the schema unnoticed.

Two instances were found by accident on 2026-08-10 while verifying an unrelated RLS fix (P1034),
from a 9-file slice — not from a systematic sweep. That sample rate suggests more.

## Known instances

**1. `e2e/integration/p425-stories-rls.spec.ts:373` — asserts an insert that cannot succeed.**

```ts
const { error } = await ownerClient
  .from('story_points')
  .insert({ story_id: storyId, point_id: pointId });   // no author_id
expect(error, `Story owner should be able to link their story to a point`).toBeNull();
```

`story_points.author_id` is `NOT NULL` with no column default, and no `BEFORE INSERT` trigger
populates it (the only one, `enforce_story_point_visibility_constraint`, checks visibility). A
service-role probe with RLS bypassed returns SQLSTATE **23502** — not-null violation. The test has
been impossible to pass since P465 added the column on 2026-03-01. The sibling test at `:393`
("non-owner cannot link") uses the same incomplete insert and therefore passes for the wrong
reason — it expects an error and gets one, but from the not-null constraint rather than from RLS.
That is the more dangerous half: a security assertion that is green while proving nothing.

**2. `e2e/p486-create-with-point.spec.ts` — asserts UI copy that no longer ships.**

Expects heading `Create a Story` (the page renders "Share a Story") and button `Publish Story`
(the app renders "Publish Public Story", `src/app/pages/create-story-page.tsx:433`, renamed in
`790675b8`). 6 of 15 tests fail, all timing out before any DB write. This is what blocked
browser-level verification of P1034's UI acceptance criteria.

## Reproduction Steps

1. From repo root on `main` (P1033's fix present): `npx playwright test --reporter=line`
2. Observe collection now succeeds (2730 tests in 401 files) and the run surfaces failures
3. Inspect failures for assertions that contradict current source or schema, as opposed to genuine
   regressions

**Reproduction rate:** 100% for the two instances above.

## Expected Behavior

Every test in the suite either passes, is explicitly `.skip()`'d with a reason, or reports a
genuine product regression. No test asserts behavior the app stopped having months ago, and no
security test passes for a reason unrelated to what it claims to verify.

## Actual Behavior

An unknown number of specs assert stale copy, stale schema expectations, or pass for the wrong
reason. Two are confirmed; the population is unmeasured because no full-suite run has completed yet.

## Affected Files

- `e2e/integration/p425-stories-rls.spec.ts:373, :393` — insert missing `author_id`
- `e2e/p486-create-with-point.spec.ts` — stale heading and button copy
- Remainder: **unknown until a full unfiltered suite run completes** — that run is the first task
  of this spec, not a precondition filed elsewhere

## Severity

**Medium** — no user-facing impact; the product is unaffected. It is not **low** because instance 1
is an RLS ownership test in a security-relevant area that currently provides false assurance, and
because the rot blocks browser-level verification for unrelated fixes (it already did so for
P1034).

## Fix Approach

1. Run the full unfiltered suite (now possible for the first time since P1033) and capture results
   to a log. Run it when concurrent sessions are idle — two suites against the shared test DB
   produce auth `Request rate limit reached` failures that read as regressions but are contention.
2. Triage every failure into: (a) rotted assertion, (b) genuine product regression, (c) shared-DB
   data drift / fixture collision, (d) contention artifact.
3. Fix (a) by correcting the assertion to match shipped behavior — for `p425` that means supplying
   `author_id`, which also restores the test's ability to actually exercise the RLS predicate.
4. File (b) separately as product bugs — do not fix them under this spec.
5. For (c), note whether the test depends on global DB state (e.g. `p586-visibility-privacy.spec.ts:146`
   asserts *every* point is public) and make it scope its own fixtures.

Test edits here are legitimate under `.claude/rules/tests.md` because the tests are stale relative
to deliberately shipped behavior — not because they are inconvenient. Each edit must name the
commit or migration that moved the goalposts.

## Acceptance Criteria

- [ ] A full unfiltered `npx playwright test` run completes and its results are recorded in this
      spec, with each failure classified (a)/(b)/(c)/(d)
- [ ] `e2e/integration/p425-stories-rls.spec.ts:373` passes, and `:393` is confirmed to fail when
      the RLS predicate is removed — proving it now tests RLS rather than the not-null constraint
- [ ] `e2e/p486-create-with-point.spec.ts` runs the full create-with-point flow to a published
      story with no stale-copy timeouts
- [ ] Every genuine product regression found is filed with its own P-number and listed here
- [ ] No test is edited without naming the commit or migration that made its assertion stale
