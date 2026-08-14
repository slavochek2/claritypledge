---
status: backlog
type: story
rank: 16
workstream: E1
created_date: 2026-03-13T00:00:00.000Z
tags: []
---

# P500: Harmonize feed cards with profile card style

## Problem

The Home feed (`/feed`) uses compact `FeedStoryCard` and `FeedPointCard` components that look visually different from the richer `StoryCardFull` on profile pages. This inconsistency makes the feed feel sparse — smaller text, no "Show more", no footer action bar, different tab styling.

## Solution

Bring the feed cards and tabs visually closer to the profile page pattern:

### Story cards
- Text size: `text-sm line-clamp-4` → `text-base` with "Show more"/"Show less" toggle (threshold ~180 chars, same as profile)
- Footer action bar: add border-t footer row with share/copy icons (matching profile pattern)
- Keep tag pills (feed-specific, profile doesn't need them)

### Point cards
- Text size: `text-sm` → `text-base` for statement
- Add "Show more" for long context text
- Visually align action row with story card footer pattern

### Tabs
- Add counts to tab labels: "Points (20)" / "Stories (34)" to match profile's "Points (0)" / "Stories (0)" pattern
- Match tab styling (font weight, spacing) to profile tabs

## Technical Notes

- `FeedStoryCard` uses `StoryWithAuthor` type; profile's `StoryCardFull` uses `StoryWithPoints` — cannot share component directly without type adapter
- Simplest path: update `FeedStoryCard` and `FeedPointCard` in place to match the visual style, not extract a shared component
- Profile's `StoryCardFull` is defined inline in `profile-page-v2.tsx` — could be extracted later but not required for this task

## Acceptance Criteria

- [ ] Feed story cards use `text-base` with expandable "Show more" for long text
- [ ] Feed story cards have footer action bar with share button
- [ ] Feed point cards use `text-base` for statement
- [ ] Feed tabs show counts: "Points (N)" / "Stories (N)"
- [ ] Visual style is noticeably closer to profile page cards
- [ ] No regressions on mobile (bottom nav still works, cards still clickable)

## Testing

Visual comparison: open `/feed` and `/p/[slug]` side by side — cards should feel like the same design system.
