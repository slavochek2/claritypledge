---
status: today
type: story
rank: 1000030.0
workstream: foundation
created_date: 2026-03-31
tags: [visibility, p576-follow-up, ux, points, stories]
flow: dev
---

# P616: Unlink Point from Story + Fix RemovePositionDialog

## Problem Statement

Two related issues with point-story relationship management:

1. **RemovePositionDialog lies.** Says "removing position will unlink your stories" — but it doesn't. The cascade trigger was dropped in P576 (Mar 23) to match P560's design (positions and story-links are independent). The dialog text was never updated.

2. **No way to unlink a point from a story in the UI.** Backend `unlinkPointFromStory()` exists in `stories-service-real.ts` (lines 593-608), RLS is correct (author-only), but no UI was ever built (P131 spec said "backend ready" — UI deferred).

## Prior Decisions

- P560 (Mar 12): Positions and story-links are independent. Stories can be created and linked to points without taking a position.
- P576 (Mar 23): Cascade trigger `cascade_position_removal_to_story_points()` explicitly dropped. Comment: "Stop unlinking stories when position is removed."
- P401 (Feb 26): Original design with cascade trigger and dialog warning — superseded by P560/P576.
- decisions.md (Mar 31): "RemovePositionDialog warns of unlink that doesn't happen — needs fix (Status: proposed)"

## Why positions and story-links are independent

P401 (Feb 26) originally coupled them: removing a position auto-unlinked stories via DB trigger. This was wrong because:
- P560 (Mar 12) established: you can link a story to a point WITHOUT taking a position. Stories explain WHY you care about a point — positions say WHERE you stand. These are different things.
- P576 (Mar 23) dropped the cascade trigger to match this design.
- But the warning dialog was never updated. It still threatens an action that doesn't happen.

**The independence principle:** A story-point link means "this point is relevant to this story." A position means "I agree/disagree with this point." You can have one without the other. Removing your opinion (position) shouldn't destroy the relationship (link). Destroying the relationship should be a separate, deliberate choice.

## Solution

### Part 1: Fix RemovePositionDialog copy

Simplify the dialog to remove all story-unlink language:
- **Current (wrong):** "Removing your position will also unlink N stories from this point. This is recorded in history."
- **New:** "Remove your [position] position from this point?" + simple "Remove" button
- Remove `checkLinkedStories` call and linked story count logic (dead code since P576)

### Part 2: Add unlink button to story detail page

On each linked point in the story detail page, add an unlink action — **author-only**.

Each point is rendered as a `QuotedPoint` card inside `StoryCardDetail`. The card layout is:

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
│                                        [×] ← HERE (author-only)
└─────────────────────────────────────────────────┘
```

**Placement:** Below the quoted box, right-aligned. NOT inside the quoted box (that's a clickable area that navigates to the point). A small icon button below, matching the pattern of action icons on other cards.

**Icon:** `X` (lucide) — small, muted color, author-only. NOT trash (trash implies deletion; the point survives).

**Tooltip:** "Unlink from story"

**On click → Confirmation dialog:**
```
┌──────────────────────────────────────────┐
│ Unlink point from story?                 │
│                                          │
│ "Point statement text here..."           │
│                                          │
│ The point will remain visible to others  │
│ who have taken positions on it.          │
│                                          │
│            [Cancel]  [Unlink]            │
└──────────────────────────────────────────┘
```

**On confirm:** Call `storiesService.unlinkPointFromStory(storyId, pointId)` → remove point from local state → success toast "Point unlinked from story."

**Visibility:** Only when `isAuthor` is true. Non-authors see no unlink icon. RLS enforces author-only DELETE on `story_points` at DB level too.

### Edge cases

- **Last point on story:** Unlinking the last point leaves a story with 0 points. This is valid — stories can exist without points.
- **Point has other people's positions:** Unlinking only removes the story_points junction row. The point, all positions, and all other story links are unaffected.
- **Re-linking after unlink:** No quick re-link UI exists today. The user would need to navigate to the story, click "Add Point", and re-add it. This is why we use a confirmation dialog (not undo toast) — the action is hard to reverse.
- **Point was created by a different author:** The `QuotedPoint` shows the point creator's name. The unlink button should still appear for the story author (they linked it, they can unlink it). The RLS policy checks story authorship, not point authorship.

## Technical Architecture

### Files to Modify
1. `src/app/components/shared/remove-position-dialog.tsx` — simplify copy, remove `checkLinkedStories` dead code
2. `src/app/pages/story-detail-page.tsx` — add unlink icon + confirmation dialog to point rows (author-only)

### Existing Backend (no changes needed)
- `storiesService.unlinkPointFromStory(storyId, pointId)` — already exists, tested
- RLS policy "Story authors can unlink points" — already enforces `auth.uid() = author_id`
- `story_point_history` — link creation already tracked; unlink implied by row deletion

### No DB/schema changes needed

## Acceptance Criteria

- [ ] RemovePositionDialog no longer mentions story unlinking
- [ ] `checkLinkedStories` dead code removed from RemovePositionDialog
- [ ] Story detail page: author sees unlink icon on each linked point
- [ ] Story detail page: non-author sees no unlink icon
- [ ] Clicking unlink icon shows confirmation dialog with clear description
- [ ] Confirming unlink removes point from story (story_points row deleted)
- [ ] After unlinking, point still exists in DB and is accessible via direct URL
- [ ] Unlink icon has tooltip "Unlink from story"
- [ ] Mobile: unlink icon has ≥40px touch target
- [ ] Unlink icon is visually distinct from delete (× or unlink icon, not trash)

## Test Coverage Strategy

- E2E: author sees unlink icon, non-author doesn't
- E2E: unlink flow — click icon → dialog → confirm → point removed from list
- E2E: verify point still exists after unlinking (navigate to point URL)
- Unit: RemovePositionDialog renders without story-unlink text
