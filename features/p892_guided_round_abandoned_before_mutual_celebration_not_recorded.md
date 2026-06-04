---
status: week
type: bug
rank: 1000782
severity: medium
workstream: C1
date_reported: '2026-06-04'
created_date: '2026-06-04'
tags: [live, session-history, rounds, investigation]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P892: Guided /live round abandoned before mutual celebration is never recorded (P879 deferred surface H2)

## Summary

In guided mode, the `sessionHistory` append fires only when **both** parties acknowledge the completion celebration — a guided round where both parties completed the check/rating cycle but the mutual "Continue" handshake never fires records nothing. Deferred from P879 (`reproduce_artifact.surfaces_deferred: guided-both-ack-handshake`).

## Root Cause

Under investigation — not yet a confirmed bug. The append sites are `handleCelebrationComplete`'s bothDone block and the guided reactive safety-net useEffect in `src/app/pages/clarity-live-page.tsx`. Open question: when a round is abandoned mid-celebration (one side advances, tab closed, handshake never fires), is the unrecorded round a bug (data loss for a genuinely completed check cycle) or expected (genuinely abandoned round)? P879 fixed the structural free-mode loss; this guided scenario needs its own reproduction to decide.

## Reproduction Steps

1. Open `/live` as the creator (verified), start a guided session; join as a second party.
2. Run a full check/rating cycle to the perfect-rating celebration screen.
3. Have only ONE party click "Continue" (other side closes the tab or never acknowledges).
4. End the session; open `/sessions`.
5. Observe whether the completed check cycle appears in Session History.

**Reproduction rate:** Unconfirmed — needs `/reproduce`.

## Expected Behavior

A round in which both parties completed the check/rating cycle is persisted to `sessionHistory` regardless of whether the celebration-acknowledge handshake completed for both parties (same principle as P879's Expected Behavior).

## Actual Behavior

(Hypothesized) The round is never appended — Session History undercounts or shows "no rounds completed" for the session.

## Affected Files

- `src/app/pages/clarity-live-page.tsx` — `handleCelebrationComplete` bothDone block + guided reactive safety-net useEffect (the only guided append sites)

## Severity

**Medium** — potential silent data loss, but trigger requires an abandoned handshake (unconfirmed frequency); the structural 100% loss case (free mode) was fixed in P879.

## Fix Approach

Run `/reproduce p892` first: build a two-party UI-driven E2E that completes a check cycle, lets only one side acknowledge, ends the session, and inspects `live_state.sessionHistory`. If confirmed, likely direction (from P879): decouple the append from the both-ack gate — persist on check-cycle completion, guard against double-append when the handshake also fires.

## Acceptance Criteria

- [ ] Reproduction decided: confirmed bug (failing two-party E2E) OR documented as expected behavior (spec closed with rationale)
- [ ] If confirmed: a guided round whose check cycle completed is recorded in `sessionHistory` even when the mutual handshake never fires
- [ ] If confirmed: no double-append when both parties do acknowledge
- [ ] Regression test passes: `e2e/p892-*.spec.ts`
