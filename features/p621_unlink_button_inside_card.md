---
status: today
type: change-request
rank: 1000032.0
changes: p616
tags:
  - redesign
  - p616
  - points
  - stories
  - ux
created_date: 2026-04-02
---

# P621: Unlink Button Inside QuotedPoint Card

> **Redesign of:** [P616: Unlink Point from Story](done/2026-03-31/p616_unlink_point_and_fix_dialog.md)
> **What was wrong:** The unlink button was placed OUTSIDE the QuotedPoint card via `renderPointRow` wrapper, while all other action buttons (edit, trash, share) are INSIDE their respective cards via `footerActionsSlot`. This visual inconsistency breaks the established pattern: actions on an entity belong inside that entity's card. Additionally, P616 only wired the button on story-detail-page — it should appear on all surfaces where the author sees their linked points.

## Problem Statement

P616 implemented unlinking correctly at the data layer (dialog, service call, optimistic state update). But the button placement decision — injecting via `renderPointRow` wrapper OUTSIDE the QuotedPoint card — was wrong.

**Evidence of the flaw:**
- Edit (Pencil), Delete (Trash2), and Share icons all render INSIDE story/point cards
- The unlink button renders BELOW and OUTSIDE the QuotedPoint card, visually disconnected
- Users didn't recognize it as an action belonging to the point

**Scope gap:** P616 only added the button to `story-detail-page.tsx`. The same linked-points view appears on profile stories tab and doc page, but has no unlink action there.

## Jobs To Be Done

- **Preserved from P616:** JTBD-2 — "When my story no longer reflects what a linked point says, I need to remove that point from my story"
- **Corrected:** Button placement. The job is the same; the UI surface was wrong.
- **Extended:** The author should be able to unlink from any surface showing the story-point relationship, not just the story detail page.

## Current State

P616 implementation (on `feature/p616-unlink-point` branch):
- `story-detail-page.tsx` passes `renderPointRow` to `StoryCardDetail` when `isAuthor`
- The wrapper adds an Unlink2 icon BELOW each QuotedPoint card, right-aligned
- Other surfaces (profile stories, docs) have no unlink button

**Before (current P616):**
```
┌─ QuotedPoint card ─────────────────────────────┐
│ 👤 Author  🎧1  Agrees                         │
│ ┌─ Quoted box ────────────────────────────────┐ │
│ │ 📌  Point text...                           │ │
│ │  × Disagree  ○ Unsure  ○ Agree              │ │
│ │  ▸ 2 stories                                │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
                                         [🔗] ← OUTSIDE the card
```

## Root Cause

The `/challenge-prd` review (Q2) decided: "Use `renderPointRow` injection, not shared StoryCardDetail — prevents button leaking into docs/embeds." This was over-cautious. The correct approach is an optional `onUnlinkPoint` callback prop on `StoryCardDetail` — when provided, `QuotedPoint` renders the icon inside the card. When not provided (embeds, contexts without auth), no button appears. Same gating pattern as `footerActionsSlot` for edit/trash.

**Code reference:** `story-detail-page.tsx` lines 1358-1379 (renderPointRow injection), `StoryCardDetail.tsx` lines 93 (renderPointRow prop definition).

## Redesign

Move the unlink button INSIDE the QuotedPoint card, consistent with how other action buttons work.

