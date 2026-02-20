---
status: all-done
type: story
rank: 400
workstream: C1
created_date: 2026-02-20T00:00:00.000Z
tags: []
locked_at: '2026-02-20T12:09:29.889Z'
---

# P401: Position-Story Integrity

## Problem

Positions and story-point links are not enforced as a unit. A user can have a story linked to a point without holding a position on it (and vice versa after removal). This breaks the semantic model: a story-point link means "this story explains my position on this point" — no position = no valid link. Additionally, the Points tab on profile shows points the user *created*, not points they have *positions on*, which is the wrong filter.

## Solution

Three coordinated changes:

**1. DB layer (cascade + history)**
- Migration: add `story_point_history` table (mirrors `story_points` with `linked_at` / `unlinked_at`, `unlink_reason`)
- Migration: add DB trigger — when a row is deleted from `point_positions`, automatically delete matching `story_points` rows where `story.author_id = user_id`, and insert into `story_point_history` with `unlink_reason = 'position_removed'`
- This makes the cascade surface-agnostic: works from /live, profile, point detail, or any future surface

**2. Position removal — warning dialog (all surfaces)**
- Before calling `removePosition()`, check if user has stories linked to this point (`checkLinkedStories(pointId, userId)`)
- If count > 0: show dialog — *"Removing your position will also unlink [N] story/stories from this point. This is recorded in history."*
- User confirms → `removePosition()` fires → DB trigger handles the rest
- Reusable component/hook, not duplicated per surface

**3. Story creation — point-linking step**
- Add point-linking UI to create-story flow (and story detail edit)
- User searches/selects a point to link
- Position selector shown inline — user must select a position before link is saved
- If user already has a position on that point, pre-fill it
- On save: write `story_points` + upsert `point_positions` atomically

**4. Profile Points tab — fix query**
- Change `getPointsForProfileDisplay` to use `getPointsWithUserPositions` (position-based) instead of `getPointsByValidator` (creation-based)
- Points tab = all points where user currently has a position, sorted by most recent

## Technical Notes

- DB trigger is the single enforcement point for cascade — no app-level duplication
- `story_point_history` schema: `(id, story_id, point_id, user_id, linked_at, unlinked_at, unlink_reason)`
- `checkLinkedStories(pointId, userId)` → query `story_points` JOIN `stories` WHERE `stories.author_id = userId AND story_points.point_id = pointId`
- Warning dialog is a shared component — consumed by profile, /live position buttons, point detail
- Position change (not removal) does NOT remove story-point links — only DELETE from `point_positions` triggers cascade
- `getPointsWithUserPositions` has N+1 issue — needs batch rewrite before use on profile

## Acceptance Criteria

- [ ] Removing a position with linked stories shows warning dialog listing count of affected stories
- [ ] After confirmation, position is removed AND story-point links are removed in DB
- [ ] Story-point link removal is recorded in `story_point_history`
- [ ] Position removal from /live, profile, and point detail all behave identically (same cascade)
- [ ] Story creation flow allows linking points; position is required to complete link
- [ ] Points tab on profile shows points user has positions on (not points they created)
- [ ] Position change (not removal) does not affect story-point links
- [ ] No orphaned `story_points` rows exist (story linked to point with no position from that author)

## Testing

- Unit: `checkLinkedStories` returns correct count
- Unit: `removePosition` cascade verified via DB trigger test
- E2E: take position → link story → remove position → confirm story-point link gone, history entry exists
- E2E: warning dialog appears, cancel keeps everything intact
- E2E: profile Points tab shows positioned-on points, not created-by points

---

## Architecture

I'm using the architect skill to design the technical architecture.

---

### Technical Analysis

**Current Code State:**

- `story_points` table: `(story_id, point_id, created_at)` with composite PK. RLS: public read, story author can link/unlink.
- `point_positions` table: `(id, point_id, user_id, position, reasoning, created_at, updated_at)` with `UNIQUE(point_id, user_id)`. RLS: public read, verified users set/update/delete own row.
- `point_position_history` table already exists (log of position changes, NULL position = removed). Trigger `trg_position_history` fires on INSERT/UPDATE/DELETE of `point_positions`.
- `story_point_history` table: does NOT exist. Must be created.
- `removePosition` exists in `points-service-real.ts` (`realPointsService.removePosition`) and is called in three places:
  - `src/app/pages/point-detail-page.tsx:139` — toggle handler
  - `src/app/pages/profile-page-v2.tsx:377` — `handleProfilePointPosition`
  - Story-detail position handler in `story-detail-page.tsx` does NOT call `removePosition` — it only calls `setPosition` (toggle via same-position check is handled by the caller, not the service)
