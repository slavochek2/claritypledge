---
status: qa
type: bug
rank: 2.0
tags: [live, scroll, round, idle]
---

# P513: Story Stuck at Top After Round Ends

## Problem

After a round ends (celebration phase completes), the story stays visually "stuck" at the top of the screen. The idle screen renders but the scroll position is wrong — content from the previous round's scroll offset persists. Users must exit and rejoin the session to fix it.

## Root Cause (5-Whys)

1. **Story stays visible at top after round ends** → scroll position from the previous round persists
2. **Scroll not reset on phase transition** → `useLayoutEffect` in live-mode-view.tsx has empty dependency array `[]`, fires only on mount
3. **Component instance not remounted** → `IdleScreen` is not keyed, so React reuses the same instance across phase transitions (idle → rating → celebration → idle). `useLayoutEffect([])` doesn't re-fire
4. **Only visible after celebration** → during the round, user scrolls down to interact with story/rating content. When celebration ends and phase returns to idle, scroll stays at that lower position
5. **Design flaw** → assumption that "mount once, reset scroll once" is sufficient. Breaks when same component instance renders different content across state transitions

**Key files:**
- `live-mode-view.tsx:988-992` — scroll reset `useLayoutEffect(() => scrollTo(0,0), [])` (empty deps)
- `live-mode-view.tsx:1005` — scroll container ref with `overflow-y-auto`
- `clarity-live-page.tsx:1384-1415` — `handleCelebrationComplete()` state reset

## Fix

Add `ratingPhase` to the `useLayoutEffect` dependency array so scroll resets when phase transitions back to idle. Alternatively, key the `IdleScreen` component to force remount on phase change.

## Expected Behavior

After a round ends and celebration completes, the idle screen should render with scroll position at the top (0, 0).

## Acceptance Criteria

- [ ] After celebration completes, idle screen scroll position is at top
- [ ] Works for multiple consecutive rounds (scroll resets each time)
- [ ] No scroll jump visible during active round (only reset on phase transition to idle)
