---
status: backlog
type: bug
rank: 59
severity: medium
workstream: live
date_reported: '2026-04-24'
created_date: '2026-04-24'
tags: [test, p804, badge, explain-back, pre-existing]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P808: P804 Path D test setup never reaches Rate 10 button

## Summary

`e2e/p804-badge-all-completion-paths.spec.ts` Path D (speaker re-rates to 10 via explain-back) has been failing on main since P804 closed. The state setup writes `ratingPhase: 'results'` but the explain-back rating UI (containing the "Rate 10" button) only renders when `ratingPhase === 'explain-back'` — so the test times out at the visibility assertion.

Discovered during P806 verification (state-watcher refactor passed Paths A/B/C and the new P806 canary; Path D was already broken).

## Root Cause

**Test setup, not source code.** Path D's `advanceSessionState` writes:
```typescript
ratingPhase: 'results',
explainBackDone: true,
speakerSawExplainBackDone: true,
explainBackRound: 1,
explainBackRatings: [],
```

The phase-routing in `live-mode-view.tsx` (`UnderstandingScreen`):
```typescript
if (liveState.ratingPhase === 'explain-back') phase = 'explain-back';
else if (liveState.ratingPhase === 'results') {
  if (reachedPerfect) phase = 'perfect';
  else phase = 'results';
}
```

With `ratingPhase: 'results'` and `explainBackRatings: []` (so `reachedPerfect=false`), phase becomes `'results'` — which never renders the `ComprehensionRatingCard` containing the "Rate 10" button. The intended "speaker is about to re-rate" state requires `ratingPhase: 'explain-back'`.

## Reproduction Steps

1. Checkout main (a3f7491c or any commit since P804 close)
2. Run: `npx playwright test e2e/p804-badge-all-completion-paths.spec.ts -g "Path D" --reporter=line`
3. Observe: test times out at line 619 (`getByRole('button', { name: 'Rate 10' })` not visible)

**Reproduction rate:** 100%

## Expected Behavior

Path D's state setup should land the speaker in the explain-back rating UI so clicking "Rate 10" triggers `handleExplainBackRate(10)`.

## Actual Behavior

The test never sees the "Rate 10" button. The page renders the post-results view (waiting indicator) instead of the explain-back rating drawer.

## Affected Files

- `e2e/p804-badge-all-completion-paths.spec.ts:574-614` — Path D `advanceSessionState` call

## Severity

**Medium** — Pre-existing broken canary. P804 was closed without verifying this path actually fired. The badge architecture itself works (P806 fix verified via the new state-watcher useEffect, plus P804 Paths A/B/C). The defect is canary fidelity, not user-facing behavior.

## Fix Approach

Change `ratingPhase: 'results'` → `ratingPhase: 'explain-back'` in Path D's `advanceSessionState` call. May also need to remove `explainBackDone: true` and `speakerSawExplainBackDone: true` (those flags belong on a state where explain-back has already happened). Then re-run to confirm Rate 10 click triggers `handleExplainBackRate(10)` and the P806 state-watcher inserts the badge.

## Acceptance Criteria

- [ ] Path D test passes against current main without changes to source code
- [ ] No console errors during the path
- [ ] Test setup accurately reflects "speaker is about to re-rate via explain-back" state
