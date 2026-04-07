---
status: backlog
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

## Root Cause (Hypothesis — Needs Investigation)

The Realtime handler in `clarity-live-page.tsx` (~line 1040-1083) receives full DB rows via `payload.new`. The `updateInFlightRef` guard prevents clobbering during optimistic updates, but there's a timing window:

1. User A submits rating → optimistic update → DB write → clears `updateInFlightRef`
2. Realtime delivers the updated row to both A and B
3. User B processes the Realtime event, updates local state
4. User B submits rating → same cycle
5. Meanwhile, User A receives Realtime with B's submission — but the `{ ...DEFAULT_LIVE_STATE, ...payload.new.liveState }` spread may reset transient flags

The exact race condition needs reproduction with logging to confirm. The `DEFAULT_LIVE_STATE` spread pattern (line 1046) is suspicious but the synthesis analysis showed Realtime delivers the full JSONB column, so clobber is narrow (only keys genuinely absent from DB).

**This bug needs investigation before fix.** The root cause is a hypothesis from code analysis, not confirmed via reproduction.

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

## Investigation Needed

Before fixing:
1. Add `console.log` to Realtime handler showing: timestamp, `updateInFlightRef.current`, `ratingPhase` before/after
2. Add logging to `handleRatingSubmit` showing: timestamp, submission payload, `updateInFlightRef` state
3. Reproduce with two browsers and capture the log timeline
4. Confirm whether `DEFAULT_LIVE_STATE` spread is the cause or if it's a different race

## Acceptance Criteria

- [ ] Root cause confirmed via reproduction with logging
- [ ] Rating submissions processed exactly once per participant (no flicker/loop)
- [ ] Realtime handler race condition resolved
- [ ] Two-party E2E test proves the fix
