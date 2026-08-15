---
status: rejected
type: change-request
rank: 2
changes: p617
tags:
  - live
  - ux
  - redesign
  - p617
created_date: 2026-04-03T00:00:00.000Z
flow: dev
superseded_by: p643
---

# P638: Fold Mode Switcher into getViewState + Dev Observability

> **Redesign of:** [P617: /live — Mode Switcher + Drawer Lifecycle Redesign](./p617_live_mode_switcher_drawer_lifecycle.md)
> **What was wrong:** P617's design was correct (ASCII flow, AD-0 distinction, UI Contract) but the implementation failed across 4 sessions because the mode switcher visibility is computed by an independent IIFE (line 1392 of `live-mode-view.tsx`) OUTSIDE of `getViewState()`. The pure function returns the correct view state but the mode switcher renders incorrectly because it has its own parallel decision logic. Additionally, tests use `page.reload()` which bypasses Realtime delivery, masking bugs that only appear in real browser sessions.

## Operating Mode

> This spec is an **incremental correction** to P617, not a greenfield design.
> The predecessor spec is **read-only shipped history** — do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P617 are not up for re-examination.

## Problem Statement

P617's acceptance criteria, UI Contract, and ASCII flow are all correct and preserved. The implementation failed because of two structural gaps:

1. **Parallel render logic:** The mode switcher visibility is governed by an inline IIFE at `live-mode-view.tsx:1392` that checks `liveState.ratingPhase`, `liveState.freePhase`, `liveState.checkerName`, `showRatingDrawer`, and `waitingForPartnerToContinue` — independently of `getViewState()`. This means `getViewState()` can return the correct answer while the mode switcher renders wrong. Four implementation sessions produced "clean logs, broken UI" because diagnostics instrumented `getViewState()` but not the IIFE.

2. **Invisible delivery failures:** `ratingInitiatedBy` was missing from drift detection (fixed in P637). But the broader issue remains: when Realtime flaps (`SUBSCRIBED → CHANNEL_ERROR` loop), state updates silently fail, and no dev-visible signal explains why the UI didn't respond. The `updateInFlightRef` guard (line 1049) silently drops Realtime events during in-flight writes. `confirmedLiveStateRef` and `liveState` can diverge. Guards read the ref while views read state.

**Root cause analysis:** `.private/thinking/t010_p617_systemic_failure.md` — full /dd:think pipeline (5 phases, adversarial).

## Jobs To Be Done

- **Preserved from P617:** All 4 JTBD (choose mode, wait without confusion, understand lock, return to idle seamlessly)
- **Corrected:** None — the jobs were right, the implementation mechanism was wrong
- **New:** "When debugging a /live session bug, I want to see which state the component received vs. what it rendered, so I can identify the exact failure point in one session"

## Current State

`getViewState()` returns a discriminated union of 8 view states. The switch statement at line 784 renders the correct component for each state. But the mode switcher is rendered OUTSIDE this switch — in an IIFE at line 1392 of `IdleScreen` that has its own condition set:

```
// Current: two independent decision-makers
getViewState() → determines which component renders (switch at line 784)
IIFE at 1392 → determines mode switcher show/hide/enabled/disabled (independent)

These can disagree. getViewState says "idle" → switch renders IdleScreen.
But IIFE says "hide mode switcher" based on its own stale conditions.
Or IIFE says "show enabled" when ratingInitiatedBy arrived via Realtime
but updateInFlightRef blocked the merge → IIFE reads stale liveState.
```

## Root Cause

The mode switcher IIFE at `live-mode-view.tsx:1392` operates outside `getViewState()`. It's a second decision-maker that no amount of logging, testing, or guard instrumentation can reconcile with the first.

Additionally:
- `handleStartCheck` guard (line 1360) reads `confirmedLiveStateRef.current`, not `liveState`
- `updateInFlightRef` (line 1049) silently drops Realtime events during writes
- Both create state divergence that's invisible without instrumentation

Code references:
- Mode switcher IIFE: `src/app/components/partners/live-mode-view.tsx:1392-1419`
- Guard: `src/app/pages/clarity-live-page.tsx:1359-1362`
- updateInFlightRef drop: `src/app/pages/clarity-live-page.tsx:1049-1068`
- Drift detection: `src/app/pages/clarity-live-page.tsx:1212-1237`

## Redesign

### Phase 1: C2-lite — Fold IIFE into getViewState (structural fix)

Add a `modeSwitcherState` field to the `ViewState` return type:

