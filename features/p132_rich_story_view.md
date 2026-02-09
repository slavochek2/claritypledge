---
status: backlog
type: task
priority: p1
milestone: M1
tags: [stories, points, position-recording, ui]
prepped_date: '2026-02-09'
reviews:
  ux: passed-with-notes
  architect: passed-with-notes
  alignment: passed
---

# P132: Rich Story View with Backend Integration

## Context

Yesterday's P126 commit simplified the story detail page to focus on basic story display. However, the prototype version showed a much richer experience:

**Current (Simple) View:**
- Basic story display (title, content, author)
- Flat list of key points (no interaction)
- No position recording
- No visual hierarchy

**Prototype (Rich) View:**
- Blue left border, author avatar with credibility badge
- Linked points displayed with thread lines (hierarchical)
- Position recording buttons (Disagree/Unsure/Agree)
- Position badges showing author's stance
- Interactive engagement

The `StoryCardDetail` component exists at `src/app/components/social/StoryCardDetail.tsx` but uses prototype types (Story with `text`, Point with `text`), while our backend uses different types (Story with `content`, Point with `statement`).

**User Evidence:** Screenshots from this morning show the rich view working beautifully. Users expect this level of interactivity when viewing stories.

## Goal

Restore the rich story view by migrating `StoryCardDetail` to use backend types directly, enabling full position recording functionality with real data.

## Success Criteria

- [ ] StoryCardDetail renders on `/story/:id` with backend types
- [ ] Linked points display with thread lines (visual hierarchy)
- [ ] Position recording buttons work (save to backend, persist on reload)
- [ ] Author credibility (ear count) displays correctly
- [ ] Position badges show for all users (including author on their own points)
- [ ] Position counts visible immediately
- [ ] Optimistic UI updates with race condition handling
- [ ] Loading and error states defined
- [ ] Unauthenticated users see modal prompting sign-in
- [ ] All existing functionality preserved (no regressions)

## Technical Approach

### Design Decision: Migrate to Backend Types

**Strategy:** Refactor StoryCardDetail and child components to use backend types directly. Delete prototype types.

**Why:**
- Production-ready solution with no technical debt
- Single source of truth for types
- Enables deleting `src/app/prototypes/` folder
- No transformation layer to maintain
- Backend type changes don't require adapter updates

**Trade-off:** More upfront work (18-22 hours) vs adapter pattern (13-15 hours), but eliminates ongoing maintenance burden.

### Key Backend Services

**Existing:**
- `storiesService.getStoryWithPoints(id)` - Story + author + linked points

**New (batch fetching for performance):**
- `pointsService.getPositionCountsForPoints(pointIds)` - Vote distribution for multiple points (single query)
- `pointsService.getMyPositionsForPoints(pointIds, userId)` - User's positions for multiple points (single query)
- `pointsService.setPosition(pointId, userId, position)` - Record position

**Why batch APIs:** Avoids N+1 query pattern. For story with 10 points, batch APIs = 3 queries vs 21 queries (1 story + 10*2 per-point).

## Implementation

### 0. Database Preparation

**Migration: Add indexes for position queries**

```sql
-- Composite index for user position lookup
CREATE INDEX IF NOT EXISTS idx_point_positions_point_user
  ON point_positions(point_id, user_id)
  WHERE deleted_at IS NULL;

-- Index for position count aggregation
CREATE INDEX IF NOT EXISTS idx_point_positions_point
  ON point_positions(point_id)
  WHERE deleted_at IS NULL;
```

**RLS Policy Verification:**
```sql
-- Verify these policies exist on point_positions table:
-- 1. Users can INSERT their own positions (user_id = auth.uid())
-- 2. Users can UPDATE their own positions (user_id = auth.uid())
-- 3. Users can SELECT all positions (for viewing counts)
-- 4. Users CANNOT set positions for other users
```

Run: `SELECT tablename, policyname, cmd, qual FROM pg_policies WHERE tablename = 'point_positions';`

If policies missing, create them before proceeding.

### 1. Add Batch Fetching APIs

**File:** `src/app/data/points-service.interface.ts`

```typescript
export interface PointsService {
  // ... existing methods ...

  // New batch methods
  getPositionCountsForPoints(
    pointIds: string[]
  ): Promise<Map<string, Record<PositionType, number>>>;

  getMyPositionsForPoints(
    pointIds: string[],
    userId: string
  ): Promise<Map<string, PointPosition>>;
}
```

**File:** `src/app/data/points-service-real.ts`

