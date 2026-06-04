---
status: qa
date_resolved: '2026-06-04'
root_cause: Free-mode completion paths reset round state without appending to sessionHistory (guided paths do append)
resolution: Added buildRoundHistoryEntry helper + sessionHistory append and currentRound increment to both free-mode reset sites (handleFreeDiscussAnother bothDone + free reactive safety-net useEffect)
type: bug
rank: 1000769
severity: high
workstream: C1
date_reported: '2026-06-02'
created_date: '2026-06-02'
tags: [live, session-history, data-loss, rounds]
delivery_stage: ship
pipeline_ran: [create-bug, reproduce, fix, ship]
reproduce_artifact:
  test_file: e2e/p879-free-mode-rounds-not-recorded.spec.ts
  root_cause: "Free-mode completion paths (handleFreeDiscussAnother bothDone ~1805 + free reactive safety-net useEffect ~2497) reset round state without appending to sessionHistory; guided paths (~2408/~2480) do append. Free rounds are therefore never recorded."
  confidence: high
  surfaces_in_scope: [free-reactive-reset, free-discuss-another]
  surfaces_deferred: [guided-both-ack-handshake]
  reproduced_at: 2026-06-04
---

# P879: /live rounds not recorded in sessionHistory ("no rounds completed" despite real activity)

## Summary

A two-party `/live` session can run multiple checks/rounds yet persist `sessionHistory: []`, so Session History shows "no rounds completed." Per-round detail (ratings, content, journey) is silently lost — only aggregate counters survive.

## Root Cause

**CONFIRMED (free mode) — reproduced by `e2e/p879-free-mode-rounds-not-recorded.spec.ts` (FAILS pre-fix: `sessionHistory.length` is 0, expected ≥1).**

`sessionHistory` is appended in `src/app/pages/clarity-live-page.tsx` only on the **guided** completion paths:
- `handleCelebrationComplete` bothDone block (~line 2408) — appends a completed round
- guided reactive safety-net useEffect (~line 2480) — same
- `handleSkip` (~line 2319) — appends a `skipped` entry

The **free-mode** completion paths reset all round state but **never append**:
- `handleFreeDiscussAnother` bothDone block (~line 1805)
- free reactive safety-net useEffect (~line 2497) — exercised by the canary

So a free-mode (`sessionMode: 'free'`, "Speak freely") session records **zero** rounds no matter how many the pair completes — a structural, 100%-reproducible loss. `checksCount` increments on the check path (~line 2761), independent of the append, which is why the real session `GFEPZL` shows `checksCount: 3` with `sessionHistory: []`.

**Not a P813 bug.** P813 only changed the Session History display filter (`sessions-service.ts:70`). The empty `sessionHistory` originates in the unchanged `/live` recording path — P813's "show all" merely made the already-broken session *visible*.

### Deferred (separate scenario, not yet a confirmed bug)

**H2 — Guided mode both-ack gate.** In guided mode the append fires only when **both** parties acknowledge the celebration. A guided round abandoned before mutual celebration records nothing. Whether that is a bug (handshake broke) or expected (genuinely abandoned) needs its own reproduction. Tracked in `reproduce_artifact.surfaces_deferred` and filed as **P892** (`features/p892_guided_round_abandoned_before_mutual_celebration_not_recorded.md`) — out of scope for this fix.

## Evidence (test DB)

Session `GFEPZL` (test DB `gfjctyxqlwexxwsmkakq`, created 2026-06-02T14:16:48Z), inspected live:
- `joiner_profile_id` set (two parties present), `creator_name` = founder
- `live_state.checksCount = 3`, `checksTotal = 14` — real activity occurred
- `live_state.sessionHistory = []` — **zero rounds recorded**
- `live_state.currentRound = 1`, `ratingPhase = idle`, `explainBackRatings = []`, `checkerRating`/`responderRating` null

Per-round data was never written, so it is **not recoverable** — only aggregate counters remain.

## Reproduction Steps

1. Open `/live` as the creator (verified), start a session.
2. Join as a second party (second tab / device) so `joiner_profile_id` is set.
3. Run through a check / rating cycle (numbers entered by both sides).
4. Continue to next round WITHOUT both parties reaching + acknowledging the completion celebration "Continue" (e.g. one side advances, tab closed mid-celebration, or the both-ack handshake never fires).
5. End or leave the session.
6. Open `/me/sessions`, tap the session.
7. Observe: "no rounds completed" — `sessionHistory` is empty despite `checksCount > 0`.

**Reproduction rate:** Observed once (GFEPZL). Exact trigger for the missed `bothDone` path to be confirmed in `/reproduce`.

## Expected Behavior

Every round in which both parties entered numbers and completed the check cycle is persisted to `sessionHistory` and appears in Session History with its ratings/content — independent of whether the celebration acknowledgment handshake completed for both parties.

## Actual Behavior

Rounds that don't reach the mutual celebration-acknowledge path are never written to `sessionHistory`. The session shows "no rounds completed" and the round detail is permanently lost.

## Affected Files

- `src/app/pages/clarity-live-page.tsx` — `handleSkip` (~2319), `handleCelebrationComplete` bothDone branch (~2352), reactive-reset twin (~2433); `checksCount` increment path (separate from sessionHistory append)
- `src/app/data/sessions-service.ts:41-42` — derives `roundCount` from `sessionHistory.filter(!skipped).length` (correctly reflects the empty array; not the cause)

## Severity

**High** — core product activity (completed rounds) is silently lost for a class of session-completion paths; the user sees no error, just an empty history. Data loss, no workaround.

## Fix Approach

To be confirmed in `/reproduce`. Likely direction: decouple the `sessionHistory` append from the both-parties celebration-acknowledge gate — persist a round entry when the check/rating cycle completes, rather than waiting on the mutual "Continue" handshake. Verify the fix does not double-append when celebration acknowledgment also fires.

**Reproduction requirement (`.claude/rules/live.md`):** the bug is not reproduced until a **two-party, UI-driven** E2E (button clicks, not `advanceSessionState` DB merges) fails on the pre-fix commit and passes post-fix. A DB-merge canary will bypass the `updateLiveState` handler path and give false confidence.

## Acceptance Criteria

- [x] A two-party free-mode `/live` session where both parties complete a check cycle records the round in `sessionHistory` (confirmed scope: free mode, both completion paths — the guided abandoned-handshake scenario is P892)
- [x] Session History shows the recorded round(s) with ratings/content, not "no rounds completed" (canary asserts "1 round" on the session's `/sessions` row; screenshot `test-results/p879-session-history-shows-round.png`)
- [x] No double-counting when the celebration-acknowledge path also fires for the same round (canary asserts `sessionHistory.length === 1` exactly; dual-ack guards mirror guided mode)
- [x] `checksCount > 0` free-mode sessions never show an empty `sessionHistory` for completed check cycles (guided abandoned-handshake case tracked as P892)
- [x] Two-party UI-driven regression test passes: `e2e/p879-free-mode-rounds-not-recorded.spec.ts` (failed pre-fix on 2026-06-04, passes post-fix)
- [x] No console errors during the affected flow (canary asserts zero console errors on both clients)