- `getPointsForProfileDisplay` in `points-service-real.ts` calls `getPointsByValidator` (creation-based). Must be swapped to position-based query.
- `getPointsWithUserPositions` exists but has N+1 issue (calls `getPointWithUserPosition` per point, which calls `getPointWithCounts` per point, which calls `getPositionCounts` per point = 3 queries per point).
- No `checkLinkedStories` method exists anywhere yet.
- Warning dialog: none exists for position removal. `src/components/ui/dialog.tsx` is available (Radix UI `@radix-ui/react-dialog` already in package.json).
- Create story page (`create-story-page.tsx`): no point-linking step — form is content + visibility only.
- `storiesService.linkPointToStory(storyId, pointId)` exists in `stories-service-real.ts` and calls `supabase.from('story_points').insert(...)`.
- `storiesService.createStory` signature: `(authorId, content, tags, visibility)`.

**Surfaces that call `removePosition` and need the warning dialog:**
1. `src/app/pages/point-detail-page.tsx` — `handlePositionClick` (toggle same position → null → `removePosition`)
2. `src/app/pages/profile-page-v2.tsx` — `handleProfilePointPosition` (position === null → `removePosition`)

**Live page (`clarity-live-page.tsx`):** positions go into `live_state.livePositions`, NOT `point_positions` directly. `removePosition` is NOT called from live page. The cascade trigger fires only on `point_positions` DELETE, so live positions are out of scope here — correct behavior.

---

### Architecture Decisions

**Decision 1: DB trigger for cascade (not app-level)**
- Chosen: PostgreSQL trigger on `DELETE FROM point_positions` cascades to `story_points` and inserts into `story_point_history`.
- Rationale: Cascade is surface-agnostic. Any deletion of a position row (from any surface, any future code) triggers the cleanup. No app code duplication.
- Trade-off: Trigger is SECURITY DEFINER (same pattern as existing triggers in this codebase — `create_initial_story_version`, `log_position_change`, etc.) because `story_points` RLS requires the story author, and the trigger runs as the deleting user, not the story author. Using SECURITY DEFINER bypasses RLS safely here since the trigger logic is authoritative.
- Alternative rejected: App-level cascade in `removePosition` service method — would need to be replicated on every surface, and would miss future surfaces.

**Decision 2: `story_point_history` as a new table (not re-using `point_position_history`)**
- Chosen: Separate `story_point_history` table per spec.
- Rationale: Different semantic — records story-point link lifecycle, not position changes. Different foreign keys (story_id + point_id + user_id). Mixing into `point_position_history` would bloat it and break the single-responsibility pattern.
- Alternative rejected: Adding a `story_id` nullable column to `point_position_history` — muddies the semantics.

**Decision 3: `useRemovePositionGuard` hook (not duplicating dialog per page)**
- Chosen: A single hook `useRemovePositionGuard` encapsulates `checkLinkedStories` check + dialog state + `removePosition` call. Pages import the hook, not the dialog directly.
- Rationale: Three surfaces need this behavior. A hook keeps each page's handler to 2-3 lines. The dialog component is consumed only by the hook.
- Trade-off: One extra abstraction layer. Worth it given three existing call sites and likely more in future.
- Alternative rejected: Shared render-prop component — more JSX ceremony for the same result.

**Decision 4: Fix `getPointsForProfileDisplay` in-place (swap data source)**
- Chosen: Replace `getPointsByValidator(validatorId)` call inside `getPointsForProfileDisplay` with a position-based query that fetches points where the user has a position.
- Rationale: `getPointsForProfileDisplay` is already the correct abstraction used by `profile-page-v2.tsx`. Changing its data source is a targeted fix with no call-site changes needed.
- Trade-off: Existing callers who expected "points created by user" will get "points user has positions on" — but the only existing caller is the profile page, which wants the new behavior.
- Alternative rejected: New method `getPointsUserHasPositionsOn` — would require updating the call site in `profile-page-v2.tsx` and the interface. Less surgical.

