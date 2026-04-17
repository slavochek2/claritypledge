---
status: backlog
type: task
rank: 1000736.0
created_date: '2026-04-17'
tags: [profiles, database, migration, cleanup]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P736: Enforce `profiles.slug NOT NULL`

## Problem

**Situation:** `profiles.slug` is `text UNIQUE` (nullable). Current prod: **23 of 70 profiles (33%) have `slug IS NULL`**. All 23 are legacy orphans; no active code path produces new NULL rows.

**Origin of the 23 rows:**

1. **Pre-2025-12-04 trigger:** the old `on_auth_user_created` trigger created profiles with NULL slugs (auth metadata didn't include one). Removed; rows remain. Documented in `supabase/migrations/20250101_initial_schema.sql:70-75`.
2. **Pre-P396 guest profiles (before 2026-02-19):** `/live` guest onboarding via the deleted `getOrCreateGuestUser()` function created `profiles` rows with `is_verified=false, slug=null` for unverified guests. [P396](done/5_feb_26/p396_eliminate-unverified-user-state.md) eliminated this model entirely — guests now use anonymous Supabase auth with **no profile row**.

**Active code paths that could theoretically produce NULL slugs (all effectively dead):**

- `AuthCallbackPage.tsx:218-221` — P50 `!isLiveRegistration` guard skips slug generation. Line 95 comment: *"source=live → user signed up via /live (non-pledger) - currently not used as /live uses anonymous auth"*. Dead code.
- `AuthCallbackPage.tsx:384` — recovery `.insert(backup)` from sessionStorage. Backup comes from migration-delete path (also `isLiveRegistration`-gated). Post-P396 largely unreachable; remaining edge case is acceptable (error is captured by Sentry).

**Not a source:** post-P396 `/live` guests use anonymous Supabase auth and create **no `profiles` row** at all. Enforcement does not affect this flow. Note: `docs/technical/authentication.md:128-176` documents the pre-P396 guest-profile model as if current — that doc is stale and should be fixed alongside (separate spec).

**Complication:** Every UI surface that links to `/p/:slug` must carry a null fallback branch. P725 adds this fallback to 5 surfaces. Without enforcement, the fallback is permanent overhead and mis-rendered registered users remain invisible.

**Question:** What is the safe path to enforce `slug NOT NULL` on the profiles table and eliminate the cross-surface null fallback?

## Appetite

Small blast radius — single table, single constraint, with a dead-code cleanup. Steps: (1) remove dead P50 `isLiveRegistration` branches, (2) audit the 23 NULL rows, (3) backfill, (4) constraint. Reversible: drop the constraint and the column stays functional.

## Solution

1. **Remove dead code:** delete all `isLiveRegistration` references in `src/auth/AuthCallbackPage.tsx` (4 hits: lines 101, 116, 219, 243) and the migration-delete branch at line 116-170 that depends on it. Line 95's comment explicitly marks this code as unused in production. Include a small canary test confirming `/auth/callback` with arbitrary `source=` query params still generates a slug.
2. **Audit:** run this query against prod (read-only, see `.claude/rules/db-access.md`) and paste the result table:

   ```sql
   SELECT
     p.id,
     p.email,
     p.name,
     p.created_at,
     p.is_verified,
     p.has_pledged,
     (SELECT count(*) FROM letters       WHERE author_id         = p.id) AS letters_authored,
     (SELECT count(*) FROM stories       WHERE author_id         = p.id) AS stories_authored,
     (SELECT count(*) FROM sessions      WHERE creator_profile_id = p.id
                                            OR partner_profile_id = p.id) AS sessions_involved,
     (SELECT max(created_at) FROM letters WHERE author_id        = p.id) AS last_letter_at
   FROM profiles p
   WHERE p.slug IS NULL
   ORDER BY p.created_at DESC;
   ```

   Classify each row as: **active** (any letters/stories/sessions OR `has_pledged=true`), **test** (email matches `*@claritypledge.com`, `*+test@*`, or obvious placeholder), **orphan** (everything else, no activity, no pledge). Paste classification back into this spec under a new `## Audit Result` section before proceeding to step 3. **Expectation:** most or all should be `orphan` or `test` — they are pre-P396 legacy guest profiles.
3. **Decide backfill strategy** [FOUNDER DECISION]:
   - Deterministic backfill from `name` (slugified, with numeric suffix on collision — matches existing retry logic at `AuthCallbackPage.tsx:313-344`)?
   - Timestamp fallback for accounts with no usable name (matches existing final-fallback at `AuthCallbackPage.tsx:353-356`)?
   - Delete pre-P396 orphans instead of backfilling (they're guest leftovers with no real user)?
4. **Migration:** backfill/delete per strategy, then `ALTER TABLE profiles ALTER COLUMN slug SET NOT NULL`.
5. **Code cleanup (post-migration):** grep for `slug ??`, `slug: string | null`, and null-slug fallback branches. Remove in a follow-up commit (not in the same migration PR). **Coordination with P725:** P725 is not yet shipped; its 5 fallback branches can be either (a) removed from P725 before it ships if P736 lands first, or (b) cleaned up in the follow-up PR if P725 ships first.

## Risks / Non-Goals

### Risks
- **Uniqueness conflicts during backfill** — 2+ accounts with the same name → need a tiebreaker (numeric suffix matching the existing retry logic, or ID prefix).
- **A NULL-slug account actively being used** — sudden slug assignment may surprise the user. Email the affected user before backfill **only when both**: (a) the audit classified them as `active`, AND (b) the chosen slug differs from `generateSlug(their name)`. Skip the email for `test` and `orphan` rows regardless.
- **Recovery-backup insert edge case** — `AuthCallbackPage.tsx:384` could insert a row with `slug=null` from sessionStorage backup. Post-NOT-NULL, this insert will fail with a constraint violation. Existing Sentry capture (line 389) logs it. Acceptable — the path is post-P396 largely unreachable, and a loud failure is better than silent NULL.

### Non-Goals
- No redesign of `/p/:slug` page.
- No change to slug format / length rules.
- Not in scope: enforcing slug uniqueness on login identity (out of band).
- Not in scope: fixing `docs/technical/authentication.md` staleness (separate spec).
- **Not affected:** post-P396 anonymous `/live` guests (no `profiles` row created).

## Done-When

- [ ] All `isLiveRegistration` references removed from `src/auth/AuthCallbackPage.tsx` (dead code)
- [ ] Canary test: `/auth/callback` with any `source=` param generates a slug
- [ ] Audit complete: origin + classification of 23 NULL-slug rows documented
- [ ] Backfill/delete strategy approved by founder
- [ ] Migration applied to prod — 0 NULL-slug rows remain
- [ ] `profiles.slug` has `NOT NULL` constraint enforced
- [ ] Null-slug fallback code branches removed (coordinated with P725 ship order)
