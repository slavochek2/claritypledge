---
status: backlog
type: story
workstream: foundation
tags:
  - visibility
  - p576-follow-up
  - ux
  - points
  - stories
delivery_stage: create-spec
rank: 44
created_date: 2026-03-31T00:00:00.000Z
---

# P616: Unlink Point from Story + Fix RemovePositionDialog

**Epic:** story-first (P523 vision)
**Depends on:** P576 (already done)

---

## Problem Statement

Two related issues with how the point-story relationship is managed:

### Issue 1: RemovePositionDialog has misleading copy

The dialog (consumed by 5 surfaces: `point-detail-page`, `profile-page-v2`, `story-detail-page`, `clarity-live-page`, `feed-point-card`) includes a conditional message:

> "Your **N stories** will stay linked to this point without a position."

This copy was added by P576 to replace the old "will unlink N stories" text. The message is technically accurate but it is misleading for two reasons:

1. The dialog is supposed to guard a simple action — "remove my position." The conditional story count message implies that something notable happens to stories when it doesn't: stories are completely unaffected.
2. The `checkLinkedStories` query still fires on every position removal even though the result no longer gates any behavior. It's an unnecessary round-trip.

The pre-P576 design (P401) added this dialog warning because removing a position DID cascade-delete story links. P560 made positions and stories independent. P576 dropped the cascade trigger. The dialog copy was updated but the structural assumption (stories are affected by position removal) was not.

**The correct dialog is a simple confirm:** "Remove your [position] position?" — no mention of stories.

### Issue 2: No UI to unlink a point from a story

The backend is ready:
- `storiesService.unlinkPointFromStory(storyId, pointId)` — implemented and tested
- RLS: story authors can delete from `story_points`
- `story_point_history` table preserves audit trail

P131 deferred the UI. There is currently no way for a story author to remove a point they linked to their story.

---

## Prior Decision Chain

| Date | Spec | Decision |
|------|------|----------|
| Feb 26 | P401 | DB trigger cascades position removal → story unlink. Warning dialog added. |
| Mar 12 | P560 | Design shift: stories and positions are independent. Stories can exist without a position. |
| Mar 23 | P576 | Cascade trigger `trg_cascade_position_removal` dropped. Dialog copy updated to "will stay linked." |
| Mar 31 | decisions.md | Identified: dialog still implies story effect from position removal. No unlink UI exists. Status: proposed. |

---

## Business Requirements

### BR-1: Simplify RemovePositionDialog

The dialog must confirm position removal only. It must not reference stories in any way (not a warning, not an informational message). The `checkLinkedStories` pre-flight call must be removed from `useRemovePositionGuard`.

**Priority: Must Have.** The existing dialog misleads users about what position removal does.

### BR-2: Add unlink button to story detail page

Story authors must be able to remove a point from their story via the story detail page. The unlink action:
- Is visible only to the story author
- Requires a confirmation dialog before proceeding
- Deletes the `story_points` junction row (point remains in the system, position unaffected)
- Provides clear feedback on completion

**Priority: Must Have.** The backend is ready; the gap is a missing UI surface only.

### BR-3: Confirmation dialog for unlink

Because re-linking a point to a story is not easy (no quick re-link UI exists), the unlink action must be confirmed with a dialog that:
- States what will happen
- Shows a truncated version of the point statement to confirm identity
- Clarifies the point survives (it is not deleted)
- Offers Cancel and Unlink actions

**Priority: Must Have.** Without confirmation, an accidental tap destroys a link that cannot be quickly restored.

### BR-4: Correct icon for unlink (not trash)

The unlink button must not use a trash icon. Unlinking removes only the junction row — the point itself is preserved. Using a trash icon would imply deletion of the point. Use `Unlink2` or `×` from lucide-react.

**Priority: Must Have** (correctness of mental model).

---

## User Stories

**US-1: Remove position without story noise**
As a user removing my position on a point,
I want a clean confirm dialog that says only "Remove position?",
so that I understand position removal and story-point links are independent.

**US-2: Unlink a point I no longer want on my story**
As a story author,
I want to remove a specific point from my story,
so that I can keep my story's point list accurate as my views evolve.

**US-3: Confirm before unlinking**
As a story author clicking the unlink button,
I want a dialog showing me which point I'm about to remove,
so that I can cancel if I tapped the wrong point.

---

## Jobs to Be Done

**JTBD-1:** When I decide to stop holding a position on a point, I need to remove it cleanly — with no noise about stories — so I understand the action is scoped to my position only.

**JTBD-2:** When my story no longer reflects what a linked point says, I need to remove that point from my story — so the story shows only the points I'm actively standing behind.

---

## UX Design

### Dialog 1: RemovePositionDialog (simplified)

Current behavior: always shows a confirmation dialog; conditionally shows story count.

New behavior: always shows a simple confirm. No story count check, no story mention.

