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

### Profile Display — Dual Position Fields

When rendering a profile page visited by someone other than the owner, `getPointsForProfileDisplay(validatorId, viewerUserId)` populates two position fields on each point:

| Field | Meaning | Use for |
|-------|---------|---------|
| `point.userPosition` | Viewer's own position | Action buttons (what the visitor selected) |
| `point.profileSubjectPosition` | Profile owner's own position | Display badge (what the owner believes) |

Self-view: when `viewerUserId === validatorId`, both fields resolve from the same batch. The batch loading strategy is encapsulated in the service method — callers don't need to manage it.

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