**Decision 5: Batch rewrite of `getPointsWithUserPositions` (fix N+1 before using on profile)**
- Chosen: Rewrite `getPointsWithUserPositions` to use batch queries (same pattern as `getPointsForProfileDisplay` already does internally). This is required before the profile fix can use it.
- Rationale: The spec's Technical Notes explicitly flag this: "N+1 issue — needs batch rewrite before use on profile."
- Implementation: After fetching user's `point_positions`, fetch all points in batch (single query with `.in('id', pointIds)`), then batch-fetch counts and positions using already-existing `getPositionCountsForPoints` + `getMyPositionsForPoints`.

**Decision 6: Point-linking in create-story as an optional post-save step**
- Chosen: After story is saved, redirect to story detail page where the point-linking UI lives (rather than adding a step to the create-story form).
- Rationale: The create-story form is intentionally minimal. Point-linking requires the story to exist first (to get a `story_id` for `story_points`). The story detail page is the natural owner of point management.
- Trade-off: User has to navigate to story detail to link points. Acceptable for MVP — can be improved later with inline creation.
- Alternative rejected: Multi-step create form — more state, more complexity, requires the story to be partially saved or the form to hold pending links. Out of scope for P401.

---

### Security Review

**RLS Policies:**

- `story_point_history` (new table): follows same pattern as `point_position_history`. Policy: public SELECT, no direct INSERT (trigger handles it using SECURITY DEFINER). No UPDATE or DELETE needed.
- DB trigger function `cascade_story_points_on_position_delete`: must be `SECURITY DEFINER` and `SET search_path = public`. Without SECURITY DEFINER, trigger runs as deleting user, who may not be the story author — failing the `story_points` DELETE RLS policy (`EXISTS (SELECT 1 FROM stories WHERE id = story_id AND author_id = auth.uid())`). With SECURITY DEFINER the trigger bypasses RLS, which is safe because the trigger logic is authoritative (it deletes story_points only for the specific user whose position was deleted, matching `stories.author_id = OLD.user_id`).
- `checkLinkedStories(pointId, userId)`: reads `story_points` JOIN `stories`. Both tables have public SELECT RLS — no privilege escalation. Safe as a plain service method.
- Story creation point-linking: `linkPointToStory` already requires story author (RLS: `auth.uid() = stories.author_id`). Position upsert requires `auth.uid() = user_id`. These RLS policies are already correct.
- Profile Points tab query change: only reads `point_positions` (public SELECT) — no new security surface.

**Authentication:**

- Warning dialog flow: `checkLinkedStories` is called only when a logged-in user triggers position removal. Auth is already checked at the page level before reaching `removePosition`.
- Position upsert during story creation point-link: handled by existing verified-user check on `setPosition`.

**Input Validation:**

- `checkLinkedStories(pointId, userId)`: both are UUIDs sourced from auth context or URL params — no user-typed input.
- Point search in story detail link UI: queries existing `points` table via Supabase client — parameterized, no injection risk.
- `story_point_history` inserts are trigger-only — no user-supplied data reaches the table directly.

**Data Protection:**

- `story_point_history` contains no PII beyond UUIDs. `unlink_reason` is a controlled enum string set by the trigger. Safe for public SELECT (consistent with all other history tables in this schema).

---

### Implementation Approach

**Files to Create:**

1. `supabase/migrations/20260220HHMMSS_p401_story_point_history_cascade.sql`
   - Create `story_point_history` table
   - Create trigger function `cascade_story_points_on_position_delete`
   - Attach trigger to `point_positions`
   - Enable RLS on `story_point_history` with public SELECT policy

2. `src/app/components/shared/remove-position-dialog.tsx`
   - `RemovePositionDialog` component (uses `src/components/ui/dialog.tsx`)
   - `useRemovePositionGuard` hook (exported alongside the component)

**Files to Modify:**

3. `src/app/data/points-service.interface.ts`
   - Add `checkLinkedStories(pointId: string, userId: string): Promise<number>` to `PointsService` interface

4. `src/app/data/points-service-real.ts`
   - Add `checkLinkedStories` method
   - Rewrite `getPointsWithUserPositions` (batch queries, fix N+1)
   - Rewrite `getPointsForProfileDisplay` inner query (swap creation-based to position-based)

5. `src/app/data/points-service-mock.ts`
   - Add stub `checkLinkedStories` returning `0` (preserves mock compatibility)