```
┌──────────────────────────────────────────┐
│ Remove position?                         │
│                                          │
│ Removing your position will remove this  │
│ point from your profile.                 │
│                                          │
│              [Cancel]  [Remove position] │
└──────────────────────────────────────────┘
```

**String table:**
- Title: `Remove position?`
- Body: `Removing your position will remove this point from your profile.`
- Cancel button: `Cancel`
- Confirm button: `Remove position` / `Removing...` (loading state)

The `linkedStoryCount` prop and the conditional story message are removed entirely.

### Dialog 2: UnlinkPointDialog (new)

Shown when the story author taps the unlink button on a QuotedPoint card.

```
┌──────────────────────────────────────────┐
│ Unlink point from story?                 │
│                                          │
│ "Point statement text here..."           │
│                                          │
│ The point will remain visible to others  │
│ who have taken positions on it.          │
│                                          │
│              [Cancel]  [Unlink]          │
└──────────────────────────────────────────┘
```

**String table:**
- Title: `Unlink point from story?`
- Point preview: truncate at 80 characters, quoted, in italic or muted style
- Body: `The point will remain visible to others who have taken positions on it.`
- Cancel button: `Cancel`
- Confirm button: `Unlink` / `Unlinking...` (loading state)
- Confirm button variant: `destructive`

### Unlink button placement on story detail page

The unlink button (`×` icon, `Unlink2` from lucide-react, or equivalent) appears at the bottom-right of each QuotedPoint card. Visible to the story author only; hidden for all other viewers.

```
┌─ QuotedPoint card ─────────────────────────────┐
│ 👤 Author Name  🎧1  Agrees                    │
│                                                 │
│ ┌─ Quoted box ────────────────────────────────┐ │
│ │ 📌  🔒 Point statement text here...         │ │
│ │                                             │ │
│ │  × Disagree  ○ Unsure  ○ Agree              │ │
│ │                                             │ │
│ │  ▸ 2 stories                                │ │
│ └─────────────────────────────────────────────┘ │
│                                        [×] ← HERE (author-only, right-aligned)
└─────────────────────────────────────────────────┘
```

- Icon: `Unlink2` (not `Trash2`) from lucide-react — signals decoupling, not deletion
- Size: matches adjacent icon buttons on the page (e.g., edit, delete buttons)
- Tooltip: `Unlink point from story`
- Color: muted/neutral; `text-destructive` on hover
- Alignment: right-aligned below the QuotedPoint card content area
- Auth check: only render when `currentUserId === story.authorId`

---

## Edge Cases

| Case | Expected behavior |
|------|------------------|
| Last point on story | Allow unlink. Stories can exist with zero points. |
| Point has other users' positions | Unaffected. Only the `story_points` junction row is deleted; `point_positions` for other users remain. |
| Re-linking after unlink | No quick re-link UI. User must use the "Add point" form on story detail page. Dialog copy acknowledges the action is not easily reversed. |
| Cross-author point (point created by someone else, linked to my story) | Unlink button still appears for story author — RLS checks story authorship, not point authorship. |
| `unlinkPointFromStory` returns `false` | Show toast error: `"Failed to unlink point. Please try again."` Dialog closes regardless. |
| Slow network on confirm | Button shows `Unlinking...` state; prevent double-submit. |

---

## Acceptance Criteria

### AC-1: RemovePositionDialog — no story mention

Given a user removes their position on a point with linked stories,
When the confirmation dialog appears,
Then the dialog contains only the title "Remove position?" and the body "Removing your position will remove this point from your profile." — no story count, no story mention.

### AC-2: RemovePositionDialog — no extra query

Given a user taps "Remove position",
When `useRemovePositionGuard` runs,
Then no call to `checkLinkedStories` is made (verified by removing the call from the hook and confirming tests pass).

### AC-3: RemovePositionDialog — position is removed

Given the user confirms in the dialog,
When `removePosition` completes,
Then the user's position is removed and `onAfterRemove` fires.

### AC-4: Unlink button visible to author only

Given a story detail page with linked points,
When the page is viewed by the story author,
Then each QuotedPoint card shows the unlink button (Unlink2 icon) below and right-aligned.

Given the page is viewed by any other user (including authenticated non-authors),
Then the unlink button is not rendered.

### AC-5: Unlink confirmation dialog shows point preview

Given the story author taps the unlink button on a point,
When the confirmation dialog opens,
Then it shows the point statement (truncated to 80 chars) and the text "The point will remain visible to others who have taken positions on it."

### AC-6: Unlink removes the junction row

Given the author confirms the unlink,
When `storiesService.unlinkPointFromStory(storyId, pointId)` resolves `true`,
Then the point disappears from the story detail page point list, and the story itself is not deleted.

### AC-7: Unlink error handling

Given `unlinkPointFromStory` returns `false`,
Then a toast error appears: "Failed to unlink point. Please try again." The dialog closes. The point remains in the list.

