---
status: qa
date_resolved: '2026-04-09'
root_cause: Race condition in patch_live_state + blanket Realtime blocking during in-flight writes
resolution: Server-side auto-reveal in RPC + field-aware merge (ratingPhase takes highest value during in-flight)
delivery_stage: fix
pipeline_ran: [fix]
type: bug
rank: 1000071.0
severity: high
date_reported: '2026-04-06'
created_date: 2026-04-06T00:00:00.000Z
tags:
  - live
  - realtime
  - rating
---

# P671: /live — Rating Submission Loops Between Participants

## Summary

During a /live rating round, rating submissions can loop — one participant's submission triggers the other to re-enter or re-process the rating phase, creating a visible flicker or repeated state transitions. Observed intermittently during two-party testing of P667.

## Root Cause (Confirmed)

**Stale Realtime echo after `updateInFlightRef` drops.**

Supabase Realtime delivers one event per DB write, carrying the row state at that write's commit time. When two users submit ratings sequentially, two Realtime events are generated:
- Event 1 (checker's write): `ratingPhase: 'waiting'`, `responderSubmitted: false`
- Event 2 (responder's write): `ratingPhase: 'revealed'`, `responderSubmitted: true`

On the responder's client:
1. Responder submits → optimistic update shows `revealed` → `updateInFlightRef = true`
2. Event 1 (checker's stale echo) arrives → blocked by `updateInFlightRef` guard
3. DB write completes → `updateInFlightRef = false`
4. Event 1 is now processed (guard is open) → applies `{ ...DEFAULT_LIVE_STATE, ...staleState }` → regresses `ratingPhase` from `revealed` to `waiting` and `responderSubmitted` from `true` to `false`
5. UI flashes back to the rating input for ~1 second until Event 2 (or drift poll) corrects it

The `DEFAULT_LIVE_STATE` spread is NOT the primary issue — the stale event would regress the state regardless. The root cause is that the Realtime handler has no monotonic guard: it applies ANY event that arrives when `updateInFlightRef` is false, even if that event predates the current local state.

## Reproduction Steps

1. Open /live as User A in browser 1, User B in browser 2
2. Start a session, User A speaks
3. Both users rate
4. Observe: rating phase may flicker or loop (intermittent)

**Reproduction rate:** Intermittent — timing-dependent

## Expected Behavior

Rating submissions are processed once per participant with no visible flicker or repeated state transitions.

## Actual Behavior

Rating phase appears to loop or flicker between states during two-party rating.

## Affected Files

- `src/app/pages/clarity-live-page.tsx` — Realtime handler (~lines 1040-1083), `updateLiveState` (~lines 1298-1364), `handleRatingSubmit` (~lines 1769-1884)

## Solution

**Monotonic phase guard** in the Realtime handler (`isPhaseRegression()`). The rating phase follows a strict ordering: `idle → waiting → rating → revealed → explain-back → results`. The Realtime handler rejects events that would move `ratingPhase` backward, unless the incoming phase is `idle` (deliberate round reset).

This is a one-way valve: forward progress is always accepted, backward regression (from stale echoes) is always rejected. The drift poll (which reads fresh DB state, not Realtime echoes) is intentionally NOT guarded — it serves as the correction mechanism if a Realtime event is missed.

## Acceptance Criteria

- [x] Root cause confirmed via reproduction with logging + screenshots
- [x] Rating submissions processed exactly once per participant (no flicker/loop)
- [x] Realtime handler race condition resolved
- [x] Two-party E2E test proves the fix
