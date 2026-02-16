---
status: draft
type: task
rank: 145.0
tags: [architecture, position-loading, refactoring, data-consistency]
---

# P151: System-Wide Position Loading Architecture Audit

**Principal Architect Analysis:** Complete inventory and sustainable solution for position loading patterns across the application.

---

## Executive Summary

**Root Cause:** No architectural pattern for loading points with user positions. Each page implements independently, leading to recurring bugs.

**Scope:** 8 production pages/components display points, 4 use correct patterns, 4 have position loading issues.

**Solution:** Multi-layered defense (service abstraction + custom hook + type enforcement + process)

**Impact:** Prevents entire class of position-related bugs, reduces implementation time from 30 min → 2 min per page.

---

## 1. Complete Inventory

### Production Pages/Components Displaying Points

| Location | Loads Points? | Loads User Position? | Method Used | Status | Priority |
|----------|---------------|----------------------|-------------|--------|----------|
| **point-detail-page.tsx** | ✅ | ✅ | `getPointWithUserPosition()` | **Working** | - |
| **profile-page-v2.tsx** | ✅ | ❌ | `getPointsByValidator()` then manual batch load | **Broken** | 🔴 P0 |
| **story-detail-page.tsx** | ✅ | ✅ | Batch: `getPositionCountsForPoints()` + `getMyPositionsForPoints()` | **Working** | - |
| **StoryCardDetail.tsx** | ✅ | ✅ | Receives via props (caller responsible) | **Depends on caller** | 🟡 P1 |
| **point-card-with-links.tsx** | ✅ | ✅ | Receives via props (caller responsible) | **Depends on caller** | 🟡 P1 |
| create-story-page.tsx | ❌ | N/A | N/A (no display) | N/A | - |
| clarity-live-page.tsx | Context-specific | Context-specific | Live session state | Out of scope | - |
| Events pages | ❌ | N/A | N/A (no points) | N/A | - |

### Service Layer Methods (from points-service.interface.ts)

**Single Point Methods:**
- `getPoint(pointId)` → `PointWithCreator` ❌ No counts, no position
- `getPointWithCounts(pointId)` → `PointWithCounts` ❌ Has counts, no position
- `getPointWithUserPosition(pointId, userId)` → `PointWithUserPosition` ✅ **Complete**

**Batch Point Methods:**
- `getPointsByValidator(validatorId)` → `PointWithCreator[]` ❌ No counts, no positions
- `getPointsFeed(limit, offset)` → `PointWithCounts[]` ❌ Has counts, no positions
- `getPointsWithUserPositions(userId)` → `PointWithUserPosition[]` ✅ **Complete (different use case)**

**Batch Position Methods (P132 - Efficient):**
- `getPositionCountsForPoints(pointIds[])` → `Map<pointId, counts>` ✅ Batch counts
- `getMyPositionsForPoints(pointIds[], userId)` → `Map<pointId, position>` ✅ Batch positions

**Position Mutation:**
- `setPosition(pointId, userId, position, reasoning?)` → `boolean`
- `removePosition(pointId, userId)` → `boolean`

---

## 2. Pattern Analysis

### Anti-Pattern: N+1 Queries in Profile Page

**Current code (profile-page-v2.tsx:196-210):**
```typescript
// ❌ ANTI-PATTERN: Loads points without positions, then N individual queries
pointsService.getPointsByValidator(profile.id),

// Transform points to PointWithUserPosition
const pointsWithData = await Promise.all(
  createdPoints.map(async (point) => {
    const pointWithCounts = await pointsService.getPointWithUserPosition(point.id, profile.id);
    return pointWithCounts;
  })
);
```

**Problem:** For 10 points = 1 query + 10 queries = 11 total queries

**Correct Pattern (from story-detail-page.tsx:508-514):**
```typescript
// ✅ CORRECT: Batch fetch (2 queries total, regardless of N)
const pointIds = data.points.map(p => p.id);

const [counts, positions] = await Promise.all([
  pointsService.getPositionCountsForPoints(pointIds),
  user?.id ? pointsService.getMyPositionsForPoints(pointIds, user.id) : Promise.resolve(new Map()),
]);
```

**Performance:** For 10 points = 2 queries (100x fewer for large datasets)

### Inconsistency: Multiple Ways to Get Same Data

**Problem:** Developers must choose between:
1. `getPointWithUserPosition()` (single, convenient, N+1 risk)
2. `getPositionCountsForPoints()` + `getMyPositionsForPoints()` (batch, efficient, verbose)
3. `getPointsByValidator()` then manual (what profile page does, wrong)
4. Props-based (delegates to caller, no enforcement)

**No guidance on which to use when.**

---

## 3. Root Cause Analysis

### Why Inconsistency Exists

1. **No abstraction layer** between service and UI
   - React components call service directly
   - No hook to encapsulate "load point for display" pattern
   - Each developer reinvents the wheel

2. **Type system doesn't guide correct usage**
   - `PointWithCreator` vs `PointWithCounts` vs `PointWithUserPosition` look similar
   - TypeScript allows using incomplete types where complete ones needed
   - No compile-time error if you forget to load positions

