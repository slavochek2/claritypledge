---
status: all-done
type: bug
rank: 1000782
severity: medium
workstream: C1
date_reported: '2026-06-04'
created_date: '2026-06-04'
tags: [live, session-history, rounds, investigation]
pipeline_ran: [create-bug, reproduce, fix, ship]
reproduce_artifact:
  test_file: e2e/p892-reproduce.spec.ts
  root_cause: "All sessionHistory completion appends (guided ~2440/~2512, free ~1837/~2534) are gated on both-ack; session exit does no flush — a completed check cycle is lost when one party never acknowledges"
  confidence: high
  surfaces_in_scope: [guided-one-sided-ack, guided-no-ack-session-end, free-one-sided-ack]
  surfaces_deferred: []
  reproduced_at: 2026-06-05
completed_at: 2026-06-05
---

# P892: Guided /live round abandoned before mutual celebration is never recorded (P879 deferred surface H2)

## Summary

In guided mode, the `sessionHistory` append fires only when **both** parties acknowledge the completion celebration — a guided round where both parties completed the check/rating cycle but the mutual "Continue" handshake never fires records nothing. Deferred from P879 (`reproduce_artifact.surfaces_deferred: guided-both-ack-handshake`).

## Root Cause

**Confirmed (high confidence) via static trace + failing two-party E2E.** All five `sessionHistory` write sites in `src/app/pages/clarity-live-page.tsx` were traced; every round-completion append is gated on both-ack:

- guided `handleCelebrationComplete` bothDone block (~2440)
- guided reactive safety-net useEffect (~2512)
- free `handleFreeDiscussAnother` bothDone block (~1837) — added by P879, still both-ack gated
- free reactive safety-net useEffect (~2534) — added by P879, still both-ack gated

Session exit (`confirmExitMeeting`, ~3480) performs no flush of a pending completed round. Therefore a round whose check cycle genuinely completed (celebration/success screen reached) is silently lost whenever the partner never clicks Continue.

**Scenario audit (all in scope, one ticket):**
1. Guided celebration, one party acks, other abandons → lost (canary test 1)
2. Guided celebration, neither acks, session ends → lost (same gate, no exit flush)
3. Both ack → works (covered by P525/P879 tests)
4. Free-mode success, one party acks, other abandons → lost (canary test 2) — sibling surface P879 did not cover

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

## Resolution

**Fixed:** 2026-06-05
**Root cause:** All four `sessionHistory` completion appends (guided `handleCelebrationComplete` bothDone + reactive safety net; free `handleFreeDiscussAnother` bothDone + reactive safety net) were gated on both-ack, and session exit did no flush — a completed check cycle was lost whenever the mutual Continue handshake never fired.
**Resolution:**
- New `roundRecorded` flag in `live_state`: the FIRST celebration ack now appends the round entry (via `buildRoundHistoryEntry`) and sets the flag; all bothDone/reactive reset sites skip the append when the flag is set and clear it on reset; `handleSkip` is flag-gated too.
- `confirmExitMeeting` flushes a completed-but-unrecorded round before terminating. Guided predicate mirrors `live-mode-view`'s `reachedPerfect` exactly (latest checker rating — last `explainBackRatings` entry or initial `checkerRating` — is 10); free predicate is `freePhase === 'success'`. The narrower first draft (`ratingPhase === 'results' && checkerRating === 10`) was corrected after code review found it missed direct-10/10 (`revealed` phase) and explain-back-achieved celebrations.
- Accepted residual: during a rolling-deploy window, an old-code first-acker doesn't set `roundRecorded`, so a new-code partner's bothDone can append a second (cosmetic) entry. Window is minutes-wide; no crash path.

**Files changed:**
- `src/app/pages/clarity-live-page.tsx` — 5 append/reset sites + exit flush + Sentry allowlist
- `src/app/types/index.ts` — `roundRecorded?: boolean`
- `e2e/p892-reproduce.spec.ts` — third canary added (no-ack exit flush via explain-back celebration)

**Regression tests:** `e2e/p892-reproduce.spec.ts` (3/3 — one canary per in-scope surface). Siblings green: `p879` (exactly-one append on both-ack), `p814`, full vitest (2315).

## Acceptance Criteria

- [x] Reproduction decided: confirmed bug (failing two-party E2E) OR documented as expected behavior (spec closed with rationale)
- [x] If confirmed: a guided round whose check cycle completed is recorded in `sessionHistory` even when the mutual handshake never fires
- [x] If confirmed: no double-append when both parties do acknowledge
- [x] Regression test passes: `e2e/p892-*.spec.ts`
