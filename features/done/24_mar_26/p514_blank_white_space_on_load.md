---
status: all-done
type: bug
rank: 3
tags:
  - live
  - layout
  - scroll
  - mobile
  - b36-incomplete
locked_at: '2026-03-18T08:10:54.753Z'
created_date: 2026-03-14
---

# P514: Blank White Space on Live Session Page Load

## Problem

When users land on the live session page, they see blank white space. The action buttons and top menu are above the visible area — users must scroll up to find them. Users think the app is broken.

**Predecessor:** B36 (Fix Live Meeting Vertical Centering) — marked as completed but investigation shows it was never fully verified. B36's own checklist has unchecked items: waiting room centering, join-via-link centering, mobile viewport test.

## Root Cause (5-Whys)

1. **Users see blank white space and need to scroll up** → viewport is scrolled down, buttons are above the fold
2. **Scroll position not at (0,0) despite useLayoutEffect** → race condition between scroll initialization and async content rendering
3. **Async content causes downward layout shift** → `JourneyToUnderstanding`, `LiveStoryCardExpanded`, `SessionHistoryList` load asynchronously, pushing `ActionArea` down. Browser auto-scrolls to maintain visual position during layout shift
4. **Browser auto-scroll overrides manual scrollTo(0,0)** → `useLayoutEffect` runs before paint (mount), but async content arrives later (60-200ms), causing layout shift that triggers browser's automatic scroll adjustment
5. **Structural factors unique to /live** → nested scrollable container (`overflow-y-auto` div, not window scroll), large padding (`pt-8` or `pt-16` on layout constants), and variable content heights from async data

**Key files:**
- `live-mode-view.tsx:85-87` — layout constants with `pt-8` / `pt-16` padding
- `live-mode-view.tsx:988-992` — scroll initialization (only on mount, before async data)
- `clarity-live-page.tsx:2244` — `min-h-[calc(100vh-4rem)]` viewport calculations

**Screens affected:** All screens with async content (story selected, after rating). Worst on mobile (header + recording indicator = ~70px = 18% of 375px viewport).

## Expected Behavior

When the page loads, the top menu and action buttons are immediately visible. No scrolling needed to find primary UI elements.

## Acceptance Criteria

- [ ] On page load, top menu and primary action buttons are visible without scrolling
- [ ] Works on mobile viewports (375px, 390px, 414px)
- [ ] Works after async content loads (no layout shift pushes buttons off-screen)
- [ ] Works on all live session phases: idle, waiting room, join-via-link, active session
- [ ] B36 unchecked items verified: waiting room centering, join-via-link centering, mobile viewport
