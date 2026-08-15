---
status: all-done
completed_at: "2026-04-03"
type: story
rank: 1000032.0
changes: p616
tags:
  - p616
  - points
  - stories
  - ux
created_date: 2026-04-02
---

# P621: Unlink Point from Story on Point Detail Page

> **Supersedes:** [P616: Unlink Point from Story](./p616_unlink_point_and_fix_dialog.md) (designed but never shipped)
> **What P616 got right:** Data layer — dialog, `unlinkPointFromStory()` service, RLS policy, optimistic state update. All built on `feature/p616-unlink-point` branch.
> **What P616 got wrong:** Targeted story-detail-page with QuotedPoint placement. QuotedPoint has zero action buttons today — adding one there would be the first, not matching any pattern.

## Problem Statement

P616 designed the unlink button for the story-detail-page, inside QuotedPoint cards showing linked points. This was the wrong surface:

**Why story-detail was wrong:**
- QuotedPoint cards have zero action buttons today (no edit, no trash, no share)
- Adding unlink there would be the FIRST action button, not matching an established pattern
- Doc page and profile stories tab show the same linked-point view — also with zero action buttons
- The "edit/trash/share are inside cards" pattern applies to **story** cards, not to **linked point** cards within stories

**The right surface is the point detail page.** When an author opens a point linked to their story, they're looking at the point directly — and the expanded story region already has an inline action (`✏ your story` edit link). Unlink belongs next to that.

## Jobs To Be Done

- **From P616:** "When my story no longer reflects what a linked point says, I need to remove that point from my story"
- **Surface:** The author encounters this on the point detail page — they see their story expanded under their position, realize the point no longer fits, and want to disconnect it.

## Requirements

### R-1: Unlink action in expanded story region on point detail page

When the viewer is the story author and expands their position to see their story, show an unlink action in the `ExpandableStoryRegion`. Place it near the existing `✏ your story` edit link — same visual pattern (inline text link or icon button).

### R-2: Confirmation dialog

Same dialog as P616 spec:
- Title: "Unlink point from story?"
- Shows truncated point statement (max 80 chars, quoted, muted text)
- Body: "The point will remain visible to others who have taken positions on it."
- Actions: Cancel (secondary) | Unlink (destructive)

### R-3: Optimistic update on success

On confirm: point disappears from the story's linked points, story region updates. The position itself remains (the author still has a position on this point, they just unlinked their story from it).

## What Stays the Same (from P616 branch)

- Backend `unlinkPointFromStory()` service method
- RLS policy on `story_points`
- Dialog copy and behavior
- Icon choice (Unlink2), tooltip text
- E2E test assertions (match on `aria-label="Unlink point from story"`)

## Surfaces

**In scope:**
- `src/app/pages/point-detail-page.tsx` — the only surface

**Out of scope (with reasoning):**
- Story detail page — QuotedPoint has zero action buttons; adding one breaks the pattern rather than matching it
- Doc page — same QuotedPoint view, same zero-action-button state
- Profile stories tab — uses `StoryCardFull` (different component), no linked-point actions
- Feed point cards — don't show linked stories at all; premature
- Embeds — no auth context

## Acceptance Criteria

- [ ] Unlink action visible on point detail page when viewer is story author and story is expanded
- [ ] Action NOT visible when viewer is not the story author
- [ ] Clicking triggers confirmation dialog (same copy as P616)
- [ ] Confirm unlink removes the story-point link (optimistic update)
- [ ] Position remains after unlink (only the story link is severed)
- [ ] Visual consistency with existing `✏ your story` edit link pattern
- [ ] All existing P616 E2E tests still pass

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | P616 was never shipped | Reclassified as `type: story`. | P616 branch has backend code but UI was never built. |
| 2 | /challenge-prd | Profile stories tab uses `StoryCardFull`, not `StoryCardDetail` | Dropped from scope. | Different component entirely. |
| 3 | Scope review | QuotedPoint has zero action buttons — story-detail is wrong surface | Moved to point detail page only. | edit/trash/share are on story card footers, not on linked-point cards within stories. No existing pattern to match in QuotedPoint. |
| 4 | Scope review | Doc page same zero-action state as story-detail | Dropped from scope. | Same reasoning as #3. |
| 5 | Scope review | Feed point cards don't show stories | Premature — no visual anchor for unlink. | Feed cards show statement + position buttons + share only. |

## UX Design

> **Scope:** Point detail page only (`/point/:id`). The viewer's own expanded story card shows an unlink action in the stats row. Other surfaces (story-detail, doc, profile, feed) are out of scope.

### Surface

On the point detail page, position holders are listed as compact rows. When a holder has a story, a "1 story" pill toggles an expanded region that renders the story card with `context="point-detail"`. In this context the card footer is hidden and the stats row (understood count + share button) is the only action area.

The unlink button lives in this stats row, next to the existing share button, visible only when the viewer is the story author.

### User Flow

1. Viewer opens `/point/:id` where they have a linked story
2. Viewer's position row shows "1 story" pill (already working)
3. Viewer taps "1 story" — expanded region opens, showing their story card
4. Stats row at the bottom of the story card shows: `[Understood count]  ...  [Unlink icon] [Share icon]`
5. Viewer taps the unlink icon
6. Confirmation dialog opens (same copy as P616):
   - Title: "Unlink point from story?"
   - Point preview: truncated statement (max 80 chars), quoted, muted text
   - Body: "The point will remain visible to others who have taken positions on it."
   - Actions: Cancel (secondary) | Unlink (destructive, red)
