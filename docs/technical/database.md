# Database Schema & Data Layer

## Overview

The Clarity Pledge uses Supabase (PostgreSQL) with Row Level Security (RLS). All database interactions go through the data layer at `src/app/data/api.ts`.

---

## Tables

### profiles

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (matches auth.users.id) |
| slug | text | Unique URL-friendly identifier (e.g., `john-doe`) |
| email | text | User's email |
| name | text | User's full name |
| role | text | Job title/role (optional) |
| linkedin_url | text | LinkedIn profile (optional) |
| reason | text | Why they signed the pledge |
| avatar_color | text | Profile color theme |
| is_verified | boolean | Email verified status |
| created_at | timestamp | Signup timestamp |
| updated_at | timestamp | Last update timestamp |

### witnesses

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| profile_id | uuid | Foreign key to profiles |
| witness_name | text | Endorser's name |
| witness_linkedin_url | text | Endorser's LinkedIn (optional) |
| witness_profile_id | uuid | FK if witness is also a user (optional) |
| is_verified | boolean | Endorsement verified status |
| created_at | timestamp | Endorsement timestamp |

### Profile Extensions (P117)

| Column | Type | Description |
|--------|------|-------------|
| ears_count | integer | Successful listener verifications (≥8/10) |
| verification_session_count | integer | Total verification sessions participated in |

Both maintained by database triggers. Calibration averages computed on-read via `AVG()`.

### clarity_sessions (Session Linking)

| Column | Type | Description |
|--------|------|-------------|
| creator_profile_id | uuid | FK to profiles (set when authenticated user creates) |
| joiner_profile_id | uuid | FK to profiles (set when authenticated user joins) |
| live_state | jsonb | Shared real-time session state (see below) |

#### live_state mutation contract (P399)

`live_state` is a JSON blob written by both participants concurrently. **Never do a full read-modify-write from local state.** Two write modes are enforced in `updateLiveState()`:

| Mode | When | DB call |
|------|------|---------|
| **Partial merge** | Updates don't include story/content fields | `patch_live_state(id, updates)` — `jsonb \|\|` merge; preserves all other fields |
| **Full overwrite** | Updates intentionally set or clear story fields | `updateClaritySessionLiveState(id, fullState)` — replaces entire column |

**`patch_live_state` RPC** (`supabase/migrations/20260220130000_patch_live_state_rpc.sql`):
```sql
UPDATE clarity_sessions
SET live_state = COALESCE(live_state, '{}') || p_patch
WHERE id = p_session_id;
```

**Why this matters:** `confirmedLiveStateRef.current` (the local "last confirmed" ref) can be stale if a subscription event was skipped while a write was in-flight. A full overwrite from a stale ref silently clears fields written by the partner. The partial merge makes stale-ref writes safe by default.

### event_practice_rooms (P406 — Practice Rooms)

Enables participants to signal session readiness on an event page without out-of-band link exchange.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| event_id | uuid | FK → events (CASCADE DELETE) |
| creator_id | uuid | FK → profiles |
| session_id | uuid | FK → clarity_sessions (SET NULL on delete) |
| status | text | `waiting` \| `active` \| `closed` |
| created_at | timestamptz | Row creation time |
| expires_at | timestamptz | Default: `NOW() + 30 min`; rooms past this are excluded from polling |

**Constraints:**
- `idx_one_waiting_room_per_creator` — partial unique index on `(event_id, creator_id) WHERE status = 'waiting'`. One open room per person per event.

**RLS:**
- SELECT: public read (anyone can see open rooms)
- INSERT: `auth.uid() = creator_id`
- UPDATE: creator can update (close), joiner can set `status = 'active'`

**Service query pattern:** `getPracticeRooms` uses PostgREST FK join syntax to pull creator profile and session code in one query:
```
event_practice_rooms
  *, creator:profiles!event_practice_rooms_creator_id_fkey(name, slug, avatar_color, avatar_url),
     session:clarity_sessions!event_practice_rooms_session_id_fkey(code)
WHERE status IN ('waiting', 'active') AND expires_at > NOW()
```

### Stories, Points & Calibration Tables (P117)

