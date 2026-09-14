---
status: all-done
type: story
disclosure: public
rank: 16
workstream: E1
created_date: 2026-03-13T00:00:00.000Z
tags: []
absorbed_by: p1296
completed_at: 2026-09-14
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

- [x] Feed story cards use `text-base` with expandable "Show more" for long text — P1296 item 6 (`text-base`, 40-line clamp, "show more" on measured overflow)
- [x] Feed story cards have footer action bar with share button — P1296 item 1 (one footer on every card: count, contribution CTA, share sheet, open-in-new)
- [x] Feed point cards use `text-base` for statement — P1296 item 6
- [x] Feed tabs show counts: "Points (N)" / "Stories (N)" — P1296 item 6, on /feed and /stake
- [x] Visual style is noticeably closer to profile page cards — P1296: the profile's footer, text size and clamp on the feed cards
- [x] No regressions on mobile (bottom nav still works, cards still clickable) — P1296 screenshots at 375/320 and its e2e

## Testing

Visual comparison: open `/feed` and `/p/[slug]` side by side — cards should feel like the same design system.

## Closure

Every criterion above is delivered by **P1296** (2026-09-11), which made story and point cards behave the same on /feed, /stake and the profile — following this spec's March recommendation to update the feed cards in place rather than extract a shared component. No `/dev` or `/fix` ran on P500 itself, so its gated close (`./scripts/git-ops.sh ship p500`) needs the founder's `--override`.
