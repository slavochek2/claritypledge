---
status: done
type: bug
rank: 125000.5
workstream: C1
severity: high
date_reported: 2026-02-17T00:00:00.000Z
date_resolved: 2026-02-18
root_cause: >
  Surface A: getPointWithCounts() never loaded userPosition on mount — needed getPointWithUserPosition(id, userId).
  Surface B: getStoriesByAuthorWithPoints() didn't accept userId, so positionCounts/userPosition were never fetched.
  QuotedPointCard used useState(prop) which doesn't reinitialize on prop changes — needed useEffect sync.
  PositionButton was missing aria-pressed attribute entirely.
resolution: >
  Added getPointWithUserPosition call to point-detail-page.tsx when user is logged in.
  Extended PointSummary type with positionCounts and userPosition fields.
  Updated getStoriesByAuthorWithPoints signature to accept optional userId; batch-fetches counts and positions.
  Added useEffect sync for userPosition in QuotedPointCard.
  Added aria-pressed to PositionButton inner button.
  Regression test: e2e/p268-position-display-integrity.spec.ts (5 tests, A1/A2/A3 Surface A, B1/B2 Surface B).
tags:
  - positions
  - counts
  - profile-page
  - story-expand
  - point-detail
  - persistence
created_date: 2026-02-17
---

# BUG P268: Position Display Incomplete — Detail Page + Stories Expanded

## Parent

**P155** fixed position counts on the Profile → Points tab.
This ticket covers the **two surfaces P155 explicitly left out** as "out of scope."

Both have the same symptom: position counts show 0, user's selected position not highlighted on page load.

---

## Surfaces in Scope

### Surface A — Point Detail Page (`/point/:id`)

**Symptom:** User's position button not highlighted when navigating to a point detail page, even if they previously selected a position.

**Root cause:** `point-detail-page.tsx` calls `getPointWithCounts(id)` on mount — never fetches the viewer's own position. `userPosition` starts as `null`. The list below correctly shows "Vyacheslav → Disagrees" (from `getPositionsForPoint`) but the button has no highlight.

**Fix:** Replace `getPointWithCounts(id)` with `getPointWithUserPosition(id, user?.id)` in the initial load. Add `user?.id` to the effect dependency array. Initialize `setUserPosition` from the returned `userPosition` field.

**Files:** `src/app/pages/point-detail-page.tsx` (lines ~52–83, ~49)

---

### Surface B — Profile → Stories Tab, Expanded Points (`QuotedPointCard`)

**Symptom:** When a story card is expanded (click "N points by..."), the position buttons inside show counts = 0 and no position highlighted, even if the user has positions set.

**Root cause:** Pipeline failure across 3 layers:
1. `getStoriesByAuthorWithPoints` (stories-service-real.ts:299) only selects `id, statement, context, tags` from points — never fetches `position_counts` or user position
2. `PointSummary` type has no `positionCounts` field
3. `QuotedPointCard` uses hardcoded `baseCounts` = all zeros

**Fix:**
1. Update `getStoriesByAuthorWithPoints` DB query to join position counts. Accept optional `userId` to fetch current user's position.
2. Add `positionCounts?: Record<string, number>` and `userPosition?: string | null` to `PointSummary` type
3. Update `mapPointSummaryFromDb` to map the new fields
4. Update `QuotedPointCard` to use `point.positionCounts` instead of hardcoded zeros, initialize `userPosition` from prop

**Files:**
- `src/app/data/stories-service-real.ts` (lines ~299–310, ~103–111)
- `src/app/types/index.ts` (line ~894)
- `src/app/pages/profile-page-v2.tsx` (`QuotedPointCard`, lines ~991–1067)

---

## Acceptance Criteria

### Surface A — Point detail page
- [ ] Navigate to `/point/:id` while logged in with existing position → button is highlighted immediately on load (no click required)
- [ ] Reload page → button still highlighted
- [ ] User with no position → no button highlighted (correct)

### Surface B — Stories tab expanded
- [ ] Expand a story card → linked points show real counts (not 0 if positions exist)
- [ ] User's own position button is highlighted in expanded points
- [ ] Collapse and re-expand → still correct

### Cross-surface (permanent regression test)
- [ ] `e2e/position-display-integrity.spec.ts` created and passing:
  - Setup: create point, set Agree position as test user
  - Verify: Profile Points tab → count = 1, Agree highlighted ✅
  - Verify: Profile Stories tab expanded → count = 1, Agree highlighted ✅
  - Verify: Point detail page → count = 1, Agree highlighted ✅
  - Verify: All 3 still correct after page reload

---

## Key Files

| File | Relevance |
|------|-----------|
| `src/app/pages/point-detail-page.tsx` | Surface A fix |
| `src/app/data/stories-service-real.ts` | Surface B — service layer |
| `src/app/types/index.ts` | Surface B — `PointSummary` type |
| `src/app/pages/profile-page-v2.tsx` | Surface B — `QuotedPointCard` |
| `e2e/position-display-integrity.spec.ts` | New permanent cross-surface test |

---

## Related

- **P155:** Fixed Profile → Points tab (parent bug) — `status: done`
- **P154:** Fixed DB persistence (positions save) — `status: done`
- **P151:** Fixed batch loading architecture — `status: done`
