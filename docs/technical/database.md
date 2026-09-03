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
| code | text | 6-symbol room code, UNIQUE. **Minted server-side** (P1097): a BEFORE INSERT trigger fills it from `mint_clarity_room_code()` (CSPRNG, alphabet `A-Z` minus `I O` + `2-9`); INSERT on the column is revoked for anon/authenticated (they get 42501 if they send one) and SELECT was revoked by P1057 — the creator reads it back via `get_room_code_for_invite`. service_role may still insert an explicit code (fixtures). |
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

**Service query pattern:** `getPracticeRooms` pulls the creator profile via a PostgREST FK join, and the session code via a SECURITY DEFINER accessor — **two calls, deliberately**:
```
event_practice_rooms
  *, creator:profiles!event_practice_rooms_creator_id_fkey(name, slug, avatar_color, avatar_url)
WHERE status IN ('waiting', 'active') AND expires_at > NOW()

get_practice_room_codes(p_event_id) -> (room_id, code)   -- same predicate, server-side
```

**Why the session code is no longer embedded (P1057).** The `code` column is the capability
`claim_joiner_seat` accepts, so it was revoked from `anon`/`authenticated` via a column-level
SELECT grant. A PostgREST FK embed compiles to a lateral subquery executed **as the request
role**, so column ACLs apply to `session:clarity_sessions(code)` exactly as they would to a
direct select — the old embed returns 42501, and because this path swallows errors into an
empty list, practice rooms would silently vanish from event pages rather than fail loudly.

Publishing the code to every visitor of a public event page remains intentional for this room
class ([FOUNDER DECISION 2026-08-13, P1057 D-A] — nobody is being excluded, which is the point
of an event). The accessor is a faithful port of that audience, scoped to sessions that have an
`event_practice_rooms` row; every other room's code goes dark.

---

### ready_submissions (P1083 — /ready distribution)

Ephemeral, no-auth submissions backing the always-visible distribution on `/ready`. No owner column, no identity — same anonymous-ephemeral shape as `clarity_feed_ideas`.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| value | smallint | 0–10, `CHECK` constraint |
| created_at | timestamptz | Row creation time |

**RLS:**
- INSERT: public, `WITH CHECK (true)`
- SELECT: public, filtered to `created_at > now() - interval '10 minutes'` — this is the retention window's actual enforcement on the read side, independent of query shape
- No UPDATE/DELETE policy for clients

**Column-level INSERT grant (critical, not just RLS):** `anon`/`authenticated` hold `GRANT INSERT (value)` only — `id`/`created_at` keep their table-wide default grant revoked. Row-level `WITH CHECK (true)` says nothing about which *columns* a client may set; without the column-scoped grant, a client could POST `{"value":5,"created_at":"2099-01-01"}` and defeat the retention window permanently — a future date passes the SELECT policy's `>` filter forever and never matches the cron's `<` filter (adversarial review finding, 2026-08-17; reproduced and closed same day). Any future column added to this table needs the same column-grant treatment by default, not table-wide `INSERT`.

**Retention:** a `pg_cron` job (`cleanup_expired_ready_submissions`, every 5 min, gated by `pg_extension` existence check) hard-deletes rows older than 10 minutes. The SELECT policy above means expired rows are unreadable even if the cron job hasn't run yet.

**Migration:** `supabase/migrations/20260816120000_p1083_ready_submissions.sql`

### event_private_info (P1194 — registration-gated event details)

Event details visible only to the host and people holding an RSVP. Currently one field, the
group chat invite link.

| Column | Type | Description |
|--------|------|-------------|
| event_id | uuid | Primary key, FK → `events(id)` `ON DELETE CASCADE` |
| group_chat_url | text | WhatsApp/Telegram/Signal/Discord invite; `NULL` or empty ⇒ no group chat |
| updated_at | timestamptz | Last write |