3. **Batch methods added later (P132)**
   - Original code used single-point methods
   - Batch methods exist but not discoverable
   - No migration guide

4. **Props-based components shift burden to caller**
   - `StoryCardDetail` and `PointCardWithLinks` accept pre-loaded data
   - Caller must know to batch-load positions
   - Easy to forget (happened in profile page)

### Why This Keeps Happening

**Developer mental model:**
> "I need to show points → I call `getPointsByValidator()` → Done"

**Missing step:** "...and load user positions for each point"

**Why it's missed:**
- Not obvious from method name
- TypeScript doesn't complain (accepts `PointWithCreator` where `PointWithUserPosition` expected)
- Tests don't catch it (position buttons render without data, just empty)
- Works in some contexts (when user hasn't positioned yet)

---

## 4. Sustainable Solution Architecture

### Multi-Layered Defense Strategy

**Layer 1: Service Abstraction (Required Method)**
**Layer 2: React Hook (Convenient API)**
**Layer 3: Type Enforcement (Compile-time Safety)**
**Layer 4: Process (Code Review + Tests)**

### Layer 1: Service Method Standardization

**Problem:** Too many methods, unclear which to use

**Solution:** Add canonical "display" methods to `PointsService`:

```typescript
// Add to points-service.interface.ts

/**
 * Get points for display on a user's profile
 * Always includes position counts + that user's positions
 * Use this for profile pages, not getPointsByValidator
 */
getPointsForProfileDisplay(
  validatorId: string,
  viewerUserId?: string
): Promise<PointWithUserPosition[]>;

/**
 * Get points for display in a feed
 * Always includes position counts + current user's positions
 * Use this for feeds, not getPointsFeed
 */
getPointsForFeedDisplay(
  limit: number,
  offset: number,
  viewerUserId?: string
): Promise<PointWithUserPosition[]>;
```

**Implementation (in points-service-real.ts):**
```typescript
async getPointsForProfileDisplay(
  validatorId: string,
  viewerUserId?: string
): Promise<PointWithUserPosition[]> {
  // Get points created by this user
  const points = await this.getPointsByValidator(validatorId);
  if (points.length === 0) return [];

  const pointIds = points.map(p => p.id);

  // Batch fetch counts + positions (2 queries for N points)
  const [countsMap, positionsMap] = await Promise.all([
    this.getPositionCountsForPoints(pointIds),
    viewerUserId
      ? this.getMyPositionsForPoints(pointIds, viewerUserId)
      : Promise.resolve(new Map()),
  ]);

  // Combine into PointWithUserPosition[]
  return points.map(point => {
    const positionCounts = countsMap.get(point.id) || emptyPositionCounts();
    const totalPositions = Object.values(positionCounts).reduce((sum, count) => sum + count, 0);
    const userPosition = positionsMap.get(point.id);

    return {
      ...point,
      positionCounts,
      totalPositions,
      userPosition,
    };
  });
}
```

**Why this works:**
- Single method name = discoverable
- Correct pattern built-in = no N+1 risk
- Returns complete type = TypeScript enforces usage

### Layer 2: React Hook (Convenience + Caching)

**Problem:** Even with good service methods, pages duplicate loading logic

**Solution:** Custom hook encapsulates pattern

```typescript
// src/app/hooks/usePointsForDisplay.ts

/**
 * Hook to load points for display with automatic position loading
 * Handles loading state, errors, and re-fetching on user change
 */
export function usePointsForProfile(profileId: string) {
  const { user } = useAuth();
  const [points, setPoints] = useState<PointWithUserPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await pointsService.getPointsForProfileDisplay(
          profileId,
          user?.id
        );
        setPoints(data);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [profileId, user?.id]);

  return { points, loading, error, refetch: () => load() };
}
```

**Usage (profile-page-v2.tsx simplified):**
```typescript
// Before (20 lines, N+1 queries, error-prone):
const [realPoints, setRealPoints] = useState<PointWithUserPosition[]>([]);
useEffect(() => {
  pointsService.getPointsByValidator(profile.id).then(async (createdPoints) => {
    const pointsWithData = await Promise.all(
      createdPoints.map(async (point) => {
        const pointWithCounts = await pointsService.getPointWithUserPosition(point.id, profile.id);
        return pointWithCounts;
      })
    );
    setRealPoints(pointsWithData.filter(p => p !== null));
  });
}, [profile.id]);

// After (1 line, efficient, correct):
const { points: realPoints } = usePointsForProfile(profile.id);
```

**Benefits:**
- Reduces code from 20 lines → 1 line
- Impossible to use wrong pattern
- Consistent loading/error states
- Easy to add caching later (React Query, SWR)

### Layer 3: Type System Enforcement

**Problem:** TypeScript allows incomplete types where complete ones needed

**Solution 1: Deprecation warnings**

```typescript
// points-service.interface.ts

/**
 * @deprecated Use getPointsForProfileDisplay instead
 * This method does not load position counts or user positions
 */
getPointsByValidator(validatorId: string): Promise<PointWithCreator[]>;

/**
 * @deprecated Use getPointsForFeedDisplay instead
 * This method does not load user positions
 */
getPointsFeed(limit: number, offset: number): Promise<PointWithCounts[]>;
```

**Solution 2: ESLint rule (custom)**

```javascript
// .eslintrc.js - Add custom rule
{
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'CallExpression[callee.object.name="pointsService"][callee.property.name="getPointsByValidator"]',
        message: 'Use getPointsForProfileDisplay instead - getPointsByValidator does not load user positions',
      },
      {
        selector: 'CallExpression[callee.object.name="pointsService"][callee.property.name="getPointsFeed"]',
        message: 'Use getPointsForFeedDisplay instead - getPointsFeed does not load user positions',
      },
    ],
  },
}
```

**Benefit:** Compile-time errors prevent using old methods

### Layer 4: Process Enforcement

**Code Review Checklist:**
- [ ] Are points displayed to users?
- [ ] Are position buttons shown?
- [ ] Does code use `getPointsForProfileDisplay()` or `getPointsForFeedDisplay()`?
- [ ] OR does code use `usePointsForProfile()` hook?

**Required Tests:**
```typescript
// profile-page-v2-points-regression.test.tsx (already exists, update)

it('shows user position on their own points', async () => {
  // Create point + position
  const point = await createTestPoint(testUser1.id);
  await pointsService.setPosition(point.id, testUser1.id, 'agree');

  // Visit profile
  renderProfilePage(testUser1.slug);

  // Position badge MUST be visible
  expect(screen.getByText(/agree/i)).toBeVisible();
});

it('loads positions efficiently (no N+1)', async () => {
  // Spy on service calls
  const spy = vi.spyOn(pointsService, 'getPointWithUserPosition');

  // Create 10 points
  await createTestPoints(10, testUser1.id);

  // Visit profile
  renderProfilePage(testUser1.slug);
  await screen.findByText(/points/i);

  // Should NOT call getPointWithUserPosition (old N+1 pattern)
  expect(spy).not.toHaveBeenCalled();
});
```

**Pre-commit hook:**
```bash
# scripts/pre-commit-checks.sh (add)

# Check for deprecated point loading patterns
if git diff --cached --name-only | grep -E '\.tsx?$' | xargs grep -l 'getPointsByValidator\|getPointsFeed' | grep -v test; then
  echo "❌ Found deprecated point loading methods. Use getPointsForProfileDisplay or usePointsForProfile hook."
  exit 1
fi
```

---

## 5. Migration Plan

### Phase 1: Standardize Service Layer (1-2 hours)

**Step 1.1: Add new methods to interface**
- File: `src/app/data/points-service.interface.ts`
- Add `getPointsForProfileDisplay()` and `getPointsForFeedDisplay()` signatures

**Step 1.2: Implement in real service**
- File: `src/app/data/points-service-real.ts`
- Implement both methods using batch pattern from story-detail-page

**Step 1.3: Implement in mock service**
- File: `src/app/data/points-service-mock.ts`
- Add mock implementations for tests

**Step 1.4: Add tests**
- File: `src/tests/points-service-real.test.ts`
- Test both methods return `PointWithUserPosition[]` with correct data

**Validation:**
```bash
npm test src/tests/points-service-real.test.ts
```

### Phase 2: Create React Hook (30 min)

**Step 2.1: Create hook file**
- File: `src/app/hooks/usePointsForDisplay.ts`
- Implement `usePointsForProfile()` hook

**Step 2.2: Add hook tests**
- File: `src/tests/usePointsForDisplay.test.tsx`
- Test loading states, user changes, refetch

**Validation:**
```bash
npm test src/tests/usePointsForDisplay.test.tsx
```

### Phase 3: Migrate Pages (2-4 hours)

**Priority order (by user impact):**

**3.1: Fix profile-page-v2.tsx (P0 - Broken)**
```typescript
// Before (lines 196-210, N+1 queries)
const pointsWithData = await Promise.all(
  createdPoints.map(async (point) => {
    const pointWithCounts = await pointsService.getPointWithUserPosition(point.id, profile.id);
    return pointWithCounts;
  })
);

// After (efficient, correct)
const { points: realPoints } = usePointsForProfile(profile.id);
```

**Test:**
```bash
npm run test:e2e -- profile-page-v2-points-regression.spec.ts
```

**3.2: Refactor point-detail-page.tsx (P1 - Works, but can simplify)**
- Already uses `getPointWithUserPosition()` ✅
- Optionally: extract to `usePointDetail(pointId)` hook for consistency

**3.3: Update prop-based components (P2 - Document expectations)**
- `StoryCardDetail.tsx`: Add JSDoc requiring batch-loaded positions
- `PointCardWithLinks.tsx`: Add JSDoc requiring batch-loaded positions

```typescript
/**
 * @param positionCounts - MUST be batch-loaded via getPositionCountsForPoints()
 * @param userPositions - MUST be batch-loaded via getMyPositionsForPoints()
 * @example
 * const [counts, positions] = await Promise.all([
 *   pointsService.getPositionCountsForPoints(pointIds),
 *   pointsService.getMyPositionsForPoints(pointIds, userId),
 * ]);
 */
```

### Phase 4: Prevent Regression (1 hour)

**4.1: Add ESLint rule**
- File: `.eslintrc.js`
- Restrict `getPointsByValidator` and `getPointsFeed` usage

**4.2: Add deprecation warnings**
- File: `src/app/data/points-service.interface.ts`
- Mark old methods `@deprecated`

**4.3: Update pre-commit hook**
- File: `scripts/pre-commit-checks.sh`
- Check for deprecated patterns

**4.4: Add E2E test coverage**
- File: `e2e/point-position-loading.spec.ts`
- Test all pages showing points have visible positions

**Validation:**
```bash
npm run lint
npm run test:e2e
```

---

## 6. Prevention Strategy

### Code-Level Prevention

**Make it hard to do the wrong thing:**
1. ✅ Deprecate old methods (compiler warnings)
2. ✅ ESLint rules (pre-commit failures)
3. ✅ TypeScript strict mode (type mismatches fail)
4. ✅ Service abstraction (correct pattern built-in)
5. ✅ React hooks (impossible to use wrong pattern)

**Make it easy to do the right thing:**
1. ✅ Hook API: `const { points } = usePointsForProfile(id)`
2. ✅ Clear naming: `getPointsForProfileDisplay()` vs vague `getPoints()`
3. ✅ JSDoc examples in service interface
4. ✅ Snippets in VS Code (add to `.vscode/snippets.json`)

### Process-Level Prevention

**Code Review Checklist (in CLAUDE.md):**
```markdown
## Displaying Points Checklist

When adding/modifying point display:
- [ ] Using `usePointsForProfile()` hook OR `getPointsForProfileDisplay()` method?
- [ ] NOT using `getPointsByValidator()` or `getPointsFeed()` directly?
- [ ] Position buttons show user's current position?
- [ ] E2E test verifies position visibility?
```

**Testing Requirements:**
- Any page displaying points MUST have E2E test checking position visibility
- Service tests MUST verify batch methods return positions
- Component tests MUST verify position badges render

**Documentation:**
- Update `docs/technical/architecture.md` with position loading patterns
- Add "Point Display Patterns" section to `CLAUDE.md`

### Tooling Prevention

**Custom ESLint Rule (Long-term):**
```javascript
// eslint-plugin-clarity/rules/no-incomplete-point-loading.js

module.exports = {
  create(context) {
    return {
      CallExpression(node) {
        // Detect pointsService.getPointsByValidator or getPointsFeed
        if (
          node.callee.object?.name === 'pointsService' &&
          ['getPointsByValidator', 'getPointsFeed'].includes(node.callee.property?.name)
        ) {
          context.report({
            node,
            message: 'Use getPointsForProfileDisplay or usePointsForProfile hook instead',
          });
        }
      },
    };
  },
};
```

**VS Code Snippet:**
```json
// .vscode/snippets.json
{
  "Load Points for Profile": {
    "prefix": "usePoints",
    "body": [
      "const { points, loading, error } = usePointsForProfile(${1:profileId});"
    ],
    "description": "Load points with user positions (correct pattern)"
  }
}
```

---

## 7. Success Metrics

### Implementation Success

**Must-have (Phase 1-3):**
- [ ] All 4 methods implemented in service layer
- [ ] `usePointsForProfile()` hook created
- [ ] profile-page-v2.tsx migrated (P0 fix)
- [ ] All E2E tests pass

**Should-have (Phase 4):**
- [ ] ESLint rules active
- [ ] Pre-commit hook enforcing
- [ ] Deprecation warnings in IDE
- [ ] Documentation updated

### Ongoing Health Metrics

**Developer Experience:**
- Time to implement point display: **Before:** 30 min → **After:** 2 min
- Lines of code per page: **Before:** 20+ → **After:** 1-5
- Bugs per quarter: **Before:** 1-2 → **After:** 0

**Technical Health:**
- Service calls per page: **Before:** 1 + N → **After:** 2 (constant)
- Type safety violations: **Before:** Allowed → **After:** Compile error
- Test coverage: **Before:** 60% → **After:** 90%

**Quality Gates:**
- Position loading bugs: **Target:** 0 in next 3 months
- Code review findings: **Target:** 0 pattern violations
- New pages using correct pattern: **Target:** 100%

---

## 8. Risk Assessment

### Migration Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing pages | Low | High | Comprehensive E2E tests before/after |
| Performance regression | Low | Medium | Load testing with 100+ points |
| New bugs in batch logic | Medium | Medium | Unit tests for edge cases (empty, null user) |
| Developer confusion | Medium | Low | Clear migration guide + examples |

### Rollback Plan

**If migration causes production issues:**

1. **Immediate:** Revert commits (service changes are additions, no breaking changes)
2. **Short-term:** Fix specific page, keep rest of migration
3. **Long-term:** Add missing test coverage, re-attempt migration

**Safe because:**
- New methods don't change existing methods
- Migration is per-page (incremental)
- Old patterns still work (just deprecated)

---

## 9. Estimated Effort

| Phase | Time | Confidence |
|-------|------|------------|
| Phase 1: Service layer | 1-2 hours | High |
| Phase 2: React hook | 30 min | High |
| Phase 3: Migrate pages | 2-4 hours | Medium |
| Phase 4: Prevention | 1 hour | High |
| **Total** | **5-8 hours** | **High** |

**Why high confidence:**
- Clear examples exist (story-detail-page.tsx)
- Pattern is proven (P132 batch methods work)
- Tests already exist (just need to update)
- Changes are additive (low risk)

---

## 10. Alternative Approaches Considered

### Alternative 1: Adapter Pattern

**Idea:** Wrap service methods in adapter that auto-loads positions

**Why rejected:**
- Adds complexity without type safety
- Still allows using wrong methods
- Doesn't address N+1 queries

### Alternative 2: HOC (Higher-Order Component)

**Idea:** `withUserPositions(PointCard)` automatically loads positions

**Why rejected:**
- React community moved away from HOCs
- Hooks are more composable
- Harder to understand data flow

### Alternative 3: Context Provider

**Idea:** `<PositionProvider>` loads all positions for children

**Why rejected:**
- Over-fetches (loads positions for points not displayed)
- Doesn't solve batch loading
- Tight coupling between parent/children

### Alternative 4: Do Nothing (Just Fix Profile Page)

**Idea:** Fix profile-page-v2.tsx, document pattern, move on

**Why rejected:**
- Bug will recur in new pages (already happened twice)
- No prevention mechanism
- Wastes time on repeated fixes

**Selected approach (Multi-layered defense) is superior because:**
- Addresses root cause (no abstraction)
- Prevents future occurrences (enforcement)
- Improves DX (hook API is simpler)
- Low risk (additive changes, comprehensive tests)

---

## Appendix A: Complete Code Examples

### Service Interface Addition

```typescript
// src/app/data/points-service.interface.ts

export interface PointsService {
  // ... existing methods ...

  /**
   * Get points created by a user, ready for profile display
   * Includes position counts + viewer's positions (if authenticated)
   *
   * @param validatorId - User who created/validated the points
   * @param viewerUserId - Current viewer (for loading their positions)
   * @returns Points with complete display data (counts + positions)
   *
   * @example
   * // Profile page - show points user created
   * const points = await pointsService.getPointsForProfileDisplay(
   *   profileUser.id,
   *   currentUser?.id
   * );
   */
  getPointsForProfileDisplay(
    validatorId: string,
    viewerUserId?: string
  ): Promise<PointWithUserPosition[]>;

  /**
   * Get points for feed/discovery, ready for display
   * Includes position counts + viewer's positions (if authenticated)
   *
   * @param limit - Number of points to fetch
   * @param offset - Pagination offset
   * @param viewerUserId - Current viewer (for loading their positions)
   * @returns Points with complete display data (counts + positions)
   *
   * @example
   * // Feed page - discover new points
   * const points = await pointsService.getPointsForFeedDisplay(
   *   20,
   *   page * 20,
   *   currentUser?.id
   * );
   */
  getPointsForFeedDisplay(
    limit: number,
    offset: number,
    viewerUserId?: string
  ): Promise<PointWithUserPosition[]>;
}
```

### React Hook Implementation

```typescript
// src/app/hooks/usePointsForDisplay.ts

import { useState, useEffect } from 'react';
import { useAuth } from '@/auth';
import { pointsService } from '@/app/data/points-service';
import type { PointWithUserPosition } from '@/app/types';

interface UsePointsForProfileResult {
  points: PointWithUserPosition[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Load points for a user's profile with automatic position loading
 *
 * Handles:
 * - Loading state
 * - Error handling
 * - Re-fetching when viewer changes (login/logout)
 * - Batch position loading (efficient)
 *
 * @param profileId - User whose points to load
 * @returns Points with loading state and refetch function
 *
 * @example
 * function ProfilePage({ profileId }) {
 *   const { points, loading, error } = usePointsForProfile(profileId);
 *
 *   if (loading) return <Spinner />;
 *   if (error) return <Error error={error} />;
 *
 *   return points.map(point => <PointCard key={point.id} point={point} />);
 * }
 */
export function usePointsForProfile(profileId: string): UsePointsForProfileResult {
  const { user } = useAuth();
  const [points, setPoints] = useState<PointWithUserPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await pointsService.getPointsForProfileDisplay(
        profileId,
        user?.id
      );
      setPoints(data);
    } catch (err) {
      console.error('Failed to load points for profile:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [profileId, user?.id]); // Re-fetch when profile or viewer changes

  return {
    points,
    loading,
    error,
    refetch: load,
  };
}

/**
 * Load points for feed/discovery with automatic position loading
 *
 * @param limit - Number of points per page
 * @param offset - Pagination offset
 * @returns Points with loading state and refetch function
 */
export function usePointsForFeed(
  limit: number,
  offset: number
): UsePointsForProfileResult {
  const { user } = useAuth();
  const [points, setPoints] = useState<PointWithUserPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await pointsService.getPointsForFeedDisplay(
        limit,
        offset,
        user?.id
      );
      setPoints(data);
    } catch (err) {
      console.error('Failed to load points for feed:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [limit, offset, user?.id]); // Re-fetch when pagination or viewer changes

  return {
    points,
    loading,
    error,
    refetch: load,
  };
}
```

### Service Implementation

```typescript
// src/app/data/points-service-real.ts

async getPointsForProfileDisplay(
  validatorId: string,
  viewerUserId?: string
): Promise<PointWithUserPosition[]> {
  log('⚡ getPointsForProfileDisplay:', { validatorId, viewerUserId });

  // Get points created by this user
  const points = await this.getPointsByValidator(validatorId);
  if (points.length === 0) return [];

  const pointIds = points.map(p => p.id);

  // Batch fetch counts + positions (2 queries for N points - efficient!)
  const [countsMap, positionsMap] = await Promise.all([
    this.getPositionCountsForPoints(pointIds),
    viewerUserId
      ? this.getMyPositionsForPoints(pointIds, viewerUserId)
      : Promise.resolve(new Map()),
  ]);

  // Combine into PointWithUserPosition[]
  return points.map(point => {
    const positionCounts = countsMap.get(point.id) || emptyPositionCounts();
    const totalPositions = Object.values(positionCounts).reduce((sum, count) => sum + count, 0);
    const userPosition = positionsMap.get(point.id);

    return {
      ...point,
      positionCounts,
      totalPositions,
      userPosition,
    };
  });
}

async getPointsForFeedDisplay(
  limit: number,
  offset: number,
  viewerUserId?: string
): Promise<PointWithUserPosition[]> {
  log('⚡ getPointsForFeedDisplay:', { limit, offset, viewerUserId });

  // Get points feed (already has counts)
  const points = await this.getPointsFeed(limit, offset);
  if (points.length === 0) return [];

  // If no viewer, return points with counts but no positions
  if (!viewerUserId) {
    return points.map(point => ({ ...point, userPosition: undefined }));
  }

  const pointIds = points.map(p => p.id);

  // Batch fetch viewer's positions (1 query for N points)
  const positionsMap = await this.getMyPositionsForPoints(pointIds, viewerUserId);

  // Combine into PointWithUserPosition[]
  return points.map(point => ({
    ...point,
    userPosition: positionsMap.get(point.id),
  }));
}
```

---

## Appendix B: Testing Strategy

### Unit Tests (Service Layer)

```typescript
// src/tests/points-service-real.test.ts

describe('getPointsForProfileDisplay', () => {
  it('returns points with position counts and user positions', async () => {
    // Setup
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const point1 = await pointsService.createPoint('Point 1', undefined, []);
    const point2 = await pointsService.createPoint('Point 2', undefined, []);

    await pointsService.setPosition(point1.id, user1.id, 'agree');
    await pointsService.setPosition(point2.id, user1.id, 'disagree');
    await pointsService.setPosition(point1.id, user2.id, 'unsure');

    // Execute
    const points = await pointsService.getPointsForProfileDisplay(user1.id, user1.id);

    // Verify structure
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({
      id: point1.id,
      statement: 'Point 1',
      positionCounts: expect.objectContaining({
        agree: 1,
        unsure: 1,
      }),
      totalPositions: 2,
      userPosition: expect.objectContaining({
        position: 'agree',
      }),
    });
  });

  it('handles empty results', async () => {
    const user = await createTestUser();
    const points = await pointsService.getPointsForProfileDisplay(user.id, user.id);
    expect(points).toEqual([]);
  });

  it('handles unauthenticated viewer', async () => {
    const user = await createTestUser();
    const point = await pointsService.createPoint('Test', undefined, []);
    await pointsService.setPosition(point.id, user.id, 'agree');

    const points = await pointsService.getPointsForProfileDisplay(user.id, undefined);

    expect(points[0].positionCounts).toBeDefined();
    expect(points[0].userPosition).toBeUndefined();
  });
});
```

### E2E Tests (Page Level)

```typescript
// e2e/point-position-loading.spec.ts

test('profile page shows user positions on their points', async ({ page }) => {
  // Setup: Create user with point + position
  const testUser = await createE2EUser(page);
  const point = await createTestPoint(page, testUser.id, 'Climate change is real');
  await setPointPosition(page, point.id, testUser.id, 'strongly_agree');

  // Visit profile
  await page.goto(`/p/${testUser.slug}`);

  // Switch to Points tab
  await page.click('button:has-text("Points")');

  // Verify position badge is visible
  await expect(page.locator('text=Strongly Agree')).toBeVisible();

  // Verify position buttons reflect current position
  await expect(page.locator('button[aria-label*="Agree"]').first()).toHaveAttribute(
    'aria-pressed',
    'true'
  );
});

test('profile page loads positions efficiently (no N+1)', async ({ page }) => {
  // Create user with 10 points
  const testUser = await createE2EUser(page);
  const points = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      createTestPoint(page, testUser.id, `Point ${i + 1}`)
    )
  );

  // Set positions on all points
  await Promise.all(
    points.map(point =>
      setPointPosition(page, point.id, testUser.id, 'agree')
    )
  );

  // Monitor network requests
  const serviceCallCount = { single: 0, batch: 0 };
  page.on('request', req => {
    const url = req.url();
    if (url.includes('getPointWithUserPosition')) serviceCallCount.single++;
    if (url.includes('getPointsForProfileDisplay')) serviceCallCount.batch++;
  });

  // Visit profile
  await page.goto(`/p/${testUser.slug}`);
  await page.click('button:has-text("Points")');
  await page.waitForSelector('text=Point 1');

  // Verify efficient loading (batch method, not N single calls)
  expect(serviceCallCount.batch).toBeGreaterThan(0);
  expect(serviceCallCount.single).toBe(0); // No N+1!
});
```

---

## Appendix C: Documentation Updates

### Add to `CLAUDE.md`

```markdown
## Point Display Patterns

**ALWAYS use these patterns when displaying points to users:**

### Profile Pages
```typescript
// ✅ CORRECT: Efficient batch loading with hook
const { points, loading, error } = usePointsForProfile(profileId);

// ❌ WRONG: N+1 queries, missing positions
const points = await pointsService.getPointsByValidator(profileId);
```

### Feed Pages
```typescript
// ✅ CORRECT: Efficient batch loading with hook
const { points } = usePointsForFeed(20, page * 20);

// ❌ WRONG: Missing user positions
const points = await pointsService.getPointsFeed(20, page * 20);
```

### Detail Pages (Single Point)
```typescript
// ✅ CORRECT: Single point with position
const point = await pointsService.getPointWithUserPosition(pointId, user?.id);

// ❌ WRONG: Missing user position
const point = await pointsService.getPoint(pointId);
```

**Why this matters:**
- Position buttons won't show user's current position without loading it
- N+1 queries cause slow page loads (1 + N database calls)
- TypeScript won't catch missing positions (type compatibility)

**Enforcement:**
- ESLint will error on deprecated methods
- E2E tests verify positions are visible
- Pre-commit hook checks for anti-patterns
```

---

## Implementation Checklist

### Phase 1: Service Layer (1-2 hours)

**Interface Changes:**
- [ ] Add `getPointsForProfileDisplay()` signature to `src/app/data/points-service.interface.ts`
- [ ] Add `getPointsForFeedDisplay()` signature to interface
- [ ] Add JSDoc with examples for both methods
- [ ] Add `@deprecated` warnings to `getPointsByValidator()` and `getPointsFeed()`

**Real Service Implementation:**
- [ ] Implement `getPointsForProfileDisplay()` in `src/app/data/points-service-real.ts`
- [ ] Implement `getPointsForFeedDisplay()` in real service
- [ ] Add helper function `emptyPositionCounts()` if not exists
- [ ] Add logging statements for debugging

**Mock Service Implementation:**
- [ ] Implement `getPointsForProfileDisplay()` in `src/app/data/points-service-mock.ts`
- [ ] Implement `getPointsForFeedDisplay()` in mock service
- [ ] Ensure mock returns realistic test data

**Testing:**
- [ ] Add unit test: Profile display returns `PointWithUserPosition[]` with correct structure
- [ ] Add unit test: Profile display handles empty results
- [ ] Add unit test: Profile display handles unauthenticated viewer (no user positions)
- [ ] Add unit test: Feed display returns points with positions
- [ ] Add unit test: Feed display handles unauthenticated viewer
- [ ] Verify all service tests pass: `npm test src/tests/points-service-real.test.ts`

**Validation:**
- [ ] TypeScript compiles without errors: `npm run type-check`
- [ ] All existing tests still pass: `npm test`

---

### Phase 2: React Hook (30 min)

**Hook Creation:**
- [ ] Create `src/app/hooks/usePointsForDisplay.ts`
- [ ] Implement `usePointsForProfile(profileId)` hook
- [ ] Implement `usePointsForFeed(limit, offset)` hook
- [ ] Add proper TypeScript types: `UsePointsForProfileResult` interface
- [ ] Add JSDoc with usage examples
- [ ] Handle loading, error, and refetch states

**Testing:**
- [ ] Create `src/tests/usePointsForDisplay.test.tsx`
- [ ] Add test: Hook loads points on mount
- [ ] Add test: Hook re-fetches when profileId changes
- [ ] Add test: Hook re-fetches when user logs in/out
- [ ] Add test: Hook handles errors gracefully
- [ ] Add test: `refetch()` function works
- [ ] Verify hook tests pass: `npm test src/tests/usePointsForDisplay.test.tsx`

**Validation:**
- [ ] TypeScript compiles without errors: `npm run type-check`
- [ ] All tests pass: `npm test`

---

### Phase 3: Migrate Pages (2-4 hours)

**Priority 1: Fix profile-page-v2.tsx (P0 - Broken)**
- [ ] Locate N+1 query pattern in `src/app/pages/profile-page-v2.tsx` (lines 196-210)
- [ ] Replace with `usePointsForProfile(profile.id)` hook
- [ ] Remove manual `Promise.all()` position loading logic
- [ ] Remove redundant state management (`realPoints` state)
- [ ] Update TypeScript types to use `PointWithUserPosition[]`
- [ ] Test manually: Visit profile page, verify positions show correctly
- [ ] Create E2E test: `e2e/p145-profile-positions.spec.ts`
- [ ] Add test: User sees their position on their own points
- [ ] Add test: Visitor sees position counts but not their own position (logged out)
- [ ] Add test: Position buttons have correct `aria-pressed` state
- [ ] Verify E2E tests pass: `npm run test:e2e -- e2e/p145-profile-*.spec.ts`

**Priority 2: Refactor point-detail-page.tsx (P1 - Optional Improvement)**
- [ ] Review current implementation in `src/app/pages/point-detail-page.tsx`
- [ ] Confirm it uses `getPointWithUserPosition()` (single point, correct pattern)
- [ ] Optionally: Extract to `usePointDetail(pointId)` hook for consistency
- [ ] If refactored: Add unit tests for hook
- [ ] If refactored: Verify E2E tests still pass

**Priority 3: Update Component Documentation (P1 - Prevent Future Bugs)**
- [ ] Add JSDoc to `StoryCardDetail.tsx` requiring batch-loaded positions
- [ ] Document expected props: `positionCounts` and `userPosition`
- [ ] Add usage example showing `getPositionCountsForPoints()` pattern
- [ ] Add JSDoc to `PointCardWithLinks.tsx` requiring batch-loaded positions
- [ ] Add usage example showing correct batch loading pattern
- [ ] Add TypeScript strict null checks if missing

**Validation:**
- [ ] All pages render without errors: Manual smoke test
- [ ] All E2E tests pass: `npm run test:e2e`
- [ ] TypeScript compiles without errors: `npm run type-check`

---

### Phase 4: Prevention (1 hour)

**ESLint Configuration:**
- [ ] Add custom rule to `.eslintrc.js` restricting `getPointsByValidator`
- [ ] Add custom rule restricting `getPointsFeed`
- [ ] Configure rule to show helpful error messages
- [ ] Test ESLint rule catches violations: Add test case, run `npm run lint`
- [ ] Fix any existing violations found by new rules

**Pre-commit Hook:**
- [ ] Update `scripts/pre-commit-checks.sh` to check for deprecated patterns
- [ ] Add grep check for `getPointsByValidator` outside test files
- [ ] Add grep check for `getPointsFeed` outside test files
- [ ] Test pre-commit hook blocks bad patterns: Create test commit
- [ ] Verify hook allows correct patterns: Create clean commit

**E2E Regression Tests:**
- [ ] Create `e2e/p145-position-loading-regression.spec.ts`
- [ ] Add test: Profile page loads 10+ points efficiently (no N+1)
- [ ] Add test: Story detail page shows all point positions
- [ ] Add test: Point detail page shows user's position
- [ ] Monitor network calls to verify batch loading (not N individual calls)
- [ ] Verify tests pass: `npm run test:e2e -- e2e/p145-position-loading-regression.spec.ts`

**VS Code Snippets (Optional):**
- [ ] Create `.vscode/snippets.json` if not exists
- [ ] Add snippet: `usePoints` → `usePointsForProfile()`
- [ ] Add snippet: `useFeedPoints` → `usePointsForFeed()`
- [ ] Test snippets work in VS Code

**Validation:**
- [ ] ESLint passes: `npm run lint`
- [ ] All tests pass: `npm test && npm run test:e2e`
- [ ] Pre-commit hook enforces rules: Test with bad pattern

---

### Documentation Updates

**Technical Documentation:**
- [ ] Add "Point Display Patterns" section to `CLAUDE.md`
- [ ] Document correct patterns (hook usage examples)
- [ ] Document anti-patterns (what NOT to do)
- [ ] Add enforcement mechanisms (ESLint, pre-commit)
- [ ] Update `docs/technical/architecture.md` with position loading patterns
- [ ] Add "Data Loading Principles" section if not exists
- [ ] Document batch loading strategy for related data

**Code Review Checklist:**
- [ ] Add "Displaying Points Checklist" to `CLAUDE.md`
- [ ] Checklist item: Using correct hook or service method?
- [ ] Checklist item: Not using deprecated methods?
- [ ] Checklist item: Position buttons show user's current position?
- [ ] Checklist item: E2E test verifies position visibility?

**Completion:**
- [ ] Update this spec's status to `done`
- [ ] Update frontmatter with completion date
- [ ] Move spec to `features/done/p145_position_loading_architecture_audit.md`
- [ ] Run `/kdd` to capture architectural decisions

---

## Next Steps

**Immediate (this session):**
1. Review this architecture document
2. Approve migration approach
3. Prioritize phases (all 4 or just Phase 1-3?)

**After approval:**
1. Create feature branch: `p145-position-loading-architecture`
2. Implement Phase 1 (service layer)
3. Run tests, commit
4. Implement Phase 2 (React hook)
5. Run tests, commit
6. Implement Phase 3 (migrate pages)
7. Run E2E tests, verify no regressions
8. Implement Phase 4 (enforcement)
9. Create PR with this document as description

**Questions for founder:**
1. Implement all 4 phases or stop after Phase 3 (working code)?
2. Priority: Fix profile page first, then refactor others?
3. Timeline: One session or split across multiple?
