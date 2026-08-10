# Database Schema & Data Layer

## Overview

The Clarity Pledge uses Supabase (PostgreSQL) with Row Level Security (RLS). All database interactions go through the data layer at `src/app/data/api.ts`.

---

## Tables

### profiles

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (matches auth.users.id) |
| slug | text NOT NULL | Unique URL-friendly identifier (e.g., `john-doe`). NOT NULL enforced since P736 (2026-04-17). |
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
| `story_points` | Many-to-many junction (stories ↔ points); `author_id UUID NOT NULL` + `UNIQUE(author_id, point_id)` since P465 |
| `point_positions` | Current user positions (7-point Likert) |
| `point_position_history` | Audit log of position changes (trigger) |
| `story_verifications` | /live verification records; `story_id`/`version_id` nullable since P413 |

**`system_tags` column (P630):** Both `stories` and `points` have a `system_tags text[] NOT NULL DEFAULT '{}'` column that holds system-controlled tags (`st\d+`, `v\d+`, `understanding`, `misunderstanding`). The `tags` column holds only user-created hashtags. System tags are never writable by clients — only DB triggers and migrations modify `system_tags`. A `protect_system_tags()` trigger silently prevents client mutations. The `extract_hashtags_from_content()` trigger writes only user tags to `tags`. The `sync_story_st_tags_to_points()` trigger reads/writes `system_tags`.

**Migrations:** `supabase/migrations/20260204_stories_points_calibration.sql` (initial), `20260222120000_p413_nullable_story_verifications.sql` (nullable FKs + NULL guard on `update_story_understood_count` trigger), `20260403120000_p630_system_tags.sql` (system_tags separation).

**Trigger NULL-guard pattern:** Any trigger on `story_verifications` that touches `story_id` must guard against NULL — `IF NEW.story_id IS NULL THEN RETURN NEW; END IF;` — since exchanges without a story are now valid rows.

**`stories.current_version` invariant (P833):** `stories.current_version` must always point to a row that exists in `story_versions`. Enforced by `trg_check_story_version_invariant` — a `DEFERRABLE INITIALLY DEFERRED` constraint trigger that fires at COMMIT time (after all AFTER ROW triggers, including `trg_story_initial_version`). Direct `UPDATE stories SET current_version = N` where no matching `story_versions(story_id, version_number = N)` row exists will raise at commit. `seal_and_send_letter` also runs a pre-flight LEFT JOIN IS NULL check and raises before sealing if any story has a missing version row. See `supabase/migrations/20260513000000_p833_seal_rpc_version_desync.sql` and [decisions.md § 2026-05-14](../decisions.md).

**story_versions INSERT RLS pattern (P465):** `story_versions` uses a SECURITY DEFINER trigger (`create_initial_story_version`) for auto-creation. When adding an INSERT policy, use `current_user = 'postgres'` for the trigger-context branch — NOT `auth.uid() IS NULL`. In Supabase, SECURITY DEFINER triggers run as the `postgres` role; `auth.uid() IS NULL` is too broad and also matches anonymous API callers (`anon` role). See `supabase/migrations/20260302130000_story_versions_insert_policy_v2.sql` and [decisions.md § 2026-03-02](../decisions.md).

**SECURITY DEFINER stripping risk:** Supabase `db push` or schema diff operations can silently strip `SECURITY DEFINER` from trigger functions. Never rely solely on SECURITY DEFINER to bypass RLS for triggers. Belt-and-suspenders: pair with an RLS policy that also works if the attribute is stripped (e.g., `WITH CHECK (auth.uid() = user_id)` instead of `WITH CHECK (false)`). Verify `prosecdef` in `pg_proc` after deployments. See [decisions.md § 2026-04-09 "SECURITY DEFINER can be silently stripped"](../decisions.md).

**story_points author_id (P465):** `story_points` has `author_id UUID NOT NULL` (FK to `profiles.id`) and a `UNIQUE(author_id, point_id)` constraint since P465. When inserting into `story_points` via test helpers or service layer, always look up `stories.author_id` first — don't assume it from the current session user.

