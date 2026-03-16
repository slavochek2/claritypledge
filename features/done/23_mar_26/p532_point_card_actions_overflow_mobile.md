---
status: all-done
completed_at: "2026-03-16"
type: bug
rank: 250011.75
workstream: E1
severity: low
date_reported: 2026-03-16
date_resolved: 2026-03-16
created_date: 2026-03-16
root_cause: Footer rows used flex justify-between without flex-wrap, causing overflow at narrow widths
resolution: Added flex-wrap + gap-y-1 to both footer row variants
flow: fix
tags: []
---

# BUG: Point card action row overflows on narrow mobile viewports

## Problem

On viewports ~327px and below, the point card action row (story count + "Add your story" link + share icon + open icon) overflows the card boundary. The share/open icons get pushed outside the card container.

## Symptoms

- Action icons visibly extend beyond card right edge
- "Add your story" text + icons don't fit in available space
- Affects both profile page Points tab and feed view

## Root Cause

`point-card-with-links.tsx` action rows (lines ~314 and ~491) use `flex justify-between` with no overflow handling. Left side has `flex-wrap` but the overall row doesn't account for the combined width of story count text + "Add your story" link + 2 icons at narrow widths. Fixed paddings (`pl-[52px] pr-4`) eat into available space.

## Resolution

Added `flex-wrap gap-y-1` to both footer row containers in `point-card-with-links.tsx` (quote pattern line ~316 and feed view line ~493). Action icons now wrap below the story label on narrow viewports instead of overflowing.

## Verification

- Resize viewport to 320px width
- Check point cards on profile page and feed
- Action row should not overflow card boundary