**After (redesign):**
```
┌─ QuotedPoint card ─────────────────────────────┐
│ 👤 Author  🎧1  Agrees                         │
│ ┌─ Quoted box ────────────────────────────────┐ │
│ │ 📌  Point text...                           │ │
│ │  × Disagree  ○ Unsure  ○ Agree              │ │
│ │                                             │ │
│ │  ▸ 2 stories              [🔗] ← INSIDE    │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

The icon sits in the bottom-right of the QuotedPoint card content area, same row as the linked-stories toggle. Author-only — gated by `onUnlink` prop presence.

## Predecessor Sections Superseded

| Section | P616 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| Implementation Notes (line 293) | "The unlink button MUST be injected via the `renderPointRow` prop on `StoryCardDetail`, NOT placed inside `StoryCardDetail` itself." | Superseded | `onUnlinkPoint` prop on `StoryCardDetail`, `onUnlink` prop on `QuotedPoint` |
| UX Design — button placement | "appears at the bottom-right of each QuotedPoint card" (but implemented outside via renderPointRow) | Superseded | Button inside QuotedPoint card content area |
| AC-4 | "Given a story detail page with linked points" (story detail only) | Extended | Must cover story detail + profile stories tab + doc page |
| Resolved Decision #3 | "Use `renderPointRow` injection, not shared StoryCardDetail" | Superseded | `onUnlinkPoint` callback prop on StoryCardDetail |
| Out of Scope | "Unlink from surfaces other than story detail page" | Superseded | Profile stories tab and doc page now in scope |

## Requirements

### R-1: onUnlinkPoint prop on StoryCardDetail

Add `onUnlinkPoint?: (pointId: string, statement: string) => void` to `StoryCardDetail` props. When provided, pass it to each `QuotedPoint` as `onUnlink`. Remove `renderPointRow` usage for unlink in `story-detail-page.tsx`.

### R-2: Unlink icon inside QuotedPoint

When `onUnlink` is provided, render the Unlink2 icon inside the card's content area — bottom-right, same row as the linked-stories toggle. Same icon, tooltip, color, and auth semantics as P616.

### R-3: Wire on story detail page

`story-detail-page.tsx` passes `onUnlinkPoint` (author-only) instead of `renderPointRow`. Confirmation dialog + handler stay in the page.

### R-4: Wire on profile stories tab

`profile-page-v2.tsx` Stories tab — passes `onUnlinkPoint` when viewing own profile. Uses same dialog pattern.

### R-5: Wire on doc page

`doc-detail-page.tsx` — passes `onUnlinkPoint` when doc owner is also story author. Existing `renderPointRow` for drag handles continues to work alongside.

## What Stays the Same

- UnlinkPointDialog copy and behavior (title, body, confirm/cancel)
- Backend `unlinkPointFromStory()` service method
- RLS policy on `story_points`
- Optimistic state update pattern
- Icon choice (Unlink2), tooltip text, color scheme
- E2E test assertions (match on `aria-label="Unlink point from story"`)
- Point detail page — out of scope (different component path, reverse direction)

## Surfaces in Scope

**In scope:**
- `src/app/components/social/StoryCardDetail.tsx` — add `onUnlinkPoint` prop, render icon in `QuotedPoint`
- `src/app/pages/story-detail-page.tsx` — replace `renderPointRow` with `onUnlinkPoint`, keep dialog + handler
- `src/app/pages/profile-page-v2.tsx` — wire `onUnlinkPoint` on own profile stories tab
- `src/app/pages/doc-detail-page.tsx` — wire `onUnlinkPoint` for doc owner

**Out of scope:**
- Point detail page (reverse direction — "1 story" badge, different component)
- Feed cards (browse context, not authoring)
- Embeds (no auth)

## Acceptance Criteria

- [ ] Unlink button renders INSIDE QuotedPoint card (same area as linked-stories toggle), not outside
- [ ] Button visible on story detail page (author-only) — same as P616
- [ ] Button visible on profile stories tab (own profile only)
- [ ] Button visible on doc page (when doc owner is story author)
- [ ] Button NOT visible on embeds, feed cards, or other profiles
- [ ] Clicking button opens same confirmation dialog as P616
- [ ] Confirm unlink removes point from story (same optimistic update)
- [ ] `renderPointRow` no longer used for unlink on story-detail-page
- [ ] All existing P616 E2E tests still pass
- [ ] Visual consistency: button matches edit/trash/share icon pattern (size, color, hover)
