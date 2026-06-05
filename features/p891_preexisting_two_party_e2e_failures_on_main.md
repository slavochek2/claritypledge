---
status: qa
type: bug
rank: 1000781
severity: medium
workstream: C1
date_reported: '2026-06-04'
created_date: '2026-06-04'
tags: [e2e, live, test-debt, two-party]
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: e2e/p562-free-mode.spec.ts  # + e2e/p398-session-history-summary.spec.ts, e2e/p525-celebration-race.spec.ts — the 8 failing tests ARE the canaries (test-debt bug; no new test written)
  root_cause: "Three independent test-drift causes: (1) p398 — idle button copy changed 'Does X understand you?' → 'Did X understand you?' in P600-era idle redesign (~5bd69a42, 2026-03-30); (2) p525 — createTestStory API drift: tests pass a single object, helper signature is (authorId, options); (3) p562 — design rework 11aadf87 (2026-03-27) replaced free-mode simultaneous sealed-bid with guided mode's sequential first round, changing both flow and copy ('understands your intention' → 'understands you')"
  confidence: high
  surfaces_in_scope: [e2e/p398-session-history-summary.spec.ts, e2e/p525-celebration-race.spec.ts, e2e/p562-free-mode.spec.ts]
  surfaces_deferred: []
  reproduced_at: 2026-06-05
date_resolved: '2026-06-05'
root_cause: "Test drift, 3 independent causes + 2 second-layer drifts found by /fix: p398 suite obsolete (P679 removed inline session history — deleted); p525 helper API drift + dead /live?code= join route (rewritten on createTwoPartySession + advanceSessionState); p562 design rework 11aadf87 (rewritten to explain-back path into freePhase=unlocked)"
resolution: "p398 suite deleted (coverage on /sessions suites); p525 + p562 rewritten to current product behavior; 5/5 pass; Speak-freely exit coverage gap deferred to P905"
---

# P891: 8 pre-existing two-party /live e2e failures on main (p398 / p525 / p562 suites)

## Summary

Three two-party /live e2e suites fail on main — 8 tests total across `e2e/p398-session-history-summary.spec.ts` (3), `e2e/p525-celebration-race.spec.ts` (2), `e2e/p562-free-mode.spec.ts` (3) — confirmed identical failures on main and on `feature/p879-free-mode-rounds-not-recorded` during the P879 blast-radius check.

## Root Cause

**Confirmed 2026-06-05 (re-reproduced 8/8 on main @ 025b3bac). All three suites are stale tests — UI/API drift, class (a). No product regression found at the failing steps.** Three independent causes:

1. **p398 (3 tests) — obsolete suite, deleted.** First divergence was idle button copy drift (`Does` → `Did`, P600-era redesign ~`5bd69a42`). After fixing the copy, /fix found the deeper cause: commit `e60e8ceb` (P679, 2026-04-09) **intentionally removed** `SessionHistoryList` and `RoundSummaryScreen` from /live — "History remains accessible on /sessions page." The suite tested a deliberately removed feature; selector updates cannot save it. **Resolution: suite deleted (user-approved).** /sessions history coverage already exists: `e2e/p405-my-sessions.spec.ts`, `e2e/p813-session-history-show-all.spec.ts`, `e2e/integration/p405-sessions-data.spec.ts` — no coverage gap, no follow-up ticket.
2. **p525 (2 tests) — helper API drift + dead join route.** First divergence: tests call `createTestStory({ authorId, title, body })`; the helper signature is `createTestStory(authorId, options)` with `content`, not `body` → `invalid input syntax for type uuid` at setup. Second layer (found by /fix after the call-site fix): the legacy `/live?code=` query-param join no longer enters a session — the page lands on the /live entry screen. **Resolution: rewritten on `createTwoPartySession` (real `/live/CODE` join) + `advanceSessionState` to the target phase; Continue/Back interactions stay UI-driven.** Two more drifts fixed en route: a partial `selectedStoryData` shape crashes the story card into the error boundary (full P879-style shape required), and the skip affordance on the rating drawer is the "Back" button (`onBackToIdle={handleSkip}`).
3. **p562 (3 tests) — design rework.** Commit `11aadf87` (2026-03-27, "reuse guided mode for first round") deleted free-mode's simultaneous sealed-bid handlers; the structured start now runs guided mode's *sequential* rating flow with different copy ("understands you?" not "understands your intention?"). Evidence: failure screenshot shows speaker on the guided rating screen while listener is correctly still idle — the simultaneity the tests assert no longer exists by design. **Resolution: suite rewritten to the current design.** Key finding: the ONLY route into `freePhase='unlocked'` is the explain-back path (gap bids → listener explains back → speaker re-rates <10, `clarity-live-page.tsx` ~2775); a 10/10 round celebrates and resets to idle. Anti-anchoring survives as a sequential guarantee — the responder's journey card shows the checker's submitted value as "Pending…" until the responder submits (asserted). The "Speak freely" exit from unlocked (P515 negotiation dual-ack) is not driven by the rewritten suite — deferred to **P905**.

**Surface audit:** grep found 12 e2e suites containing `Does .* understand you` — most likely pass via the "your story" substring coincidence; not re-run. Scope for P891 stays the 3 named suites; widen only if /fix's full-suite run flags others.

**Residual risk (why confidence isn't absolute):** each test dies at its *first* divergence; later steps can't be assessed until selectors are updated. /fix must re-run after updating and classify any *new* failure point fresh (could be a real product bug).

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

(AC #1 updated during /fix: the p398 suite was deleted as obsolete — user-approved, see Root Cause #1 — so the pass target is the two surviving suites, 5/5.)

- [x] `npx playwright test e2e/p525-celebration-race.spec.ts e2e/p562-free-mode.spec.ts` passes (5/5, no flaky, verified 2026-06-05)
- [x] Each previously failing test's cause is classified (UI drift vs product regression) in this spec — all 8 were test drift; no product regression found
- [x] No app crashes during the affected flows — all 5 tests drive the real UI through full rounds; an error-boundary crash fails the assertions (and did, once, during the p525 story-shape iteration, proving the sensor works). Note: console output was not instrumented — the verified claim is no error-boundary crash + all UI assertions passing, not strict console silence.
