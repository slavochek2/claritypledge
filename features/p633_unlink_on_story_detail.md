---
status: today
type: change-request
rank: 1000035.0
changes: p621
chain_root: p616
tags:
  - redesign
  - p621
  - p616
  - points
  - stories
  - ux
created_date: 2026-04-03
---

# P633: Unlink Button on Story Detail Page (Inside QuotedPoint)

> **Redesign of:** [P621: Unlink Point from Story on Point Detail Page](p621_unlink_button_inside_card.md)
> **Chain root:** [P616: Unlink Point from Story](done/2026-03-31/p616_unlink_point_and_fix_dialog.md) (original spec, never shipped UI)
> **What P621 got right:** Backend reuse from P616, confirmation dialog, optimistic update, point-detail surface works.
> **What P621 got wrong:** Targeted only point-detail page. Independent UX review found story-detail is the canonical surface — the author manages story composition there, and the "ownership model" matches (the story owns the link, not the point).

## Problem Statement

P621 added unlink to the point detail page stats row. An independent UX review identified this inverts the mental model: the story owns the link to the point, not the other way around. The story detail page is where the author manages what's in their story — edit, trash, share are already there. QuotedPoint (the linked point card inside the story) has zero action buttons today, making unlink the natural first one.

**Evidence:**
- Edit (Pencil), Delete (Trash2), Share icons are on the **story card footer** — the author is in "manage my story" mode
- QuotedPoint cards show the linked points inside — the author sees "these points are in my story"
- Unlinking = "remove this point from my story" — ownership flows from story to point
- Point detail page is "I'm looking at a point" — unlinking there is a side-effect, not primary intent

## Jobs To Be Done

Same as P616/P621: "When my story no longer reflects what a linked point says, I need to remove that point from my story."

The job is the same. The surface changes to match the ownership model.

## Requirements

### R-1: Unlink icon inside QuotedPoint on story detail page

When the viewer is the story author, each QuotedPoint card shows an Unlink2 icon button. Placement: inside the QuotedPoint card, right-aligned. Author-only — gated by callback prop presence.

### R-2: Prop threading through StoryCardDetail

Add `onUnlinkPoint?: (pointId: string, statement: string) => void` to `StoryCardDetail` props. Thread to private `QuotedPoint` function as `onUnlink`. When not provided (embeds, non-author views), no button appears.

### R-3: Dialog + handler in story-detail-page

`story-detail-page.tsx` owns the confirmation dialog state and handler. Same dialog copy as P621: title, truncated point preview, body text, Cancel/Unlink buttons. Same optimistic update pattern.

## What Stays the Same (from P616 branch + P621)

- Backend `unlinkPointFromStory()` service method
- RLS policy on `story_points`
- Dialog copy and behavior (reuse from P621)
- Icon choice (Unlink2), tooltip, color scheme
- Point-detail unlink (P621) — stays as-is, this adds a second surface
- E2E test patterns (adapt P621's test structure)

## Surfaces

**In scope:**
- `src/app/components/social/StoryCardDetail.tsx` — add `onUnlinkPoint` prop, render icon in private `QuotedPoint`
- `src/app/pages/story-detail-page.tsx` — wire `onUnlinkPoint` (author-only), add dialog + handler

**Out of scope (stress-tested, code-grounded reasons):**
- Point detail page — already done in P621
- Doc page — eye toggle (hide locally) next to unlink (sever globally) = dangerous mental model collision. Also `isOwner` ≠ story author — per-story auth check adds complexity for a surface that doesn't want it.
- Profile stories tab — browse/showcase surface. `StoryCardFull` (different component) has inline edit/delete but no `QuotedPoint` action slots. Accidental unlink risk while scrolling feed. Correct flow: notice → click through to story detail → unlink with full context.
- Profile points tab — inverted direction. Stories shown as read-only `LinkedStoryCard` excerpts inside point cards. No `QuotedPoint` card exists here — nowhere to put unlink that matches the ownership model.
- Feed cards — don't show linked stories at all

## Acceptance Criteria

- [ ] Unlink icon visible inside QuotedPoint on story detail page (author-only)
- [ ] Icon NOT visible for non-authors, embeds, or logged-out users
- [ ] Clicking opens confirmation dialog (same copy as P621)
- [ ] Confirm removes point from story (optimistic update)
- [ ] Point-detail unlink (P621) still works — no regression
- [ ] Visual consistency: icon matches the muted-foreground → destructive-on-hover pattern from P621
