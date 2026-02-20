# Architecture Patterns

Technical patterns and conventions used in this codebase. For product decisions (why we chose X over Y), see [decisions.md](../decisions.md).

## Service Layer Pattern

**Pattern:** Interface-based services with feature flag switching between mock and real implementations.

```
src/app/data/
├── {domain}-service.interface.ts  # Type definitions
├── {domain}-service-mock.ts       # Mock implementation (for tests)
├── {domain}-service-real.ts       # Real Supabase implementation
└── {domain}-service.ts            # Exports based on feature flag
```

**How it works:**

```typescript
// {domain}-service.ts
const USE_REAL_API = import.meta.env.VITE_USE_REAL_{DOMAIN}_API === 'true';
export const {domain}Service = USE_REAL_API ? realService : mockService;
```

**When to use which:**

| Context | Implementation | Why |
|---------|---------------|-----|
| Unit tests | Mock (import directly) | Fast, no DB dependency |
| Local dev | Real | Configured via `.env.local` |
| Production | Real | Always |

**Current services using this pattern:**
- `events-service` (`VITE_USE_REAL_EVENTS_API`)
- `stories-service` (`VITE_USE_REAL_STORIES_API`)
- `points-service` (`VITE_USE_REAL_POINTS_API`)
- `calibration-service` (`VITE_USE_REAL_CALIBRATION_API`)

**Reference:** [decisions.md § 2026-01-19](../decisions.md) for original decision context.

---

## Data Layer Architecture

Two data layers exist in parallel:

| Layer | Location | Used By |
|-------|----------|---------|
| Interface-based services | `src/app/data/{domain}-service*.ts` | Event pages, Stories, Points, Calibration |
| Legacy API | `src/app/data/api.ts` | sign-pledge-page, clarity-tax-section, profiles |

**Migration path:** New features should use the interface-based pattern. Legacy `api.ts` will be migrated incrementally.

---

## Component Hierarchy

### Avatar Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `GravatarAvatar` | `src/components/ui/gravatar-avatar.tsx` | Base avatar with photo/initials/badge support |
| `PersonAvatar` | `src/components/ui/person-avatar.tsx` | Wrapper ensuring pledge badge via `PersonRef` type |
| `PersonRow` | `src/app/components/` | Compound component (avatar + name + subtitle) |

**Rule:** Use `PersonAvatar` for standalone person avatars. Use `PersonRow` for list items with additional metadata.

**Reference:** [P118 spec](../../features/done/5_feb_26/p118_person_avatar_consolidation.md) for consolidation rationale.

---

## Stories, Points, and Calibration API

Added in P117. Replaces mock data with real Supabase backend.

### Services

| Service | Feature Flag | Purpose |
|---------|-------------|---------|
| `stories-service` | `VITE_USE_REAL_STORIES_API` | User-created content with versioning |
| `points-service` | `VITE_USE_REAL_POINTS_API` | Statements with 7-point Likert positions |
| `calibration-service` | `VITE_USE_REAL_CALIBRATION_API` | Verification tracking and calibration stats |

### Story Versioning

Stories have immutable versions. When a story is created, version 1 is auto-created via trigger. Updates create new versions. Verifications reference specific `version_id`, enabling "view what was verified."

```
stories ─── story_versions (1:N, auto-created by trigger)
                  │
                  └── story_verifications (references version_id)
```

### Position Scale (7-point Likert)

```
strongly_disagree → disagree → somewhat_disagree → unsure → somewhat_agree → agree → strongly_agree
```

Positions are upserted on `(point_id, user_id)` unique constraint. Changes are logged to `point_position_history` via trigger.

### Calibration Computation

Calibration averages are computed **on-read** via SQL `AVG()`, not stored. Requires `REQUIRED_SESSIONS = 5` before returning calibration stats. Returns `status: 'insufficient' | 'sufficient'`.

Stats include: `earsCount`, `listenerCalibrationAvg`, `listenerSelfRatingAvg`, `calibrationGap`, `speakerCalibrationAvg`.

