---
status: all-done
type: task
rank: 250010.75
workstream: E1
created_date: 2026-03-16
completed_at: "2026-03-16"
flow: dev
tags: []
---

# P531: Standardize core page widths to max-w-2xl

## Problem

Profile page (`/p/:username`) and point detail page use `max-w-lg` (512px) while the feed, settings, and create-story pages use `max-w-2xl` (672px). This creates an inconsistent, cramped feel — especially on desktop where ~60% of the viewport is empty white space on the profile page. Cards are width-agnostic (fill parent), so the fix is purely at the page container level.

## Solution

Widen the inner content container on 3 pages from `max-w-lg` to `max-w-2xl` to match the feed:

| Page | File | Current | Target |
|------|------|---------|--------|
| Profile | `profile-page-v2.tsx` | `max-w-lg` (lines 654, 744) | `max-w-2xl` |
| Point Detail | `point-detail-page.tsx` | `max-w-lg` | `max-w-2xl` |
| Story Detail | `story-detail-page.tsx` | no explicit constraint | `max-w-2xl` |

## Technical Notes

- All card components (FeedPointCard, StoryCardWithLinks, PointCardWithLinks) are width-agnostic — they fill their parent. No card changes needed.
- Feed page already uses `max-w-2xl` — this is the reference width.
- Settings page and create-story page also use `max-w-2xl` — consistency achieved.

## Acceptance Criteria

- [x] Profile page content renders at `max-w-2xl` (672px) width
- [x] Point detail page content renders at `max-w-2xl` width
- [x] Story detail page has explicit `max-w-2xl` constraint
- [ ] Cards look correct at the wider width (no broken layouts)
- [ ] Visual verification on desktop viewport confirms reduced white space
