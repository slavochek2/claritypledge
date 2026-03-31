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

## Solution

### Part 1: Fix RemovePositionDialog copy

Simplify the dialog to remove all story-unlink language:
- Current: "Removing your position will also unlink N stories from this point..."
- New: "Remove your [position] position from this point?" + simple "Remove" button
- Remove `checkLinkedStories` call and linked story count logic (dead code since P576)

### Part 2: Add unlink button to story detail page

On each linked point row in the story detail page, add an unlink action — **author-only**.

**Placement:** Bottom-right of each point row, next to existing share/external-link icons (matching the established icon position pattern).

**Icon:** × or Unlink2 (lucide) — NOT trash (implies deletion; the point survives).

**Tooltip:** "Unlink from story"

**On click:** Confirmation dialog: "Unlink this point from your story? The point will remain visible to others but won't appear on this story page." + Cancel / Unlink buttons. (Dialog, not undo-toast — re-linking is not trivially reversible without a dedicated UI.)

**On confirm:** Call `storiesService.unlinkPointFromStory(storyId, pointId)` → remove point from local state → success toast "Point unlinked."

**Visibility:** Only when `isAuthor` is true. Non-authors see no unlink icon. RLS enforces this at DB level too.

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
