---
status: done
type: bug
rank: 125459.0
severity: medium
workstream: live
date_reported: '2026-02-19'
created_date: '2026-02-19'
completed_at: '2026-02-19'
tags: [live-session, story-card, layout, speak-freely]
root_cause: Three independent JSX-level issues in live-mode-view.tsx — (1) systematic copy-paste ordering error placed <LiveStoryCardExpanded> before <JourneyToUnderstanding> in all 9 UnderstandingScreen sub-phases; (2) action buttons in IdleScreen used disabled={showRatingDrawer} instead of conditional render, keeping them in the DOM when the drawer was open; (3) Speak Freely button was gated with !showRatingDrawer in IdleScreen and entirely absent from RatingScreen, RatingScreenWithOptionalDrawer, and UnderstandingScreen phase=waiting.
resolution: "Fix 1: Swapped JSX order in all 9 UnderstandingScreen sub-phases to put JourneyToUnderstanding before LiveStoryCardExpanded. Fix 2: Changed disabled buttons to {!showRatingDrawer && <Button>} conditional renders; removed !showRatingDrawer gate from Speak Freely in IdleScreen. Fix 3: Added onClearStory prop to RatingScreen, RatingScreenWithOptionalDrawer, and UnderstandingScreen; added Speak Freely button after story card in RatingScreen, RatingScreenWithOptionalDrawer, and UnderstandingScreen phase=waiting."
---

# P400: Story card rendering inconsistencies — wrong position, buttons overlap, Speak Freely missing

## Summary

In `/live`, the story card appears above the journey section (wrong order), action buttons overlap the rating drawer instead of hiding, and "Speak Freely" is missing in four states where the story card is visible.

## Root Cause

Three independent JSX-level issues in `live-mode-view.tsx`, all caused by inconsistent component ordering and missing conditional renders:

**Bug 3 — Wrong position:** All 9 sub-phases of `UnderstandingScreen` render `<LiveStoryCardExpanded>` before `<JourneyToUnderstanding>` in the JSX. Because the layout is `flex flex-col`, first-in-JSX = higher on screen. The correct order (used consistently in `IdleScreen` and `RatingScreen`) is journey first, story second. This is a systematic copy-paste ordering error across 9 locations.

**Bug 4 — Buttons overlap drawer:** `IdleScreen` lines 956–974 render the "Does X understand you?" and "Do you understand X?" buttons with `disabled={showRatingDrawer}` — they are greyed out but still mounted in the DOM. When the rating `Drawer` slides up from the bottom, both elements are simultaneously visible.

**Speak Freely gaps:** The "Speak Freely" button in `IdleScreen` is explicitly gated with `!showRatingDrawer` (line 993), making it disappear exactly when the story card is still visible. It is entirely absent from `RatingScreen`, `RatingScreenWithOptionalDrawer`, and the `phase='waiting'` branch of `UnderstandingScreen`.

## Reproduction Steps

**Bug 3 (wrong position):**
1. Start a `/live` session as either participant
2. Complete a full rating round and reach the "understand" phase (either explain-back or gap-revealed)
3. Observe: story card appears above the journey/confidence meters

**Bug 4 (buttons overlap):**
1. Start a `/live` session, select a story
2. Partner submits their rating → rating drawer appears for local user
3. Observe: "Does X understand you?" and "Do you understand X?" buttons are visible and greyed out below/alongside the open drawer

**Speak Freely missing:**
1. Start a `/live` session, select a story
2. Navigate to any of: rating input screen, waiting-for-partner screen, or `phase='waiting'` of understand screen
3. Observe: story card is visible but no "Speak Freely" button anywhere

**Reproduction rate:** 100%

## Expected Behavior

- Story card always renders **below** the journey/confidence meters section in all phases
- When the rating drawer is open, the action buttons are **not visible** (hidden, not just disabled)
- **At any point a story card is visible, "Speak Freely" must be present** — regardless of phase or drawer state

## Actual Behavior

- Story card renders above journey meters in all `UnderstandingScreen` phases (9 sub-phases)
- Rating drawer opens alongside greyed-out action buttons — visually noisy and confusing
- "Speak Freely" is absent in 4 states: drawer-open idle, rating input, rating waiting, understand waiting

## Affected Files

- `src/app/components/partners/live-mode-view.tsx:1999` — UnderstandingScreen explain-back checker branch 1: story before journey
- `src/app/components/partners/live-mode-view.tsx:2071` — UnderstandingScreen explain-back checker branch 2: story before journey
- `src/app/components/partners/live-mode-view.tsx:2158` — UnderstandingScreen explain-back listener (hasTappedDone): story before journey
- `src/app/components/partners/live-mode-view.tsx:2222` — UnderstandingScreen explain-back listener (before done): story before journey
- `src/app/components/partners/live-mode-view.tsx:2302` — UnderstandingScreen phase=waiting: story before journey; also missing Speak Freely
- `src/app/components/partners/live-mode-view.tsx:2363` — UnderstandingScreen phase=perfect: story before journey
- `src/app/components/partners/live-mode-view.tsx:2431` — UnderstandingScreen phase=gap-revealed: story before journey
- `src/app/components/partners/live-mode-view.tsx:2561` — UnderstandingScreen phase=calibrated: story before journey
- `src/app/components/partners/live-mode-view.tsx:2807` — UnderstandingScreen phase=results: story before journey
- `src/app/components/partners/live-mode-view.tsx:956-974` — IdleScreen action buttons: disabled but not hidden when drawer open
- `src/app/components/partners/live-mode-view.tsx:993` — IdleScreen Speak Freely: gated with `!showRatingDrawer` (hides when drawer open)
- `src/app/components/partners/live-mode-view.tsx:1180` — RatingScreen: story card shown, no Speak Freely
- `src/app/components/partners/live-mode-view.tsx:1317` — RatingScreenWithOptionalDrawer: story card shown, no Speak Freely

## Severity

**Medium** — story card is visible but in wrong position and users cannot exit to free conversation in multiple active states; workaround is completing the round.

## Fix Approach

All three fixes are in `live-mode-view.tsx` only:

**Bug 3:** In each of the 9 `UnderstandingScreen` sub-phases, swap the render order — move `<JourneyToUnderstanding>` before `<LiveStoryCardExpanded>`.

**Bug 4:** Change `disabled={showRatingDrawer}` → `{!showRatingDrawer && <Button ...>}` for both action buttons in `IdleScreen` (lines 956–974). Also remove the `!showRatingDrawer` gate on the "Speak Freely" button at line 993 — "Speak Freely" should show whenever the story card shows, regardless of drawer state.

**Speak Freely gaps:** Add a "Speak Freely" button alongside the story card in:
- `RatingScreen` (~line 1185) — after `<LiveStoryCardExpanded>`
- `RatingScreenWithOptionalDrawer` (~line 1322) — after `<LiveStoryCardExpanded>`
- `UnderstandingScreen phase='waiting'` (~line 2307) — after `<LiveStoryCardExpanded>`

## Acceptance Criteria

- [ ] In all phases (rating, waiting, understand), story card appears **below** the journey/confidence meters — never above
- [ ] When the rating drawer opens, the "Does X understand you?" and "Do you understand X?" buttons are not visible on screen
- [ ] "Speak Freely" button is visible whenever the story card is visible — including during rating input, waiting for partner, and drawer-open states
- [ ] Clicking "Speak Freely" from any of these states exits the story and returns to free conversation
- [ ] No console errors during any of the affected phase transitions
- [ ] Regression test passes: `e2e/p400-story-card-rendering.spec.ts`