6. `src/app/pages/point-detail-page.tsx`
   - Replace direct `removePosition` call in `handlePositionClick` with `useRemovePositionGuard` hook
   - Render `<RemovePositionDialog>` in JSX

7. `src/app/pages/profile-page-v2.tsx`
   - Replace direct `removePosition` call in `handleProfilePointPosition` with `useRemovePositionGuard` hook
   - Render `<RemovePositionDialog>` in JSX

8. `src/app/pages/story-detail-page.tsx`
   - Add point-linking UI section (search/select point, inline position selector, save link button)
   - Wire to `storiesService.linkPointToStory` + `pointsService.setPosition` (atomic from user perspective, two sequential DB calls)

---

### Exact SQL — Migration

**File:** `supabase/migrations/20260220120000_p401_story_point_history_cascade.sql`

```sql
-- Migration: P401 — story_point_history table + cascade trigger
-- When a user's position is deleted, automatically unlink their stories from that point
-- and record the unlink in story_point_history.

-- ============================================================================
-- story_point_history table
-- ============================================================================

CREATE TABLE story_point_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id    UUID        NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  point_id    UUID        NOT NULL REFERENCES points(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  linked_at   TIMESTAMPTZ NOT NULL,  -- copied from story_points.created_at at unlink time
  unlinked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unlink_reason TEXT      NOT NULL DEFAULT 'position_removed'
);

CREATE INDEX idx_story_point_history_story   ON story_point_history(story_id);
CREATE INDEX idx_story_point_history_point   ON story_point_history(point_id);
CREATE INDEX idx_story_point_history_user    ON story_point_history(user_id);
CREATE INDEX idx_story_point_history_unlinked ON story_point_history(unlinked_at DESC);

ALTER TABLE story_point_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Story point history is publicly readable"
  ON story_point_history FOR SELECT USING (true);

-- ============================================================================
-- Cascade trigger function
-- ============================================================================

-- SECURITY DEFINER: needed because this trigger deletes from story_points using
-- RLS that requires auth.uid() = stories.author_id. Since the trigger runs on
-- behalf of the user deleting their position (not the story author), we bypass
-- RLS here. The WHERE clause is authoritative: only stories authored by the
-- position-holder are affected.
CREATE OR REPLACE FUNCTION cascade_story_points_on_position_delete()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_row RECORD;
BEGIN
  -- Only fires on DELETE of point_positions
  -- For each story_points row where the story's author is the user who held the position
  FOR affected_row IN
    SELECT sp.story_id, sp.point_id, sp.created_at AS linked_at
    FROM story_points sp
    JOIN stories s ON s.id = sp.story_id
    WHERE sp.point_id = OLD.point_id
      AND s.author_id = OLD.user_id
  LOOP
    -- Record the unlink in history
    INSERT INTO story_point_history (story_id, point_id, user_id, linked_at, unlinked_at, unlink_reason)
    VALUES (affected_row.story_id, OLD.point_id, OLD.user_id, affected_row.linked_at, now(), 'position_removed');

    -- Delete the story_point link
    DELETE FROM story_points
    WHERE story_id = affected_row.story_id
      AND point_id = OLD.point_id;
  END LOOP;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cascade_story_points_on_position_delete
AFTER DELETE ON point_positions
FOR EACH ROW EXECUTE FUNCTION cascade_story_points_on_position_delete();
```

---

### Exact Function Signatures — Service Layer

**`src/app/data/points-service.interface.ts` — additions:**

```typescript
/**
 * P401: Count stories authored by userId that are linked to pointId.
 * Used before removePosition to decide whether to show warning dialog.
 * Returns count (0 = no warning needed).
 */
checkLinkedStories(pointId: string, userId: string): Promise<number>;
```

**`src/app/data/points-service-real.ts` — new method:**