### AC-8: Point survives unlink

Given a point is unlinked from a story,
When the point detail page is visited,
Then the point still exists with all its positions intact.

### AC-9: No regression on other RemovePositionDialog surfaces

Given the 5 surfaces that use `useRemovePositionGuard` (point-detail-page, profile-page-v2, story-detail-page, clarity-live-page, feed-point-card),
When any of them triggers position removal,
Then the simplified dialog appears with no story mention, and position removal completes correctly.

---

## Out of Scope

- Re-link UI (quick way to re-add a point just unlinked). Out of scope — existing "Add point" form on story detail page serves this need.
- Bulk unlink (removing all points from a story at once). Not a known user need.
- Unlink from surfaces other than story detail page (e.g., from point detail page). Story-point relationship is most naturally managed from the story.
- Unlink audit trail (`story_point_history` DELETE trigger). The existing trigger fires on INSERT only. Unlink is implied by row deletion. Adding a DELETE trigger is scope creep — history is informational only, never used for undo/restore.
- Restoring historical story-point links that were cascade-deleted before P576.
- Any change to `checkLinkedStories` in `points-service-real.ts` beyond removing the call from the hook. The function can stay as dead code for now; removing it is a separate cleanup task.
- **BR-1 (RemovePositionDialog fix) is split out** — shipped separately as inline fix. This spec covers BR-2 (unlink UI) only.

---

## Implementation Notes (for architect)

**Backend:** No migration needed. `unlinkPointFromStory` in `stories-service-real.ts` (lines 593-608) and the RLS policy on `story_points` are already correct.

**RLS verified (2026-03-31):** Policy `"Story authors can unlink points"` uses `EXISTS (SELECT 1 FROM stories WHERE stories.id = story_points.story_id AND stories.author_id = auth.uid())`. Correct — joins through stories to check authorship.

**Component placement (from /challenge-prd Q2):** The unlink button MUST be injected via the `renderPointRow` prop on `StoryCardDetail`, NOT placed inside `StoryCardDetail` itself. Reason: `StoryCardDetail` is shared across story-detail-page, doc-detail-page, and embed mode. Placing the button inside the shared component would leak it into docs and embeds. The `renderPointRow` prop exists for exactly this — per-page control injection (doc-detail-page already uses it for drag handles).

**State update strategy (from /challenge-prd Q3):** Optimistic removal from ALL local state:
- Filter unlinked point out of `story.points` array
- Remove entries from `positionCounts`, `userPositions`, `storyAuthorPositions`, `linkedStoriesForPoints` maps
- On service failure (`unlinkPointFromStory` returns false): full story refetch to restore state
- No refetch on success — optimistic is the established pattern (see position updates, point creation)

**Dialog simplification (BR-1 — split out, fix separately):**
- `RemovePositionDialog` component: remove `linkedStoryCount` prop and the conditional story message block
- `useRemovePositionGuard` hook: remove `checkLinkedStories` call, remove `linkedCount` state
- All 7 call sites (not 5 — includes doc-detail-page and StoryGuideChat) pass `linkedStoryCount` today

**New: UnlinkPointDialog** — confirm dialog for point unlinking. Inline in `story-detail-page.tsx` (small enough, page-scoped).

**story-detail-page.tsx changes:**
- Use `renderPointRow` prop to wrap each QuotedPoint with an unlink button (author-only)
- Wire button to inline dialog state
- On confirm: call `storiesService.unlinkPointFromStory(storyId, pointId)`, optimistically update all local state maps, handle error with refetch

**Test files to update:**
- New test coverage for unlink flow (see `/generate-tests` phase)

---

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [BLOCK] AC-6 state update mechanism unspecified | Optimistic removal from all local state maps; refetch on failure | Matches established codebase pattern |
| 2 | /challenge-prd | [WARN] RLS DELETE policy unverified | Verified: `EXISTS (stories.author_id = auth.uid())` | Confirmed via DB query |
| 3 | /challenge-prd | [WARN] Component placement ambiguous | Use `renderPointRow` injection, not shared StoryCardDetail | Prevents button leaking into docs/embeds |
| 4 | /challenge-prd | [WARN] Surface count wrong (5 vs 7) | Fixed: 7 consumers of RemovePositionDialog | Includes doc-detail-page + StoryGuideChat |
| 5 | /challenge-prd | [WARN] Split BR-1 from BR-2 | Split: BR-1 (dialog fix) ships separately as inline fix | Dialog fix is deletion-only, zero design decisions |
| 6 | /challenge-prd | [NOTE] History trigger INSERT-only | Accepted: unlink audit trail out of scope | History is informational, never used for undo |

## Next Steps

- [ ] Fix BR-1 inline (RemovePositionDialog — separate from this spec)
- [ ] UX validation — confirm icon choice and button placement against design system (`/ux`)
- [ ] Implementation (`/dev`)
