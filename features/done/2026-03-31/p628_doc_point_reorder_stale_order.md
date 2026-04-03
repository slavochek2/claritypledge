---
status: all-done
completed_at: "2026-04-03"
date_resolved: 2026-04-03
root_cause: handleMovePoint used stale pointConfig.order missing newly-linked point IDs
resolution: Replaced with orderedPointIds which always includes all current points
type: bug
rank: 1000034
workstream: E1
severity: medium
date_reported: 2026-04-03
created_date: 2026-04-03
tags: [docs, point-reorder]
---

# BUG: Point move-up/down arrow silently fails in Clarity Docs for newly linked points

## Problem

On the Clarity Doc detail page (`/d/:docId`), point reorder arrows (up/down) silently fail for points that were linked to a story **after** the order was first saved. Most points reorder fine, but newly added ones do nothing when their arrows are clicked.

## Symptoms

- User clicks the move-up chevron on a point in a Clarity Doc
- Nothing happens — no error, no reorder, no toast
- Other points in the same story reorder correctly
- Affects any point added after a prior reorder saved `pointConfig.order`

## Root Cause

`handleMovePoint` in `SortableStoryCard` (`src/app/pages/doc-detail-page.tsx:118-137`) uses `pointConfig.order` from the DB as its working array. This saved array can be stale — missing IDs of points linked after the order was first saved. `indexOf(pointId)` returns `-1`, the guard `if (idx < 0) return` fires, and the move is silently dropped.

The display layer (`orderedPointIds`, lines 110-116) correctly includes all points by starting from `allPoints`, but `handleMovePoint` diverges by using the raw saved order.

## Resolution

Replace `handleMovePoint`'s order source with `orderedPointIds` (which always contains all current point IDs):

**File:** `src/app/pages/doc-detail-page.tsx`

**Change 1 — Lines 119-121:**
```typescript
// Before:
const currentOrder = pointConfig.order?.length
  ? pointConfig.order
  : allPoints.map(p => p.id);

// After:
const currentOrder = [...orderedPointIds];
```

**Change 2 — Line 137 (useCallback deps):**
```typescript
// Before:
}, [pointConfig, docId, docStory.story_id, docStory.point_config, allPoints]);

// After:
}, [pointConfig, docId, docStory.story_id, docStory.point_config, orderedPointIds]);
```

Fix is self-healing: once any move succeeds, ALL current point IDs get persisted, permanently correcting the stale order.

## Verification

1. Open `claritypledge.com/d/ck` (the doc where the bug was reported)
2. Try the move-up arrow on the point that previously didn't work
3. Verify the move succeeds and persists after page refresh
4. Add a NEW point to a story, return to doc, verify it can be reordered