```typescript
async checkLinkedStories(pointId: string, userId: string): Promise<number> {
  log(' checkLinkedStories:', { pointId, userId });

  const { count, error } = await supabase
    .from('story_points')
    .select('story_id', { count: 'exact', head: true })
    .eq('point_id', pointId)
    .filter('story_id', 'in', `(${
      // Subquery: stories authored by userId
      // Supabase JS client doesn't support subqueries — use RPC or two-query approach
    })`);

  // Two-query approach (Supabase JS client limitation — no subqueries):
  // 1. Get story IDs authored by userId
  const { data: storyIds } = await supabase
    .from('stories')
    .select('id')
    .eq('author_id', userId);

  if (!storyIds || storyIds.length === 0) return 0;

  const ids = storyIds.map(s => s.id);

  // 2. Count story_points matching pointId + those story IDs
  const { count: linkedCount, error: countError } = await supabase
    .from('story_points')
    .select('story_id', { count: 'exact', head: true })
    .eq('point_id', pointId)
    .in('story_id', ids);

  if (countError) {
    log('ERROR: checkLinkedStories error:', countError);
    return 0;
  }

  return linkedCount ?? 0;
},
```

**`src/app/data/points-service-real.ts` — `getPointsWithUserPositions` rewrite:**

```typescript
async getPointsWithUserPositions(userId: string): Promise<PointWithUserPosition[]> {
  log(' getPointsWithUserPositions (batch):', userId);

  // 1. Get all position rows for this user
  const { data: positions, error: posError } = await supabase
    .from('point_positions')
    .select('point_id')
    .eq('user_id', userId);

  if (posError || !positions || positions.length === 0) return [];

  const pointIds = positions.map(p => p.point_id);

  // 2. Batch fetch points with creator joins
  const { data: rawPoints, error: pointsError } = await supabase
    .from('points')
    .select(`
      *,
      creator:profiles!points_first_validator_id_fkey (
        id, name, slug, avatar_color, avatar_url
      )
    `)
    .in('id', pointIds);

  if (pointsError || !rawPoints) {
    log('ERROR: getPointsWithUserPositions points fetch error:', pointsError);
    return [];
  }

  const points = (rawPoints as DbPointWithCreator[]).map(mapPointFromDb);

  // 3. Batch fetch counts + user positions (2 queries for N points)
  const [countsMap, userPositionsMap] = await Promise.all([
    this.getPositionCountsForPoints(pointIds),
    this.getMyPositionsForPoints(pointIds, userId),
  ]);

  return points.map(point => {
    const positionCounts = countsMap.get(point.id) || emptyPositionCounts();
    const totalPositions = Object.values(positionCounts).reduce((sum, c) => sum + c, 0);
    return {
      ...point,
      positionCounts,
      totalPositions,
      userPosition: userPositionsMap.get(point.id),
    };
  });
},
```

**`src/app/data/points-service-real.ts` — `getPointsForProfileDisplay` fix (swap data source):**

Replace the first call inside `getPointsForProfileDisplay` from:
```typescript
const points = await this.getPointsByValidator(validatorId);
```
to:
```typescript
const points = await this.getPointsWithUserPositions(validatorId);
```

This swap means the method returns points where `validatorId` has a position (not points they created). The rest of the method body (batch counts, viewer positions) continues to work unchanged because `getPointsWithUserPositions` now returns `PointWithUserPosition[]` which already includes the subject's position in `userPosition`. The existing overlap (counting subject positions twice) should be evaluated — simplest fix is to let `getPointsForProfileDisplay` keep its current batch structure and just change the initial data source.

Concretely, the rewritten `getPointsForProfileDisplay` for the profile Points tab:

```typescript
async getPointsForProfileDisplay(
  subjectUserId: string,
  viewerUserId?: string
): Promise<PointWithUserPosition[]> {
  log('⚡ getPointsForProfileDisplay (position-based):', { subjectUserId, viewerUserId });

  // P401: Changed from getPointsByValidator (created-by) to position-based query
  // Points tab = points where subject has a current position
  const { data: positionRows, error: posErr } = await supabase
    .from('point_positions')
    .select('point_id')
    .eq('user_id', subjectUserId)
    .order('updated_at', { ascending: false });

  if (posErr || !positionRows || positionRows.length === 0) return [];

  const pointIds = positionRows.map(p => p.point_id);

  // Batch fetch points
  const { data: rawPoints, error: pointsError } = await supabase
    .from('points')
    .select(`
      *,
      creator:profiles!points_first_validator_id_fkey (
        id, name, slug, avatar_color, avatar_url
      )
    `)
    .in('id', pointIds);

  if (pointsError || !rawPoints) return [];
  const points = (rawPoints as DbPointWithCreator[]).map(mapPointFromDb);

  const viewerIsSubject = viewerUserId === subjectUserId;

  const [countsMap, viewerPositionsMap, subjectPositionsMap] = await Promise.all([
    this.getPositionCountsForPoints(pointIds),
    !viewerIsSubject && viewerUserId
      ? this.getMyPositionsForPoints(pointIds, viewerUserId)
      : Promise.resolve(new Map<string, PointPosition>()),
    this.getMyPositionsForPoints(pointIds, subjectUserId),
  ]);

  return points.map(point => {
    const positionCounts = countsMap.get(point.id) || emptyPositionCounts();
    const totalPositions = Object.values(positionCounts).reduce((sum, c) => sum + c, 0);
    const profileSubjectPosition = subjectPositionsMap.get(point.id);
    const userPosition = viewerIsSubject ? profileSubjectPosition : viewerPositionsMap.get(point.id);

    return {
      ...point,
      positionCounts,
      totalPositions,
      userPosition,
      profileSubjectPosition,
    };
  });
},
```

