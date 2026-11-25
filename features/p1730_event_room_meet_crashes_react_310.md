---
status: in-progress
type: bug
rank: 358
severity: critical
workstream: events
date_reported: 2026-11-25
created_date: 2026-11-25
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [events, event-room, react-hooks, regression]
disclosure: public
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_file: src/tests/p1730-reproduce.test.tsx
  root_cause: "useEventRoomCounts is called below EventRoomMeet's early returns (loader, offline, gate), so the first room render after any of them runs one more hook and React throws #310"
  confidence: high
  surfaces_in_scope: [loading-then-room, offline-then-room, gate-then-room, non-hike-room]
  surfaces_deferred: []
  reproduced_at: 2026-11-25
---

# P1730: Event room /meet crashes with "Something went wrong" (React #310) once it loads

## Summary

Opening an event room at `/events/<slug>/meet` on prod shows the error boundary ("Something went wrong … Refresh Page") because React throws minified error #310, "Rendered more hooks than during the previous render". Regression from P1675 (`7e57904e1`, 2026-11-17).

## Root Cause

Confirmed by /reproduce (canary `src/tests/p1730-reproduce.test.tsx`, 4 of 4 red with "Rendered more hooks than during the previous render" before the fix): `useEventRoomCounts` is called at `EventRoomMeet.tsx:426`, **after** the early returns at lines 407–410 (`<ClarityPageLoader />` while loading, `<NeedsConnection />` offline, `<EventRoomGateScreen />` when not granted). The first render (still loading) returns early having run N hooks; the next render (loaded, granted) reaches line 426 and runs N+1, so React throws #310. The prod stack matches: `useState` ← `use-event-room-counts` ← `EventRoomMeet`.

Why nothing caught it: `eslint.config.js` ignores `src/app/prototypes/**`, so `react-hooks/rules-of-hooks` never runs on `EventRoomMeet.tsx`, even though the route at `src/App.tsx:104` serves it in production.

## Invariants

- Every hook in a component runs on every render, before any early return. The component's own comment just above the returns ("before the early returns") already says so; line 426 broke it.

## Reproduction Steps

1. Signed in as a person with access to an event (prod or local), open `/events/<slug>/meet`.
2. The loader shows while the access and seat reads are in flight.
3. Once they resolve, observe the error boundary: "Something went wrong".

**Reproduction rate:** 100% in the canary for each of loader, offline screen and gate screen giving way to the room, hike and non-hike alike; on prod, whenever the page renders the loader first (the normal path). Seen on prod by the founder on 2026-11-25 at 370 px wide (a mastermind event, not a hike, so the `registration === 'hike'` gate does not help: the hook is called whatever `enabled` is).

## Expected Behavior

The room renders after loading.

## Actual Behavior

The error boundary replaces the room. Console: `Error: Minified React error #310` at `useState` in `use-event-room-counts` ← `vo` (EventRoomMeet).

## Affected Files

- `src/app/prototypes/events/components/EventRoomMeet.tsx:426`: hook call below the early returns at 407–410.
- `eslint.config.js:9`: `src/app/prototypes/**` ignore means rules-of-hooks never checked this file.

## Severity

**Critical**: every visitor's event room crashes once it loads, for every event type.

## Fix Approach

Move the `useEventRoomCounts` call (and `hostMerged`, which only derives from it) above the early returns. Its arguments (`event?.id`, `granted`, `recipeForEvent(event)`) are already available there. Whether to also lint `src/app/prototypes/**` for rules-of-hooks is a separate question; /reproduce reports how many other violations that tree holds.

## Acceptance Criteria

- [ ] `/events/<slug>/meet` renders the room after the loader, with no error boundary
- [ ] No React #310 in the console during load
- [ ] Hike rooms still show the "N registered, not here yet" line and the host's merged counts (P1675 section 6)
- [ ] Regression test passes: `src/tests/p1730-reproduce.test.tsx` (loading → loaded render does not throw)
