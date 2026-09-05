---
status: week
type: bug
rank: 1000074
severity: medium
date_reported: '2026-09-05'
created_date: '2026-09-05'
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [e2e, test-isolation, pledgers, shared-state]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1253: `e2e/pledgers-page.spec.ts` is coupled to shared test-DB state

## Summary

`e2e/pledgers-page.spec.ts` violates the shared-table isolation pattern this repo already
documents (`docs/technical/e2e-testing-guide.md`, P1083) in three concrete ways, and P1229's
desktop pagination narrowed the window that was hiding one of them.

## Root Cause

Three distinct couplings, all in one file:

1. **Module-level fixture array + generic `afterEach`.** The file keeps `let testUsers: TestUser[]`
   at describe scope, seeded in `beforeEach` and torn down in `afterEach`. The e2e guide names this
   exact shape as the thing not to do: *"never a shared module-level array plus a generic
   `afterEach` (that reintroduces the same race once tests in one file run in parallel: one test's
   cleanup can delete another still-running test's not-yet-used row)"*. Today the file is held
   together only by `test.describe.configure({ mode: 'serial' })`; remove that line, or add a
   second worker, and the cleanup races the seeding.

2. **An exact-count assertion against a table other tests write to.** `expect(count).toBe(20)` on
   the carousel dots. The guide's rule is *"assert floors (`toBeGreaterThanOrEqual`), not exact
   counts, against a table other tests can also be touching"*. This one is defensible — 20 is
   `MAX_MOBILE_CAROUSEL`, a cap, not a population count — but it reads as a population assertion
   and should say what it means.

3. **Dead seeding in the empty-state test.** P1229 rewrote that test to stub the
   `get_pledgers_page` RPC, so it no longer reads the database at all — but it still inherits the
   `beforeEach` that creates 25 real users and the `afterEach` that deletes them. That is ~50 real
   Supabase writes per run that nothing reads, and it is the largest single contributor to the
   orphan `Test Pledger N` rows that accumulate whenever a run is interrupted.

**What P1229 changed.** Before P1229, `/pledgers` fetched the entire verified set, so stray rows
from other runs could never push the seeded fixture out of view. The page now renders one page of
30, ordered reason-first then newest-first. All 25 seeded users carry a non-empty `reason` and are
newest, so they win that ordering today — but if accumulated pollution ever includes 6+ other
reason-bearing profiles created after these tests were written, seeded users fall past the page-1
boundary and the assertions go flaky through no fault of the test.

**Not reproduced as flake yet.** Four consecutive full runs of the file are green (9 passed / 0
failed / 0 flaky, exit 0). This is a latent coupling with a named mechanism, not an observed
intermittent failure. Filed because the mechanism is understood now and will not be later.

## Invariants

- **A test asserting a global property of a shared table is unsound regardless of how it is
  cleaned up.** P1229 already hit this: the empty-state test asserted "no verified pledger exists
  anywhere", passed on one run and failed on the next, with the only difference being orphans the
  first run itself left behind. The fix was to stop reading the table, not to clean it harder.
  Deleting orphan rows buys one green run, never a green test.
- **Seeded fixture rows must not be assumed to land on page 1.** Any assertion that depends on
  seeing a specific seeded row must either target it by a unique per-run identifier or tolerate it
  being paginated out.

## Reproduction Steps

The isolation defects are structural and read directly off the file; the race requires forcing the
conditions the `serial` guard currently prevents.

1. Open `e2e/pledgers-page.spec.ts`.
2. Observe `let testUsers: TestUser[] = []` at describe scope, written by `beforeEach` and consumed
   by `afterEach` (the shape the e2e guide names as the anti-pattern).
3. Remove `test.describe.configure({ mode: 'serial' })` from the describe block.
4. Run `npx playwright test e2e/pledgers-page.spec.ts`.
5. Observe: with tests in the file running in parallel, one test's `afterEach` deletes users a
   concurrently-running test is still asserting on.

For defect 3, no removal is needed:

1. Run `npx playwright test e2e/pledgers-page.spec.ts -g "Empty state"`.
2. Observe the `[TEST HELPER] Test user created/deleted` log lines — 25 creates and 25 deletes for
   a test whose data source is a `page.route` stub.

**Reproduction rate:** structural (defects 1-3), 100%. The page-1 pagination race: not currently
reproducible — requires 6+ reason-bearing pollution rows newer than the fixture.

## Expected Behavior

- Each test tracks and deletes only the ids it created, in a per-test-local array via `try/finally`.
- The file's isolation does not depend on `serial` mode to be correct — `serial` may stay as
  defence in depth, but removing it must not introduce a cleanup race.
- The empty-state test does no database work, since it reads no database data.
- Count assertions against the shared table are floors, or are commented to say they assert a cap
  rather than a population.

## Actual Behavior

- Cleanup correctness rests entirely on `serial` mode; the file would race without it.
- The empty-state test performs ~50 real Supabase writes it never reads, and leaves orphan rows
  behind on any interrupted run.
- `expect(count).toBe(20)` reads as a population assertion against a table other suites write to.

## Affected Files

- `e2e/pledgers-page.spec.ts` — describe-scope `testUsers` array; `beforeEach` seeding; `afterEach`
  teardown; the empty-state test that no longer needs either; the `toBe(20)` dot assertion.
- `docs/technical/e2e-testing-guide.md` — the P1083 pattern this file should follow (reference
  only; no change expected).

## Severity

**Medium** — no user-facing impact and the suite is currently green; the cost is a test that can go
flaky under conditions that are getting more likely, plus real test-database pollution on every run.

## Fix Approach

Follow the P1083 pattern already documented in `docs/technical/e2e-testing-guide.md` — do not
invent a new one:

1. Move the empty-state test out of the seeding `describe`, or give it its own describe with no
   `beforeEach`. It stubs the RPC and needs no rows.
2. Replace the module-level `testUsers` array with per-test-local tracking in `try/finally`, so a
   test only ever deletes ids it created itself.
3. Change `expect(count).toBe(20)` to assert the cap explicitly — either keep the exact value with
   a comment stating it is `MAX_MOBILE_CAROUSEL` and independent of table population, or assert
   `toBeLessThanOrEqual(20)` alongside a floor.
4. Where a test must see a seeded row, seed with a per-run unique prefix and assert on that, so the
   assertion cannot be satisfied by, or defeated by, another run's rows.

**Not in scope, and deliberately so:** deleting the existing orphan `Test Pledger N` rows from the
shared test project. That is a `DELETE` on shared state other sessions may be mid-run against, it
is the founder's call under `.claude/rules/db-access.md`, and per the invariant above it does not
fix this bug.

## Acceptance Criteria

- [ ] `e2e/pledgers-page.spec.ts` passes with `test.describe.configure({ mode: 'serial' })` removed,
      on three consecutive runs (proving cleanup no longer depends on serialization)
- [ ] `serial` mode restored afterwards if desired as defence in depth, and the file still green
- [ ] Running only the empty-state test produces zero `[TEST HELPER] Test user created` lines
- [ ] No test in the file deletes a user id it did not itself create
- [ ] The dot-count assertion states whether it asserts a cap or a population
- [ ] Full file green: 9 passed / 0 failed / 0 flaky, exit 0, on three consecutive runs
- [ ] `npx vitest run` and `./scripts/pre-commit-checks.sh` green