---

### Warning Dialog Component

**File:** `src/app/components/shared/remove-position-dialog.tsx`

```typescript
/**
 * @file remove-position-dialog.tsx
 * @description P401: Warning dialog shown before removing a position that has linked stories.
 * Consumed by: point-detail-page, profile-page-v2.
 * Hook: useRemovePositionGuard — wraps checkLinkedStories + dialog state + removePosition.
 */
import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { pointsService } from '@/app/data/points-service';

// ============================================================================
// Props
// ============================================================================

export interface RemovePositionDialogProps {
  open: boolean;
  linkedStoryCount: number;        // number to show in warning message
  onConfirm: () => void;           // called when user confirms removal
  onCancel: () => void;            // called when user cancels
  isRemoving?: boolean;            // shows loading state on confirm button
}

// ============================================================================
// Dialog component
// ============================================================================

export function RemovePositionDialog({
  open,
  linkedStoryCount,
  onConfirm,
  onCancel,
  isRemoving = false,
}: RemovePositionDialogProps) {
  const storyWord = linkedStoryCount === 1 ? 'story' : 'stories';

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent hideCloseButton>
        <DialogHeader>
          <DialogTitle>Remove position?</DialogTitle>
          <DialogDescription>
            Removing your position will also unlink{' '}
            <strong>{linkedStoryCount} {storyWord}</strong> from this point.
            This action is recorded in history.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isRemoving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isRemoving}>
            {isRemoving ? 'Removing...' : 'Remove position'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Hook: useRemovePositionGuard
// ============================================================================

interface UseRemovePositionGuardOptions {
  userId: string;
  onAfterRemove?: (pointId: string) => void;  // called after successful removal
}

interface UseRemovePositionGuardReturn {
  dialogProps: RemovePositionDialogProps;
  guardedRemovePosition: (pointId: string) => Promise<void>;
}

/**
 * Wraps removePosition with a linked-stories check and confirmation dialog.
 *
 * Usage:
 *   const { dialogProps, guardedRemovePosition } = useRemovePositionGuard({ userId, onAfterRemove });
 *   // In JSX: <RemovePositionDialog {...dialogProps} />
 *   // In handler: await guardedRemovePosition(pointId);
 */
export function useRemovePositionGuard({
  userId,
  onAfterRemove,
}: UseRemovePositionGuardOptions): UseRemovePositionGuardReturn {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [linkedCount, setLinkedCount] = useState(0);
  const [pendingPointId, setPendingPointId] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const guardedRemovePosition = useCallback(async (pointId: string) => {
    const count = await pointsService.checkLinkedStories(pointId, userId);

    if (count > 0) {
      // Show dialog — user must confirm
      setLinkedCount(count);
      setPendingPointId(pointId);
      setDialogOpen(true);
    } else {
      // No linked stories — remove directly
      await pointsService.removePosition(pointId, userId);
      onAfterRemove?.(pointId);
    }
  }, [userId, onAfterRemove]);

  const handleConfirm = useCallback(async () => {
    if (!pendingPointId) return;
    setIsRemoving(true);
    await pointsService.removePosition(pendingPointId, userId);
    setIsRemoving(false);
    setDialogOpen(false);
    setPendingPointId(null);
    onAfterRemove?.(pendingPointId);
  }, [pendingPointId, userId, onAfterRemove]);

  const handleCancel = useCallback(() => {
    setDialogOpen(false);
    setPendingPointId(null);
  }, []);

  return {
    dialogProps: {
      open: dialogOpen,
      linkedStoryCount: linkedCount,
      onConfirm: handleConfirm,
      onCancel: handleCancel,
      isRemoving,
    },
    guardedRemovePosition,
  };
}
```

