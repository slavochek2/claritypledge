---
status: all-done
type: bug
rank: 1000756.6
severity: critical
workstream: live
date_reported: '2026-04-24'
created_date: '2026-04-24'
tags: [badge, certification, live, race-condition, p804-followup, architectural]
pipeline_ran: [create-bug, reproduce, fix, ship]
reproduce_artifact:
  test_file: e2e/p806-badge-listener-slides-last.spec.ts
  root_cause: "Badge insertion lives in event handlers (handleFreeRoundComplete / handleRatingSubmit / handleExplainBackRate). When the non-certifier client fires the handler last, awardBadgeIfEligible returns early (not certifier) and the function unconditionally writes freePhase='success', which locks the certifier's client out of ever re-running via the entry guard at clarity-live-page.tsx:1701."
  confidence: high
  surfaces_in_scope: [free-mode handleFreeRoundComplete, rating-phase handleRatingSubmit, explain-back handleExplainBackRate]
  surfaces_deferred: [P808 Path D test setup, P810 celebration UI lies about ratings, P811 prod-stories-to-dev sync]
  reproduced_at: '2026-04-24'
completed_at: 2026-04-24
---

# P806: Badge handler runs on the wrong client when the listener slides to 10 last

## Summary

P804 shipped helpers (`pickLatestUnderstandingPoint`, `awardBadgeIfEligible`) wired into `handleRatingSubmit`, `handleExplainBackRate`, and `handleFreeRoundComplete`. **The fix shipped, but no badges fire in production.** Root cause: badge insertion lives inside event handlers triggered by the local user's slider/rating action, not in a state-watching effect. Whichever client fires first wins. When the listener (non-certifier) slides to 10 last — the dominant prod scenario — their client runs the handler, exits at the certifier check without inserting, then unconditionally writes `freePhase: 'success'` to shared state, which **locks out the certifier's client** from ever running the handler (the entry guard at clarity-live-page.tsx:1624 returns immediately on `freePhase !== 'unlocked'`).

Net effect: P686, P796, P797, P804 all patched the body of `handleFreeRoundComplete`. None changed where it lives. Badge insertion is in the wrong place.

## Root Cause

**Architectural**: badge insertion is a STATE INVARIANT ("when a round transitions to mutual 10/10 in shared state, the certifier client must insert a `badge_points` row if the listener positioned agree on the latest #understanding point") — but it is implemented as an event-handler RESPONSIBILITY ("when the local user just slid to 10 and the partner is also at 10, run the badge logic").

