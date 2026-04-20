---
status: all-done
completed_at: '2026-04-20'
type: bug
rank: 1000761.0
severity: high
workstream: core
date_reported: '2026-04-18'
created_date: '2026-04-18'
tags: [free-mode, slider, realtime, timing]
pipeline_ran: [create-bug, fix, ship]
---

# P763: Free mode 10/10 slider stuck — handleFreeRoundComplete guard reads stale confirmedRef for own slider

## Summary

When the current user drags their own slider to 10 last (partner already at 10), the free-mode session never transitions to the success/celebration screen — it stays stuck at 10/10 indefinitely.

## Root Cause

`handleFreeRoundComplete` in `clarity-live-page.tsx` (lines 1573–1579) guards against premature transitions by verifying both slider values in `confirmedLiveStateRef.current`. But `confirmedLiveStateRef` for the **own** slider key is only updated when the debounced `updateLiveState({ [myKey]: 10 })` fires — 300ms after the user finishes dragging.

Meanwhile, `bothAtTen` in `FreeModeView` uses `localSliderValue` which updates **immediately** (no debounce). So when the user drags to 10 last:

1. `localSliderValue = 10` (0ms) → `bothAtTen = true` → effect fires → `roundCompleteFiredRef.current = true`
2. `handleFreeRoundComplete` runs → guard reads `confirmedLiveStateRef.current[myKey] = OLD` (debounce pending) → `return` early
3. At 300ms: debounce fires → `confirmedLiveStateRef.current[myKey] = 10` — but `roundCompleteFiredRef = true`, effect never retries
4. Session stuck at 10/10 forever (until page reload)

The partner's slider has no timing gap — it arrives via Realtime and is committed to `confirmedRef` synchronously in the Realtime handler. Only the **own** slider key has this 300ms lag.

Bug introduced in commit `1b317878` (March 31) when the 2-second hold timer was replaced with an immediate call + confirmed-state guard.

## Reproduction Steps

1. Start a free-mode session (complete guided round to unlock free mode) — two clients
2. Both users drag sliders toward 10. User A (partner) reaches 10 and stays there
3. User B (you) drag your slider to 10 last
4. Observe: slider shows 10/10, live dots show both at 10 — but celebration screen never appears

**Reproduction rate:** 100% when own slider reaches 10 after partner's slider

## Expected Behavior

When both sliders reach 10, the session immediately transitions to `freePhase: 'success'` — celebration screen appears.

## Actual Behavior

Session stays on the slider screen forever. `freePhase` remains `'unlocked'`. No celebration. `roundCompleteFiredRef = true` prevents any retry.

## Affected Files

- `src/app/pages/clarity-live-page.tsx` — lines 1577–1579: guard checks `confirmedLiveStateRef.current.freeSliderCreator` and `freeSliderJoiner` — own-slider key is stale for 300ms after drag
- `src/app/components/partners/free-mode-view.tsx` — line 92: `bothAtTen` uses `localSliderValue` (immediate), inconsistent with guard timing

## Severity

**High** — free-mode 10/10 achievement is the core success moment of a session; being permanently stuck destroys the session for both users.

## Fix Approach

In `handleFreeRoundComplete`, only check the **partner's** confirmed slider key, not the own slider key. The own slider at 10 is already guaranteed by `bothAtTen` in `FreeModeView` (uses `localSliderValue` which is immediate and accurate). The partner's slider comes via Realtime which IS synchronously committed to `confirmedRef` — no timing gap.

```typescript
// Before (stale for own-key):
const creatorVal = current.freeSliderCreator ?? 0;
const joinerVal = current.freeSliderJoiner ?? 0;
if (creatorVal !== 10 || joinerVal !== 10) return;

// After (only guard partner's confirmed value):
const partnerKey = isCreator ? 'freeSliderJoiner' : 'freeSliderCreator';
if ((current[partnerKey] ?? 0) !== 10) return;
```

Add `isCreator` to `useCallback` deps (already present — no dep change needed).

## Acceptance Criteria

- [x] When user drags own slider to 10 last (partner already at 10), celebration screen appears immediately
- [x] When partner reaches 10 last (own slider already at 10), celebration screen appears immediately
- [x] No false-positive transition when partner's Realtime value is stale (partner not actually at 10)
- [x] Regression test passes: both-at-10 detection fires and `freePhase` transitions to `'success'`
- [x] Full test suite passes with no regressions