**Surfaces that consume `useRemovePositionGuard`:**
- `src/app/pages/point-detail-page.tsx`: replace `await pointsService.removePosition(id, user.id)` in `handlePositionClick` with `await guardedRemovePosition(id)`.
- `src/app/pages/profile-page-v2.tsx`: replace `await pointsService.removePosition(pointId, currentUser.id)` in `handleProfilePointPosition` with `await guardedRemovePosition(pointId)`.

---

### Story Creation Point-Linking UI

Per Decision 6, point-linking lives in the story detail page, not the create-story form. The create-story form (`create-story-page.tsx`) requires no changes for P401.

**File to modify:** `src/app/pages/story-detail-page.tsx`

Add a "Linked Points" section visible only to the story author, below the story content. This section contains:

1. A search input querying `supabase.from('points').select(...)` with `.ilike('statement', '%query%')`.
2. Results list — clicking a point opens an inline position selector.
3. Position selector (reuse `PositionButtons` from `src/app/prototypes/linkedin-like/components/shared.tsx` or a minimal inline version).
4. "Link point" button — active only when a position is selected. Calls `storiesService.linkPointToStory(storyId, pointId)` then `pointsService.setPosition(pointId, user.id, selectedPosition)` sequentially.
5. Currently linked points list with "Unlink" action calling `storiesService.unlinkPointFromStory(storyId, pointId)`.

**Component structure within story-detail-page.tsx:**

```typescript
// No new file needed — inline component within story-detail-page.tsx
function LinkedPointsEditor({ storyId, authorId, currentUserId, existingPoints }: {
  storyId: string;
  authorId: string;
  currentUserId: string;
  existingPoints: PointSummary[];
}) { ... }
```

Rendered in the JSX only when `user?.id === story?.authorId`.

**Data flow:**
- Search: `useState(searchQuery)` → `useEffect` debounces and fetches matching points.
- Position selection: `useState<PositionType | null>(selectedPosition)`.
- After link save: calls parent `onPointsChange` callback to refresh `story.points`.
- Existing user position: `pointsService.getMyPosition(pointId, currentUserId)` — pre-fills if user already has a position on that point.

---

### Implementation Order

The following sequence respects hard dependencies (DB before app, interface before implementation, shared components before consumers):

**Step 1 — DB migration** (no app code depends on this yet, but must exist before service layer uses the new table)
- Create and run `supabase/migrations/20260220120000_p401_story_point_history_cascade.sql`
- Verify: check `story_point_history` table exists in Supabase dashboard; check trigger fires on test position delete.

**Step 2 — Service interface + implementation**
- Add `checkLinkedStories` to `src/app/data/points-service.interface.ts`
- Implement `checkLinkedStories` in `src/app/data/points-service-real.ts`
- Add stub in `src/app/data/points-service-mock.ts` (returns `0`)
- Rewrite `getPointsWithUserPositions` in `points-service-real.ts` (batch queries)
- Rewrite `getPointsForProfileDisplay` in `points-service-real.ts` (position-based)

**Step 3 — Warning dialog component + hook**
- Create `src/app/components/shared/remove-position-dialog.tsx` (component + hook)
- Unit test: `checkLinkedStories` returns correct count (mock Supabase)

**Step 4 — Wire warning dialog into existing surfaces**
- Update `src/app/pages/point-detail-page.tsx`: use `useRemovePositionGuard`
- Update `src/app/pages/profile-page-v2.tsx`: use `useRemovePositionGuard`

**Step 5 — Profile Points tab query fix**
- Verify `getPointsForProfileDisplay` now returns position-based points (Step 2 already done)
- Smoke test: profile Points tab shows positioned-on points, not created-by points

**Step 6 — Story detail point-linking UI**
- Add `LinkedPointsEditor` component inside `src/app/pages/story-detail-page.tsx`
- Wire `storiesService.linkPointToStory` + `pointsService.setPosition`
- Wire `storiesService.unlinkPointFromStory`

**Step 7 — E2E tests** (per spec Testing section)
- Take position → link story → remove position → confirm cascade + history entry
- Warning dialog cancel path (everything stays intact)
- Profile Points tab shows positioned-on points