**Services:** Interface-based pattern — see [architecture.md § Service Layer](architecture.md#service-layer-pattern).

**Content conventions (for agents working with stories/points data):**
- **"Latest" content** = `stories.content` or `points.statement` directly. `story_versions` is an immutable audit trail (trigger-created on every edit) — never query it to find current content.
- **Tags live in two places:** `system_tags` column (system-controlled: `st1`–`st9`, `v1`/`v2`, `understanding`/`misunderstanding`) and inline hashtags in content text (`#st8`, `#partners`). The `tags` column holds user-created hashtags extracted by trigger. To find content by topic, search content text (`ilike '%#st8%'`), not the `tags` column (which may be empty for older content).
- **Naming:** `st8` = story 8's point set. `st8-a` = anti-point for story 8 (a point with the opposing framing). Points and anti-points are both rows in `points` — no separate table.
- **Version markers:** `#v1`, `#v2` etc. appear as hashtags in content text and as `v1`, `v2` in `system_tags`. They mark content revisions. The highest version number in `system_tags` is the current version.

### Clarity Letters (P581)

Five tables for async comprehension assessment via letters.

| Table | Purpose |
|-------|---------|
| `clarity_letters` | Letter metadata (source doc, sender, mode, status) |
| `letter_deliveries` | Per-receiver tracking (token, status, progress) |
| `letter_story_snapshots` | Immutable story+version snapshots at seal time |
| `letter_predictions` | Sender's predictions per story (**sealed-bid**: receiver sees only after rating) |
| `letter_point_responses` | Forward-only receiver positions (INSERT only, no UPDATE). UNIQUE constraint `letter_point_responses_unique` on `(delivery_id, point_id)` — first write wins. |

**Column additions:** `story_verifications.source` (TEXT, default 'live'), `.verified` (BOOLEAN, default true), `.sort_order` (INTEGER), `clarity_sessions.source_letter_id` (UUID FK).

**Sealed-bid RLS:** `letter_predictions` SELECT: sender always; receiver only after matching `story_verifications` row with `source='letter'` exists. Per-story reveal, not all-or-nothing.

**Circular RLS pattern:** `_is_letter_sender()` and `_is_letter_receiver()` SECURITY DEFINER helpers break cross-table RLS recursion (letters↔deliveries). See decisions.md 2026-04-04.

**`letter_deliveries` insertion contract:** `WITH CHECK (false)` on all INSERT paths — no direct client insert ever succeeds. Four SECURITY DEFINER write paths: (1) `seal_and_send_letter` (seal-time delivery creation, P757 — lower() email→profile lookup), (2) `add_recipient_to_sealed_letter` (post-seal recipient addition, P731 — exact-match email→profile lookup), (3) `create_letter_delivery` (already-authenticated one-to-many path, P707 — uses `auth.uid()` directly), (4) `confirm-letter-response` edge function (anon→signup flow). Never add a permissive INSERT policy. **`receiver_profile_id` invariant:** every write path must attempt the profile lookup and populate `receiver_profile_id` when a match exists — NULL rows are invisible to `get_inbox_items` Branch 1. See decisions.md 2026-04-18.

**`get_inbox_items()` RPC — return shape contract** (SECURITY DEFINER, returns JSONB array, authoritative as of P755):

| Field | Branch 1 (`received`) | Branch 2 (sender view) |
|---|---|---|
| `type` | `'received'` | `'recipient_in_progress'` / `'link_respondent_in_progress'` / `'recipient_responded'` / `'link_respondent'` |
| `delivery_id` | uuid | uuid |
| `letter_id` | uuid | uuid |
| `title` | string | string |
| `actor_name` | string (sender name) | string (receiver name) |
| `actor_slug` | string (sender slug) | string or null (null for link respondents) |
| `timestamp` | `created_at` | `COALESCE(completed_at, created_at)` |
| `read_at` | timestamptz or null | timestamptz or null |
| `completed_at` | timestamptz or null | timestamptz or null |
| `stories_rated` | integer | — |
| `total_stories` | integer | — |
| `steps_completed` | integer | integer |
| `total_steps` | integer | integer |

Branch 2 WHERE: `cl.sender_id = v_user_id AND (ld.completed_at IS NOT NULL OR ld.status = 'in_progress') AND receiver_profile_id != v_user_id`. LIMIT 20, ORDER BY `(item->>'timestamp')::timestamptz DESC`. **When replacing this RPC, diff every field against this table — P725 silently dropped 5 fields by omission. See decisions.md 2026-04-18.**

**RPCs:** `get_letter_by_token`, `seal_and_send_letter` (atomic seal + content denormalization + public story filter), `reveal_prediction`, `persist_anonymous_completion`, `get_letter_for_reading` (anon-safe, token-validated), `claim_letter_delivery` (sets receiver_profile_id), `submit_point_response_by_token`, `submit_rating_by_token`, `reveal_prediction_by_token`, `update_delivery_status_by_token`.

**Anonymous engagement:** Token-based RPCs bypass RLS for anonymous recipients. Positions work anonymously; rating requires authentication (`story_verifications.listener_id` FK to profiles). `seal_and_send_letter` denormalizes `story_versions.content` + `story_points` + `point_positions` into `letter_story_snapshots.point_config` JSONB at seal time.

**`letter_point_responses` conflict handling divergence (P768):** `submit_point_response_by_token` (token RPC) uses `ON CONFLICT ON CONSTRAINT letter_point_responses_unique DO NOTHING` — crash-safe on re-open. `submitPointResponse` in `letters-service.ts` (authenticated path) uses plain `.insert()` with no conflict handling — throws 409 on re-open. Any new write path to this table must use `ON CONFLICT DO NOTHING`. Hooks that drive UI for this table must rehydrate existing rows from the DB on mount (before first render) so the insert is never attempted for already-answered points. See decisions.md 2026-04-20 [technical].

**Migrations:** `supabase/migrations/20260403224331_p581_clarity_letters.sql`, `20260404*_p642_*.sql` (4 files — reading RPC, seal denormalization, claim delivery, anon engagement RPCs)

### P703 — Letter-Sourced /live Sessions

Adds inbox-invite delivery for letter-sourced Clarity Sessions (pre-loaded baseline ratings, phase skip).

**New columns on `clarity_sessions`:**

| Column | Type | Description |
|--------|------|-------------|
| `source_story_id` | uuid FK → stories | Story being verified in this session |
| `target_listener_id` | uuid FK → profiles | Designated recipient; gates session access when set |

(Note: `source_letter_id` was added by P581 — see column additions entry above.)

**New table: `clarity_live_invites`**

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | Row id |
| `session_id` | uuid FK → clarity_sessions (CASCADE DELETE) | The session the invite points to |
| `target_user_id` | uuid FK → profiles | Recipient of the invite |
| `created_at` | timestamptz | Invite creation time |
| `updated_at` | timestamptz | Bumped by `resendLiveInvite()` to re-ping Realtime |
| `closed_at` | timestamptz | Set by `complete_clarity_session` RPC when session ends |

**Constraints:**
- `clarity_live_invites_open_unique` — partial unique index on `(target_user_id) WHERE closed_at IS NULL`. One open invite per recipient at a time.
- Server trigger: `trg_resend_rate_limit` — rejects `updated_at` bumps more than once per 30s.

**RLS on `clarity_live_invites`:**
- SELECT: recipient (`target_user_id = auth.uid()`) or session creator
- INSERT: session creator only
- UPDATE: session creator only (for resend bump + close)

**RPCs:**
- `complete_clarity_session(p_session_id uuid)` — SECURITY DEFINER; atomically sets `clarity_sessions.status = 'completed'` and `clarity_live_invites.closed_at = now()`. Called on session end for letter-sourced sessions.

**Migrations:** `supabase/migrations/20260414100001_p703_letter_sourced_live.sql`, `20260414100002_p703_live_invites_cron.sql`

---

## Row Level Security (RLS)

### profiles policies

| Policy | Who | What |
|--------|-----|------|
| Select | Anyone | RLS `using(true)` (all rows), BUT column grants restrict columns (see P877 below) |
| Insert | Authenticated | Create own profile only (`auth.uid() = id`) |
| Update | Authenticated | Update own profile only (`auth.uid() = id`) |
| Delete | Authenticated | Delete own profile only (`auth.uid() = id`) |

**P877 — column-level PII gate (email, linkedin_url, reason):** RLS is row-level only; it does not gate columns. `anon`+`authenticated` have a column-scoped `GRANT SELECT` on the non-sensitive columns only — `email`/`linkedin_url`/`reason` are **not** directly selectable (or filterable in a WHERE) by either role (returns `42501`). Read/write them via the `SECURITY DEFINER` accessors instead:
- `get_profile_by_id(uuid)` / `get_profile_by_slug(text)` — display fields always; `email` → owner only; `linkedin_url`/`reason` → verified+pledged (public-by-design) or owner
- `get_featured_profiles(int)` — verified+pledged list for the public wall / `/pledgers` (no email)
- `get_my_profile_by_email(text)` — own row by email (`/live` migration); rejects other emails
- `lookup_party_by_email(text)` — resolve an invitee to a party (no email out); authenticated only
- `email_exists(text)` — login email check (boolean only)
- `upsert_my_profile(jsonb)` — own-row write (forces `id = auth.uid()`); needed because `.upsert()` reads `EXCLUDED.email` which requires the revoked SELECT privilege

A **new** profiles column is not readable by anon/authenticated until added to the column GRANT in `20260602160000_p877_profiles_pii_column_grants.sql` (intentional default-deny). See decisions.md 2026-06-04 [technical].

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

## Profile Deletion — FK-aware pre-flight required

Deleting a profile is not a one-call cascade. `profiles.id REFERENCES auth.users(id) ON DELETE CASCADE` only deletes the `profiles` row itself. Children of `profiles` have their own ON DELETE clauses, and **most are NO ACTION or RESTRICT** — they will block the delete with an FK violation if any row exists.

Before any code path deletes a profile (`auth.users` DELETE, admin tool, GDPR erasure flow, test-data cleanup), classify the profile children:

**BLOCKING** (NO ACTION / RESTRICT — non-zero row count blocks the delete):

| Table | Column | Clause | Source |
|---|---|---|---|
| `clarity_sessions` | `creator_profile_id` | NO ACTION | `20260204_stories_points_calibration.sql:152` |
| `clarity_sessions` | `joiner_profile_id` | NO ACTION | `20260204_stories_points_calibration.sql:153` |
| `clarity_sessions` | `target_listener_id` | NO ACTION | `20260414100001_p703_letter_sourced_live.sql:24` |
| `clarity_letters` | `sender_id` | NO ACTION | `20260403224331_p581_clarity_letters.sql:18` |
| `letter_deliveries` | `receiver_profile_id` | NO ACTION | `20260403224331_p581_clarity_letters.sql:36` |
| `clarity_docs` | `owner_id` | NO ACTION | `20260326100454_p551_clarity_docs.sql:15` |
| `clarity_agreements` | `creator_profile_id` | RESTRICT | `20260224150000_p422_clarity_agreements.sql:12` |
| `clarity_agreements` | `partner_profile_id` | RESTRICT | `20260224150000_p422_clarity_agreements.sql:13` |
| `email_send_log` | `profile_id` | NO ACTION | `20260314123817_add_email_send_log.sql:8` |
| `story_verifications` | `speaker_id` | NO ACTION | `20260204_stories_points_calibration.sql:121` |
| `story_verifications` | `listener_id` | NO ACTION | `20260204_stories_points_calibration.sql:122` |

CASCADE/SET NULL children (e.g., `events.host_id`, `event_rsvps.profile_id`, `event_practice_rooms.creator_id`, `event_sub_rooms.initiator_id`/`target_id`, `stories.author_id`, `points.first_validator_id`, `point_ratings.user_id`, `point_user_status.user_id`, `badge_points.user_id`/`verified_by`, `witnesses.profile_id`, `clarity_agreements.terminated_by` SET NULL) handle themselves and do not block.

**Pre-flight pattern (re-derive each run — snapshot drifts):**
```bash
grep -nE "REFERENCES (public\.)?(profiles|auth\.users)" supabase/migrations/*.sql
```
For each match, read the `CREATE TABLE` block (not just the line) to attribute the column to the correct table — multi-table migrations make line-grep misleading. Then classify by the ON DELETE clause and probe row counts for each candidate via REST `?<col>=eq.<uid>&select=id` with `Prefer: count=exact`.

If any BLOCKING row exists: deletion requires either explicit DELETE/NULL of those rows first under approval, or rejecting the operation. See `.claude/commands/slava/maintain/clean-test-users.md` for the canonical workflow.

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

**Prod gates (P887, after the P886 auth outage):** `./scripts/migrate.sh --env prod` enumerates every pending migration upfront and refuses without explicit ack (interactive `y/N`, or `--yes` for non-interactive runs). A pending migration carrying `-- requires-frontend: <commit-sha>` hard-blocks the apply — `--yes` does not bypass — until that commit is an ancestor of `origin/main` (fail-safe: malformed marker or git failure also blocks). After any successful prod run the script auto-runs `node scripts/prod-smoke-test.mjs` and exits non-zero on failure. **Authoring rule:** a new migration containing client-breaking shapes (REVOKE from `anon`/`authenticated`, `DROP POLICY`, `DROP COLUMN`, column type change) must carry `-- requires-frontend: <sha>` or `-- client-safe: <reason>` — enforced by pre-commit via `scripts/check-migration-client-safety.sh`. Regression canary: `src/tests/p887-reproduce.test.ts`.

**RLS scoping rule (P1039, after the P1035 unscoped-service-role-bypass incident; hardened P1041):** a new or modified migration's `CREATE POLICY` for a non-SELECT command (`INSERT`/`UPDATE`/`DELETE`/`ALL`, or `FOR` omitted) whose `USING`/`WITH CHECK` clause is a literal `true` or a role-identity function (`current_setting('role')`, `auth.role()`, `auth.jwt() ->> 'role'`) must carry an explicit, non-`PUBLIC` `TO <role>` clause — omitting it, or including `PUBLIC` in the role list, silently defaults to every role including unauthenticated. `ALTER POLICY ... TO PUBLIC` (widening an existing policy) is also flagged. Public SELECT policies are never flagged (normal, common pattern). Exempt with `-- intentionally-public: <reason>` when the policy is deliberately open to all roles. Enforced by pre-commit via `scripts/check-rls-scope.py` against a tokenizer that blanks single/double-quoted content, `/* */` comments, and `$$...$$` dollar-quoting before matching (P1041 fixed false negatives where a policy's own quoted name, or an apostrophe in an unmodeled construct elsewhere in the file, defeated detection). Regression canaries: `src/tests/p1039-reproduce.test.ts`, `src/tests/p1041-reproduce.test.ts`.

