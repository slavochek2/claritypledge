---
status: all-done
type: bug
rank: 1000801.0
severity: medium
workstream: live
date_reported: '2026-04-25'
created_date: '2026-04-25'
tags: [live, badge, p806-followup, state-reset]
pipeline_ran: [create-bug, reproduce, reproduce.2, fix, ship]
pipeline_plan: [create-bug, reproduce, fix, ship]
architect_plan: ~/.claude/plans/nested-cooking-stonebraker.md
reproduce_artifact:
  test_file: e2e/p814-badge-flag-persists-across-rounds.spec.ts
  root_cause: "Three round-reset paths in clarity-live-page.tsx (handleCelebrationComplete bothDone block at line 2321, P525 reactive safety-net useEffect at line 2397, P592 free reactive safety-net useEffect at line 2438) omit `badgePointEarned: false, badgeCount: 0` from their updateLiveState resets. Only handleFreeDiscussAnother:1822 clears them. Pre-P806 the rating-mode badge never fired so the omission was invisible; P806's state-watcher useEffect made it user-visible. The watcher's early-return at line 1614 (`if (liveState.badgePointEarned === true) return`) compounds the symptom by suppressing future round badges once stale `true` persists."
  confidence: high
  surfaces_in_scope: [rating-mode-handle-celebration-complete, rating-mode-reactive-safety-net, free-mode-reactive-safety-net]
  surfaces_deferred: []
  reproduced_at: '2026-04-25'
  prod_evidence: "session VG6CJR (2026-04-25 08:16 UTC) — round 1 fired badge legitimately (badgeCount 3→4), round-reset moved to currentRound=2/ratingPhase=idle/selectedStoryId=null but badgePointEarned: true persisted"
completed_at: 2026-04-25
---

# P814: Stale `badgePointEarned` flag persists across rating-phase rounds

## Summary

After P806 made the certifier's state-watcher useEffect actually fire badges in the rating-phase path, a latent bug surfaced: the rating-phase round-reset paths in `clarity-live-page.tsx` never clear `badgePointEarned`/`badgeCount`. Subsequent rounds inherit the stale `true` flag — the amber "Badge point earned!" headline renders on rounds that did not earn a badge, and the P806 watcher's early-return short-circuits new badge attempts.

## Root Cause

Two reset paths in `clarity-live-page.tsx` are missing the badge-flag clear:

1. `handleCelebrationComplete` `bothDone` block (lines 2314–2346) — the `updateLiveState({...})` call that transitions to the next round
2. The reactive safety-net useEffect (lines 2390–2415) — parallel `updateLiveState({...})` call when both clients have acknowledged celebration

The free-mode equivalent at `handleFreeDiscussAnother` (lines 1815–1816) already clears both `badgePointEarned: false` and `badgeCount: 0` — the rating-phase paths are an asymmetric omission. Pre-P806, badges never fired in rating-phase so this was invisible. P806's state-watcher useEffect made the omission user-visible.

The P806 watcher itself short-circuits via `if (liveState.badgePointEarned === true) return` (line 1607) — once a stale `true` persists, no future badge fires for the session until the flag is cleared.

## Reproduction Steps

**Path A — Prod-observed (rare; requires multi-round flow with one badge round):**

1. Two-party /live session in rating mode, host is certifier
2. Round 1: speaker + listener both rate 10, listener positioned `agree`/`strongly_agree` on the speaker's #understanding point → badge fires, `live_state.badgePointEarned = true`, amber headline renders
3. Both acknowledge celebration → reset path runs → next round selected
4. Round 2: select a different story whose #understanding point the listener has positioned `slightly_agree` (or no eligible point at all). Both rate 10 → reachedPerfect → celebration screen renders
5. Observe: amber "Badge point earned!" headline still visible on round 2's celebration despite no qualifying badge

**Reproduction rate:** 100% in the canary (deterministic via `advanceSessionState`); rare in real prod use because it requires multiple rounds with mixed badge eligibility (prod evidence: session UN2RWG, code `5763f31c-b31e-493b-a1bb-c7eac5a7e024`).

## Expected Behavior

After round 1's celebration is acknowledged and round 2 begins, `badgePointEarned` and `badgeCount` reset to `false` / `0` (mirroring `handleFreeDiscussAnother`). On round 2's celebration screen, the amber headline only renders if round 2 actually earned a badge. The P806 watcher is free to fire (or correctly short-circuit) based on round 2's data alone.

## Actual Behavior

Round 2's celebration inherits round 1's `badgePointEarned: true` flag. The amber headline renders falsely. The P806 watcher short-circuits via its early-return guard, suppressing any qualifying round-2 badge.

## Affected Files

- `src/app/pages/clarity-live-page.tsx:2314-2346` — `handleCelebrationComplete` bothDone block (Edit A)
- `src/app/pages/clarity-live-page.tsx:2390-2415` — reactive safety-net useEffect (Edit B)
- `src/app/pages/clarity-live-page.tsx:1815-1816` — `handleFreeDiscussAnother` (reference pattern, no change)
- `src/app/pages/clarity-live-page.tsx:1599-1656` — P806 watcher (context only, do not modify)
- `src/app/components/partners/live-mode-view.tsx:3103` — DOM target for amber headline assertion (`{liveState.badgePointEarned && (...)}`)

## Severity

**Medium** — UI honesty (false amber headline) + functional regression (suppresses subsequent badges in the session). Not blocking core flow; user can still complete /live rounds. Surfaces alongside the P806 fix's intended behavior, so impact scales with badge-eligible mutual-10 round counts.

## Fix Approach

Per architect plan at `~/.claude/plans/nested-cooking-stonebraker.md`:

- **Edit A** — Add `badgePointEarned: false, badgeCount: 0` to `handleCelebrationComplete` bothDone block's `updateLiveState({...})` call
- **Edit B** — Same insertion in the reactive safety-net useEffect's `updateLiveState({...})` call
- **Do NOT clear** `badgeFiredRoundsRef.current` — `roundKey = ${sessionId}:${selectedStoryId}:${currentRound}` already namespaces per round, and clearing would create a new failure mode (late Realtime echo for round N racing the round N+1 reset could re-fire round N's badge). DB UNIQUE on `badge_points (user_id, point_id)` is the backstop.

Canary: `e2e/p814-reproduce.spec.ts` — two-round Playwright flow using `createTwoPartySession` + `advanceSessionState`. Round 1 earns a badge for storyA, round 2 selects storyB with non-qualifying listener position. Asserts: amber headline NOT visible on host on round 2; `badge_points` count for the session = 1.

## Acceptance Criteria

- [x] On round 2's celebration screen, the amber "Badge point earned!" headline is NOT visible when round 2 has no qualifying badge
- [x] `live_state.badgePointEarned` is `false` (or absent) after the round-1→round-2 reset settles
- [x] `live_state.badgeCount` is `0` (or absent) after the round-1→round-2 reset settles
- [x] A qualifying round-2 #understanding point still triggers the watcher to insert a new `badge_points` row (no permanent suppression) — covered by code-pattern mirror per architect plan; canary asserts negative case (watcher correctly does not fire on disagree position)
- [x] No regression on free-mode "discuss another" reset (`handleFreeDiscussAnother` continues to clear correctly)
- [x] No regression on round-1 badge insertion (P806 path still works end-to-end)
- [x] Regression test passes: `e2e/p814-badge-flag-persists-across-rounds.spec.ts`
- [x] No console errors during the two-round flow — accepted per user decision; canary uses architect-default no-console-listener coverage
