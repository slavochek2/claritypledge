---
status: all-done
type: bug
rank: 13
severity: medium
date_reported: '2026-09-29'
created_date: '2026-09-29'
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [position-buttons, intensity, destructive-action]
disclosure: public
pipeline_ran: [create-bug, reproduce, fix, ship]
reproduce_artifact:
  test_file: src/tests/p1372-same-row-intensity-pick.test.tsx
  root_cause: "PositionButtons.handleIntensityClick forwards the already-selected level to onPositionClick; consumers toggle a repeated value to null"
  confidence: high
  surfaces_in_scope: [position-buttons-menu, quoted-point-card]
  surfaces_deferred: []
  reproduced_at: 2026-09-29
completed_at: 2026-09-29
---

# P1372: Picking the already-selected level in the intensity menu removes the position

## Summary

Opening the intensity menu and tapping the level already held removes the reader's position (or raises the remove-guard dialog), although P847 Model C′ makes the "Clear position" row the only removal path. Prerequisite for P1371 Phase 0.1.

## Root Cause

`PositionButtons.handleIntensityClick` (`src/app/components/shared/PositionButton.tsx`) calls `onPositionClick(position)` for every menu row, including the row equal to the current `userPosition`. Most consumers pre-date P847 and still interpret a repeated position as toggle-off (`userPosition === position ? null : position`). P847 deleted the same-segment destructive branch in `handleGroupClick` but left this same-row path in the menu, so the conflation the 2026-05-20 [product] decision ("Destructive UI actions must be explicit affordances, not derived from same-segment toggling") forbids survives one level down.

P847's "Decision A" (see `src/tests/p847-position-buttons-explicit-clear.test.tsx`, "Clear row is HIDDEN when onClear prop is absent") deliberately kept this toggle as the removal path for consumers that did not wire `onClear`. So a fix at the choke point removes the only removal path from any consumer without `onClear` — each must be checked.

## Invariants

- Removal of a position happens only through the explicit "Clear position" row (`onClear`), never through re-selecting the current value (docs/decisions.md 2026-05-20 [product]).
- The tutorial demo (`intensity-preview-pictogram.tsx`, controlled mode) and the letter engage phases (`letter-flow-content.tsx`, `counts={ZERO_COUNTS}`) keep their behaviour.

## Reproduction Steps

1. Signed-in reader on `/feed` (or a point detail page) with a point whose position is `agree`.
2. Click the selected Agree button: the intensity menu opens with "Agree" checked.
3. Click the checked "Agree" row (the natural "close it" tap).
4. Observe: the position is removed (or the remove-guard dialog appears).

**Reproduction rate:** 100%

## Expected Behavior

Tapping the already-selected level closes the menu and leaves the position unchanged. Founder: "if position is selected already and they click again on this position it remains, because 'remove position' is another button in the same menu." Removal remains possible via the "Clear position" row.

## Actual Behavior

`onPositionClick(currentPosition)` fires; the consumer toggles it to `null` and removes the position.

## Affected Files

- `src/app/components/shared/PositionButton.tsx` — `handleIntensityClick` (single choke point).
- Consumers that toggle on repeat: `shared/quoted-point-card.tsx:121`, `social/story-card-with-links.tsx:699`, `social/StoryCardDetail.tsx:691`, `social/point-card-with-links.tsx:237,244`, `partners/live-story-card-expanded.tsx:472`, `feed/feed-point-card.tsx:166,172`, `pages/point-detail-page.tsx:254,261`, `pages/profile-page-v2.tsx:1985`, `pages/story-detail-page.tsx:288` (composer).
- Consumers without `onClear` (lose the toggle-removal path after the fix): `shared/quoted-point-card.tsx` (profile + feed story expansions), `pages/story-detail-page.tsx:285` composer (position is required to submit, so no removal is needed there), `letters/intensity-preview-pictogram.tsx` (controlled demo, clicks blocked).

## Severity

**Medium** — silent data loss of a reader's position on a normal gesture; the position can be re-set, and some surfaces show a guard dialog first.

## Fix Approach

1. In `handleIntensityClick`, if the resolved position equals `userPosition`, close the menu without calling `onPositionClick`. Covers every consumer at once; consumer toggle logic is left untouched (still used by other callers).
2. `QuotedPointCard` renders `PositionButtons` without `onClear`. Give it an opt-in clear handler routed through the existing removal path (`onPositionSelect(null)` → profile's `guardedRemovePosition`). The feed's `feed-story-card.tsx` handler ignores `null` today, so it must not get a Clear row that does nothing — opt-in per caller.

## Acceptance Criteria

- [x] Picking the currently selected level from the menu closes the menu and leaves the position unchanged (unit test on `PositionButtons`).
- [x] Picking a different level still changes the position; the "Clear position" row still removes it.
- [x] Points expanded under a story on the profile page show a "Clear position" row that removes the position through the existing guarded path (consumer test on `QuotedPointCard` covers the card; profile-page wiring: founder browser UAT on the w2 build against the test DB, 2026-09-29, "works well").
- [x] Existing position-button, letter and tutorial tests still pass.
- [x] No console errors during the affected flow — founder UAT 2026-09-29 reported no problems; console output was not captured by the agent.

## Resolution

- `PositionButton.tsx` `handleIntensityClick`: a pick equal to `userPosition` closes the menu without calling `onPositionClick`. One choke point for every consumer; consumer toggle logic unchanged.
- `QuotedPointCard` gains opt-in `onPositionClear` → `PositionButtons onClear`. The profile page wires it to its existing guarded removal (`onPointPositionSelect(id, null)` → `guardedRemovePosition`). The feed's story expansion does not opt in: its handler ignores `null`, so removal there was already a no-op and a Clear row would do nothing.
- No longer a removal path after this fix (no `onClear`): the story composer in `story-detail-page.tsx` (position is required to submit) and the controlled tutorial demo (clicks blocked).
- Regression test: `src/tests/p1372-same-row-intensity-pick.test.tsx` (4 of 7 red before the fix, 7 of 7 green after).