**P417 caveat — migration history ≠ schema truth:** The Supabase Management API can return HTTP 200 with a JSON error body (`{"message":...,"code":...}`) when SQL fails. Before P417 fix, this caused `apply_via_api()` to record a migration as applied even when the schema change never executed. Fixed in `scripts/migrate.sh` — `_check_api_success()` now validates the response body, not just HTTP status. If you suspect silent drift, verify the column/index actually exists:
```bash
curl -s "https://<project-ref>.supabase.co/rest/v1/<table>?select=<column>&limit=1" \
  -H "apikey: <anon-key>" -H "Authorization: Bearer <anon-key>"
# Error 42703 = column missing despite migration showing "applied"
```

**Rule:** one file per day, or use 14-digit timestamps (`YYYYMMDDHHMMSS`) if you need multiple same-day migrations. All migration SQL must be idempotent (`CREATE OR REPLACE`, `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`). See [cli-tools.md](cli-tools.md) for details.

**`RETURNS TABLE` column name gotcha — `position` is reserved.** When writing a `RETURNS TABLE (...)` signature in a PostgreSQL function, `position` is a reserved keyword and causes a parse error if used as a column name. Use an alias: e.g., `response_position TEXT` instead of `position TEXT`. The alias must then be referenced consistently in the `SELECT` clause (`SELECT lpr.position::TEXT AS response_position`). Confirmed in P768 migration `20260420120000_p768_get_letter_point_responses_by_token.sql`.
