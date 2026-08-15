---
status: all-done
completed_at: "2026-04-03"
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
uat_file: features/uat/p633.md
test_files:
  - e2e/p633-unlink-story-detail.spec.ts
---

# P633: Unlink Button on Story Detail Page (Inside QuotedPoint)

> **Redesign of:** [P621: Unlink Point from Story on Point Detail Page](p621_unlink_button_inside_card.md)
> **Chain root:** [P616: Unlink Point from Story](./p616_unlink_point_and_fix_dialog.md) (original spec, never shipped UI)
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

## UX Design

### Unlink Flow (Author Only)

1. Author navigates to `/story/:id`
2. Points section is expanded (auto-expands on detail view)
3. Each QuotedPoint card shows an Unlink2 icon button (right-aligned, below position buttons)
4. Author clicks Unlink2 icon
5. Confirmation dialog opens: title "Unlink point from story?", truncated point statement preview, body text about point remaining visible
6. Author clicks "Unlink" (destructive) or "Cancel"
7. On confirm: point removed from local state (optimistic), toast "Point unlinked from story.", dialog closes
8. On failure: toast error, retry key incremented

### Button Specification

- Icon: `Unlink2` from lucide-react, `size={14}`
- Container: `min-w-[40px] min-h-[40px]` (40px touch target), `rounded-full`, flex centered
- Colors: `text-muted-foreground` default, `text-destructive hover:bg-destructive/10` on hover
- Wrapper: `MobileTooltip` with content "Unlink point from story"
- `aria-label="Unlink point from story"`
- Placement: inside QuotedPoint, right-aligned, below position buttons area, with `paddingLeft: 44px` to align with content column
- Click handler calls `e.stopPropagation()` to prevent card navigation

### Edge Cases

- **Last point**: unlinking the last point leaves the story with 0 points. Footer shows "0 points" label.
- **Optimistic failure**: on error, toast shows failure message, retry key forces data reload.
- **Loading state**: "Unlinking..." text replaces "Unlink" button in dialog while request is in flight. Both dialog buttons disabled.
- **Non-author**: `onUnlinkPoint` prop is `undefined`, no icon rendered. No way for non-author to trigger unlink.

## Component Strategy

### Component Map

**Reuse (no changes):**
- `MobileTooltip` — wraps unlink icon for tooltip
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` — confirmation dialog (already imported in story-detail-page)
- `Button` — dialog Cancel/Unlink buttons (already imported)
- `toast` — success/error notifications (already imported)
- `Loader2` — loading spinner in dialog (already imported)

**Build inline (~12 lines JSX):**
- Unlink icon button inside QuotedPoint's `onUnlink` conditional block

### Composition

```
StoryDetailPage
  └─ StoryCardDetail (new: onUnlinkPoint prop)
       └─ QuotedPoint (new: onUnlink prop)
            └─ [icon button] (conditional on onUnlink presence)
```

### Prop Threading

1. `StoryCardDetail` receives `onUnlinkPoint?: (pointId: string, statement: string) => void`
2. In `renderPoint()`, passes `onUnlink={onUnlinkPoint}` to each `QuotedPoint`
3. `QuotedPoint` receives `onUnlink?: (pointId: string, statement: string) => void`
4. When present, renders the unlink icon button

### What Gets Removed

The existing `renderPointRow` approach in story-detail-page (P616) is replaced by the cleaner `onUnlinkPoint` prop. The `renderPointRow` prop itself stays on StoryCardDetail (used by doc context for drag handle + eye toggle), but story-detail-page stops using it for unlink.

## Test Coverage Strategy

### E2E Tests (`e2e/p633-unlink-story-detail.spec.ts`)

- Author sees unlink button on each linked point in story detail
- Non-author (viewer) does NOT see unlink button
- Clicking unlink opens confirmation dialog
- Confirming unlink removes point from story
- Canceling dialog preserves point

### Smoke Test (`e2e/p633-smoke.spec.ts`)

- Story detail page loads with linked points visible
- Points section expands and shows linked point content

### UAT Scenarios (`features/uat/p633.md`)

- Manual checklist covering author/non-author flows, dialog behavior, visual consistency

### Not Needed

- No unit tests (no new logic, no pure functions)
- No integration tests (no new DB operations — reuses existing `unlinkPointFromStory`)
- No new DB migrations
