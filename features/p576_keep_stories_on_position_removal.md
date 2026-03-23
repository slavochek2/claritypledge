---
status: in-progress
type: bug
rank: 1
tags:
  - epic-story-first
  - stories
  - points
  - database
flow: dev
created_date: 2026-03-23T00:00:00.000Z
---

# P576: Keep Stories Linked When Position Is Removed

**Epic:** story-first (P523 vision)
**Depends on:** P560, P574

## Problem

A DB trigger (`trg_cascade_position_removal` from P401) automatically deletes `story_points` rows when a position is removed. This made sense pre-P560 when stories required positions. Now that P560 decouples stories from positions and P574 renders positionless stories, the cascade destroys valuable story-point links.

When a user removes their position on a point where they've filed a story:
- The story disappears from the point detail page
- The `story_points` link is deleted by trigger
- History row is written to `story_point_history` with `unlink_reason = 'position_removed'`

## Solution

1. Drop the cascade trigger — stories survive position removal
2. Update dialog copy to reflect new behavior ("story will remain without a position")
3. Keep `story_point_history` table and link-creation trigger (still useful for audit)

## Acceptance Criteria

- [ ] Removing a position does NOT unlink stories from the point
- [ ] Story moves to "Perspectives without position" section (P574) after position removal
- [ ] Dialog text updates: "Your N stories will remain linked without a position" (replaces "unlink N stories")
- [ ] `story_point_history` table preserved (no schema drop)
- [ ] Link-creation trigger (`trg_story_point_link_history`) preserved
- [ ] Only the cascade trigger (`trg_cascade_position_removal`) is dropped

## Technical Details

**Migration:** Drop trigger + function
```sql
DROP TRIGGER IF EXISTS trg_cascade_position_removal ON point_positions;
DROP FUNCTION IF EXISTS cascade_position_removal_to_story_points();
```

**UI:** Update `remove-position-dialog.tsx` copy (line 54)

## Out of Scope
- Re-linking previously unlinked stories (historical data stays as-is)
- Changes to story_point_history schema
