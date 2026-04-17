---
status: qa
type: bug
rank: 1000741.0
severity: high
workstream: live
date_reported: '2026-04-17'
created_date: '2026-04-17'
tags: [live, free-mode, realtime, state-merge, regression]
delivery_stage: park
pipeline_ran: [create-bug, fix, park]
---

# P741: Partner Slider Preservation Lost During In-Flight Write (P671 Regression)

## Summary

P671 (commit `fb48a64d`, 9 Apr 2026) rewrote the in-flight merge logic to add a monotonic `ratingPhase` guard but did not restore the partner-key extraction that P609 (commit `065774dc`, 30 Mar 2026) had originally introduced. As a result, when a partner's Realtime event carrying `freeSliderJoiner`/`freeSliderCreator` arrives while a local write is in-flight, the partner's slider value is silently overridden by the local stale value.

## Root Cause

`src/app/pages/clarity-live-page.tsx` in-flight branch (Realtime handler ~1128-1141 and drift-poll ~1302-1312):

```ts
setLiveState(prev => ({ ...mergedState, ...prev, ratingPhase: phaseToUse }));
confirmedLiveStateRef.current = { ...mergedState, ...confirmedLiveStateRef.current, ratingPhase: confirmedPhase };
```

`...mergedState, ...prev` means `prev` (local state) wins for **every** key including partner-owned keys (`freeSliderCreator`, `freeSliderJoiner`, `livePositionsCreator`, `livePositionsJoiner`). P609 fixed this by extracting partner-owned keys from the incoming payload before the merge and re-applying them after. P671 rewrote the same block without restoring that extraction.

**Regression commit:** `fb48a64d` (P671)
**Original fix commit:** `065774dc` (P609)

## Reproduction Steps

1. Open two authenticated browser windows in the same /live session
2. Both reach `freePhase: 'unlocked'` (Speak Freely mode)
3. While Browser B drags its slider (triggering writes), Browser A also moves its slider rapidly
4. Observe Browser B: its live-dots row for Browser A's position intermittently reverts to the stale pre-drag value
5. Symptom is intermittent — only fires when a partner Realtime event arrives during a local write's in-flight window

**Note:** `src/tests/p609-free-slider-sync.test.ts` exists and passes, but tests a mock helper defined inside the test file — not the production handler. Its passing state is meaningless with respect to this regression.

## Expected Behavior

Partner slider values are preserved through local write in-flight windows. Each participant's live-dots row always reflects the latest value from the partner.

## Actual Behavior

Partner slider values are intermittently dropped when a local write is in-flight, causing the partner's live-dots row to revert to a stale value for up to ~1 s (Realtime) or ~2 s (drift-poll fallback).

## Affected Files

- `src/app/pages/clarity-live-page.tsx` — lines ~1128-1141 (Realtime in-flight branch) and ~1302-1312 (drift-poll in-flight branch)
- `src/tests/p609-free-slider-sync.test.ts` — tests a mock, not the real helper; must be rewritten

## Severity

**High** — intermittent data loss in the core Speak Freely collaboration feature; affects regular /live and letter-sourced /live equally.

## Fix Approach

1. Extract a pure `mergeInFlight` helper to `src/app/lib/live-state-merge.ts` that restores partner-key extraction (P609) while keeping the `ratingPhase` monotonic guard (P671)
2. Replace both inline in-flight merge blocks in `clarity-live-page.tsx` with calls to the helper
3. Rewrite `src/tests/p609-free-slider-sync.test.ts` to import and test the real helper

See architect plan: `~/.claude/plans/create-a-plan-here-serialized-scott.md`

## Acceptance Criteria

- [x] Canary test `partner slider update preserved during in-flight write` fails before fix, passes after
- [x] `ratingPhase` monotonic guard (P671) still passes: server-ahead advances phase, server-behind holds phase
- [x] Echo of own partner-owned key is not re-applied (local optimistic value wins)
- [x] Full unit test suite passes — no regressions in P671 / drift / bootstrap behavior
- [x] `npx tsc --noEmit` passes with no new errors
- [x] Write-success ref merge at `clarity-live-page.tsx:1395` is untouched