**Why a side table and not a column on `events`:** `events` is `SELECT USING (true)` and every read
in `events-service-real.ts` runs `select('*', …)`. Protecting a column there would need a
column-level `REVOKE`, and a `REVOKE` makes `SELECT *` fail outright for `anon` — taking the whole
events page down. A separate table with its own RLS leaves every existing query untouched.

**RLS** (all policies `TO authenticated`):
- SELECT: host of the event **OR** holder of an `event_rsvps` row for it. Not `USING (true)`.
- INSERT / UPDATE / DELETE: host only. UPDATE carries a matching `WITH CHECK` so a host cannot
  repoint a row at an event they do not own.

**`events.has_group_chat`** — a public boolean on `events`, maintained by the
`sync_event_has_group_chat()` trigger (`SECURITY DEFINER`, `SET search_path = ''`). The *existence*
of a group chat is public; the URL is not. Without it the UI could not decide whether to show a
"register to join" prompt without leaking whether a link exists. Never written by a client. The
trigger syncs **both** `NEW.event_id` and `OLD.event_id` on UPDATE — a row moved between two events
owned by the same host would otherwise leave the vacated event's flag stuck `TRUE`.

**Client access:** `eventsService.getEventGroupChatUrl(eventId)` only — it returns `null` from the
database for an unauthorized caller rather than fetching-then-hiding. Never join this table onto a
publicly-readable `events` query.

**Migration:** `supabase/migrations/20260831120000_p1193_event_private_info.sql` (filename carries
the pre-renumber P-number; see its header)
**Integration test:** `e2e/integration/p1193-db-schema.spec.ts` (10 cases, live RLS)

### agent_accounts (P1104 — machine readings of public figures)

A registry, not a flag. An **agent account** is a persistent machine reading of a real public
figure, assembled from quoted sources; it carries positions the subject never took and must never
render as that person. **Row existence — not a column value — answers "is this an agent?"**

| Column | Type | Description |
|--------|------|-------------|
| profile_id | uuid | PK, `REFERENCES profiles(id) ON DELETE CASCADE` |
| subject_key | text | `NOT NULL UNIQUE` — stable identity of the subject across sources |
| operator_name | text | `NOT NULL` — the human answerable for the account; rendered as "Operated by {name}" |
| created_at | timestamptz | Row creation time |

**Why row-existence over a boolean column:** a column outside `p877`'s explicit profile-read grant
list returns `undefined` → falsy → an agent renders as a person. Absence of a row is unambiguous in
the safe direction, and it replaced seven hand-maintained profile-projection lists. See
`decisions.md` 2026-08-19 for why an in-code constant was rejected as *more* dangerous, not less.

**Column-level SELECT grant (critical):** `anon`/`authenticated` hold
`GRANT SELECT (profile_id, operator_name)` only. `subject_key` is deliberately excluded, so
`select('*')` returns `42501` rather than leaking which real person an account reads. Table-wide
grants are revoked. Same pattern as `ready_submissions` above (P877/P886 lineage).

**Creation is service-role only:** `create_or_reuse_agent_account(...)` — `SECURITY DEFINER`,
`EXECUTE` granted to `service_role` alone — commits the `profiles` row and the registry row
together. `profiles.id` is `uuid references auth.users` with **no default**, so the caller mints the
GoTrue user first and passes its id. The function sets `is_verified`/`has_pledged` to `false`
explicitly: `has_pledged` **defaults to TRUE**, so an insert that omits it creates an agent holding
a pledge.

**Reserved name + no self-promotion:** `is_reserved_agent_name()` (NFKC-normalised, invisible-char
and homoglyph folded, first-token test) is enforced inside `guard_profile_trust_columns()` — which
must stay **`SECURITY INVOKER`**; making it `DEFINER` switches `current_user` to the owner and
disables the P880/P878 trust-column pinning wholesale. `mark_self_verified()` and
`set_my_pledge(true)` both consult the registry, so an agent holding a live session cannot verify or
pledge itself. `DELETE`/`TRUNCATE` are revoked from `service_role` and a `BEFORE DELETE` trigger
guards the table.