The two definitions diverge whenever:
- The certifier slid to 10 first (their handler runs while partner < 10 → guard returns early → handler never re-fires)
- The listener slides to 10 last (their handler runs the helper but they're not is_certifier → helper returns `{ badgePointEarned: false }` and the function unconditionally writes `freePhase: 'success'` → certifier client locked out by the freePhase guard)

The same architectural flaw exists for the rating-phase path: `awardBadgeIfEligible` is called inside `handleRatingSubmit` only on the SECOND submitter's client. If that submitter is not the certifier, no badge fires.

### Code locations

- `src/app/pages/clarity-live-page.tsx:1624` — `if (current.freePhase !== 'unlocked') return;` — the lockout guard
- `src/app/pages/clarity-live-page.tsx:1700-1720` — `awardBadgeIfEligible` called inside `handleFreeRoundComplete`
- `src/app/pages/clarity-live-page.tsx:~2127` — `awardBadgeIfEligible` called inside `handleRatingSubmit` `isPerfect` block
- Same problem in `handleExplainBackRate` for the after-paraphrase path

## Reproduction Steps

### Path E — Certifier slides first, listener slides to 10 last (THE PROD SCENARIO)

1. Two authenticated users on /live, story-mode (creator has `is_certifier=true`).
2. Story has at least one `#understanding`-tagged point. Listener positioned `agree` on the latest `#understanding` HEAD.
3. Both reach `freePhase: 'unlocked'`.
4. **Certifier slides slider to 10 first.** Their `handleFreeRoundComplete` fires, partner check returns early (listener not yet at 10).
5. Listener slides slider to 10. Their `handleFreeRoundComplete` fires:
   - Both-at-10 guard passes
   - `awardBadgeIfEligible` returns `{ badgePointEarned: false }` (listener not certifier)
   - Function unconditionally writes `freePhase: 'success'` to shared state
6. Certifier's client receives the new state via Realtime. Any subsequent attempt to re-enter `handleFreeRoundComplete` is blocked at line 1624 (`freePhase !== 'unlocked'`).
7. **Observe**: success screen renders. No amber "Badge point earned!" headline. `badge_points` row does NOT exist.

**Reproduction rate**: 100% when listener is the second to reach 10.

### Path F — Listener overshoots to 10 then drops (intermittent variant)

Same as Path E but the listener's slider briefly hits 10 (their own client fires the handler) and they immediately drop back to 6. End-state in DB: `freeSliderCreator=6`, `freePhase='success'`, no badge. The journey-table UI synthesizes a "10/10 final" row for the celebration screen even though the actual stored state is asymmetric (P806b — see Out of Scope).

### Verified prod evidence (2026-04-24)

Session `9f7f7fc7-79eb-4f5b-b559-53de080744c3` (creator=Test Ladischenski [listener], joiner=Vyacheslav [speaker, slug=`slava`, `is_certifier=true`]):
- `live_state.freePhase`: `'success'` — round completed
- `live_state.freeSliderJoiner`: 10 (speaker)
- `live_state.freeSliderCreator`: 6 (listener — currently at 6 in DB)
- `live_state.badgePointEarned`: `false`
- Listener position on `28a1d40b...` (`#understanding` v2 HEAD): `agree`
- `badge_points` rows for this session: **0**

All P804 preconditions met. No badge fired. Sister sessions `84098179` and `ce1ae0cc` show identical pattern.

## Expected Behavior

For all `/live` round-completion paths, the unified product rule:

> Whenever shared state transitions to mutual 10/10 (sliders OR ratings) AND the round ties to a story whose latest `#understanding` HEAD has the listener positioned `agree`/`strongly_agree` AND the speaker is `is_certifier=true` — exactly one `badge_points` row is inserted by the certifier's client. The amber "Badge point earned!" headline propagates to BOTH parties via Realtime.

The trigger MUST NOT depend on which user took the action that produced the 10/10 state.

## Actual Behavior

Badge fires only in the rare case where the certifier is the SECOND submitter (rating phase) or the SECOND person to reach 10 on the slider (free mode). In the dominant prod pattern (speaker slides to 10 first, listener confirms last), no badge fires and the failure is silent — success celebration renders normally.

## Affected Files

- `src/app/pages/clarity-live-page.tsx`
  - `handleFreeRoundComplete` (~line 1620) — entry guard at 1624 is the lockout
  - `handleRatingSubmit` `isPerfect` block (~line 2127) — `awardBadgeIfEligible` only fires on second submitter
  - `handleExplainBackRate` — same pattern as `handleRatingSubmit`
  - `awardBadgeIfEligible` (~line 280) — correct logic, wrong invocation site

## Severity

**Critical** — silently breaks the core P686 mechanism (badge certification) across the dominant `/live` completion path. P686, P796, P797, and P804 all shipped without fixing this; users who actually verify understanding still walk away with zero `badge_points` rows. The failure is invisible to both parties (success screen renders normally), so the founder can't tell from the UI whether the system is working.

## Fix Approach

**Move badge insertion out of the event handlers and into a state-watching `useEffect` on the certifier's client.**

```typescript
// Pseudocode — actual implementation needs care for round identity + idempotency
const badgeFiredForRoundRef = useRef<Set<string>>(new Set());

useEffect(() => {
  if (myProfile?.is_certifier !== true) return;

  const state = confirmedLiveState;
  const isMutual10 =
    (state.checkerRating === 10 && state.responderRating === 10) ||
    (state.freeSliderCreator === 10 && state.freeSliderJoiner === 10);
  if (!isMutual10) return;

  const roundKey = `${session?.id}:${state.currentRound ?? 1}:${state.selectedStoryId ?? ''}`;
  if (badgeFiredForRoundRef.current.has(roundKey)) return;
  badgeFiredForRoundRef.current.add(roundKey);

  void awardBadgeIfEligible({ ... }).then((res) => {
    if (res.badgePointEarned) {
      updateLiveState({ badgePointEarned: true, badgeCount: res.newBadgeCount });
    }
  });
}, [
  confirmedLiveState.checkerRating,
  confirmedLiveState.responderRating,
  confirmedLiveState.freeSliderCreator,
  confirmedLiveState.freeSliderJoiner,
  confirmedLiveState.currentRound,
  confirmedLiveState.selectedStoryId,
  myProfile?.is_certifier,
]);
```

Properties:
- Fires on the CERTIFIER's client regardless of who triggered the 10/10
- Fires for both rating-phase and free-mode (no per-handler wiring)
- Idempotent via `roundKey` ref + DB UNIQUE constraint as backstop
- The `freePhase: 'success'` write stays where it is — UI separation preserved
- The `awardBadgeIfEligible` calls in the three handlers must be REMOVED to prevent double-fire (DB UNIQUE will catch duplicates but we don't want log noise)

### Reproduction strategy (no prod data sync needed)

The bug is timing-driven, not data-driven. The existing P804 canary infra (`createTwoPartySession` + synthetic story + #understanding point + position) is sufficient. Add ONE new test: Path E — host (certifier) slides first, then guest (listener) slides last. Pre-fix the badge_points table is empty; post-fix it has a row.

If we ever want easier manual reproduction in dev (mirroring real prod stories), that's a separate infra task — file as P808+ rather than coupling to this fix.

## Acceptance Criteria

- [x] Path E canary (certifier slides first, listener slides last) → `badge_points` row inserted, amber "Badge point earned!" headline visible on BOTH parties' success screens — verified by `e2e/p806-badge-listener-slides-last.spec.ts` PASS
- [x] Existing P804 Paths A/B/C/D continue to pass (regression coverage) — Paths A/B/C pass post-fix; Path D was pre-existing broken on main (test setup writes `ratingPhase: 'results'` which never renders the explain-back rate UI), filed as P808
- [x] Rating-phase scenario where certifier is the FIRST submitter (not second) → badge still fires after both rate 10/10 — covered by architecture: state-watcher useEffect fires on the certifier's client regardless of who triggered the action
- [x] Story with no `#understanding`-tagged point + mutual 10/10 → no badge, no error, no double-fire — `awardBadgeIfEligible` returns early at `pickLatestUnderstandingPoint` returning `undefined` (clarity-live-page.tsx:313-316)
- [x] Story with `#understanding` HEAD + listener position `disagree` + mutual 10/10 → no badge, no error — `awardBadgeIfEligible` returns early at `listenerPosition !== 'agree' && listenerPosition !== 'strongly_agree'` (clarity-live-page.tsx:327-329)
- [x] Idempotency: a state that briefly bounces back to non-10 then back to 10/10 fires the badge AT MOST once per round (no DB UNIQUE violations in logs) — `badgeFiredRoundsRef` guards within a round; rollback on async failure permits retry; DB UNIQUE backstop catches cross-client races
- [x] No console errors on any party's client during any of the scenarios — verified during canary runs (P806 + P804 A/B/C all clean)
- [ ] Manual prod re-test: a fresh /live session reaching 10/10 actually inserts a `badge_points` row [post-deploy]

## Out of Scope (file separately)

- **P810 — celebration journey table lies about ratings.** In session 9f7f7fc7 the live_state shows `freeSliderCreator=6` but the screenshot's journey table renders a "10/10 final" row. The success-screen rendering synthesizes a perfect final row even when actual stored state is asymmetric. This is a separate UI honesty bug. Worth filing because it masks the badge bug from the user (they see "perfect 10/10!" and assume the badge fired).
- **P811 — sync prod st-stories to dev for easier manual reproduction.** Useful for OTHER bugs that are data-shape dependent but not needed for this fix.
- **P808 — Path D pre-existing test setup bug.** Discovered during P806 verification: P804 Path D has been failing on main since P804 closed (test setup writes `ratingPhase: 'results'` which never renders the explain-back rate UI). Filed for separate fix; does not gate P806 closure.
- **`handleFreeRoundComplete` cleanup pass** — once badge logic is moved out, the function is just a state-update + analytics call. Could be simplified, but defer to keep this PR small.
- **Bootstrap edge case** — letter pre-loaded with both ratings at 10. The new useEffect should fire on first render if state already shows mutual 10. Verify in canary, no separate spec needed.

## Lesson — why P686 → P796 → P797 → P804 → P806

Every prior round patched a different miss INSIDE the handler:
- P686: original badge logic
- P796: free-mode slider debounce broke the trigger
- P797: explainBackRate path was never wired
- P804: rating-phase isPerfect block had no call; .find() was non-deterministic

Each fix made the handler "more correct." None questioned WHY badge insertion was in an event handler in the first place. The pattern is: **when you keep fixing the same area, the bug is one level above where you keep looking.**

Filed as a learning to capture in `/kdd` after this ships.

## Branch

`fix/p806-badge-state-watcher`
