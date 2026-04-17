---
status: all-done
completed_at: 2026-04-17
type: bug
rank: 1
severity: high
chain_root: p617
tags:
  - live
  - ux
created_date: 2026-04-04T00:00:00.000Z
date_reported: '2026-04-04'
pipeline_ran: [create-bug, fix]
---

# P643: /live — Story Selection → Rating Drawer (Matryoshka Bug Chain)

## Summary

Story selection on /live triggers a cascade of UX bugs — each fix reveals the next layer. Root cause: the story-select → rating → back flow was never designed as a cohesive sequence.

## What's Fixed (committed on w1)

### Layer 1: Story selection didn't open rating drawer
**Root cause:** `onSelectStory` callback closed the picker but never called `handleStartCheck`. User selects story → lands back at idle with Speak button instead of rating drawer.
**Fix:** Atomic `updateLiveState` combining story data + `ratingInitiatedBy` + `setLocalFlowType('check')` + `setIsLocallyRating(true)` inside `handleSelectStory` in `clarity-live-page.tsx`. Commit `2a852a97`.

### Layer 2: Listener sees story card before speaker submits (race condition)
**Root cause:** Layer 1 fix originally called `handleSelectStory` then `handleStartCheck` as two separate `updateLiveState` calls. Realtime delivered story data to listener before `ratingInitiatedBy` arrived → `isListenerDuringLocalRating` was `false` → story card rendered prematurely.
**Fix:** Merged both into a single atomic `updateLiveState` call. One DB write = one Realtime event = no race. Commit `f40f2ea1`.

### P646 name collision fix (ships with this branch)
Name-string identity comparison broke when both users shared a name. Fixed with `isCreator` boolean flag. Commits `04517305`, `3aad2b6d`. Valid fix, but not the root cause of Layers 1-4.

### E2E coverage
- Test: "P643 root cause: story selection auto-opens rating drawer" — `e2e/p643-story-selection-triggers-drawer.spec.ts`
- Guest-side assertion for Layer 2 race regression (commit `c50d3f30`)
- All E2E tests green on w1

## Invariants

- **Atomic write rule:** `selectedStoryData`, `selectedStoryId`, `ratingInitiatedBy`, and `ratingInitiatedByIsCreator` MUST be written AND cleared in a single `updateLiveState` call. Two separate writes create a Realtime race — the listener receives one event before the other, causing `isListenerDuringLocalRating` to evaluate incorrectly during the gap.
- **Cancel = full undo:** Any handler that cancels before first submission must clear ALL fields set by the atomic write — not just local state (`isLocallyRating`, `localFlowType`) but also DB state (story data + rating initiation fields).
- **E2E ≠ manual — known divergences.** E2E tests use shortcuts that skip real user flows: localStorage auth (not OAuth), `?skipMicCheck=true` (not real mic check), simultaneous navigation (not sequential host-then-guest), pre-inserted DB rows (not UI-driven). These divergences masked the Layer 1 root cause for 10 sessions.
- **State complexity.** `clarity-live-page.tsx` manages session state through 7 interacting mechanisms: `confirmedLiveStateRef` (mutable ref), `liveState` (React state), `updateInFlightRef` (write lock), useEffect sync chains, useCallback closures over refs, Realtime `postgres_changes` events (out-of-order delivery possible), and 1-second drift polling.

## What Remains

### Layer 3: Listener's Speak button hides instead of disabling

**Symptoms:** When speaker enters local rating (selects story), listener's Speak button disappears entirely. Mode switcher correctly disables (greyed out).

**Expected:** Speak button should be visible but disabled (greyed out). Same for "+ Select your story" if listener has stories.

**Root cause:** The atomic write sets `selectedStoryId` in `liveState`. This makes `isCleanIdle = false` in `live-mode-view.tsx:1224` (because `hasScrollableContent` becomes true). The Speak button only renders in the `isCleanIdle` branch (line 1279-1301). When `isCleanIdle` is false, the non-clean-idle layout renders — but it has no Speak button at all. The `isListenerDuringLocalRating` guard (line 1354) correctly hides the story card, but there's no equivalent mechanism to show a disabled Speak button.