**Client read is paginated:** PostgREST caps at `max_rows = 1000` and truncates silently, so
`agent-accounts-service.ts` pages with an explicit `ORDER BY` and throws rather than returning a
partial registry — a short read here renders agents as people.

**Migrations:** `20260819120000_p1104_agent_accounts.sql`,
`20260819160000_p1104_reserve_agent_name_at_the_table.sql`,
`20260819170000_p1104_agents_cannot_self_promote.sql`

### Stories, Points & Calibration Tables (P117)

Seven tables added by P117. Full schema details in [architecture.md](architecture.md#stories-points-and-calibration-api).

| Table | Purpose |
|-------|---------|
| `stories` | User-created content (content, understood_count; `title` dropped by P701 — see P1227) |
| `story_versions` | Immutable snapshots, auto-created by trigger |
| `points` | Statements users take positions on |
| `story_points` | Many-to-many junction (stories ↔ points); `author_id UUID NOT NULL` + `UNIQUE(author_id, point_id)` since P465 |
| `point_positions` | Current user positions (7-point Likert) |
| `point_position_history` | Audit log of position changes (trigger) |
| `story_verifications` | /live verification records; `story_id`/`version_id` nullable since P413 |

**`system_tags` column (P630):** Both `stories` and `points` have a `system_tags text[] NOT NULL DEFAULT '{}'` column that holds system-controlled tags (`st\d+`, `v\d+`, `understanding`, `misunderstanding`). The `tags` column holds only user-created hashtags. System tags are never writable by clients — only DB triggers and migrations modify `system_tags`. A `protect_system_tags()` trigger silently prevents client mutations. The `extract_hashtags_from_content()` trigger writes only user tags to `tags`. The `sync_story_st_tags_to_points()` trigger reads/writes `system_tags`.

**Migrations:** `supabase/migrations/20260204_stories_points_calibration.sql` (initial), `20260222120000_p413_nullable_story_verifications.sql` (nullable FKs + NULL guard on `update_story_understood_count` trigger), `20260403120000_p630_system_tags.sql` (system_tags separation).

**Trigger NULL-guard pattern:** Any trigger on `story_verifications` that touches `story_id` must guard against NULL — `IF NEW.story_id IS NULL THEN RETURN NEW; END IF;` — since exchanges without a story are now valid rows.

**`stories.video_url` / `stories.video_quotes` (P1141):** A story may carry a source video instead of an image. `video_url` is the canonical watch URL and is the **only** stored video field — the player, the thumbnail and the open-at-timestamp fallback are all re-derived from it, so no two stored fields can drift apart. It is constrained by `stories_video_url_allowlisted_host`, a CHECK that admits only the allowlisted video hosts; an absent or unparseable value is treated exactly as "this story has no video" and every surface renders as it did before P1141. `video_quotes` is `jsonb` holding the supporting quotes with per-quote timecodes plus the video duration — normalize it through `normalizeVideoQuotes()` rather than reading it raw. Migrations: `20260823120000_p1141_stories_video_reference.sql` (columns + CHECK), `20260823120100_p1141_seal_rpc_video_fields.sql` (carries both fields through `seal_and_send_letter` so a sealed letter snapshots them).

**Reserved account namespaces (P1104):** Two channels are reserved so a machine account can never be mistaken for a person, and a person can never wear a machine's identity. `is_reserved_agent_name(text)` reserves the `Agent · ` display-name prefix; `is_reserved_machine_slug(text)` reserves the `machine-` URL prefix. Both normalise with **NFKD**, strip invisible characters, fold confusables, strip the combining marks NFKD exposes, and then test the first token — the mark strip is load-bearing, because a combining mark is not `[[:alnum:]]` and would otherwise split the very token being tested (a confirmed bypass, closed by `20260824140000_p1104_slug_guard_decompose.sql`). Each is enforced at three points: the `guard_profile_trust_columns` trigger (SECURITY INVOKER, so it sees the client role), `upsert_my_profile` (SECURITY DEFINER, so the trigger's client branch never fires inside it and it keeps its own copy), and a positive assertion in `create_or_reuse_agent_account` — an agent account cannot be created without both markers. Migrations: `20260819160000`, `20260820091000`, `20260820092000` (name), `20260824120000`, `20260824140000` (slug).

