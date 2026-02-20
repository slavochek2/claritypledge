---
status: done
type: bug
rank: 1
severity: high
workstream: profile
date_reported: '2026-02-20'
created_date: '2026-02-20'
tags:
  - positions
  - remove-position
  - dialog
  - live
  - profile
locked_at: '2026-02-20T13:01:33.795Z'
completed_at: '2026-02-20'
---

# P408: Cancelling remove-position dialog still visually removes the position

## Summary

Clicking to remove a position shows a confirmation dialog, but the position button deselects immediately — so clicking Cancel leaves the UI showing the position as gone even though nothing was removed.

## Root Cause

Three components hold **local position state** and update it optimistically on click, before the dialog resolves:

1. **`PointRow` in `live-story-card-expanded.tsx` (line 199):** `setUserPosition(next)` fires immediately for `next === null` (removal). No `useEffect` to sync back from props when the guard confirms or cancels.

2. **`QuotedPointCard` in `profile-page-v2.tsx` (line 1104):** Same — `setUserPosition(newPosition)` fires for null immediately. The component has a `useEffect` to sync from `point.userPosition` (line 1075), but `onAfterRemove` only refetches `realPoints` (points tab), never `realStories` (stories tab) — so the prop never changes and the effect never fires even after Confirm.

3. **`remove-position-guard.test.ts` (lines 143–200):** Three tests assert the old "count=0 = skip dialog, remove directly" behavior — which was intentionally removed. These tests are now stale/incorrect.

The profile **Points tab** (`PointCardWithLinks`) is unaffected — it has no optimistic update and waits for the DB response.

## Reproduction Steps

**Surface A — /live session:**
1. Sign in as a verified user and start or join a /live session
2. Select a story that has points
3. Expand the points section and click a position button (e.g. Agree)
4. Position button highlights — click the same button again to remove
5. Observe: button deselects immediately (before any dialog)
6. Dialog appears — click **Cancel**
7. Observe: button stays deselected even though removal was cancelled

**Surface B — Profile → Stories tab:**
1. Navigate to your own profile, Stories tab
2. Find a story with a linked point where you hold a position
3. Click the highlighted position button to remove
4. Observe: button deselects immediately
5. Dialog appears — click **Cancel**
6. Observe: button stays deselected

**Reproduction rate:** 100% (both surfaces)

## Expected Behavior

- Clicking to remove: position button **stays highlighted** while the dialog is open
- Clicking **Cancel**: button remains highlighted, position unchanged
- Clicking **Confirm**: button deselects, position removed from profile

## Actual Behavior

- Clicking to remove: button **deselects immediately** before dialog is seen
- Clicking **Cancel**: button stays deselected (position looks removed but isn't)
- The DB is consistent (position not actually removed on cancel) but the UI is wrong

## Affected Files

- `src/app/components/partners/live-story-card-expanded.tsx` — `PointRow.handlePositionClick` line 199: premature `setUserPosition(next)` + missing `useEffect` for prop sync
- `src/app/pages/profile-page-v2.tsx` — `QuotedPointCard.handlePositionClick` line 1104: premature `setUserPosition(newPosition)` for null; `onAfterRemove` (lines 348–373) doesn't refetch stories
- `src/tests/remove-position-guard.test.ts` — lines 143–200: three tests assert stale "count=0 = direct remove" behavior

## Severity

**High** — affects every position removal attempt in /live and the profile stories tab. Users see wrong UI state after every cancel, eroding trust in whether their data was saved.

## Fix Approach

**`live-story-card-expanded.tsx`:**
- In `PointRow.handlePositionClick`, only call `setUserPosition(next)` when `next !== null` (don't optimistically deselect)
- Add `useEffect(() => { setUserPosition(point.userPosition ?? null); }, [point.userPosition])` — `LiveModeView` already recomputes `selectedStory` reactively from `liveState.livePositions` (lines 268–301), so after Confirm the prop will update and the effect fires

**`profile-page-v2.tsx`:**
- In `QuotedPointCard.handlePositionClick`, same fix: only call `setUserPosition` for non-null
- In `onAfterRemove`, also refetch stories: `const updatedStories = await storiesService.getStoriesByAuthorWithPoints(profile.id, currentUser.id); setRealStories(updatedStories);` — the existing `useEffect` at line 1075 will then sync `QuotedPointCard`

**`remove-position-guard.test.ts`:**
- Rewrite the 3 "count=0" tests to expect the dialog to always open (new behavior)
- Add cancel+confirm tests for the count=0 path

**New test file:** `src/tests/remove-position-dialog.test.tsx` — component render tests for `RemovePositionDialog` (profile message always shown, story count conditional, button states)

## Acceptance Criteria

- [ ] In /live: clicking to remove a position — button stays highlighted until dialog resolves
- [ ] In /live: clicking Cancel in the dialog — button remains highlighted, position unchanged
- [ ] In /live: clicking Confirm in the dialog — button deselects, position removed
- [ ] Profile → Stories tab: same Cancel behaviour — button stays highlighted on cancel
- [ ] Profile → Stories tab: Confirm removes position and button deselects
- [ ] Profile → Points tab: unaffected — continues to work correctly
- [ ] `npm test` passes with no failures (updated + new tests)
- [ ] No console errors during any of the above flows
