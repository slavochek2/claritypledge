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
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: src/tests/p1730-reproduce.test.tsx
  root_cause: "useEventRoomCounts is called below EventRoomMeet's early returns (loader, offline, gate), so the first room render after any of them runs one more hook and React throws #310"
  confidence: high
  surfaces_in_scope: [loading-then-room, offline-then-room, gate-then-room, non-hike-room]
  surfaces_deferred: []
  reproduced_at: 2026-11-25
date_resolved: 2026-11-25
root_cause: "useEventRoomCounts called below EventRoomMeet's early returns (P1675), so the hook count changed between the loader/offline/gate render and the room render"
resolution: "moved the useEventRoomCounts call above the early returns, and turned it off behind the offline screen"
spec_review_hash: 6c5a46add64553cebbf39e7b68b43448a8e80d078de01da4bed6119f3f0a52f6
spec_review_vendors: [gemini, openrouter]
---

# P1730: Event room /meet crashes with "Something went wrong" (React #310) once it loads

## Summary

Opening an event room at `/events/<slug>/meet` on prod shows the error boundary ("Something went wrong … Refresh Page") because React throws minified error #310, "Rendered more hooks than during the previous render". Regression from P1675 (`7e57904e1`, 2026-11-17).

## Root Cause

Confirmed by /reproduce (canary `src/tests/p1730-reproduce.test.tsx`, 4 of 4 red with "Rendered more hooks than during the previous render" before the fix): `useEventRoomCounts` is called at `EventRoomMeet.tsx:426`, **after** the early returns at lines 407–410 (`<ClarityPageLoader />` while loading, `<NeedsConnection />` offline, `<EventRoomGateScreen />` when not granted). The first render (still loading) returns early having run N hooks; the next render (loaded, granted) reaches line 426 and runs N+1, so React throws #310. The same happens mid-session: the access read sets `loading` true again on every reconnect (`EventRoomAccess.tsx`, `reconnectKey`), so room → loader → room crashes too. (The seat read does not: it sets `loading` only for a different event.) A room whose first render is already loaded does not crash, which is why every existing room test, all mounted with `loading: false`, stayed green. The prod stack matches: `useState` ← `use-event-room-counts` ← `EventRoomMeet`.

Why nothing caught it: `eslint.config.js` ignores `src/app/prototypes/**`, so `react-hooks/rules-of-hooks` never runs on `EventRoomMeet.tsx`, even though the route at `src/App.tsx:104` serves it in production.

## Invariants

- Every hook in a component runs on every render, before any early return. The component already applied this to `stepKey` (its comment above the returns: "computed here because hooks must run before the early returns"); line 426 broke it.

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

**Critical**: on the normal path (the loader shows first) every visitor's room crashes once it loads, for every event type, and again after any reconnect.

## Fix Approach

Move only the `useEventRoomCounts` call above the early returns. `hostMerged` and `hostMergedUndecided` stay where they are: they are plain values, not hooks. The arguments (`event?.id`, `granted`, `recipeForEvent(event)`) are already available there; `recipeForEvent(event)` with a null event already runs above the returns.

Not gated on `!loading && !offline` (spec review, Gemini): with the hook above the returns, a hike's first count read can start while the seat read is still loading. That is the same read the room makes a moment later, and the effect's dependencies (`eventId`, `enabled`) do not change when loading ends, so it is not a second read. Gating on loading would instead toggle `enabled` on every reconnect's loader flash, resetting the counts and re-reading. Offline, a read fails and keeps what is shown (the hook's existing rule).

Why nothing caught it: `src/app/prototypes/**` is excluded from ESLint. Whether to lint that tree for rules-of-hooks is recorded in Resolution below.

## Acceptance Criteria

- [x] `/events/<slug>/meet` renders the room after the loader, with no error boundary (also after the loader shows again mid-session)
- [x] No React #310 in the console during load
- [x] Hike rooms still show the "N registered, not here yet" line and the host's merged counts (P1675 section 6)
- [x] Regression test passes: `src/tests/p1730-reproduce.test.tsx` (loader, offline and gate screens giving way to the room; host merged count; mid-session loader flash; no hook-order console error)

## Resolution

**Fixed:** 2026-11-25. `useEventRoomCounts` moved above the early returns in `EventRoomMeet.tsx`, and its `enabled` now also requires `!accessOffline`.

The second part came from code review (all four reviewers raised it). With the hook above the returns, it also ran behind `<NeedsConnection />`. An offline access read keeps the event and registration, so `granted` stayed true, and the 30 s poll kept calling a dead network. Turning it off there also refreshes the counts at once when the room comes back, instead of up to 30 s later. Two other review findings were dropped after checking: "unhandled rejection" (`getEventRoomCounts` catches everything and returns null) and gating on loading (rejected above).

**Evidence:**
- `src/tests/p1730-reproduce.test.tsx`: the first 6 cases were red against the unfixed file ("Rendered more hooks than during the previous render") and all 7 are green with the fix. Cases: loader, offline screen and gate screen each giving way to the room, each screen asserted before the room replaces it; a non-hike room; the host's merged count after the loader; a mid-session loader flash (one count read, kept across it); the room going offline and back (no read for 95 s behind the offline screen, one read on return). The seventh case fails with the offline gate removed. Every case asserts no hook-order console error.
- Real browser on TEST (`e2e/p1114-event-room.spec.ts`, "every answer state" and "freshly-arrived"): 2 of 2 fail against the unfixed file (the roster never renders), 2 of 2 pass with the fix. A signed-in registered attendee then sees the room at 375 px, 320 px and 1280 px, with no #310 in the console.
- The room's ten existing unit suites pass (93 passed, 1 skipped).
- `react-hooks/rules-of-hooks` over all 162 files in `src/app/prototypes/**` (the tree ESLint ignores): 1 violation before the fix (this one), 0 after.

**Why the existing e2e did not catch it:** `e2e/p1114-event-room.spec.ts` opens `/meet` and fails on the unfixed code, but no CI workflow runs it: CI runs Playwright only for the public-route CSP and prod-health smokes, which never reach an auth-gated room.

