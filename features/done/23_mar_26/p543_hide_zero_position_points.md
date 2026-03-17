---
status: in-progress
delivery_stage: uat
type: feature
rank: 250011.75
workstream: E1
flow: dev
created_date: 2026-03-17
tags: [points, feed, graveyard]
uat_file: features/uat/p543.md
test_files:
  - src/tests/p543-zero-position-filter.test.ts
---

# P543: Hide Zero-Position Points from Listings

## Problem

Points with zero positions (all positions withdrawn, or abandoned after creation) appear in feed, profile, and live session picker — polluting listings with content nobody engaged with. They should be kept in DB for reference but hidden from all listing surfaces.

## Solution

Query-level filter in 3 service methods. No schema change. Points with `totalPositions === 0` are excluded from listing queries by joining against `point_positions` and requiring at least one match.

### Surfaces to filter (hide zero-position points)
1. **`getPublicPointsFeed`** — feed page
2. **`getPointsForProfileDisplay`** — profile points tab
3. **`getPointsForFeedDisplay`** — feed display (deprecated but still callable)
4. **Live content picker** — calls `getPointsForProfileDisplay`

### Surfaces to NOT filter (keep accessible)
1. **`getPoint` / `getPointWithCounts` / `getPointWithUserPosition`** — direct URL access (`/point/:id`)
2. **Story-linked point quotes** — story chose this point, show regardless
3. **P523 standalone creation flow** — transient zero during creation is expected

### Implementation approach
Each listing method adds an INNER JOIN on `point_positions` (or equivalent `IN` subquery) so only points with at least one position row are returned. This is more efficient than fetching all then filtering client-side.

## Acceptance Criteria

- [x] Feed page shows no points with 0 positions
- [x] Profile points tab shows no points with 0 positions
- [x] Live session content picker shows no points with 0 positions
- [x] Direct URL `/point/:id` still works for zero-position points
- [x] Story-linked point quotes still render for zero-position points
- [x] Newly created point (P523 flow) is visible during creation before first position is taken

## Testing

- Unit tests for each filtered service method confirming zero-position points excluded
- Unit test confirming direct access (`getPoint`) still returns zero-position points
- Edge case: point with positions that all get removed → disappears from feed

## Test Coverage Strategy

**What's Tested:**
- ✅ `getPublicPointsFeed` excludes zero-position points (unit)
- ✅ `getPointsFeed` excludes zero-position points (unit)
- ✅ `getPointsForProfileDisplay` excludes zero-position points (unit)
- ✅ `getPoint` still returns zero-position points (unit — negative test)
- ✅ `getPointWithCounts` still returns zero-position points with 0 counts (unit — negative test)
- ✅ Edge case: all points zero → empty result (unit)
- ✅ Edge case: last position removed → point disappears on next load (unit)

**What's NOT Tested (rationale):**
- ❌ E2E tests — no new UI surface; points simply disappear from existing lists
- ❌ Integration tests — no DB schema change; filter is client-side after fetch
- ❌ Accessibility tests — no UI changes
- ❌ Smoke tests — no new routes

**Test Pyramid:**
```
  /\
 /  \  0 E2E
/____\
/ 7 UNIT \
```

Total: 7 automated unit tests + 7 UAT scenarios
Estimated run time: ~2 seconds

**Files:**
- `src/tests/p543-zero-position-filter.test.ts` — 7 unit tests
- `features/uat/p543.md` — 7 UAT scenarios
