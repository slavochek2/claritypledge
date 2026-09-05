---
status: all-done
type: bug
rank: 1000074
severity: medium
date_reported: '2026-09-05'
created_date: '2026-09-05'
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [e2e, test-isolation, pledgers, shared-state]
pipeline_ran: [create-bug, fix]
completed_at: 2026-09-05
---

# P1253: `e2e/pledgers-page.spec.ts` is coupled to shared test-DB state

## Summary

`e2e/pledgers-page.spec.ts` violates the shared-table isolation pattern this repo already
documents (`docs/technical/e2e-testing-guide.md`, P1083) in three concrete ways, and P1229's
desktop pagination narrowed the window that was hiding one of them.

## Root Cause

Three distinct couplings, all in one file:

1. **Seeded rows are tracked only after `Promise.all` resolves, so a partial failure leaks all of
   them.** `beforeEach` did `testUsers = await Promise.all(...25 creates...)`. `Promise.all` rejects
   on the first failure and never yields the successes, so if creation 13 fails — or the run is
   interrupted mid-flight — the 12 rows already written are never assigned to `testUsers`, and
   `afterEach` therefore deletes nothing. **This is the mechanism behind the orphan `Test Pledger N`
   rows accumulating in the shared test project**, and it is the defect with real consequences.

   **Corrected 2026-09-05 — the originally-filed cause was wrong.** This was first written up as
   the module-level-array-plus-generic-`afterEach` race that `docs/technical/e2e-testing-guide.md`
   (P1083) warns about, with the claim that only `test.describe.configure({ mode: 'serial' })` was
   holding the file together. **Measured, that claim is false.** The pre-fix file was run with
   `serial` removed and `--workers=4` (`fullyParallel: true` is set in `playwright.config.ts`, so
   tests within a file genuinely do distribute): **9 passed, exit 0.** Each worker is a separate
   process with its own module instance and runs one test at a time, so two tests never share that
   array concurrently — the race the guide describes is not reachable in this execution model. The
   probe that "proved" the fix was therefore blind: a known-good and a known-bad control both
   passed it. The guide's advice still holds as a shape to prefer; it was not this file's bug.

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

- [x] A mid-seed failure leaves **zero** rows behind. Control probe running both fixture shapes
      against a `createTestUser` that throws on call 13: push-after-`Promise.all` leaves **24 rows**,
      track-as-created leaves **0**.
      **Scope of that guarantee, stated honestly (review finding):** it covers the *creation*-failure
      path only. It does **not** cover a *deletion* failure — teardown wraps each `deleteTestUser`
      in `.catch`, matching the convention at 21 other call sites in `e2e/`, because letting one
      id's network blip reject the `Promise.all` would skip every other id's deletion and produce
      strictly more orphans. And nothing covers a worker crash or SIGKILL, which never runs
      `finally` at all — that gap is identical for every `afterEach`-based cleanup in this repo and
      is not closeable in Node.
- [x] Running only the empty-state test performs **zero** database work: **0** `[TEST HELPER]` lines
      on the fixed file vs **126** on `main`'s version of the same test (5.3s vs 7.5s).
- [x] No test deletes an id it did not itself create — seeding is a per-test Playwright fixture
      whose tracking array is function-local and whose teardown runs in `finally`.
- [x] Seeded rows carry a per-run unique prefix, so rows from another run (or a leftover orphan)
      can neither satisfy nor defeat an assertion.
- [x] No wait depends on one specific seeded row being inside the visible slice. The mobile
      carousel shows only the first 20 of a newest-first page while the 25 fixture rows are created
      concurrently, so any single seeded name had a real chance of being paginated out — the
      original mobile flakes. Waits now assert on visible pledger cards.
- [x] The dot-count assertion states that it asserts a **cap** (`MAX_MOBILE_CAROUSEL`), not a
      population, and is valid regardless of how many rows the shared table holds.
- [x] Full file green: 9 passed / 0 failed / 0 flaky, exit 0, on three consecutive runs.
- [x] `npx tsc --noEmit`, `npx eslint`, `npx vitest run` and `./scripts/pre-commit-checks.sh` green.
- [x] The fixture still activates after unused bindings were aliased to `_seeded` — positive
      control: **175** `[TEST HELPER] Creating test user` lines in a full run (7 seeded tests x 25),
      not 0. A rename that silently disabled seeding would still have passed every assertion, since
      the shared table already holds enough rows.
- [x] **Withdrawn as unmeasurable:** "passes with `serial` removed, proving cleanup no longer
      depends on serialization." Both the fixed file **and** the unfixed control pass that check
      (9 passed, exit 0, `--workers=4`), so it discriminates nothing. Recorded rather than deleted
      because the criterion looked decisive when written. `serial` is kept as defence in depth.

## Post-ship finding (2026-09-05) — the fixture is redundant today, not unnecessary

**Heading and framing corrected after the reviewer's full report arrived.** The first version of
this section was titled "the fixture is not load-bearing" and said the code comment "overstates its
role". That was wrong, and the reviewer's reasoning beats the measurement below on this point: the
fixture's job is to make `toHaveCount(20)` independent of table state, and it does that. If the
shared project ever held fewer than 20 eligible verified+pledged rows, the carousel would render
fewer than 20 dots and the assertion would fail — the fixture's 25 seeds are what guarantee the cap
is actually reached. The probe shows the guarantee is currently *also* satisfied by other rows, i.e.
**redundant right now**, which is not the same as unnecessary. Keep the fixture; the comment stands.

Recorded after `/ship`, because it qualifies a claim made in the code comments above.

**Measured:** a throwaway probe ran the dot-count assertion (`toHaveCount(20)`) with **no seeding
fixture at all** — `1 passed`, exit 0, in 3.1s. So the shared test project already holds at least
20 eligible verified+pledged rows on its own. That measures redundancy, not sufficiency: it says
the precondition happens to hold today, and says nothing about whether it will tomorrow. The
fixture is what makes that a guarantee rather than a coincidence.

**The circularity worth naming:** the rows making those tests pass without seeding are largely the
orphan `Test Pledger N` rows this very spec exists to stop producing. If the orphans were cleaned
up and the fixture kept, the tests would still pass (the fixture seeds 25). If the orphans were
cleaned up and the fixture removed, several would fail. So the seeding is correct to keep — it is
just not currently the thing making them green.

**What this does NOT change.** The two shipped fixes were measured against controls that
discriminate, and neither depends on this: the leak fix (24 rows left behind vs 0, control probe
with a `createTestUser` throwing on call 13) and the dead-seeding removal (126 `[TEST HELPER]`
lines vs 0 on the same single test). Both stand.

**Follow-up, not done here:** decide whether these tests should assert against *only* their own
seeded rows — which would make the fixture load-bearing and the assertions genuinely independent of
table population — or stay as mechanics-against-whatever-renders. That is a test-design call, and
it is coupled to whether the orphan rows get cleaned up (a `DELETE` on shared state, founder's call
under `.claude/rules/db-access.md`). Tracked alongside P1254.
