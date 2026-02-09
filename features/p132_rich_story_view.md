---
status: backlog
type: task
priority: p1
milestone: M1
tags: [stories, points, voting, ui]
---

# P132: Rich Story View with Backend Integration

## Context

Yesterday's P126 commit simplified the story detail page to focus on basic story display. However, the prototype version showed a much richer experience:

**Current (Simple) View:**
- Basic story display (title, content, author)
- Flat list of key points (no interaction)
- No position voting
- No visual hierarchy

**Prototype (Rich) View:**
- Blue left border, author avatar with credibility badge
- Linked points displayed with thread lines (hierarchical)
- Position voting buttons (Disagree/Unsure/Agree)
- Position badges showing author's stance
- Interactive engagement

The `StoryCardDetail` component still exists at `src/app/components/social/StoryCardDetail.tsx` but uses prototype types (Story with `text`, Point with `text`), while our backend uses different types (Story with `content`, Point with `statement`).

**User Evidence:** Screenshots from this morning show the rich view working beautifully. Users expect this level of interactivity when viewing stories.

## Goal

Restore the rich story view by integrating `StoryCardDetail` with real backend data while preserving the proven UI/UX.

## Success Criteria

- [ ] StoryCardDetail renders on `/story/:id` with real backend data
- [ ] Linked points display with thread lines (visual hierarchy)
- [ ] Position voting buttons work (save to backend, persist on reload)
- [ ] Author credibility (ear count) displays correctly
- [ ] Author's position badges show on linked points
- [ ] Optimistic UI updates (instant feedback, revert on error)
- [ ] All existing functionality preserved (no regressions)

## Technical Approach

### Design Decision: Adapter Pattern

**Strategy:** Create type adapters to transform backend data → prototype types. Keep StoryCardDetail unchanged.

**Why:**
- StoryCardDetail's UI/UX is proven (user saw it working)
- Rewriting risks breaking carefully tuned UX
- Child components (PositionButtons, PositionBadge, ThreadLine) are deeply integrated
- Adapters are testable and maintainable

### Key Backend Services

- `storiesService.getStoryWithPoints(id)` - Story + author + linked points
- `pointsService.getPositionCounts(pointId)` - Vote distribution
- `pointsService.getMyPosition(pointId, userId)` - User's position
- `pointsService.setPosition(pointId, userId, position)` - Record vote

## Implementation

### 1. Type Adapter Layer

**New File:** `src/app/adapters/story-to-prototype.ts`

Transform backend types → prototype types:
- `content` → `text`
- `statement` → `text`
- `understoodCount` → `verificationCount`
- Build `positions: Record<string, PositionEntry>` from PointPosition records
- Extract `ears_count` → `authorCredibility.ear`

**Key Function:**
```typescript
export function adaptStoryWithPoints(
  data: StoryWithPoints,
  pointsData: Map<string, {
    counts: Record<PositionType, number>;
    userPosition?: PointPosition;
    authorPosition?: PointPosition;
  }>
): {
  story: PrototypeStory;
  author: StoryAuthor;
  authorCredibility: CredibilityStats;
  linkedPoints: PrototypePoint[];
}
```

### 2. Story Detail Page Integration

**File:** `src/app/pages/story-detail-page.tsx`

**Changes:**
1. Fetch story with `getStoryWithPoints(id)`
2. For each linked point, fetch:
   - Position counts via `getPositionCounts(pointId)`
   - User's position via `getMyPosition(pointId, userId)`
   - Author's position via `getMyPosition(pointId, authorId)`
3. Run adapter to transform data
4. Render StoryCardDetail with adapted data
5. Wire position click handler with optimistic updates

**Position Click Flow:**
```
User clicks → Update local state (instant)
            → Call backend API
            → On success: track analytics
            → On failure: revert + toast error
```

### 3. Position Voting Wire-up

**File:** `src/app/components/social/StoryCardDetail.tsx`

**Minimal changes:**
- Add `onPositionClick?: (pointId, position) => void` prop
- Pass to QuotedPoint sub-component
- QuotedPoint calls handler instead of just local state

### 4. Backend Type Extension

**File:** `src/app/types/index.ts`

Extend `StoryWithAuthor` to include:
```typescript
authorEarsCount?: number;
```

**File:** `src/app/data/stories-service-real.ts`

Update query to join `profiles.ears_count as author_ears_count`.

## Testing

### Manual QA

**As authenticated user:**
- Visit `/story/:id` → rich view renders
- Click position button → saves to backend
- Refresh page → position persists
- Change position → updates correctly

**As unauthenticated user:**
- Story displays correctly
- Position buttons → "Sign in to vote" toast

**Edge cases:**
- 0 linked points → renders correctly
- 1 linked point → no thread lines
- 3+ linked points → thread lines connect

### Unit Tests

Test adapter functions:
- Backend Story → Prototype Story transformation
- Backend PointSummary → Prototype Point transformation
- Missing position data handled gracefully

### E2E Tests

Add to existing story tests:
- Position voting saves and persists

## Critical Files

1. **`src/app/adapters/story-to-prototype.ts`** (NEW) - Type transformation
2. **`src/app/pages/story-detail-page.tsx`** (MODIFY) - Integration
3. **`src/app/components/social/StoryCardDetail.tsx`** (MODIFY) - Voting wire-up
4. **`src/app/types/index.ts`** (MODIFY) - Type extension
5. **`src/app/data/stories-service-real.ts`** (MODIFY) - Query update

## Risks & Mitigations

**Risk:** Optimistic updates create race conditions
**Mitigation:** Comprehensive error handling + revert on failure

**Risk:** Type adapter misses edge cases
**Mitigation:** Unit tests for all transformation paths

**Risk:** Breaking existing /live demo positions
**Mitigation:** Demo flow uses separate 3-option model (different domain)

## Estimated Effort

- Adapter layer: 1-2 hours
- Page integration: 2-3 hours
- Position voting: 1-2 hours
- Type extension: 30 min
- Testing: 2-3 hours

**Total:** 7-11 hours (1-1.5 days)

## Dependencies

- P117: Stories + Points backend (DONE)
- P126: Create Story + View Story (DONE)
- P131: Manual Points Creation (DONE)

## Notes

- Keep existing /live demo flow positions separate (different domain)
- VoteButton component exists but not needed for this implementation
- Prototype components in `src/app/prototypes/` remain unchanged
- All position data flows through adapter - single transformation point

## References

- Implementation plan: `~/.claude/plans/majestic-watching-cerf.md`
- Screenshots: `~/Screenshots/Screenshot at Feb 07 00-36-16.png` (good version)
- Original component: `src/app/components/social/StoryCardDetail.tsx`
- Backend services: `src/app/data/stories-service.interface.ts`, `src/app/data/points-service.interface.ts`