### Session Profile Linking

`clarity_sessions` has `creator_profile_id` and `joiner_profile_id` FKs. Set when authenticated users create/join /live sessions. Enables linking verifications back to user profiles.

### Database Triggers

| Trigger | On | Effect |
|---------|------|--------|
| `trg_story_version_insert` | `stories` INSERT | Creates version 1 |
| `trg_story_version_update` | `stories` UPDATE (title/content) | Creates new version |
| `trg_position_history` | `point_positions` INSERT/UPDATE/DELETE | Logs to history table |
| `trg_story_verification_count` | `story_verifications` INSERT | Updates `stories.understood_count` |
| `trg_profile_ears_count` | `story_verifications` INSERT | Increments listener `ears_count` and both users' `verification_session_count` |

### RLS Policies

| Table | Read | Create | Update | Delete |
|-------|------|--------|--------|--------|
| `stories` | Public | Verified users | Author only | Author only |
| `story_versions` | Public | System (trigger) | — | — |
| `points` | Public | Verified users | — (immutable) | — |
| `story_points` | Public | Story author | — | Story author |
| `point_positions` | Public | Verified users (own) | Own only | Own only |
| `point_position_history` | Public | System (trigger) | — | — |
| `story_verifications` | Public | Authenticated | — | — |

### Point Display Patterns