**`stories.current_version` invariant (P833):** `stories.current_version` must always point to a row that exists in `story_versions`. Enforced by `trg_check_story_version_invariant` — a `DEFERRABLE INITIALLY DEFERRED` constraint trigger that fires at COMMIT time (after all AFTER ROW triggers, including `trg_story_initial_version`). Direct `UPDATE stories SET current_version = N` where no matching `story_versions(story_id, version_number = N)` row exists will raise at commit. `seal_and_send_letter` also runs a pre-flight LEFT JOIN IS NULL check and raises before sealing if any story has a missing version row. See `supabase/migrations/20260513000000_p833_seal_rpc_version_desync.sql` and [decisions.md § 2026-05-14](../decisions.md).

**story_versions INSERT RLS pattern (P465):** `story_versions` uses a SECURITY DEFINER trigger (`create_initial_story_version`) for auto-creation. When adding an INSERT policy, use `current_user = 'postgres'` for the trigger-context branch — NOT `auth.uid() IS NULL`. In Supabase, SECURITY DEFINER triggers run as the `postgres` role; `auth.uid() IS NULL` is too broad and also matches anonymous API callers (`anon` role). See `supabase/migrations/20260302130000_story_versions_insert_policy_v2.sql` and [decisions.md § 2026-03-02](../decisions.md).

**Moving a write behind SECURITY DEFINER discards the RLS predicates it replaces (P1053):** a definer function bypasses RLS entirely — not just the policy, but *each condition inside it*. A write that was bound by an RLS UPDATE policy loses every one of those bindings the moment it moves into an RPC, and nothing warns you: the function compiles, the tests pass, and the lost predicate is invisible unless you diff the policy against the new body line by line. **Before moving any write behind SECURITY DEFINER, enumerate the policy's predicates and account for each one explicitly in the new function.** P1053 lost an addressee binding this way and only found it under adversarial review.

**NULL-safety in a definer guard is decided by the CONSTRUCT, not the operator (P1053):** plpgsql **skips an `IF` whose condition evaluates to NULL**, so a refusal guard written as `IF <condition involving a nullable column> THEN RAISE` silently becomes an *allow* whenever that condition is NULL. The identical expression inside a `WHERE` clause excludes the row instead — zero rows updated, exception raised — which is fail-**closed**. Same text, opposite failure direction. **Use `IS DISTINCT FROM` / `IS NOT DISTINCT FROM` for any comparison against a nullable column inside an `IF`;** they never return NULL. A grep for the predicate cannot find this class — the safe and unsafe cases are textually identical. Guards on the seat-claim path are pinned in `src/tests/sd-guard-completeness.test.ts` (`CRITICAL_PREDICATES`) so a future `CREATE OR REPLACE` that drops one fails a test; when adding a needle there, **verify it occurs exactly once in the function body** — a substring that also matches a neighbouring guard provides no protection.

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

### Start every RLS audit with the live drift check (P1048)

```bash
python3 scripts/rls-drift-check.py     # read-only; exit 1 = drift, exit 2 = could not run
```

Run this **before** grepping migrations, and before trusting anything below. It queries
`pg_policies` on live prod and live test and compares both against the policy names this
repo's migrations create, reporting four directions in this order: `prod-only`,
`not-in-files`, `test-only`, `differs`. The first two gate the exit code.

**Why it comes first.** P1038's Decision 1 held that grepping migration files was the
primary and sufficient method for RLS audit. P1046 falsified that twice in one pass — once
via a migration the deploy manifest recorded as applied to prod but prod never reflected,
and once via a policy that existed in no migration at all. Neither the manifest nor a
migration file is evidence of live state, and no file-based method can see an object that
exists live and nowhere in the repo. Full account in the script's own module docstring and
in `features/done/` P1048; do not restate it here a third time.