7a. Confirm: story-point link is removed. Story card disappears from the expanded region. "1 story" pill disappears from the position row. Toast: success.
7b. Cancel: dialog closes, no change.
7c. Network failure: toast error "Failed to unlink point. Please try again." Story card remains.

**Non-flows (button does NOT appear):**
- Viewing another user's expanded story — `isViewer` is false, no unlink icon
- Logged-out viewer — no user, no unlink icon
- Story-detail, doc, profile, feed, embed surfaces — different component paths, out of scope

### Screen Layout

```
┌─ Position holder row ─────────────────────────────┐
│ [Avatar] Name  🎧2  Agrees              [1 story] │
└───────────────────────────────────────────────────┘
  │  (ThreadLine connector)
  │
  ┌─ Story card (context="point-detail") ──────────┐
  │  [Avatar] Name  🎧2                            │
  │  Role · 3d ago · 🔒                            │
  │                                                │
  │  Story text content...                         │
  │  Tag Tag                                       │
  │                                                │
  │  👂 2 understood     [🔗 Unlink] [↗ Share]     │
  │                      ▲ NEW                     │
  └────────────────────────────────────────────────┘
```

The unlink icon sits in the existing stats row, inside the right-side action group, before the share button. It only renders when the viewer is the story author and context is point-detail.

### Button Specification

- **Icon:** `Unlink2` from lucide-react, `size={16}` (matches share icon size in the same row)
- **Container:** `min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full` (same pattern as share button)
- **Colors:**
  - Default: `text-muted-foreground` (matches share icon)
  - Hover: `text-destructive hover:bg-destructive/10` (signals removal; matches delete button hover)
- **Tooltip:** "Unlink point from story" (via MobileTooltip, same component used for share/open buttons)
- **ARIA:** `aria-label="Unlink point from story"` (matches P616 E2E test expectations)

### Edge Cases

| Case | Behavior |
|------|----------|
| Last linked story on this point | Allow unlink. Position row remains (position != story). "1 story" pill disappears. |
| Viewer has position but no story | No "1 story" pill, no expanded region, no unlink button. Nothing to unlink. |
| Optimistic update fails | Story card reappears. Toast: "Failed to unlink point. Please try again." |
| Dialog loading state | Confirm button shows "Unlinking..." with spinner, disabled. Cancel remains active. |
| Multiple stories by viewer for same point | `viewerStory` takes only one (first by created_at). Unlink removes that one link. |

### Accessibility

- Icon button has `aria-label="Unlink point from story"` — no visible text
- Wrapped in MobileTooltip for sighted hover context
- Tab order: after understood count, before share button (natural DOM order in the stats row)
- Confirmation dialog: standard shadcn Dialog with focus trap, Escape to close, auto-focus on Cancel
- Screen reader: dialog title "Unlink point from story?" announced on open; point preview provides context
- Focus return: on dialog close, focus returns to the unlink button

## Component Strategy

### Component Map

| Element | Classification | Notes |
|---------|---------------|-------|
| Unlink icon button | **Build inline** | `Unlink2` from lucide-react, `size={16}`, ~12 lines JSX in stats row of `StoryCardWithLinks` |
| Tooltip wrapper | **Reuse** `MobileTooltip` | Already wraps share/open buttons in the same stats row |
| Confirmation dialog | **Reuse** `Dialog`/`DialogContent`/`DialogFooter` | Same shadcn pattern as story-detail-page unlink dialog |
| Toast | **Reuse** `toast` from sonner | Add import to point-detail-page (not currently imported) |
| Destructive button | **Reuse** `Button variant="destructive"` | Same as story-detail confirm |

No new component files needed. 4 reuse, 1 inline build.

### Composition Tree

```
PointDetailPage
 └─ PositionHolderCard
     └─ ExpandableStoryRegion          (new: onUnlinkPoint callback)
         └─ StoryCardWithLinks          (new: onUnlinkPoint prop)
              └─ stats row div
                   ├─ UnderstoodBadge
                   └─ action group div
                        ├─ [NEW] MobileTooltip → icon button (Unlink2)
                        └─ ShareButton (existing)
 └─ Dialog (confirmation)              (owned by PointDetailPage)
```

**Prop threading:** `PointDetailPage` → `ExpandableStoryRegion` (only when `isViewer`) → `StoryCardWithLinks`. Dialog state + handler owned by page, not card.

### Visual Refinements

- **Button container:** `min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full` — matches stats row share button
- **Hover:** `text-muted-foreground` default → `text-destructive hover:bg-destructive/10` — signals removal
- **Spacing:** sits in existing `flex items-center gap-1` div, no extra margin
- **Transition:** `transition-colors` matching adjacent share button

### Extraction Plan

No extraction needed. Unlink button is conditional inline JSX. Dialog is page-level state. Both patterns already exist in story-detail-page. Extracting shared `UnlinkPointDialog` premature — the two pages have different post-unlink behaviors.

### Implementation Notes

1. `StoryCardWithLinks` needs new optional prop: `onUnlinkPoint?: (storyId: string) => void`
2. `ExpandableStoryRegion` (private in point-detail-page.tsx) already receives `isViewer` — pass `onUnlinkPoint` through
3. Unlink button gate: `context === 'point-detail' && !hideActions && !isEmbed && onUnlinkPoint` (matches share button gate)
4. `storiesService.unlinkPointFromStory(storyId, pointId)` — storyId from callback, pointId from route params
5. Post-unlink: set `viewerStory` to `null` + collapse expanded holder. No full refetch needed.