Implement with single `WHERE point_id IN (...)` queries.

### 2. Migrate StoryCardDetail to Backend Types

**File:** `src/app/components/social/StoryCardDetail.tsx`

**Changes:**
1. Update props interface:
   - `story: Story` (backend type, not PrototypeStory)
   - `linkedPoints: PointSummary[]` (backend type, not PrototypePoint)
   - `positionCounts: Map<string, Record<PositionType, number>>`
   - `userPositions: Map<string, PointPosition>`
   - `onPositionClick?: (pointId: string, position: PositionType) => Promise<void>`

2. Update component internals:
   - Replace `story.text` → `story.content`
   - Replace `point.text` → `point.statement`
   - Update child components (QuotedPoint, PositionButtons) to use backend types

3. Keep UI/UX unchanged (blue border, thread lines, badges)

### 3. Story Detail Page Integration

**File:** `src/app/pages/story-detail-page.tsx`

**Flow:**

```typescript
// 1. Show skeleton loading state immediately
const [loading, setLoading] = useState(true);

// 2. Fetch all data
const story = await storiesService.getStoryWithPoints(id);
const pointIds = story.linkedPoints.map(p => p.id);

// Batch fetch position data (parallel)
const [positionCounts, userPositions] = await Promise.all([
  pointsService.getPositionCountsForPoints(pointIds),
  userId ? pointsService.getMyPositionsForPoints(pointIds, userId) : null,
]);

// 3. Render StoryCardDetail with backend data
<StoryCardDetail
  story={story}
  linkedPoints={story.linkedPoints}
  positionCounts={positionCounts}
  userPositions={userPositions}
  onPositionClick={handlePositionClick}
/>
```

**Loading State:**
- Skeleton UI matching StoryCardDetail layout (avatar, blue border, gray bars for points)
- Shows while fetching story + position data

**Error Handling (Graceful Degradation):**
- Story fetch fails → 404 page
- Position data fails → Show story with positions disabled + toast: "Unable to load position data"

**Unauthenticated Flow:**
- Position buttons visible but clicking opens modal:
  - Title: "Sign in to record your position"
  - Body: "Track your understanding by recording your stance on key points."
  - Actions: [Sign In] [Cancel]
  - Sign-in redirects to `/auth/login?redirect=/story/:id` (returns post-login)

### 4. Position Recording Handler

**Race Condition Handling:**

```typescript
const handlePositionClick = async (pointId: string, position: PositionType) => {
  // Cancel any in-flight request for this point
  if (pendingRequests[pointId]) {
    pendingRequests[pointId].abort();
  }

  const controller = new AbortController();
  pendingRequests[pointId] = controller;

  // Optimistic update
  setUserPositions(prev => new Map(prev).set(pointId, position));

  try {
    await pointsService.setPosition(pointId, userId, position, {
      signal: controller.signal
    });

    // Success: track analytics
    analytics.track('position_recorded', {
      story_id: storyId,
      point_id: pointId,
      position,
      previous_position: userPositions.get(pointId)
    });
  } catch (error) {
    if (error.name === 'AbortError') return; // Cancelled, ignore

    // Failure: revert + toast
    setUserPositions(prev => {
      const updated = new Map(prev);
      updated.delete(pointId);
      return updated;
    });

    toast.error('Failed to save position. Please try again.');
  } finally {
    delete pendingRequests[pointId];
  }
};
```

**Strategy:** Last-click-wins with AbortController. If user clicks multiple positions rapidly, cancel previous request and send new one.

### 5. Backend Type Extension

**File:** `src/app/types/index.ts`

Extend `StoryWithAuthor` to include:
```typescript
authorEarsCount?: number;
```

**File:** `src/app/data/stories-service-real.ts`

Update query to join `profiles.ears_count as author_ears_count`.

### 6. Delete Prototype Types (Cleanup)

After StoryCardDetail migration complete:
- Delete `src/app/prototypes/` folder
- Remove prototype type definitions
- Verify no other components reference prototype types

## Testing

### Manual QA

**As authenticated user:**
- Visit `/story/:id` → skeleton → rich view renders
- Click position button → instant feedback → persists
- Refresh page → position persists
- Change position rapidly (3 clicks) → last one wins, no errors
- Slow network: disable button during API call

**As unauthenticated user:**
- Story displays correctly
- Position buttons → modal with sign-in CTA
- Sign in → returns to story page → position recording works