**Always use hooks and named service methods — never raw service calls.** Wrong patterns cause N+1 queries and missing user positions (TypeScript won't catch it).

**For profile pages** (points created by user):
```typescript
// ✅ CORRECT: Efficient batch loading
const { points, loading, error } = usePointsForProfile(profileId);

// ❌ WRONG: Manual loading creates N+1 queries
const points = await pointsService.getPointsByValidator(profileId);
```

**For feed pages:**
```typescript
// ✅ CORRECT
const { points } = usePointsForFeed(20, page * 20);

// ❌ WRONG: Missing user positions
const points = await pointsService.getPointsFeed(20, page * 20);
```

**For detail pages** (single point):
```typescript
// ✅ CORRECT
const point = await pointsService.getPointWithUserPosition(pointId, user?.id);

// ❌ WRONG: Missing user position
const point = await pointsService.getPoint(pointId);
```

**Hooks:** `usePointsForProfile`, `usePointsForFeed` — `src/app/hooks/usePointsForDisplay.ts`
**Service methods:** `getPointsForProfileDisplay`, `getPointsForFeedDisplay`

### Optimistic Position State in QuotedPoint

`QuotedPoint` (inside `StoryCardDetail.tsx`) uses `localPosition`/`effectivePosition` to stay responsive during async round-trips without going stale on parent re-renders:

```typescript
// ✅ CORRECT: localPosition layer + derived effectivePosition
const [localPosition, setLocalPosition] = useState<PositionType | null>(null);
const serverPosition = userPosition?.position ?? null;
const effectivePosition = localPosition ?? serverPosition;

// Clear local override once parent confirms
useEffect(() => {
  if (localPosition !== null && localPosition === serverPosition) {
    setLocalPosition(null);
  }
}, [serverPosition, localPosition]);
```

**Why not `useState(userPosition?.position)`?**
`useState` initializer runs once at mount. If parent fetches new positions after mount (e.g., on navigation or re-render), `currentPosition` stays frozen at the mount value. The `localPosition ?? serverPosition` pattern is always in sync with parent while still allowing optimistic overrides.

**Toggle-off**: `handlePositionClick` must call `pointsService.removePosition` (not `setPosition`) when the selected position matches the current one. Detect before the try block:
```typescript
const isTogglingOff = userPositions.get(pointId)?.position === position;
// branch inside try: isTogglingOff ? removePosition : setPosition
```

### Profile Display — Dual Position Fields

When rendering a profile page visited by someone other than the owner, `getPointsForProfileDisplay(validatorId, viewerUserId)` populates two position fields on each point:

| Field | Meaning | Use for |
|-------|---------|---------|
| `point.userPosition` | Viewer's own position | Action buttons (what the visitor selected) |
| `point.profileSubjectPosition` | Profile owner's own position | Display badge (what the owner believes) |

Self-view: when `viewerUserId === validatorId`, both fields resolve from the same batch. The batch loading strategy is encapsulated in the service method — callers don't need to manage it.

### Idempotent DB Inserts — Treat 23505 as Success

When an INSERT has a unique constraint (e.g., `story_points (story_id, point_id)`), a `23505` unique violation means the row already exists — the desired state is already true. Return `true`, not `false`:

```typescript
if (error) {
  if (error.code === '23505') return true; // already linked — idempotent success
  log('ERROR:', error);
  return false;
}
```

**Why**: callers of `linkPointToStory` use the return value to decide whether to show an orphan error flow. A unique violation isn't an error — it's idempotent success. Returning `false` incorrectly triggers fallback UX.

### Migration

Schema: `supabase/migrations/20260204_stories_points_calibration.sql`

---

## Key Routes

| Route | Purpose |
|-------|---------|
| `/` | Landing page |
| `/sign-pledge` | Pledge signup form |
| `/auth/callback` | **Critical auth handler** - do not modify without reading [authentication.md](authentication.md) |
| `/p/:id` | Public profile (`:id` is slug, not UUID) |
| `/pledgers` | Directory of verified signatories |
| `/about` | About page with contact form |
| `/settings` | User settings (authenticated) |
| `/s/:code` | Short link redirects (see `src/app/data/short-links.ts`) |

---

## TypeScript: Shared Type Shapes Across Interfaces

When two interfaces need to share the same field shape and one is defined before the other, extract a named type alias above both:

```typescript
// ✅ Extract to named alias BEFORE both interfaces
export type LiveStoryData = Pick<StoryWithAuthor, 'authorName' | ...> & { ... };

// Then reference it in both:
export interface SessionHistoryItem { storyData?: LiveStoryData; }
export interface LiveSessionState { selectedStoryData?: LiveStoryData; }
```

**Why:** `SessionHistoryItem` can't reference `NonNullable<LiveSessionState['selectedStoryData']>` if `LiveSessionState` is defined after it. The named alias solves ordering without duplication.

---

## React: `useMemo` + `?? []` Fallback Trap

Never use `?? []` directly as a `useMemo` dependency — it creates a new array reference every render:

```typescript
// ❌ Triggers lint warning — new [] on every render breaks memoization
const items = liveState.foo ?? [];
const result = useMemo(() => compute(items), [items]);

// ✅ Stabilize the fallback in its own useMemo first
const items = useMemo(() => liveState.foo ?? [], [liveState.foo]);
const result = useMemo(() => compute(items), [items]);
```

**Rule:** Anything computed with `??`, `||`, or object spread at the top level of a component needs its own `useMemo` before being used as a dependency.

---

## Common Gotchas

1. **Profile lookup**: Routes use `slug` (e.g., `/p/john-doe`), not UUID. Use `getProfileBySlug()` for routes, `getProfile(id)` when you have UUID.

2. **Auth race conditions**: The app previously had issues with "Profile Not Found" errors during auth. This was fixed by isolating profile creation in `AuthCallbackPage.tsx` (in `src/auth/`). Don't create profiles elsewhere.

3. **Witness fetching**: Always fetch witnesses separately from profiles. Nested `select()` queries don't work reliably with Supabase.

4. **Email verification**: Users aren't "verified" until they click the magic link. Profile creation happens on callback, not during signup.

5. **Navigation state**: The app uses `SimpleNavigation` component to avoid auth state flicker. Check `src/app/components/layout/simple-navigation.tsx` for current implementation.

---

## Known Issues

- Magic link auth requires correct redirect URLs in Supabase dashboard
- Profile creation must only happen in auth callback (not hooks)
- E2E tests: 6 skipped due to browser session detection limitation (see [e2e-testing.md](e2e-testing.md))
