---
id: P594
title: Add "show more" expand/collapse to feed cards
type: story
status: all-done
priority: medium
flow: quick-feature
completed_at: "2026-03-27"
---

# P594: Add "show more" expand/collapse to feed cards

## Problem

Feed cards (`feed-story-card.tsx`, `feed-point-card.tsx`) use CSS `line-clamp-6` / `line-clamp-3` for text truncation but have no "show more" affordance. Users can't tell text is truncated and must navigate away to read full content.

Meanwhile, social cards (`story-card-with-links.tsx`, `point-card-with-links.tsx`) already have proper "...more" buttons with `textExpanded` state — the pattern exists, feed cards just don't use it.

## Root Cause

P491 built feed cards as lightweight navigation cards. The assumption was "click to navigate to detail page." But CSS `line-clamp` gives no visual signal beyond a subtle `...` at the end of the last visible line.

## Solution

Add `textExpanded` state + ref-based overflow detection to both feed cards. Show "show more" only when text actually overflows the clamp. `stopPropagation` on the button so card click-to-navigate still works.

## Files to Change

- `src/app/components/feed/feed-story-card.tsx` — story content (line-clamp-6)
- `src/app/components/feed/feed-point-card.tsx` — point statement (line-clamp-6) + context (line-clamp-3)

## Acceptance Criteria

- [ ] "show more" appears below truncated text only when content actually overflows
- [ ] Clicking "show more" expands text inline, button changes to "show less"
- [ ] Clicking "show less" collapses back to clamped view
- [ ] Clicking the card body (not the button) still navigates to detail page
- [ ] Short text that fits within the clamp shows no button
- [ ] Works for both story cards (content) and point cards (statement + context)
