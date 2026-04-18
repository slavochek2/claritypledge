---
id: p713
title: Compose flow does not preselect author's existing point positions
type: bug
status: all-done
completed_at: 2026-04-17
severity: medium
date_reported: 2026-04-15
pipeline_ran: [fix]
tags: []
rank: 1000752.0
created_date: 2026-04-15
---

# P713: Compose flow does not preselect author's existing point positions

## Bug Description

**Reported:** 2026-04-15
**Severity:** Medium — author sees their own points as unselected, even after having set positions

**Symptoms:**
- In `LetterPredictionWalk` (compose flow), all three position buttons (Disagree / Unsure / Agree) appear unselected for every point
- The author has already set positions on those points (saved to `point_positions` DB)
- Clicking a button writes correctly to DB (write path works — P711)
- But on page load, existing positions are not reflected in the UI

**Reproduction steps:**
1. As an author with positions set on points in a doc, open the compose flow:
   `http://localhost:5200/letter/[doc-id]/compose`
2. Observe the point cards — all buttons are unselected
3. Expected: buttons reflect the author's existing positions
4. Actual: all buttons appear unselected (no visual selection)

**Root cause:**
`docsService.getDoc()` fetches `story_points → points` but never joins `point_positions` for the current user.
`STORY_WITH_AUTHOR_AND_POINTS_SELECT` has no `point_positions` subquery, so `userPosition` is always
`undefined` on every `PointWithUserPosition` object returned.

**Affected surface:** `letter-compose-page.tsx` → `LetterPredictionWalk`

---

## Acceptance Criteria

- [ ] On compose flow open, point buttons reflect the author's existing positions from DB
- [ ] Points with no saved position show all buttons unselected (unchanged behavior)
- [ ] Writing a new position during compose still works (write path unaffected)
- [ ] No regression on other `getDoc()` callers

---

## Resolution

**Root cause:** `STORY_WITH_AUTHOR_AND_POINTS_SELECT` has no `point_positions` subquery.
`userPosition` is never populated in the data returned by `getDoc()`.

**Fix location:** `src/app/pages/letter-compose-page.tsx` — after `getDoc()` resolves,
bulk-fetch `point_positions` for the current user across all point IDs, then merge
`userPosition` into the stories before passing to `LetterPredictionWalk`.

**Regression test:** `e2e/p713-compose-positions-preselected.spec.ts`
