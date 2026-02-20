---
status: today
type: story
rank: 1
workstream: foundation
created_date: 2026-02-20T00:00:00.000Z
tags: []
uat_file: features/uat/p407.md
test_files:
  - e2e/p407-story-detail-points.spec.ts
  - e2e/p407-smoke.spec.ts
locked_at: '2026-02-20T11:49:34.801Z'
---

# P407: Unify Story Detail Points — Remove Duplicate List, Add Author Unlink to Card

## Problem

On the story detail page, linked points appear **twice**:
1. Inside `StoryCardDetail` — collapsible toggle in the footer, full `QuotedPoint` cards with position buttons
2. Inside `KeyPointsSection` — a separate flat list of the same points with unlink (✕) buttons

The author sees their points listed in two different visual styles stacked below each other. The `KeyPointsSection` was built separately from the story card's collapsible points system and now duplicates it.

## Solution

- **Remove** the point list from `KeyPointsSection` — it's already shown in the story card
- **Auto-expand** points by default when `isDetailView={true}` in `StoryCardDetail`
- **Add author-only unlink (✕)** to each `QuotedPoint` card — visible only when viewer is the author
- **`KeyPointsSection` becomes add-form only** — no point list, just the textarea + position picker + Add Point button
- **`justCreated` banner** sits above the add form ("Story saved. Now add key points...")

## Acceptance Criteria

- [ ] Points auto-expand on story detail page (no click needed)
- [ ] ✕ unlink button visible on each QuotedPoint card — author only, hidden for non-authors
- [ ] Clicking ✕ unlinks point with optimistic removal + undo toast (5s)
- [ ] KeyPointsSection shows only the add form — no repeated point list
- [ ] `justCreated` banner appears above form when redirected from create flow
- [ ] Non-authors: no ✕ visible anywhere, no add form shown
- [ ] Undo toast successfully re-links point

## Files Affected

- `src/app/components/social/StoryCardDetail.tsx` — auto-expand on detail view, thread `isAuthor` + `onUnlink`
- `src/app/prototypes/linkedin-like/components/shared/PositionButton.tsx` (QuotedPoint) — add ✕ button
- `src/app/pages/story-detail-page.tsx` — remove point list from KeyPointsSection, wire onUnlink to card

## Technical Notes

- `isDetailView` prop already exists on `StoryCardDetail` — use it to default `pointsExpanded` to `true`
- `onUnlink` callback needs to thread from `StoryDetailPage` → `StoryCardDetail` → `QuotedPoint`
- Unlink logic already exists in `KeyPointsSection.handleUnlink` — move/reuse it
- `QuotedPoint` is inside `PositionButton.tsx` — check exact component location before editing

## Testing

Manual: author flow (create → detail → unlink → undo), non-author view (no ✕, no form)
