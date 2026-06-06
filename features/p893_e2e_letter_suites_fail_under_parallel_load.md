---
status: qa
date_resolved: '2026-06-05'
root_cause: stale e2e assertions (P725/P770/P852 shipped behavior) + Supabase auth rate limit under parallel load + duplicate history push per tab click on /letters
resolution: tests updated to shipped behavior; per-worker session cache + rate-limit retry in test-user helper; handleTabChange dedupe guard + history canary
type: bug
rank: 1000783.0
severity: medium
workstream: letters
date_reported: '2026-06-04'
created_date: '2026-06-04'
tags: [e2e, test-infra, letters, race-condition]
delivery_stage: ship
pipeline_ran: [create-bug, fix, ship]
---

# P893: p660/p665 e2e suites fail under default parallel load (pre-existing races, not flake noise)

## Summary

9 tests across `e2e/p660-letters-nav.spec.ts` (all 5) and `e2e/p665-letter-immersive.spec.ts` (AC8/9/11/12) fail deterministically-under-load: they fail BOTH attempts (failed, not flaky) when run as part of a multi-file parallel run at the default worker count, but pass at `--workers=2`. Verified pre-existing on main via controlled comparison during P888 verification.

## Root Cause (verified during /fix — original hypotheses falsified)

The "pass at `--workers=2`" premise was **falsified**: the same 9 tests fail at `--workers=2` too. Verified causes:

1. **Stale assertions (8 of 9 tests):** the tests assert pre-P725/P770/P852 product behavior:
   - p660 "default tab is Drafts" — P725 changed the default tab to Inbox
   - p660 ×3 clicking a "Sent" tab — P770 renamed Sent → Published (URL value stays `sent`); `getByRole('tab', { name: /Sent/i })` matches nothing and times out
   - p665 AC8/AC9 — "Back to composition" no longer exists; the exit affordance is the "Close preview" banner/end-state button
   - p665 AC9/11/12 — P852 added a letter cover ("Open the Letter") at preview start; tests never clicked it. AC11's progress label is now "Chapter 1 of N" (not "Story 1 of N"); AC12's shared component legitimately renders `live-story-card-expanded`
2. **Strict-mode nav locator (p660 "nav shows Letters"):** `locator('nav').getByText(/Letters/)` resolves to both the desktop nav and mobile bottom nav — genuine test bug, deterministic.
3. **REAL parallel-load substrate (the batch-wide failures in p699/p700):** per-test `signInWithPassword` calls in `setTestSession`/`createTestUser` exceed Supabase's per-IP auth token rate limit ("Request rate limit reached", 20 hits in one baseline batch), cascading into `beforeAll` failures and "did not run" blocks.
4. **PRODUCT BUG found by the back/forward test:** each tab click on /letters pushed TWO identical history entries (Radix `TabsTrigger` fires `onValueChange` twice per click — focus activation + click — before the URL-driven re-render lands). Browser Back needed two presses per tab switch. Verified by history.length probe (3→5→7 across two clicks).

## Reproduction Steps

1. From the repo root (or any worktree), run a multi-file letter-suite batch at default worker count:
   `npx playwright test e2e/p660-letters-nav.spec.ts e2e/p665-letter-immersive.spec.ts e2e/p700-letter-overview.spec.ts e2e/p699-letter-results-sender.spec.ts e2e/p699-letter-results-receiver.spec.ts e2e/p694-letter-not-found-flash.spec.ts`
2. Observe: the 9 tests fail (both attempts — listed under `failed`, not `flaky`)
3. Re-run only the two files at `--workers=2`: `npx playwright test e2e/p660-letters-nav.spec.ts e2e/p665-letter-immersive.spec.ts --workers=2`
4. Observe: all pass (one intermittent retry-pass possible, e.g. p665 AC7)

**Reproduction rate:** 100% at default worker count in 6–8-file batches (reproduced twice on feature/p888-letter-results-nav, once on main, same 9 tests each time)

## Expected Behavior

Letter-suite e2e tests pass at the default worker count regardless of how many spec files run in the batch. A multi-file verification run is trustworthy without manually capping workers.

## Actual Behavior

Same-batch evidence (P888 verification session):

- main: 66 passed / 10 failed (the 9 + `p699 "top menu is visible"`, which was the P888 bug itself)
- feature/p888 branch: 75 passed / 9 failed (identical 9 — the p699 delta is the P888 fix)
- `--workers=2`: 18–19/19 pass

The 9 failures mask real regressions in letter-route suites: any verification batch reports failures that must be manually triaged against main each time.

## Affected Files

- `e2e/p660-letters-nav.spec.ts` — tests at lines 28, 45, 58, 86, 152 (all 5 in file)
- `e2e/p665-letter-immersive.spec.ts` — tests at lines 317, 349, 436, 459 (AC8/9/11/12)
- Suspected contributing: `playwright.config.ts` default worker count vs single shared dev server

## Severity

**Medium** — verification noise with a workaround (`--workers=2`); no user-facing impact, but it erodes trust in every letter-suite verification run and forces a main-baseline comparison to triage.

## Fix Applied

1. **Test updates to shipped behavior** (`e2e/p660-letters-nav.spec.ts`, `e2e/p665-letter-immersive.spec.ts`): Inbox default tab (P725), Published label (P770), strict-safe `nav[data-nav="main"]` scoping, "Open the Letter" cover click (P852), "Close preview" exit assertions, "Chapter 1 of N" label, AC12 flipped to assert the shared `live-story-card-expanded` IS rendered. AC9's crawler now tries rating buttons before advance buttons and only clicks enabled buttons (the rating drawer renders a disabled Continue that hung the click until timeout).
2. **Auth rate-limit mitigation** (`e2e/helpers/test-user.ts`): per-worker session cache (one token call per user per worker instead of per test; 79 reuses in one batch) + backoff retry on rate-limit errors only. Cache evicted on `deleteTestUser`.
3. **Product fix** (`src/app/pages/letters-page.tsx`): dedupe guard in `handleTabChange` — one history entry per tab switch. Regression canary: `e2e/p893-history-probe.spec.ts`.

## Acceptance Criteria

- [x] The 6-file batch from Reproduction Steps passes at default worker count, run twice consecutively (76/76 both runs, 0 rate-limit errors)
- [x] `e2e/p660-letters-nav.spec.ts` — all 5 tests listed above pass in that batch
- [x] `e2e/p665-letter-immersive.spec.ts` — AC8/9/11/12 pass in that batch
- [x] No assertion semantics weakened (assertions updated to current shipped product behavior — P725/P770/P852; no `.skip`, no `.only`, no timeout inflation as the primary fix)
- [x] No console errors introduced in the affected flows (suite smoke tests assert console cleanliness; 2315 unit tests pass)