**Reading the output.** `prod-only` and `not-in-files` are the security-relevant
directions and fail the run. `test-only` is usually expected (dev-support tooling).
`differs` is reported for review and never fails. Divergence that is genuinely expected
goes in `scripts/rls-drift-allowlist.txt` with a reason and a date — never to quiet a
finding you have not investigated. A red check is the check working.

**What it does not cover:** authoritative list is the `NOT_COVERED` constant in
`scripts/rls-drift-check.py`, which the check prints on every run — read it there rather
than trusting this paragraph, which has already drifted from it once. In summary: RLS
policies on `public` only (not GRANTs, role memberships, RPCs, or `SECURITY DEFINER`
bodies); the migrations leg is a membership test, not a replay, so a policy that *is* in
the files is not thereby confirmed current; and a policy renamed by `ALTER POLICY ...
RENAME` reads as absent from migrations. Green means those three queries agreed — it is
not a clean bill of health for prod.

`scripts/test-rls-drift-check.py` replays the pre-P1046 state offline and asserts the
checker catches all four policies and distinguishes both origins. Run it after any change
to the checker.

### Function EXECUTE grants are a separate surface (P1065)

```bash
python3 scripts/function-grant-drift-check.py   # read-only; exit 1 = drift, exit 2 = could not run
```

The RLS check above covers **policies**. It reads nothing about who may EXECUTE a function,
and that is a distinct hole: P1063 found four RPCs executable by unauthenticated callers on
prod, each already carrying a lockdown in its own migration that had never taken effect.
Grepping for the lockdown is worse than useless — the ineffective revoke form and the
working one are textually near-identical, and the ineffective one raises no error.

This check reads `has_function_privilege()` on live prod and live test and diffs against
`scripts/anon-execute-allowlist.txt` (P1064). Two gating directions: `anon-unlisted` (an
anonymous caller can reach a function nobody has justified) and `grant-differs` (prod and
test disagree about who may execute). `fn-env-only` and `allowlist-stale` report only.

**It also answers the second half of the question.** A finding only exists in the
*conjunction* of a live anon grant and a guard that fails to refuse an anonymous caller —
either alone is not a vulnerability. So the check invokes each unlisted anon-executable
function on **test** with `SET LOCAL ROLE anon` inside a transaction that ends in
`ROLLBACK`, and reports which ones did not refuse. Those findings are `guard-permits-anon`
and are **report-only**: the probe passes NULL arguments and so under-reports, and letting
a heuristic carry the exit code would drag the reliable leg toward suppression. The probe
runs two controls first and declares itself blind rather than clean if either fails.

**Both revoke forms are required.** These functions typically carry a PUBLIC grant *and* a
role-direct grant. `REVOKE ... FROM anon` alone leaves PUBLIC; `REVOKE ... FROM PUBLIC`
alone leaves the role-direct grant. `has_function_privilege()` cannot tell them apart, so a
half-revoke leaves this check green and the hole open — see the `NOT_COVERED` constant the
script prints on every run, which is authoritative over this paragraph.

`scripts/test-function-grant-drift-check.py` asserts each shape offline against synthetic
fixtures, including that the blindness controls fire. Run it after any change to the
checker. The known-open backlog lives in `.private/function-grant-baseline.json`
(gitignored — it names live unpatched functions); it is a backlog, not an allowlist.

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
| Insert | `authenticated` | `WITH CHECK (auth.uid() = profile_id)` — **binds ownership** |
| Update | — | **No policy exists** (implicit deny) |
| Delete | — | **No policy exists** (implicit deny) |

**Corrected 2026-08-11 (P1038).** This table previously documented the insert policy as intentionally open ("any authenticated user can add a witness to any profile") and described UPDATE/DELETE policies scoped to "own witness records." Neither was true: `20260404120000_security_backlog_rls.sql` replaced the open insert policy with an ownership-binding one, and no UPDATE or DELETE policy has ever existed for this table. The stale entry was load-bearing — P1038's spec cited it as its canonical example of an intentionally-open table, and reasoned from it. Verified against the live migration and live `pg_policies`, not from this file's prior prose.

