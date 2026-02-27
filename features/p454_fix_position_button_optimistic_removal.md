---
id: p454
title: "Fix: position button clears optimistically before Remove dialog confirmed"
type: bug
status: qa
severity: medium
date_reported: 2026-02-27
date_resolved: 2026-02-27
root_cause: "setUserPosition(null) fired immediately on deselect in PointCardWithLinks before the Remove Position confirmation dialog appeared. Cancel left local state as null while DB was untouched."
resolution: "Guard setUserPosition call: only update optimistically when newPosition !== null. Mirrors pattern already used in point-detail-page.tsx."
tags: []
created_date: 2026-02-27
rank: 100000
---

# P454: Fix position button clears optimistically before Remove dialog confirmed

## Bug Description

**Reported:** 2026-02-27
**Severity:** Medium

**Symptoms:**
- On the profile → Points tab, clicking an already-selected position button immediately clears the position badge
- The "Remove position?" dialog then appears
- Clicking **Cancel** closes the dialog without a DB change, but the position badge stays gone (local state already null)
- Position only reappears on full page reload or navigation away and back

**Affected surfaces:** Profile → Points tab, Live session point cards (both consume `PointCardWithLinks`).
`point-detail-page.tsx` was already correct — it reverts before calling `guardedRemovePosition`.

**Root cause:** `handlePositionClick` in `point-card-with-links.tsx` called `setUserPosition(newPosition)` unconditionally, including the null (removal) case. The `useEffect` that syncs from props only runs when `point.positions` changes (which only happens after a parent refetch on confirmed removal), so there was no automatic revert on Cancel.

## Resolution

**Fixed:** 2026-02-27
**File:** `src/app/components/social/point-card-with-links.tsx`

Added guard: `if (newPosition !== null) { setUserPosition(newPosition); }` — identical to the pattern in `point-detail-page.tsx:178` and the `PointCardWithLinksInner` component.
