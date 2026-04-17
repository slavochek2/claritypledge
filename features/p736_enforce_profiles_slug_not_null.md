---
status: in-progress
type: task
rank: 1000736.0
created_date: '2026-04-17'
tags: [profiles, database, migration, cleanup]
delivery_stage: fix
pipeline_ran: [create-spec, fix]
---

# P736: Enforce `profiles.slug NOT NULL`

## Problem

**Situation:** `profiles.slug` is `text UNIQUE` (nullable). Current prod: **23 of 70 profiles (33%) have `slug IS NULL`**. Two origins identified:

1. **Legacy (pre-2025-12-04):** the old `on_auth_user_created` trigger created profiles with NULL slugs (auth metadata didn't include one). Trigger removed; rows remain. Documented in `supabase/migrations/20250101_initial_schema.sql:70-75`.
2. **Active source — P50:** `AuthCallbackPage.tsx:218-221` intentionally skips slug generation for `source=live` registrations (`!isLiveRegistration && !slug` guard). These users have email + name + verified account but no slug, so ongoing NULL rows keep accruing.

**Not a source:** pure anonymous guests at `/live` (`isGuest={!user}` in `clarity-live-page.tsx:3511`). They never hit `AuthCallbackPage`, never create a `profiles` row. Enforcement does not affect this flow.

**Complication:** Every UI surface that links to `/p/:slug` must carry a null fallback branch (plain text, no link). P725 alone adds this fallback to 5 surfaces. Without enforcement, the fallback is permanent overhead and mis-rendered registered users remain invisible.

**Question:** What is the safe path to enforce `slug NOT NULL` on the profiles table and eliminate the cross-surface null fallback?

## Appetite

Small blast radius — single table, single constraint, one code-path fix. Requires: (1) stop the bleeding in `AuthCallbackPage`, (2) audit the 23 NULL rows, (3) backfill, (4) constraint. Reversible: drop the constraint and the column stays functional.

## Solution

1. **Stop the bleeding first:** drop the `!isLiveRegistration` guard at `src/auth/AuthCallbackPage.tsx:219`. `/live`-registered users already have `name` + `email`; generating a slug for them is trivial and their `/p/:slug` page is valid (possibly empty, which is fine). Guest flow is unaffected — guests never reach this code. Without this fix, NOT NULL will break new `/live` signups.
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

   Classify each row as: **active** (any letters/stories/sessions OR `has_pledged=true`), **test** (email matches `*@claritypledge.com`, `*+test@*`, or obvious placeholder), **orphan** (everything else, no activity, no pledge). Paste classification back into this spec under a new `## Audit Result` section before proceeding to step 3.
3. **Decide backfill strategy** [FOUNDER DECISION]:
   - Deterministic backfill from `name` (slugified, with numeric suffix on collision — matches existing retry logic at `AuthCallbackPage.tsx:313-344`)?
   - Timestamp fallback for accounts with no usable name (matches existing final-fallback at `AuthCallbackPage.tsx:353-356`)?
   - Skip and archive orphans first?
4. **Migration:** backfill remaining NULLs, then `ALTER TABLE profiles ALTER COLUMN slug SET NOT NULL`.
5. **Code cleanup (post-migration):** grep for `slug ??`, `slug: string | null`, and null-slug fallback branches. Remove in a follow-up commit (not in the same migration PR).

## Audit Result

Queried prod 2026-04-17. All 23 NULL-slug rows are from Jan–Feb 2026 (P50 era — the legacy trigger was already removed). **No legacy pre-2025-12-04 rows found.**

| Classification | Count | Notes |
|---|---|---|
| **active** | 0 | No NULL-slug user has stories, sessions, or pledge |
| **test** | 1 | `test-agent@claritypledge.com` — E2E test account |
| **orphan** | 22 | All unverified (`is_verified=false`), not pledged, zero activity |

All orphans include 5 personal `test+*@example.com` test addresses and 17 external users who signed up via `/live` but never verified or engaged. None require user notification before backfill (spec §Risks: email only when active AND slug differs from `generateSlug(name)`).

**Backfill is safe to proceed with no user emails.**

## Risks / Non-Goals

### Risks
- **Uniqueness conflicts during backfill** — 2+ accounts with the same name → need a tiebreaker (numeric suffix matching the existing retry logic, or ID prefix).
- **A NULL-slug account actively being used** — sudden slug assignment may surprise the user. Email the affected user before backfill **only when both**: (a) the audit classified them as `active`, AND (b) the chosen slug differs from `generateSlug(their name)` (e.g., a numeric-suffix tiebreaker or timestamp fallback was used). Skip the email for `test` and `orphan` rows regardless, and for `active` rows where the slug matches `generateSlug(name)` exactly.
- **AuthCallbackPage regression** — step 1 of the solution IS this fix. NOT NULL must not ship until step 1 is merged and verified, otherwise the next `/live` signup crashes.

### Non-Goals
- No redesign of `/p/:slug` page.
- No change to slug format / length rules.
- Not in scope: enforcing slug uniqueness on login identity (out of band).
- **Not affected:** pure anonymous `/live` guests (no `profiles` row created). Their flow is untouched.

## Done-When

- [x] `AuthCallbackPage.tsx:219` `!isLiveRegistration` guard dropped — all authed registrations generate a slug
- [x] Canary test: `source=live` signup produces a non-null slug
- [x] Audit complete: origin of 23 NULL-slug rows documented (legacy vs P50-era)
- [x] Backfill strategy approved by founder (Option B timestamp slug; orphans deleted)
- [x] Migration applied to prod — 0 NULL-slug rows remain (48 profiles total)
- [x] `profiles.slug` has `NOT NULL` constraint enforced
- [ ] Null-slug fallback code branches in P725's surfaces can be removed (follow-up PR)
