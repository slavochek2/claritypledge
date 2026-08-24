---
status: all-done
type: task
p_number: 701
title: Points Restructure + Badge Display Fix
pipeline_ran: [fix, ship]
date_created: 2026-04-13
completed_at: "2026-04-13"
tags: []
rank: 1000706.0
created_date: 2026-04-13
---

# P701: Clarity Points Restructuring + Badge Display Fix

## Context

System tags for clarity points reordered to match new reading order. Badge display overhauled to be data-driven (removes hardcoded `CANONICAL_BADGE_STATIONS`). `stories.title` column deleted (always empty).

**Depends on:** P581 (letters), P686 (badge — in main).

## Tasks

### Task 1: System Tag 3-Way Swap (prod migration)

Rename st-tags to match new reading order:

| Pos | Content | Old tag | New tag |
|-----|---------|---------|---------|
| 1 | Understanding ambiguity | st1 | st1 (same) |
| 2 | Paraphrase method | st3 | st2 |
| 3 | Shared vs common belief | st5 | st3 |
| 4 | Judgment breaks it | st4 | st4 (same) |
| 5 | Estimates + illusion + Popper gap | st2 | st5 |
| 6–9 | Win-win through Pledge | st6–st9 | same |

10 rows affected. Migration file: `supabase/migrations/20260413100000_p701_st_swap.sql`

### Task 2: Content Updates (2 new point versions)

- ST1 v3: "I" language + cognitive type reframe
- ST5 v2 (was old-st2): expanded with illusion + Popper gap, all "I" language

Migration file: `scripts/archive/migrations/20260413-p701-points-content.sql`

### Task 3: Badge Display Overhaul

Remove `CANONICAL_BADGE_STATIONS` (lines 37-92 of `badge-certificate.tsx`). Replace with data-driven earned-only layout with expandable items showing story excerpt + point with position pill.

### Task 4: Delete `stories.title` Column

Column always empty. ~15 files to update. Migration file: `supabase/migrations/20260413110001_p701_drop_story_title.sql`

## Acceptance Criteria

- [ ] Task 1: `/feed/understanding` shows points in new reading order (st1→st2→st3→st4→st5)
- [ ] Task 1: `/feed/misunderstanding` shows anti-points in new order
- [ ] Task 1: `/point/st2` resolves to paraphrase method
- [ ] Task 1: `/point/st5` resolves to estimates+illusion
- [ ] Task 2: New ST1 v3 and ST5 v2 appear as latest in their st-group
- [ ] Task 3: Badge page shows only earned points (not 9 empty slots)
- [ ] Task 3: Each earned item expandable with story excerpt + point + position pill
- [ ] Task 3: Badge progress bar shows N/9 (collapsed by st-group)
- [ ] Task 3: Export certificate shows all items expanded
- [ ] Task 4: No TypeScript errors after title removal
- [ ] Task 4: `/live` story picker still works without title field
- [ ] `npm run build` passes
- [ ] `npm test` passes