### INSERT ownership-binding audit (P1038, 2026-08-11)

Every table with a `UUID REFERENCES profiles(id)` / `auth.users(id)` column was checked for one
specific question: **does the INSERT policy's `WITH CHECK` bind the row's own owner column to
`auth.uid()`?** Read the scope limits below before treating any row as a safety statement.

**The buckets are not a partition — a table can appear in two.** `witnesses`, `badge_points` and
`point_position_history` are BOUND (their INSERT does bind the owner column) *and* NO COMPARISON
BASIS (no UPDATE/DELETE policy exists to compare against). Both facts are worth recording: the
first says the write path is guarded, the second says this audit had no second signal to check it
against.

| Status | Tables |
|---|---|
| **BOUND** — INSERT binds the owner column | `stories`, `points` (P1032), `clarity_sessions` (P1038), `events`, `event_rsvps`, `event_sub_rooms`, `event_practice_rooms`, `clarity_docs`, `doc_stories`, `clarity_agreements`, `clarity_letters`, `letter_deliveries`, `letter_point_responses`, `story_verifications`, `membership`, `story_explain_backs`, `point_positions`, `point_position_history`, `clarity_live_invites`, `witnesses`, `badge_points` |
| **NOT APPLICABLE** — no owner column, `WITH CHECK (false)`, or no client-reachable INSERT | `organization`, `terms_acceptances`, `session_consents`, the anonymous demo/idea/chat sibling tables, `ai_rate_limits`, `email_send_log`, `letter_response_pending`, `letter_story_snapshots`, `letter_predictions`, `story_point_history`, `story_versions`, `session_transcripts`, `transcription_jobs`, `user_voice_profiles`, `search_rate_limits`, `ml_training_sessions` |
| **NO COMPARISON BASIS** — owner column bound at INSERT but no UPDATE/DELETE policy to compare against | `witnesses`, `point_position_history`, `badge_points` |
| **GAP FOUND** | `clarity_sessions` — fixed (P1038). `story_points` — fixed independently (P1034, `20260811140000`). |

> **The comparison basis in this table was itself unsound, and P1047 proved it.** Every row
> above answers one question — *does INSERT bind the owner column?* — using the table's own
> UPDATE policy as the reference implementation. That assumes the UPDATE policy is correct.
> On `clarity_sessions` it was not: its predicate led with a branch true for ~94% of rows, so
> the OR short-circuited before any `auth.uid()` comparison. A table can therefore read as
> **BOUND** here while its UPDATE side is wide open. Re-auditing this class means reading
> *both* commands' live predicates, not comparing one against the other.
>
> P1047 also established that a policy predicate is the wrong lever when a caller
> legitimately writes some columns of a row it does not own — ownership binds at the
> **privilege** layer (revoke table-level UPDATE, re-grant the non-ownership columns), which
> no permissive OR can defeat. `clarity_sessions` now carries that shape plus a BEFORE UPDATE
> trigger; see [decisions.md](../decisions.md) 2026-08-12 [technical]. Note the trigger only
> works for a column with a single meaning — one open case remains, tracked in P1053.

**Multi-actor tables** carry both a creator column and a beneficiary/target column. Only the
creating party can be bound at INSERT time; the other party has not acted yet. `badge_points` is
the clearest case — a certifier awards a badge to someone else, so `user_id != auth.uid()` is
correct and binding it would break the flow. `event_sub_rooms` and `clarity_sessions` bind only
their creator column, deliberately.

**Tables also written by a `SECURITY DEFINER` function** (queried from live prod `pg_proc`, not
grepped): `clarity_agreements`, `clarity_letters`, `clarity_live_invites`, `clarity_sessions`,
`event_sub_rooms`, `letter_deliveries`, `letter_point_responses`, `letter_predictions`,
`letter_story_snapshots`, `point_position_history`, `point_positions`, `profiles`,
`search_rate_limits`, `story_explain_backs`, `story_point_history`, `story_verifications`,
`story_versions`, `transcription_jobs`.

