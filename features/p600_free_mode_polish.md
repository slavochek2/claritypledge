---
status: in-progress
type: story
rank: 0.19
tags:
  - epic-story-first
  - live
  - p562
flow: dev
delivery_stage: uat
created_date: 2026-03-28T00:00:00.000Z
---

# P600: Free Mode Polish — Exit Consistency + Visual Feedback

**Depends on:** P562 (free mode core, on branch `prototype/p562-new-live` in w2)
**Priority:** Ship-blocker for P562 — these are functional gaps, not nice-to-haves

---

## Problem Statement

P562 free mode core works (guided first round → sliders unlock → live updates). Four issues remain before shipping:

1. **"Speak freely" doesn't fully exit free mode** — `handleSkip` (called after confirmation dialog) clears guided mode state but leaves `freePhase`, `freeSliderCreator/Joiner`, `freeRounds` set. Users get stuck in a broken state.

2. **Success screen (10/10) lacks dual-acknowledgment** — One user clicking "Discuss another story" immediately resets for both. Should require both to click "Continue" (same as guided mode celebration).

3. **Live-updating Journey dots not visually distinct** — The live row (current slider positions) uses the same black dots as committed rounds. Should be blue to signal "this is live, not committed."

4. **No feedback when partner moves slider** — In unlocked phase, partner's slider changes update the Journey silently. A brief toast would draw attention to the change.

---

## Acceptance Criteria

### Fix 1: handleSkip clears free mode state
- [x] Add `freePhase: undefined, freeSliderCreator: undefined, freeSliderJoiner: undefined, freeRounds: undefined` to `handleSkip`'s `updateLiveState` call in `clarity-live-page.tsx` (~line 1813)
- [x] After "Speak freely" confirmation in slider phase, both users return cleanly to idle entry screen

### Fix 2: Dual-acknowledgment for success screen
- [x] "Discuss another story" on success screen uses `celebrationAcknowledgedByCreator/Joiner` pattern
- [x] First user to click sees "Waiting for [partner] to continue..."
- [x] Only when both click does state reset to idle
- [x] Reuse `handleCelebrationComplete` with free mode branch that resets to idle (clears all free mode + guided state)

### Fix 3: Blue dots for live row
- [x] In `free-mode-view.tsx`, the live-updating DotBar row uses `text-blue-500` instead of `text-foreground`
- [x] Committed round rows remain black (`text-foreground`)

### Fix 4: Toast on partner slider move
- [x] In `FreeModeView`, useEffect diffs `partnerSliderValue` (from Realtime)
- [x] On change: show toast with partner name + new value (e.g., "Alex moved to 7/10")
- [x] Toast uses existing `toast.custom()` pattern with `id: 'live-slider'` (replaces on rapid moves)

---

## Technical Notes

**Files to modify:**
- `src/app/pages/clarity-live-page.tsx` — Fix 1 (handleSkip), Fix 2 (handleCelebrationComplete free mode branch)
- `src/app/components/partners/free-mode-view.tsx` — Fix 3 (blue dots), Fix 4 (slider toast)
- `src/app/components/partners/free-mode-success.tsx` — Fix 2 (add waiting state + dual-ack callback)

**Reuse:**
- `celebrationAcknowledgedByCreator/Joiner` keys (existing in LiveSessionState)
- `isBothAcknowledged()` / `isBothAcknowledgedCompat()` helpers (existing in clarity-live-page.tsx)
- `toast.custom()` pattern from position change toast (live-mode-view.tsx ~line 453)
- `WaitingIndicator` pattern from guided mode celebration (live-mode-view.tsx ~line 2867)

**Branch:** Start from `prototype/p562-new-live` (w2) or create new worktree
