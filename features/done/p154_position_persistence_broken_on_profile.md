---
status: done
type: bug
rank: 125002.0
workstream: C2
severity: high
date_reported: 2026-02-16
created_date: 2026-02-16
tags: [positions, persistence, profile-page, p389-followup]
---

# BUG P154: Position Buttons Not Persisting on Profile Page

## Problem

Users cannot save their positions (agree/disagree/unsure) when clicking position buttons on the profile page. Clicks appear to register (optimistic UI update) but disappear on page refresh. This affects the Points tab on `/p/:slug` pages.

**Severity:** HIGH - Core feature broken, affects all users trying to position on profile pages.

**Related:** P151 fixed position *loading* (batch queries), but never addressed position *persistence* (mutations + refetch).

---

## Symptoms

### What Users Experience

1. Navigate to profile page (`/p/:slug`)
2. Click "Points" tab
3. Try to click position button (Agree/Disagree/Unsure) on any point
4. **Expected:** Position saves, count updates, badge appears
5. **Actual:**
   - For non-owners: Buttons may not even appear
   - For all users: Click has no effect, or optimistic update disappears on refresh

### Observable Behavior

- Point detail page (`/point/:id`) - **WORKS** (positions persist correctly)
- Profile page points section - **BROKEN** (no persistence)
- Story detail page - **VERIFY** (depends on implementation)

---

## Root Cause

**Three distinct failures** (from comprehensive analysis by agent a52d9c1):

### 1. Position Buttons Hidden (Profile Page Only)

**File:** `src/app/pages/profile-page-v2.tsx:684-726`

```tsx
<PointCardWithLinks
  key={point.id}
  point={point}
  linkedStories={point.linkedStories || []}
  profileOwner={{...}}
  getPointPositionCounts={...}
  getStoryAuthor={...}
  // ❌ MISSING: currentUserId={currentUser?.id}
  // ❌ MISSING: onPositionSelect={handlePositionSelect}
/>
```

**Impact:** Without `currentUserId` prop, buttons don't render at all (line 226 in point-card-with-links.tsx guards visibility).

### 2. No Persistence Wiring

**File:** `src/app/components/social/point-card-with-links.tsx:163-168`

```tsx
const handlePositionClick = (position: Position) => {
  const newPosition = userPosition === position ? null : position;
  setUserPosition(newPosition);  // Only local state
  onPositionSelect?.(newPosition);  // Callback never provided
};
```

The component calls `onPositionSelect?.(newPosition)` but:
- Callback is optional (`?`)
- Profile page never provides this callback
- No calls to `pointsService.setPosition()` anywhere

### 3. No Refetch After Mutation

Even if persistence worked, there's no cache invalidation or refetch to show updated counts.

---

## Correct Pattern (Point Detail Page)

**File:** `src/app/pages/point-detail-page.tsx:119-151`

```tsx
const handlePositionClick = async (position: PositionType) => {
  if (!user || !id) return;

  const newPosition = userPosition === position ? null : position;

  // ✅ Optimistic update
  setUserPosition(newPosition);

  try {
    // ✅ Persist to database
    if (newPosition === null) {
      await pointsService.removePosition(id, user.id);
    } else {
      await pointsService.setPosition(id, user.id, newPosition);
    }

    // ✅ Refetch to get updated counts
    const updatedPoint = await pointsService.getPointWithUserPosition(id, user.id);
    if (updatedPoint) {
      setPoint(updatedPoint);
    }
  } catch (err) {
    console.error('Failed to update position:', err);
    setUserPosition(userPosition);  // Revert on error
  }
};
```

**This is the pattern to replicate on profile page.**

---

## Resolution

### Fix 1: Pass Required Props to PointCardWithLinks

**File:** `src/app/pages/profile-page-v2.tsx:684`

```tsx
<PointCardWithLinks
  point={point}
  linkedStories={point.linkedStories || []}
  profileOwner={{...}}
  currentUserId={currentUser?.id}  // ✅ ADD THIS
  onPositionSelect={(pos) => handleProfilePointPosition(point.id, pos)}  // ✅ ADD THIS
  getPointPositionCounts={...}
  getStoryAuthor={...}
/>
```

### Fix 2: Add Persistence Handler to Profile Page

**File:** `src/app/pages/profile-page-v2.tsx` (add new function)

```tsx
const handleProfilePointPosition = async (pointId: string, position: Position | null) => {
  if (!currentUser?.id || !profile?.id) return;

  try {
    // Persist to database
    let result;
    if (position === null) {
      result = await pointsService.removePosition(pointId, currentUser.id);
    } else {
      result = await pointsService.setPosition(pointId, currentUser.id, position);
    }

    if (!result) {
      toast.error('Failed to save position');
      return;
    }

    // Refetch points to update counts and user positions
    const updatedPoints = await pointsService.getPointsForProfileDisplay(
      profile.id,
      currentUser.id
    );
    setRealPoints(updatedPoints);

  } catch (err) {
    console.error('Position update error:', err);
    toast.error('Failed to save position');
  }
};
```