Definer-rights functions run with the owner's privileges and **do not evaluate these INSERT
policies at all**. For every table on that list, a BOUND status describes the direct-client write
path only. Three edge functions additionally write with the service-role key, bypassing RLS the
same way. Whether those paths re-validate ownership in application code was not audited — tracked
in P1045.

**Permissive-OR check:** run against both environments. Only `ml_training_sessions` returns more
than one permissive INSERT policy, identically on prod and test (so not drift) — both check
nothing, and one reaches anonymous callers. It has no owner column, hence NOT APPLICABLE above;
the open-write question is P1045.

**What this audit does NOT establish** — read this before citing the table above:

- It asked about **INSERT only**. UPDATE-side ownership is a separate question and at least one
  open gap exists there (P1047).
- It asked about **RLS policies only**. Rows written by a `SECURITY DEFINER` function or by an
  edge function using the service-role key never evaluate these policies at all.
- **Tables with no owner column are marked NOT APPLICABLE, meaning "not examined by this
  audit"** — not "safe." At least one such table accepts unauthenticated writes (P1045).
- A `DEFAULT auth.uid()` on the owner column does **not** count as binding: a default only fires
  when the client omits the column, and a forged insert supplies it explicitly.

**Method note (P1046).** Classification used live `pg_policies` on both environments, not
migration files. Files and `deploy-manifest.json` were both proven unreliable during this work —
see [decisions.md](../decisions.md) 2026-08-11 [technical]. Start any re-audit with a three-way
diff (live prod vs live test vs files). That tooling now exists — `scripts/rls-drift-check.py`,
documented in § "Start every RLS audit with the live drift check" at the top of this section.

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

CASCADE/SET NULL children (e.g., `event_rsvps.profile_id`, `event_practice_rooms.creator_id`, `event_sub_rooms.initiator_id`/`target_id`, `stories.author_id`, `point_ratings.user_id`, `point_user_status.user_id`, `badge_points.user_id`, `witnesses.profile_id`; SET NULL since P520: `points.first_validator_id`, `events.host_id`, `badge_points.verified_by`, plus the older `clarity_agreements.terminated_by`) handle themselves and do not block.

**Self-serve erasure (P520):** `erase_my_account()` — `SECURITY DEFINER`, `EXECUTE` granted to `authenticated` only, **no target parameter** (acts on `auth.uid()`) — is the one sanctioned path that walks this whole table in one transaction and then deletes the `auth.users` row itself. Its header (`supabase/migrations/20260901213000_p520_erase_my_account.sql`) is the authoritative erase-vs-anonymise table; when a new profile FK lands, add the table to that function or the erasure raises for the next user who has a row there — `e2e/integration/p520-account-deletion.spec.ts` is the canary. The three P520 FK rewrites were added `NOT VALID` because the test project already held orphaned `points.first_validator_id` values (the prior constraint was not enforcing); `ON DELETE` actions still apply.

Hardening (`20260902090000_p520_erasure_hardening.sql`): every INSERT policy that gated only on `auth.uid() IS NOT NULL` (`terms_acceptances`, `session_consents`, `clarity_demo_rounds`, `clarity_ideas`, `clarity_live_turns`, `clarity_verifications`) now also requires the caller's `profiles` row to exist — a stale access JWT (≤1 h after erasure; refresh tokens die with `auth.users`) can read but not write. Shared sessions of an erased user are set to `status = 'cancelled'`, a state nothing else writes; `patch_live_state`, the `clarity_sessions_creator_update` policy and the three live INSERT policies refuse it. `public.erased_subjects(user_id, erased_at, same_name_sessions)` records each erasure (ids only; service_role read); `same_name_sessions` lists sessions whose counterparty shared the leaver's display name, where the name-only rows were deliberately left in place.

