---
status: in-progress
delivery_stage: arch-review
type: story
rank: 8.0
workstream: C1
tags: [visibility, privacy, stories, rls]
created_date: '2026-02-24'
---

# P424: Visibility Model Rethink

## Problem

The current visibility model conflates "private" with "author-only," which is confusing and limits sharing intent.

Additionally:
- "Shared" is not enforced — it currently behaves like "private" (deferred implementation).
- The current "Shared" tooltip is wrong: "Visible only in /live sessions you share it in" — this is not what "shared" means.
- The UI order is not intuitive (defaults to Public on the left).
- The default visibility is Public, which is a privacy risk for new users.
- There is no way to edit visibility after a story is created.

## Proposed Model

| Level   | Meaning                                                              |
|---------|----------------------------------------------------------------------|
| Private | Author manually controls who sees it (person-by-person sharing). Not author-only — others can be granted access explicitly. |
| Shared  | Anyone who has registered for any event the story author has registered for or hosted — past, present, or future signups — can see it automatically. |
| Public  | Anyone (logged in or not) can see it.                                |

**Note on "Shared" semantics:** The scope is event co-registration, not event attendance. If author and reader both registered for the same event (at any time), the story is readable. This enables discoverability: future registrants of that event also gain access when they sign up.

## Scope

### 1. RLS Policy Update

- `private`: author + explicitly granted users (grant table or similar mechanism TBD at architect stage).
- `shared`: author + all users who share event co-registration with the author (join via `event_attendees` or equivalent — any event where both author and reader have a registration record).
- `public`: no restriction (current behavior).

### 2. "Shared" Enforcement Fix

Currently `shared` behaves like `private` — the RLS policy for `shared` is not implemented. This spec fixes that: users who co-registered for any event with the author must be able to read shared stories.

### 3. UI Order Change

Left → right order must be: **Private → Shared → Public** (currently defaults to Public first).

### 4. Default Visibility Change

Change default from `public` to `private` — safer default for new stories.

### 5. UI Copy Update

- Labels and tooltips must reflect the new mental model.
- "Private" tooltip: "Only people you explicitly share with can view this."
- "Shared" tooltip: "Visible to anyone who has registered for an event you've also registered for or hosted — including future registrants."
- "Public" tooltip: "Anyone can view this."

### 6. Edit Visibility on Existing Stories

Add a visibility selector to the story edit/detail view so authors can change visibility after creation. The backend already supports this (`updateStory()` accepts a `visibility` field) — this is a UI gap only.

## Out of Scope

- Per-user explicit grant UI (P-by-P sharing UI for Private) — this spec only fixes the model and RLS. The grant UI can be a follow-on spec.
- Notification to attendees when a story is shared.

## Acceptance Criteria

- [ ] RLS policies updated for all three visibility levels.
- [ ] `shared` stories are readable by users who co-registered for any event with the author.
- [ ] UI toggle order is Private → Shared → Public.
- [ ] Default visibility for new stories is `private`.
- [ ] Tooltip copy matches the new mental model (including fixing the wrong "Shared" tooltip).
- [ ] Author can change visibility on an existing story (edit UI added).
- [ ] Existing `public` and `private` stories are unaffected in intent (data migration not required unless schema changes demand it).
- [ ] `createStory` TypeScript default, `mapStoryFromDb` fallback, and `updateStory` return fallback all updated to `'private'` — not just the DB column default and UI state.
- [ ] `getStoriesFeed()` has an explicit `.eq('visibility', 'public')` filter — shared stories do not appear in the global feed.

---

## Technical

### Technical Analysis

#### Current State

**RLS policy (`20260206_add_story_visibility.sql`):**
```sql
CREATE POLICY "Stories readable by visibility"
  ON stories FOR SELECT USING (
    visibility = 'public'
    OR author_id = auth.uid()
  );
```
"Shared" is silently collapsed to author-only. No join to any event registration table. This was an explicit deferral noted in the migration comment.

**Visibility column:** Defined as a proper PostgreSQL enum `story_visibility` (added in `20260209_add_story_visibility_enum.sql`), values `('public', 'shared', 'private')`. No schema change needed for P424 — the enum already has the right values.

**`event_rsvps` table schema (from `20260118_create_events.sql`):**
- `event_id UUID` — references `events(id)`
- `profile_id UUID` — references `profiles(id)`
- `UNIQUE(event_id, profile_id)`
- RLS: SELECT is open (`USING (true)`), INSERT requires `auth.uid() = profile_id`