### Fix 3: Same for QuotedPointCard Component

**File:** `src/app/pages/profile-page-v2.tsx:926-996` (QuotedPointCard)

Apply same fixes:
- Pass `currentUserId` prop
- Add `onPositionSelect` callback
- Wire to persistence handler

---

## Acceptance Criteria

### Functional Requirements

- [ ] Position buttons visible on profile page (for authenticated users)
- [ ] Clicking position button saves to database
- [ ] Position persists after page refresh
- [ ] Position counts update immediately after click
- [ ] User's position badge appears after save
- [ ] Clicking same position again removes it (toggle behavior)
- [ ] Error handling: Shows toast on failure, reverts optimistic update
- [ ] Works for both regular points and quoted points on profile

### Technical Requirements

- [ ] `currentUserId` prop passed to PointCardWithLinks on profile page
- [ ] `onPositionSelect` callback provided and wired to persistence handler
- [ ] Handler calls `pointsService.setPosition()` or `removePosition()`
- [ ] Handler refetches points after mutation succeeds
- [ ] No console errors during position click
- [ ] Logging shows mutation calls (for debugging)

---

## Testing

### Manual Verification

1. **Setup:**
   - Login as User A
   - Navigate to User A's profile (`/p/user-a`)
   - Click "Points" tab

2. **Test Case 1: Position Button Visibility**
   - **Verify:** Position buttons (Agree/Disagree/Unsure) are visible
   - **Expected:** Buttons render for authenticated user

3. **Test Case 2: Position Persistence**
   - Click "Agree" on a point
   - **Expected:** Button highlights, badge appears
   - Refresh page
   - **Expected:** "Agree" button still highlighted, badge still visible

4. **Test Case 3: Position Counts Update**
   - Click "Disagree" on a different point
   - **Expected:** Disagree count increments by 1
   - Refresh page
   - **Expected:** Count still shows +1

5. **Test Case 4: Toggle Off**
   - Click "Agree" button again (on point already agreed)
   - **Expected:** Position removed, badge disappears, count decrements
   - Refresh page
   - **Expected:** Still removed

6. **Test Case 5: Error Handling**
   - (Simulate network error if possible)
   - **Expected:** Toast error message, position reverts

### E2E Test Coverage

Create test file: `e2e/p154-position-persistence-profile.spec.ts`

**Test scenarios:**
- [ ] Position buttons visible for authenticated users
- [ ] Click position saves and persists after refresh
- [ ] Toggle position (click same button twice) removes it
- [ ] Position counts update correctly
- [ ] Multiple positions on different points work
- [ ] Unauthenticated users see counts but can't position

### Regression Tests

- [ ] Point detail page still works (`/point/:id`)
- [ ] Story detail page still works (if using PointCardWithLinks)
- [ ] Profile page loads correctly (no crashes)

---

## Verification

### After Fix Applied

1. All E2E tests pass
2. Manual test scenarios pass
3. No regression in existing position functionality
4. Console shows successful `setPosition` calls
5. Database contains saved positions (check `point_positions` table)

### Database Validation

```sql
-- Check position was saved
SELECT * FROM point_positions
WHERE user_id = '{user-id}'
AND point_id = '{point-id}';

-- Check position counts updated
SELECT position, COUNT(*)
FROM point_positions
WHERE point_id = '{point-id}'
GROUP BY position;
```

---

## Technical Notes

### Why P151 Didn't Fix This

P151 scope was **"efficient position loading"** (batch queries, no N+1). It fixed:
- ✅ `getPointsForProfileDisplay()` - loads positions efficiently
- ✅ `usePointsForProfile()` hook - auto-refetch on user changes

P151 did NOT address:
- ❌ Position mutation (saving clicks)
- ❌ Refetch after mutations
- ❌ UI component wiring for persistence

This is a **scope gap**, not a bug in P151. P151 fixed reading, this bug is about writing.

### Architecture

```
User clicks button
  ↓
handleProfilePointPosition (NEW - this bug fix)
  ↓
pointsService.setPosition() (EXISTS - already works)
  ↓
Database updated
  ↓
getPointsForProfileDisplay() refetch (EXISTS from P151)
  ↓
UI updates with new counts
```

Only missing piece: the handler function + wiring.

---

## Related

- **P151:** Position loading architecture (batch methods) - DONE
- **P145:** Different bug (Add Point button, rejected)
- **Point Detail Page:** Working example of correct persistence pattern
