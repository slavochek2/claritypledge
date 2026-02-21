---
status: all-done
type: bug
rank: 402
workstream: C1
severity: high
date_reported: 2026-02-20T00:00:00.000Z
created_date: 2026-02-20T00:00:00.000Z
tags: []
locked_at: '2026-02-20T12:09:25.516Z'
---

# BUG: Profile Points Tab Shows Wrong Points

## Problem

The Points tab on a user's profile shows points the user **created** (`first_validator_id = user_id`), not points they have **positions on**. A user who takes positions on 10 points they didn't create sees zero in their tab. A user who created points but removed all positions still sees them.

## Symptoms

- Points tab is empty for users who positioned on others' points
- Points tab shows points with no active position (user created but never positioned, or removed position)
- Tab count is misleading

## Root Cause

`getPointsForProfileDisplay(validatorId)` calls `getPointsByValidator(validatorId)` which filters on `first_validator_id`. Should filter on `point_positions.user_id` instead.

The correct method already exists: `getPointsWithUserPositions(userId)` — but it has an N+1 query problem that needs fixing before it can be used on profile.

## Resolution

1. Fix `getPointsWithUserPositions` to use batch queries (same pattern as `getPositionCountsForPoints`)
2. Replace `getPointsByValidator` call in `getPointsForProfileDisplay` with the fixed method
3. Ensure `profileSubjectPosition` is still populated for the profile owner's position display

## Verification

- User with positions on others' points sees those points in tab
- User who created points but has no positions sees empty tab
- Tab count matches actual positions held
- Existing batch loading (counts, viewer positions) still works

## Architecture

### Root of the Bug

`getPointsForProfileDisplay(validatorId, viewerUserId)` calls `getPointsByValidator(validatorId)` which queries `points WHERE first_validator_id = validatorId`. This returns points the user *created*, not points the user *has positions on*. The correct data source is `point_positions WHERE user_id = userId`.

`getPointsWithUserPositions(userId)` already queries the correct table, but uses `Promise.all(pointIds.map(id => this.getPointWithUserPosition(id, userId)))` — one DB round-trip per point (N+1).

---

### Fix 1: Rewrite `getPointsWithUserPositions` — Batch Queries

Replace the N+1 pattern with the same batch strategy used in `getPointsFeed` / `getPointsForProfileDisplay`.

**New signature (unchanged):**
```ts
async getPointsWithUserPositions(userId: string): Promise<PointWithUserPosition[]>
```

**New implementation:**

```ts
async getPointsWithUserPositions(userId: string): Promise<PointWithUserPosition[]> {
  log('⚡ getPointsWithUserPositions:', userId);

  // 1. Get all point_ids this user has positions on
  const { data: positionRows, error: posError } = await supabase
    .from('point_positions')
    .select('point_id')
    .eq('user_id', userId);

  if (posError || !positionRows || positionRows.length === 0) return [];

  const pointIds = positionRows.map(p => p.point_id);

  // 2. Fetch the point rows with creator profiles (single query, IN clause)
  const { data: pointRows, error: pointsError } = await supabase
    .from('points')
    .select(`
      *,
      creator:profiles!points_first_validator_id_fkey (
        id, name, slug, avatar_color, avatar_url
      )
    `)
    .in('id', pointIds)
    .order('created_at', { ascending: false });

  if (pointsError || !pointRows) {
    log('ERROR: getPointsWithUserPositions points fetch error:', pointsError);
    return [];
  }

  const points = (pointRows as DbPointWithCreator[]).map(mapPointFromDb);

  // 3. Batch fetch position counts and user's own positions (2 queries for N points)
  const [countsMap, userPositionsMap] = await Promise.all([
    this.getPositionCountsForPoints(pointIds),
    this.getMyPositionsForPoints(pointIds, userId),
  ]);

  // 4. Assemble PointWithUserPosition[]
  return points.map(point => {
    const positionCounts = countsMap.get(point.id) || emptyPositionCounts();
    const totalPositions = Object.values(positionCounts).reduce((sum, n) => sum + n, 0);
    return {
      ...point,
      positionCounts,
      totalPositions,
      userPosition: userPositionsMap.get(point.id),
    };
  });
},
```

**Query budget:** 4 queries total (was 1 + N×3). Matches the `getPointsFeed` batch pattern.

---

### Fix 2: Update `getPointsForProfileDisplay` — Use `getPointsWithUserPositions`