**Edge cases:**
- 0 linked points → renders correctly (story content only)
- 1 linked point → no thread lines
- 10+ linked points → batch fetching performs well
- Position data fails to load → story still displays, positions disabled

**Mobile viewport:**
- Thread lines render correctly at narrow widths
- Position buttons accessible

### Unit Tests

Test backend type integration:
- StoryCardDetail renders with backend Story type
- Position recording updates state correctly
- Race condition handling (AbortController cancels previous requests)
- Error handling reverts optimistic updates

### E2E Tests

Add to existing story tests:
- Position recording saves and persists
- Unauthenticated user sees sign-in modal

## Critical Files

1. **`supabase/migrations/YYYYMMDDHHMMSS_add_position_indexes.sql`** (NEW) - Database indexes
2. **`src/app/data/points-service.interface.ts`** (MODIFY) - Add batch APIs
3. **`src/app/data/points-service-real.ts`** (MODIFY) - Implement batch APIs
4. **`src/app/components/social/StoryCardDetail.tsx`** (MODIFY) - Migrate to backend types
5. **`src/app/pages/story-detail-page.tsx`** (MODIFY) - Integration + loading/error states
6. **`src/app/types/index.ts`** (MODIFY) - Type extension
7. **`src/app/data/stories-service-real.ts`** (MODIFY) - Query update
8. **`src/app/prototypes/`** (DELETE) - Remove after migration

## Risks & Mitigations

**Risk:** Migrating StoryCardDetail breaks carefully tuned UX
**Mitigation:** Keep UI/UX unchanged, only update data layer. Side-by-side comparison with screenshots before/after.

**Risk:** Race conditions in position recording
**Mitigation:** AbortController cancels in-flight requests, last-click-wins strategy.

**Risk:** Performance degradation with many points
**Mitigation:** Batch APIs reduce query count from O(N*2) to O(1). Indexes ensure fast lookups.

**Risk:** Missing RLS policies expose security hole
**Mitigation:** Verify policies exist before implementation. Add to pre-commit checklist.

## Estimated Effort

- Database indexes + RLS verification: 1 hour
- Batch APIs implementation: 2-3 hours
- StoryCardDetail type migration: 4-5 hours
- Page integration (loading/error/unauth): 3-4 hours
- Position recording handler (race condition logic): 2-3 hours
- Backend type extension: 30 min
- Cleanup (delete prototypes): 30 min
- Testing: 3-4 hours

**Total:** 18-22 hours (2-3 days)

## Dependencies

- P117: Stories + Points backend (DONE)
- P126: Create Story + View Story (DONE)
- P131: Manual Points Creation (DONE)

## Notes

**Terminology:**
- Use "position recording" not "position voting" (declaring epistemic stance, not popularity contest)
- Position = Disagree/Unsure/Agree (formal term from definitions.md)

**Author Positions:**
- Authors can record positions on their own points (like any other user)
- Author position badge shows their declared stance
- Currently: manual point creation → author records stance
- Future: system generates points → author confirms or chooses different stance

**Position Counts:**
- Displayed immediately (no "show after recording" complexity)
- Format: "12 Agree · 5 Disagree · 2 Unsure"
- Purpose: Calibration aid (see how others interpreted) + engagement

**Component Reusability:**
- StoryCardDetail works anywhere stories are displayed
- No separate versions for event rooms vs normal context
- All story functionality unified

## Prep Notes

From prep-spec review (2026-02-09):

**UX Review:** Passed with notes
- Added: Loading state (skeleton UI)
- Added: Error handling (graceful degradation)
- Added: Unauthenticated flow (modal with sign-in CTA)
- Added: Position count display specification

**Architect Review:** Passed with notes
- Changed: Adapter pattern → direct migration (production-ready solution)
- Added: Batch fetching APIs (performance)
- Added: Database indexes + RLS verification (security + performance)
- Added: Race condition handling (AbortController)

**Alignment Review:** Passed
- Changed: "position voting" → "position recording" (terminology consistency)
- Clarified: Author positions (can record on own points)
- Removed: Hypothesis requirement (UX improvement, not validation)

## References

- Implementation plan: `~/.claude/plans/majestic-watching-cerf.md`
- Screenshots: `~/Screenshots/Screenshot at Feb 07 00-36-16.png` (good version)
- Original component: `src/app/components/social/StoryCardDetail.tsx`
- Backend services: `src/app/data/stories-service.interface.ts`, `src/app/data/points-service.interface.ts`
- Prep-spec review: See agent outputs above