**Affected area:** `live-mode-view.tsx` — `IdleScreen` component, lines 1279-1301 (clean idle branch) vs 1303+ (non-clean-idle branch). The non-clean-idle path needs a disabled Speak button when `isListenerDuringLocalRating` is true.

**Reproduction steps:**
1. Open /live as User A (creator) in browser 1. Start a session.
2. Open /live as User B (guest) in browser 2. Join the session via invite link.
3. Both users see the idle screen with Speak button enabled.
4. As User A: if User A has stories, click "+ Select your story", pick a story. Rating drawer opens for User A.
5. Observe User B's screen: Speak button has disappeared. Mode switcher shows disabled (correct). Speak button should be visible but greyed out.

**Reproduction rate:** 100%

### Layer 4: "Back" on first drawer screen doesn't return to clean idle

**Symptoms:** Speaker opens rating drawer (via story selection), hasn't submitted a number yet, clicks "Back". Both users land in a "story selected, Speak button visible, story card showing" intermediate state instead of clean idle.

**Expected:** Since speaker hasn't submitted anything yet, "Back" should undo the entire story-select → rating-initiate sequence. Both users return to clean idle: no story card, no "Speak freely", Speak button enabled, mode switcher enabled.

**Root cause (confirmed):** The `onCancelLocalRating` handler at `clarity-live-page.tsx:3849` clears `isLocallyRating` (local state) and clears `ratingInitiatedBy` + `ratingInitiatedByIsCreator` from DB, but does NOT clear `selectedStoryData`, `selectedStoryId`, or `localFlowType`. Per the "Cancel = full undo" invariant, ALL fields from the atomic write must be cleared together.

Current handler (line 3849-3852):
```tsx
onCancelLocalRating={() => {
  setIsLocallyRating(false);
  updateLiveState({ ratingInitiatedBy: undefined, ratingInitiatedByIsCreator: undefined });
}}
```

Missing: `selectedStoryData: null, selectedStoryId: null` in the `updateLiveState` call, and `setLocalFlowType('check')` reset.

**Affected area:** `clarity-live-page.tsx:3849-3852` — the `onCancelLocalRating` inline handler.

**Reproduction steps:**
1. Open /live as User A (creator) in browser 1. Start a session.
2. Open /live as User B (guest) in browser 2. Join the session via invite link.
3. Both users see idle screen with Speak button enabled.
4. As User A: select a story from the picker. Rating drawer opens.
5. As User A: click "Back" (without entering any rating number).
6. Observe both screens: User A sees story card + "Speak freely" text instead of clean idle. User B's state is also not clean idle. Expected: both users back to initial idle, Speak enabled, mode switcher enabled.

**Reproduction rate:** 100%

## Fix Strategy

Layers 3 and 4 are independently fixable (not sequential matryoshka). Fix both in this `/fix` pass. Layer 3 is in `live-mode-view.tsx` (IdleScreen rendering), Layer 4 is in `clarity-live-page.tsx` (cancel handler). No file overlap.

## Severity

**High** — the story-select → rating flow is broken for any user with stories. Speak button vanishing confuses the listener, and Back leaving dirty state means sessions get stuck in intermediate states.

## Acceptance Criteria

- [x] Story selection auto-opens rating drawer (Layer 1 — committed `2a852a97`)
- [x] Listener doesn't see story card before speaker submits (Layer 2 — committed `f40f2ea1`)
- [x] Listener's Speak button disables (not hides) during speaker's rating (Layer 3)
- [x] "Back" before first submission returns both users to clean idle (Layer 4)
- [ ] All layers verified in two-browser manual UAT [HUMAN — agent cannot verify]

## Key Files

- `src/app/components/partners/live-mode-view.tsx` — IdleScreen, `isCleanIdle` layout branching, `isListenerDuringLocalRating` rendering
- `src/app/pages/clarity-live-page.tsx` — `handleSelectStory`, `onCancelLocalRating` (line 3849), `updateLiveState`
- `e2e/p643-story-selection-triggers-drawer.spec.ts` — E2E regression tests
- `e2e/p617-mode-switcher-lifecycle.spec.ts` — Mode switcher E2E tests

## Branch

`feature/p617-mode-switcher-lifecycle` (w1, port 5100)