This is the registration table that backs the "shared" semantic. The spec calls it `event_attendees` — the actual table is `event_rsvps`. No alias or new table needed.

**"Co-registration" join logic** for the RLS `shared` condition:
> Reader and author share at least one event_rsvps record on the same event_id. Also: if the author is the host of the event, they count as a registrant via `events.host_id`.

The spec says "registered for or hosted." This means the author's participation in an event includes both `event_rsvps.profile_id = author_id` AND `events.host_id = author_id`. The reader's participation is always via `event_rsvps.profile_id = reader_id` (hosts can also RSVP themselves, but the simpler read: readers access via event_rsvps; author access qualification includes host role).

**`updateStory()` in `stories-service-real.ts`:** Already accepts `{ visibility?: StoryVisibility }` and writes it to the database. No backend change needed.

**`story-detail-page.tsx` — current visibility enforcement:** Done client-side at line 460:
```typescript
if (data.visibility !== 'public' && data.authorId !== user?.id) {
  setError('private');
}
```
This must be relaxed for `shared` stories visible to co-registrants — the RLS policy will be the real enforcement. The client-side check should only block if RLS returns null (i.e., `getStory` returns null for unauthorized readers).

**`create-story-page.tsx` — current UI state:**
- VISIBILITY_OPTIONS order: `['public', 'shared', 'private']` — needs reversal to `['private', 'shared', 'public']`
- Default state: `useState<StoryVisibility>('public')` — needs to change to `'private'`
- Tooltip for shared: `'Visible only in /live sessions you share it in'` — wrong, must be updated

**`visibility-badge.tsx`:** Same stale description for `shared`: `'Visible only in /live sessions you share it in'`. Needs update.

**`profile-page-v2.tsx`:** Uses `getStoriesByAuthorWithPoints()` which calls `getStoriesByAuthor()`. That query selects from `stories` with no explicit visibility filter — RLS handles filtering. Profile page therefore automatically respects RLS; no code change needed there. However, there is a stale `AdaptedStory` interface with `visibility: 'public'` hardcoded (line 72) — this should be updated to `StoryVisibility` for correctness but is display-only and low risk.

**`getStoriesForPoints()` in stories-service-real.ts:** Currently hard-filters to `visibility !== 'public'` in client-side code (line 560). This should be relaxed — let RLS decide what comes back, remove the explicit `public`-only client filter. Shared stories accessible to the viewer will naturally pass through RLS.

---

### Architecture Decisions

#### Decision 1: How to model the "shared" RLS JOIN

**Chosen:** Direct correlated EXISTS subquery in the RLS policy joining `event_rsvps` and `events`.

**Rationale:** `event_rsvps` is already the authoritative co-registration table with a `UNIQUE(event_id, profile_id)` index. An EXISTS subquery is evaluated per-row by Postgres and will use this index efficiently. No new table, no denormalization, no maintenance burden. The join is readable and matches the spec semantics exactly.

**RLS condition for `shared`:**
```sql
(
  visibility = 'shared'
  AND (
    author_id = auth.uid()
    OR EXISTS (
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
)
```

**Trade-off:** More complex RLS expression than the current one. Postgres evaluates RLS per row, so this adds a subquery per `shared` story read. With the existing `idx_event_rsvps_profile` and `idx_event_rsvps_event` indexes, this should be fast at current scale. If the platform grows to tens of thousands of stories and users, a materialized summary table could be added later.

**Alternative rejected — denormalized `story_access` table:** A pre-computed table of `(story_id, viewer_id)` pairs would give O(1) lookups but requires triggers or background jobs to stay current as RSVPs change. This is premature complexity for current scale, and it duplicates the source-of-truth logic.

**Alternative rejected — Postgres function `user_can_read_story()`:** Would encapsulate the logic nicely but adds a schema object that must be migrated and maintained. For a single call site (the RLS policy), inlining the EXISTS is cleaner.

---

#### Decision 2: New migration vs. updating existing

**Chosen:** New migration file with a 14-digit timestamp, e.g., `20260224120000_p424_visibility_model.sql`.

**Rationale:** The existing migration `20260206_add_story_visibility.sql` is already applied to production. Editing it would not re-run it. All schema changes must go in a new file to flow through `./scripts/migrate.sh`.

**Trade-off:** Policy history is spread across two files. Acceptable — the new file is self-documenting and the old file comment already notes the deferral.

