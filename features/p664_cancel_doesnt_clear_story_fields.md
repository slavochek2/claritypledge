---
status: backlog
type: bug
rank: 5
chain_root: p617
tags:
  - live
  - ux
created_date: 2026-04-06T00:00:00.000Z
---

# P664: Cancel After Story Selection Doesn't Clear Story Fields (Layer 4)

## Problem

After selecting a story and opening the rating drawer, if the speaker cancels, `onCancelLocalRating` clears `ratingInitiatedBy` and `ratingInitiatedByIsCreator` but leaves `selectedStoryId`, `selectedStoryData`, and `selectedContentTitle` in the DB. Both users remain in an intermediate state: story selected, Speak button visible, story card showing on the listener side.

This violates the "Cancel = full undo" invariant documented in the P643 spec.

## Fix

`onCancelLocalRating` handler in `clarity-live-page.tsx` (~line 3849) needs to also clear the story fields:

```tsx
onCancelLocalRating={() => {
  setIsLocallyRating(false);
  updateLiveState({
    ratingInitiatedBy: undefined,
    ratingInitiatedByIsCreator: undefined,
    selectedStoryId: undefined,
    selectedStoryData: undefined,
    selectedContentTitle: undefined,
  });
}}
```

Safe in both paths: when rating was started via Speak (not story selection), `selectedStoryId` is already `undefined` so the clear is a no-op.

## Acceptance Criteria

- [ ] After story selection + cancel, both users return to clean idle (no story card, no story data in live_state)
- [ ] After Speak (no story) + cancel, behavior unchanged (regression check)
- [ ] E2E test covers cancel-after-story-selection path

## References

- **Discovered during:** P643 code review (Layer 4)
- **Key file:** `src/app/pages/clarity-live-page.tsx`
- **Branch:** `feature/p617-mode-switcher-lifecycle` (w1)