Replace the `getPointsByValidator` call with `getPointsWithUserPositions`. The method must then also populate `profileSubjectPosition` (the profile owner's position, shown in `PointCard` even when viewing as another user).

**New signature (unchanged):**
```ts
async getPointsForProfileDisplay(
  validatorId: string,    // profile subject's userId
  viewerUserId?: string   // logged-in viewer (may differ from subject)
): Promise<PointWithUserPosition[]>
```

**New implementation:**

```ts
async getPointsForProfileDisplay(
  validatorId: string,
  viewerUserId?: string
): Promise<PointWithUserPosition[]> {
  log('⚡ getPointsForProfileDisplay:', { validatorId, viewerUserId });

  // FIX: query by positions held, not points created
  const { data: positionRows, error: posError } = await supabase
    .from('point_positions')
    .select('point_id')
    .eq('user_id', validatorId);

  if (posError || !positionRows || positionRows.length === 0) return [];

  const pointIds = positionRows.map(p => p.point_id);

  // Fetch point rows with creator profiles
  const { data: pointRows, error: pointsError } = await supabase
    .from('points')
    .select(`
      *,
      creator:profiles!points_first_validator_id_fkey (
        id, name, slug, avatar_color, avatar_url
      )
    `)
    .in('id', pointIds)
    .order('created_at', { ascending: false });

  if (pointsError || !pointRows) {
    log('ERROR: getPointsForProfileDisplay points fetch error:', pointsError);
    return [];
  }

  const points = (pointRows as DbPointWithCreator[]).map(mapPointFromDb);

  const viewerIsSubject = viewerUserId === validatorId;

  // Batch fetch: counts + viewer positions + subject positions (2-3 queries)
  const [countsMap, viewerPositionsMap, subjectPositionsMap] = await Promise.all([
    this.getPositionCountsForPoints(pointIds),
    !viewerIsSubject && viewerUserId
      ? this.getMyPositionsForPoints(pointIds, viewerUserId)
      : Promise.resolve(new Map<string, PointPosition>()),
    this.getMyPositionsForPoints(pointIds, validatorId),   // always fetch subject
  ]);

  return points.map(point => {
    const positionCounts = countsMap.get(point.id) || emptyPositionCounts();
    const totalPositions = Object.values(positionCounts).reduce((sum, n) => sum + n, 0);
    const profileSubjectPosition = subjectPositionsMap.get(point.id);
    const userPosition = viewerIsSubject
      ? profileSubjectPosition
      : viewerPositionsMap.get(point.id);

    return {
      ...point,
      positionCounts,
      totalPositions,
      userPosition,
      profileSubjectPosition,   // always the profile owner's position
    };
  });
},
```

**Query budget:** 4–5 queries total regardless of N points. Same as before — complexity is unchanged, only the source table changes.

---

### `profileSubjectPosition` — Still Correctly Populated

`profile-page-v2.tsx` uses `point.profileSubjectPosition` in two places:

1. **Initial load** (line ~283): `positions[profile.id] = { position: point.profileSubjectPosition.position, ... }`
2. **After position update** (line ~407): same transform in `handleProfilePointPosition`

Both call `getPointsForProfileDisplay(profile.id, currentUser?.id)`. The new implementation fetches `subjectPositionsMap` from `getMyPositionsForPoints(pointIds, validatorId)` — identical to the current approach — so `profileSubjectPosition` is populated with the same query pattern as before. No changes to the call sites in `profile-page-v2.tsx` are needed.

---

### Type Changes

No type changes required. `PointWithUserPosition` already has `profileSubjectPosition?: PointPosition` (used currently). The field is populated via the same `getMyPositionsForPoints` batch call — source changes from `getPointsByValidator` to `point_positions`, not from a type change.

---

### Files to Change

| File | Change |
|------|--------|
| `src/app/data/points-service-real.ts` | Rewrite `getPointsWithUserPositions` (batch, no N+1); rewrite body of `getPointsForProfileDisplay` to query `point_positions` instead of `getPointsByValidator` |
| `src/app/pages/profile-page-v2.tsx` | No changes needed — call sites are identical |

---

### Correctness Invariants After Fix

- A user with positions on 10 others' points → sees all 10 in Points tab
- A user who created 5 points but has no positions on them → sees 0 in Points tab
- `profileSubjectPosition` on each card still reflects the profile owner's actual position
- Viewer's own position (`userPosition`) still shows for the logged-in user
- Tab count matches `realPoints.length`, which now reflects positions held