**Migration approach:** The new migration must:
1. `DROP POLICY IF EXISTS "Stories readable by visibility" ON stories;` (the current deferred policy)
2. `CREATE POLICY` with the full three-branch USING clause (public, shared with EXISTS, private/author-only)
3. Idempotent: wrap in `DO $$ ... $$` or use `DROP IF EXISTS + CREATE`. No data migration needed — enum values and existing rows are unchanged.

---

#### Decision 3: Edit-visibility UI placement

**Chosen:** Inline selector on `story-detail-page.tsx`, visible only to the author, positioned below the story card.

**Rationale:** The spec states the backend already supports `updateStory({ visibility })`. The simplest UI is a compact inline toggle (same pattern as the create-story visibility selector, reusing `VISIBILITY_OPTIONS`). No modal required — the change is low-stakes and immediately visible. Authors are already on the detail page after creation; this is where they expect to manage their story.

**Implementation:** Add a `VisibilitySelector` component (or inline the toggle) in an author-only section below `StoryCardDetail`. On change, call `storiesService.updateStory(story.id, { visibility: newValue })` and update local state. Show a brief toast on success. No navigation needed.

**Trade-off:** Visibility control is split between creation (create-story-page) and editing (story-detail-page). Acceptable — the create page is where first-time defaults matter most; the detail page is where post-creation changes happen. A future unified edit page could consolidate these.

**Alternative rejected — modal from the VisibilityBadge click:** Clicking the badge in the story header to open a popover is more discoverable but adds complexity (popover state, outside-click handling). The inline author section is simpler and consistent with how key-points management is already done on this page.

---

### Security Review

**RLS Policies:**
- ⚠️ The actual table is `event_rsvps` (not `event_attendees` as the spec originally said). Migration must use `event_rsvps` with `profile_id` as the attendee column — the architect's SQL above already reflects this correctly.
- ⚠️ **"Shared" scope is permanently expanding.** Once a story is set to `shared`, future RSVPs to any event the author ever attended automatically gain read access. An author who shared when 5 people were registered may find it visible to 50+ over time, with no audit trail of current audience. This is not a security bug — it is the intended model — but the UI tooltip should warn authors: "Anyone who has registered or will register for an event you've attended can view this."
- ⚠️ The proposed RLS policy uses a correlated EXISTS subquery. Performance is safe at current scale because `UNIQUE(event_id, profile_id)` on `event_rsvps` automatically creates a btree index covering the join. No additional index migration needed.
- ✅ `event_rsvps` SELECT RLS is `USING (true)` — the subquery executes under the caller's role and sees all RSVPs without needing `SECURITY DEFINER` elevation.
- ✅ The new migration must `DROP POLICY IF EXISTS "Stories readable by visibility" ON stories` before creating the replacement — avoids duplicate-policy errors.

**Authentication:**
- ✅ `createStory` ignores the caller-supplied `_authorId` and always sets `author_id` to `supabase.auth.getUser()` — correct defense-in-depth.
- ⚠️ `updateStory` issues the UPDATE without an explicit session check, relying entirely on `auth.uid() = author_id` in the RLS policy. If the user is unauthenticated, `auth.uid()` returns null, the UPDATE silently returns 0 rows, and the service returns `null`. Safe now — but fragile if anon access is added later. Document as known pattern; no change required for this spec.

**Authorization:**
- ✅ UPDATE RLS policy enforces `auth.uid() = author_id` — a user cannot change another user's story visibility.
- ✅ `author_id` is set server-side on insert; no caller can inject a different owner.
- ⚠️ The `private` grant table (for person-by-person sharing) is correctly deferred. The migration must NOT pre-implement a grant-table join for `private` — the table doesn't exist yet and would cause a deploy error. `private` remains author-only until the grant UI spec ships.

**Input Validation:**
- ✅ `visibility` is a Postgres ENUM type — invalid values are rejected at the DB level before any application logic runs.
- ✅ TypeScript `StoryVisibility` type provides compile-time validation.
- ⚠️ **Both the DB column default and the TypeScript function default must change.** `createStory` has `visibility: StoryVisibility = 'public'` as a parameter default (line ~135 in `stories-service-real.ts`). If only the DB default is changed via `ALTER COLUMN`, callers that omit `visibility` will still send `'public'` explicitly, overriding the DB default. Change both: DB column default + TypeScript default parameter.
- ⚠️ `mapStoryFromDb` fallback (`?? 'public'`) and `updateStory` return fallback (`?? 'public'`) will be inconsistent after the default changes. Update both fallbacks to `'private'` or eliminate them (the column is already `NOT NULL`, so null is not expected).