```typescript
type ModeSwitcherState = 'enabled' | 'disabled' | 'hidden';

// ViewState gains a new field:
| { view: 'idle'; modeSwitcherState: ModeSwitcherState }
| { view: 'idle-fallback'; modeSwitcherState: ModeSwitcherState }
// Other view states always have modeSwitcherState: 'hidden'
```

`getViewState()` now receives these additional inputs:
- `ratingInitiatedBy: string | undefined`
- `hasSessionModeChangeHandler: boolean` (matches existing `hasFreeSliderHandler` pattern — no callbacks in pure functions)
- `checkerName: string | undefined` (already available via existing inputs, but now used for mode switcher)
- `freePhase: string | undefined` (already an input, now also drives mode switcher)

**IIFE condition → getViewState mapping (all 7 conditions accounted for):**

| # | IIFE condition | getViewState equivalent | Notes |
|---|----------------|------------------------|-------|
| 1 | `!onSessionModeChange` | `!hasSessionModeChangeHandler` → `'hidden'` | Direct map |
| 2 | `showRatingDrawer` | View is not `idle` (responder-drawer branch) → `'hidden'` | Implicitly covered — IdleScreen with showRatingDrawer=true only renders in non-idle views |
| 3 | `waitingForPartnerToContinue` | View is `waiting-for-partner` → `'hidden'` | Implicitly covered — passed as true only in waiting-for-partner view |
| 4 | `ratingPhase !== 'idle'` | View is not `idle` → `'hidden'` | Implicitly covered by non-idle view states |
| 5 | `liveState.freePhase` | `freePhase` truthy → `'hidden'` | **EXPLICIT CHECK NEEDED** — freePhase can linger while view is idle (sessionMode='guided' but freePhase not cleared) |
| 6 | `liveState.checkerName` | `checkerName` truthy → `'hidden'` | **EXPLICIT CHECK NEEDED** — checkerName can be set via Realtime race while ratingPhase is still idle |
| 7 | `liveState.ratingInitiatedBy` | `ratingInitiatedBy` set → `'disabled'` | Direct map |

Computation logic:
- `'hidden'` — when `!hasSessionModeChangeHandler` OR view is not idle OR `freePhase` truthy OR `checkerName` truthy
- `'disabled'` — when `ratingInitiatedBy` is set (partner is rating)
- `'enabled'` — default idle state

The IIFE at line 1392 is **deleted**. IdleScreen reads `modeSwitcherState` from the view state object.

**After:**
```
// One decision-maker
getViewState() → returns view + modeSwitcherState
switch renders component, component reads modeSwitcherState
No parallel logic. No IIFE. One source of truth.
```

### Phase 2: Dev observability (diagnostic insurance)

Dev-only instrumentation (`import.meta.env.DEV` gated):

1. **State application log:** Inside the `if (!updateInFlightRef.current)` branch (line 1045) and `else` branch (line 1049), log whether the event was applied or dropped:
   ```
   [Realtime] Event applied: {keys changed}
   [Realtime] Event DROPPED (updateInFlight): {keys dropped}
   ```

2. **Write success/failure log:** After `updateLiveState` DB call (line 1293), log:
   ```
   [LiveUpdate] Write succeeded: {keys written}
   [LiveUpdate] Write FAILED + REVERTED: {error}
   ```

3. **Guard entry log:** At `handleStartCheck` guard (line 1359), log BOTH `confirmedLiveStateRef.current` and current `liveState`:
   ```
   [Guard] handleStartCheck: ref.ratingPhase={X}, state.ratingPhase={Y}, action={allowed|rejected}
   ```

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [BLOCK] IIFE conditions 5 (`freePhase`) and 6 (`checkerName`) can be truthy while view is `idle` — proposed logic didn't hide mode switcher | Added explicit `freePhase` and `checkerName` checks to `modeSwitcherState` computation + full 7-condition mapping table | These are Realtime race guards — dropping them silently re-introduces the bug class |
| 2 | /challenge-prd | [WARN] `onSessionModeChange` is a callback — breaks pure function pattern | Changed to `hasSessionModeChangeHandler: boolean` (matches `hasFreeSliderHandler`) | Consistent with existing pattern, keeps getViewState pure |
| 3 | /challenge-prd | [WARN] No explicit IIFE→getViewState condition mapping | Added 7-row mapping table showing how each IIFE condition maps | Prevents implementer guesswork on edge cases |

## Predecessor Sections Superseded