Seven tables added by P117. Full schema details in [architecture.md](architecture.md#stories-points-and-calibration-api).

| Table | Purpose |
|-------|---------|
| `stories` | User-created content (title, content, understood_count) |
| `story_versions` | Immutable snapshots, auto-created by trigger |
| `points` | Statements users take positions on |
| `story_points` | Many-to-many junction (stories ↔ points) |
| `point_positions` | Current user positions (7-point Likert) |
| `point_position_history` | Audit log of position changes (trigger) |
| `story_verifications` | /live verification records; `story_id`/`version_id` nullable since P413 |

**Migrations:** `supabase/migrations/20260204_stories_points_calibration.sql` (initial), `20260222120000_p413_nullable_story_verifications.sql` (nullable FKs + NULL guard on `update_story_understood_count` trigger).

**Trigger NULL-guard pattern:** Any trigger on `story_verifications` that touches `story_id` must guard against NULL — `IF NEW.story_id IS NULL THEN RETURN NEW; END IF;` — since exchanges without a story are now valid rows.

**Services:** Interface-based pattern — see [architecture.md § Service Layer](architecture.md#service-layer-pattern).

---

## Row Level Security (RLS)

### profiles policies

| Policy | Who | What |
|--------|-----|------|
| Select | Anyone | Read all profiles (public) |
| Insert | Authenticated | Create own profile only (`auth.uid() = id`) |
| Update | Authenticated | Update own profile only (`auth.uid() = id`) |
| Delete | Authenticated | Delete own profile only (`auth.uid() = id`) |

### witnesses policies

| Policy | Who | What |
|--------|-----|------|
| Select | Anyone | Read all witnesses (public) |
| Insert | Authenticated | **Any user can add witness to any profile** |
| Update | Authenticated | Update own witness records |
| Delete | Authenticated | Delete own witness records |

**Design Decision:** The witnesses insert policy intentionally allows ANY authenticated user to add witnesses to ANY profile. This enables users to endorse someone's pledge without requiring the endorsee to have an account. This is a feature, not a security gap.

### P117 table policies

See [architecture.md § RLS Policies](architecture.md#rls-policies) for the full matrix covering stories, points, positions, verifications, and related tables.

### stories visibility policy (P424)

The `stories` SELECT policy enforces three branches based on the `visibility` column (type `story_visibility` enum: `'public'`, `'shared'`, `'private'`):

```sql
CREATE POLICY "Stories readable by visibility"
  ON stories FOR SELECT USING (
    visibility = 'public'
    OR author_id = auth.uid()
    OR (
      visibility = 'shared'
      AND auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM event_rsvps reader_rsvp
        WHERE reader_rsvp.profile_id = auth.uid()
          AND EXISTS (
            SELECT 1 FROM event_rsvps author_rsvp
            WHERE author_rsvp.event_id = reader_rsvp.event_id
              AND author_rsvp.profile_id = stories.author_id
            UNION ALL
            SELECT 1 FROM events hosted
            WHERE hosted.id = reader_rsvp.event_id
              AND hosted.host_id = stories.author_id
          )
      )
    )
  );
```

**`shared` access logic:** A reader can see a `shared` story if both the reader and the author attended (or hosted) the same event. The UNION ALL handles the case where the author is the event host — hosts may not have an `event_rsvps` row.

**Column default:** `visibility` column defaults to `'private'` (changed from `'public'` in P424 migration `20260224120000_p424_visibility_model.sql`).

**Client-side gate rule:** Remove any `if (story.visibility !== 'public') continue` guards once RLS is the enforcement layer. `getStory()` returning null = unauthorized — no need to distinguish "not found" from "forbidden" (enumeration prevention). Any consumer filtering by `visibility` in application code is a bug.

**Feed vs. contextual queries:** `getStoriesFeed()` has an explicit `.eq('visibility','public')` filter — shared stories are intentionally excluded from global discovery. `getStoriesForPoints()` trusts RLS — shared stories surface in point context for co-registrants.

---

## Data Layer (api.ts)

Location: [src/app/data/api.ts](../../src/app/data/api.ts)

All Supabase interactions go through this file.

### Key Functions

| Function | Purpose |
|----------|---------|
| `createProfile()` | Sends magic link only. Does NOT write to database. |
| `getProfile(id)` | Fetch profile by UUID |
| `getProfileBySlug(slug)` | Fetch profile by URL slug |
| `updateProfile()` | Update profile data |
| `getWitnesses(profileId)` | Fetch witnesses for a profile |
| `addWitness()` | Add endorsement to a profile |

### Critical Pattern: Separate Fetching

Always fetch profiles and witnesses separately:

```typescript
// Good - separate queries
const profile = await getProfileBySlug(slug);
const witnesses = await getWitnesses(profile.id);

// Bad - nested select (unreliable with Supabase PostgREST)
const { data } = await supabase
  .from('profiles')
  .select('*, witnesses(*)');  // Don't do this
```

---

## Type Definitions

Location: [src/app/types/index.ts](../../src/app/types/index.ts)

### Profile

```typescript
interface Profile {
  id: string;           // UUID from auth.users
  slug: string;         // URL-friendly identifier (used in routes)
  name: string;
  email: string;
  role?: string;
  linkedinUrl?: string;
  reason?: string;
  signedAt: string;
  isVerified: boolean;
  witnesses: Witness[];
  reciprocations: number;
  avatarColor?: string;
}
```

### Witness

```typescript
interface Witness {
  id: string;
  name: string;
  linkedinUrl?: string;
  timestamp: string;
  isVerified: boolean;
}
```

### Database ↔ Frontend Mapping

Database uses snake_case, frontend uses camelCase. The `mapProfileFromDb()` function handles conversion:

| Database | Frontend |
|----------|----------|
| `linkedin_url` | `linkedinUrl` |
| `created_at` | `signedAt` |
| `avatar_color` | `avatarColor` |
| `is_verified` | `isVerified` |

---

## Slug Generation

Slugs are URL-friendly identifiers generated from names:
- `John Doe` → `john-doe`
- Must be unique in the database

### Conflict Resolution

The `generateSlug()` function in api.ts creates slugs. Conflict handling happens in AuthCallbackPage.tsx:

1. Try `john-doe`
2. If taken, try `john-doe-2`, `john-doe-3`
3. After 3 retries, fall back to timestamp: `john-doe-1733270400000`

### Client-Side Trade-off

The slug conflict resolution runs in the browser, not in a database function. This is deliberate:

**Why not server-side:**
- Supabase doesn't support custom server functions without Edge Functions
- Edge Functions add deployment complexity for a simple operation

**Safety guarantees:**
- Retry loop (up to 3 attempts) ensures eventual success
- Timestamp fallback guarantees uniqueness
- Worst case: user gets `john-doe-1733270400000` instead of `john-doe-2`

**Risk accepted:**
- If browser closes mid-transaction, user can re-verify via magic link
- No data corruption possible (profile just won't exist)

---

## No Database Trigger

**Important:** There is NO database trigger for profile creation.

The old `handle_new_user()` trigger was removed (2025-12-04) because it created profiles with NULL slugs. Profile creation now happens ONLY in AuthCallbackPage.tsx after email verification.

This means:
- You cannot rely on a trigger to create profiles
- Profile creation is explicit and controlled
- Slug is always set correctly

---

## Common Queries

### Profile by slug (for routes)

```typescript
import { getProfileBySlug } from '@/app/data/api';

// Routes use slug: /p/john-doe
const profile = await getProfileBySlug('john-doe');
```

### Profile by UUID (when you have the ID)

```typescript
import { getProfile } from '@/app/data/api';

const profile = await getProfile(userId);
```

### Witnesses for a profile

```typescript
import { getWitnesses } from '@/app/data/api';

const witnesses = await getWitnesses(profile.id);
```

---

## Schema Files

| File | Purpose |
|------|---------|
| [supabase/schema.sql](../../supabase/schema.sql) | Base schema (profiles, witnesses) |
| [supabase/migrations/20260204_stories_points_calibration.sql](../../supabase/migrations/20260204_stories_points_calibration.sql) | P117: Stories, Points, Calibration tables + triggers |

**Migration workflow:** Create a `.sql` file in `supabase/migrations/` with a unique timestamp name, then run:
```bash
./scripts/migrate.sh
```
Primary path: `supabase db push`. Automatic fallback: Supabase Management API (used when the CLI fails due to branch divergence from main). The fallback reads the PAT from the macOS keychain and applies unapplied migrations directly.

**P417 caveat — migration history ≠ schema truth:** The Supabase Management API can return HTTP 200 with a JSON error body (`{"message":...,"code":...}`) when SQL fails. Before P417 fix, this caused `apply_via_api()` to record a migration as applied even when the schema change never executed. Fixed in `scripts/migrate.sh` — `_check_api_success()` now validates the response body, not just HTTP status. If you suspect silent drift, verify the column/index actually exists:
```bash
curl -s "https://<project-ref>.supabase.co/rest/v1/<table>?select=<column>&limit=1" \
  -H "apikey: <anon-key>" -H "Authorization: Bearer <anon-key>"
# Error 42703 = column missing despite migration showing "applied"
```

**Rule:** one file per day, or use 14-digit timestamps (`YYYYMMDDHHMMSS`) if you need multiple same-day migrations. All migration SQL must be idempotent (`CREATE OR REPLACE`, `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`). See [cli-tools.md](cli-tools.md) for details.