**Data Protection:**
- ✅ Changing the default to `'private'` does not backfill existing rows — column is already `NOT NULL DEFAULT 'public'`; only new inserts are affected.
- ⚠️ The "shared" RLS join indirectly reveals event co-registration: a reader who can see a `shared` story can infer "this author and I share an event." Low severity — `event_rsvps` SELECT is already `USING (true)` (RSVPs are publicly readable), so no new information is technically exposed.
- ⚠️ `getStoriesFeed` has no explicit visibility filter in the service layer — it relies entirely on RLS. After the new policy lands, it will return `shared` stories to co-registered users. If the intent is to surface only public stories in the general feed, add `.eq('visibility', 'public')` to the query and treat RLS as a safety net rather than the sole filter. Confirm intended feed behavior before shipping.

---

### Implementation Approach

#### Files to Create

- `supabase/migrations/20260224120000_p424_visibility_model.sql` — new RLS policy replacing the deferred one.

#### Files to Modify

| File | What Changes |
|------|-------------|
| `src/app/pages/create-story-page.tsx` | Reorder `VISIBILITY_OPTIONS` to `['private', 'shared', 'public']`; change default state from `'public'` to `'private'`; update `shared` tooltip copy. |
| `src/app/components/shared/visibility-badge.tsx` | Update `shared` description from stale `/live sessions` copy to new tooltip copy. Update `private` description to match spec copy. |
| `src/app/pages/story-detail-page.tsx` | Relax client-side visibility gate (lines ~460): remove the `data.visibility !== 'public'` short-circuit for shared stories visible via RLS — instead rely on `getStory()` returning null for unauthorized readers. Add author-only `VisibilitySelector` inline below `StoryCardDetail`. |
| `src/app/data/stories-service-real.ts` | `getStoriesForPoints()`: remove explicit `visibility !== 'public'` client-side filter (line ~560); let RLS decide. Co-registered users should see shared stories on a specific point page — this is contextually appropriate. |
| `src/app/data/stories-service-real.ts` | `getStoriesFeed()`: add explicit `.eq('visibility', 'public')` filter. Shared stories must NOT appear in the global discovery feed — "shared" means peer visibility within event circles, not broadcast. Per-event feed (future spec) will handle contextual shared story discovery. |
| `src/app/data/stories-service-real.ts` | Change `createStory` TypeScript function default from `visibility: StoryVisibility = 'public'` to `= 'private'`. Also update `mapStoryFromDb` fallback (`?? 'public'` → `?? 'private'`) and `updateStory` return fallback (same). These three changes must ship together with the DB column default migration — if only the DB default is changed, explicit `'public'` sent from the application layer overrides it. |
| `src/app/pages/profile-page-v2.tsx` | Update `AdaptedStory.visibility` type from `'public'` literal to `StoryVisibility` (minor correctness fix). |

#### Build Sequence

1. **Migration first** — write and run `./scripts/migrate.sh` so the new RLS is live on test before any UI change is deployed.
2. **UI copy + order** — update `create-story-page.tsx` and `visibility-badge.tsx`. These are safe to deploy before or after the RLS change (no functional dependency).
3. **Story detail page** — relax client-side gate, add inline visibility selector for authors.
4. **Service layer** — remove client-side `public`-only filter in `getStoriesForPoints`.
5. **Verification** — test with two users who share an event RSVP; confirm shared story is readable by co-registrant and not by unrelated user.

#### Client-side Gate Adjustment (detail)

Current code in `story-detail-page.tsx`:
```typescript
// Visibility enforcement: private/shared stories only visible to author
if (data.visibility !== 'public' && data.authorId !== user?.id) {
  setError('private');
  setLoading(false);
  return;
}
```

After this change, the gate should be removed entirely — if `getStory()` returns data, the viewer is authorized (RLS enforces this). If `getStory()` returns null (including for unauthorized shared/private), the existing `not_found` error path handles it. The error state wording "Story not found" is acceptable — we do not need to distinguish "not found" from "not authorized" for security reasons (enumeration prevention).

#### No-op items (confirmed no change needed)

- `updateStory()` in `stories-service-real.ts` — already handles `visibility` field.
- Database enum `story_visibility` — already includes all three values; no schema change.
- `event_rsvps` table — no change; used read-only by the RLS EXISTS subquery.
- `getStoriesByAuthor()` / `getStoriesByAuthorWithPoints()` — RLS handles filtering automatically; no code change needed.