| Section | P617 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| AD-1 | "The mode switcher no longer needs to be hidden from within IdleScreen. The render branch structure already handles hiding." | **Superseded** | P638: `getViewState()` handles ALL mode switcher state via `modeSwitcherState` return field. Render branch structure is not the hiding mechanism. |
| AD-3 | "No new props on IdleScreenProps" | **Superseded** | IdleScreen now consumes `modeSwitcherState` from the view state object. |
| Technical Analysis | "The only meaningful condition change is splitting `!liveState.ratingInitiatedBy` from 'hide' to 'disable'" | **Superseded** | The IIFE is eliminated entirely, not refined. |
| Build step 2 | Mode switcher conditions within IdleScreen | **Superseded** | Mode switcher logic moves into `getViewState()`. |
| Scope Fence | "Mode switcher render condition — already mostly correct, needs refinement" | **Superseded** | The render condition is replaced, not refined. |

## Requirements

1. `getViewState()` returns `modeSwitcherState: 'enabled' | 'disabled' | 'hidden'` for idle views
2. The IIFE at line 1392 is deleted
3. IdleScreen reads `modeSwitcherState` from the view state, not from independent conditions
4. `ratingInitiatedBy` is an input to `getViewState()`
5. All 17 existing `getViewState` unit tests updated to include `modeSwitcherState` assertions
6. New unit tests for `modeSwitcherState` transitions (enabled → disabled → hidden → enabled)
7. Dev-only observability: Realtime drop log, write success/failure log, guard entry log
8. All P617 acceptance criteria still pass

## What Stays the Same

- All P617 acceptance criteria (14 ACs) — unchanged
- UI Contract (6 rows) — unchanged
- ASCII flow (Steps 1-4 + 2c) — unchanged
- AD-0 (two mechanisms: `isLocallyRating` local, `ratingInitiatedBy` shared) — unchanged
- AD-2 (MobileTooltip for disabled state) — unchanged
- AD-4 (tooltip text "Mode locked — your partner is rating") — unchanged
- `handleRatingSubmit`, `handleCelebrationComplete`, `handleSkip`, `handleFreeSpeakFreely` — unchanged
- No database changes, no new dependencies

## Surfaces in Scope

**In scope:**
- `src/app/components/partners/live-mode-view.tsx` — `getViewState()` return type + IdleScreen mode switcher
- `src/app/pages/clarity-live-page.tsx` — dev-only observability logs
- `src/tests/p617-mode-switcher-lifecycle.test.ts` — update for `modeSwitcherState`
- `src/tests/live-mode-view-state.test.ts` — update for `modeSwitcherState`

**Out of scope:**
- `clarity-live-page.tsx` state management architecture (no useState→useReducer migration)
- `FreeModeView`, `RatingScreen`, `UnderstandingScreen` — unchanged
- Database, edge functions, Realtime subscription setup — unchanged

## Acceptance Criteria

- [ ] `getViewState()` returns `modeSwitcherState` field on idle view states
- [ ] IIFE at line 1392 of `live-mode-view.tsx` is deleted
- [ ] IdleScreen renders mode switcher from `modeSwitcherState`, not independent conditions
- [ ] All 14 P617 acceptance criteria still pass
- [ ] All existing `getViewState` unit tests pass (updated for new return field)
- [ ] New unit tests for modeSwitcherState transitions: enabled → disabled → hidden → enabled
- [ ] Dev-only logs gated behind `import.meta.env.DEV`
- [ ] At least one E2E test uses no-reload sync (`waitForUIUpdate` pattern from P637)
- [ ] Manual two-browser UAT: speaker clicks Speak → listener mode switcher disables WITHOUT page reload

## References

- **Root cause analysis:** `.private/thinking/t010_p617_systemic_failure.md`
- **Discovery session:** `/Users/slavochek/.claude/projects/-Users-slavochek-Projects-public-claritypledge/593ee69e-4fbe-461d-b2af-44f00b84661c.jsonl`
- **Related:** P636 (advanceSessionState helper), P637 (no-reload E2E sync + drift completeness test)

## Next Steps

- [x] `/pick-flow` — B+ tier, full flow confirmed
- [x] `/challenge-prd` — PASS (1 BLOCK resolved: added freePhase + checkerName to mapping)
- [ ] `/architect` — design getViewState interface expansion + observability hooks
- [ ] `/generate-tests` — modeSwitcherState unit tests + no-reload E2E
- [ ] `/spec-review` — mandatory for change-requests
- [ ] `/spec-compact`
- [ ] `/dev` — implement on w1
- [ ] `/verify` — two-browser UAT