Hardening round 2 (`20260903090000_p520_erasure_hardening_2.sql`): `erase_my_account()` and `_p520_scrub_live_state()` run with `SET search_path = ''` and fully schema-qualified references — the RPC deletes from `auth.users`, so it is the strongest privilege bridge in the API schema and must not be shadowable. Two GoTrue tables do **not** cascade from `auth.users` and are now deleted explicitly inside the RPC: `auth.refresh_tokens` (its `user_id` is a `varchar` with no FK; rows are otherwise reached only via `refresh_tokens_session_id_fkey`) and `auth.flow_state` (PKCE, no FK). The three P520 FK rewrites are no longer `NOT VALID`: the legacy orphans that blocked validation are copied into `public.p520_legacy_fk_orphans(table_name, column_name, row_id, orphan_value)` (service_role only), the column is nulled, and `points_first_validator_id_fkey`, `events_host_id_fkey` and `badge_points_verified_by_fkey` are `VALIDATE`d — so the paragraph above's "added NOT VALID" is the historical reason, not the current state. The migration also asserts at deploy time that exactly one `erase_my_account` overload exists, that it is owned by the migration role, and that neither `anon` nor `PUBLIC` holds `EXECUTE`.

**Pre-flight pattern (re-derive each run — snapshot drifts):**
```bash
grep -nE "REFERENCES (public\.)?(profiles|auth\.users)" supabase/migrations/*.sql
```
For each match, read the `CREATE TABLE` block (not just the line) to attribute the column to the correct table — multi-table migrations make line-grep misleading. Then classify by the ON DELETE clause and probe row counts for each candidate via REST `?<col>=eq.<uid>&select=id` with `Prefer: count=exact`.

If any BLOCKING row exists: deletion requires either explicit DELETE/NULL of those rows first under approval, or rejecting the operation. See `.claude/commands/slava/maintain/clean-test-users.md` for the canonical workflow.

---

## Database Extensions

| Extension | Environments | Used by |
|-----------|--------------|---------|
| `pg_net` | prod + test | `tx_jobs_enqueue()` only |
| `supabase_vault` | prod + test | endpoint + shared secret for the above |

**`pg_net`** lets the database make outbound HTTP calls. Exactly one function uses it:
`tx_jobs_enqueue()`, an `AFTER INSERT` trigger on `transcription_jobs` that POSTs the new job id to
the `enqueue-transcription` edge function.

*Reachability (verified 2026-08-13):* the `net` schema is **not** exposed by PostgREST — the API
serves `public` and `graphql_public` only, and a request naming another schema is refused with
`PGRST106`. So `net.*` is not callable from the API even though the extension ships its functions
with Postgres's default `EXECUTE` to `PUBLIC`. That default is deliberately left as the vendor set
it: revoking it closes nothing reachable, and deviating from an extension's shipped grants without
cause is its own maintenance risk. The only `public` function that reaches `pg_net` builds its URL
from Vault rather than from any caller-supplied value, and is not anon-executable.

**`supabase_vault`** holds two per-environment secrets that `tx_jobs_enqueue()` reads at call time:
`transcription_webhook_secret` (must equal the `enqueue-transcription` function's `WEBHOOK_SECRET`)
and `transcription_webhook_url` (that environment's endpoint). Keeping both in Vault is what lets a
single migration run unchanged in prod and test with no project ref in this repo, and makes rotation
a Vault update rather than a code change.

> **Seeding a fresh environment.** Both Vault entries must exist or the trigger logs a warning and
> skips the enqueue — deliberately, because raising inside an `AFTER INSERT` trigger would roll back
> the caller's insert and turn a misconfigured webhook into lost job rows. Creation SQL is in the
> header of `supabase/migrations/20260813120000_p1064_tx_jobs_enqueue_from_vault.sql`.

*History (P1064):* `pg_net` was installed on prod and absent from test, and `tx_jobs_enqueue()`
existed on prod while appearing in no migration file — it was created out-of-band, with its endpoint
and secret as literals in the function body. Both are now declared in that migration. This is the
same failure mode as the **P417 caveat** below: what a database actually contains, and what the
migration history says it contains, are separate facts that have to be checked separately.

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
