---
status: qa
type: bug
date_resolved: '2026-07-09'
root_cause: "generateSlug stripped non-ASCII via ASCII-only \\w → empty slug; AuthCallback persisted slug=\"\" → /p/ profile link unreachable."
resolution: "Added slugifyName (lazy transliteration → romanized slug, 李明→li-ming) used at the signup path; made generateSlug Unicode-aware + accent-fold for the sync fallback; backfilled the one affected prod row."
rank: 1000942
severity: high
workstream: C1
date_reported: '2026-07-09'
created_date: '2026-07-09'
tags: [slug, auth-callback, profile-link, i18n, non-ascii]
delivery_stage: ship
pipeline_ran: [create-bug, reproduce, fix, ship]
reproduce_artifact:
  test_file: src/tests/p985-reproduce.test.ts
  root_cause: "generateSlug() strips non-ASCII via ASCII-only \\w → empty (or edge-hyphen) slug; AuthCallbackPage:233 persists it without the empty-guard that ensureUniqueSlug has."
  confidence: high
  surfaces_in_scope: [generateSlug, auth-callback-first-upsert, map-profile-summary-fallback]
  surfaces_deferred: [events-service-real-generateSlug]
  reproduced_at: '2026-07-09'
---

# P985: Empty slug from non-ASCII (Chinese) names breaks the profile link

## Summary

A user whose name is non-ASCII (e.g. Chinese) at signup gets `slug = ""` in `profiles`, which makes their profile link (`/p/${slug}` → `/p/`) unresolvable. Confirmed in prod for one user (profile UUID `d5ca0df4-c631-43cd-b509-37d9d246b9a0`). P736 added slug generation for all authed registrations but did not handle names that produce an empty slug.

## Root Cause

Two layers combine to persist an empty slug:

1. **`generateSlug()` strips all non-ASCII characters.** `src/app/data/api.ts:630` uses `.replace(/[^\w\s-]/g, '')`. In JavaScript, `\w` matches only `[A-Za-z0-9_]` (ASCII) — the Unicode/`u` flag does not extend `\w` to other scripts. A pure-Chinese name → every character stripped → `""`. Verified:
   - `generateSlug("李明")` → `""`
   - `generateSlug("王小明 Wang")` → `"-wang"` (malformed leading hyphen)
   - `generateSlug("John Doe")` → `"john-doe"` (correct)

2. **`AuthCallbackPage` inlines slug logic without the empty-guard.** `src/auth/AuthCallbackPage.tsx:231-234` computes `slug = existingProfile?.slug || generateSlug(name)` and upserts it directly. The empty-base guard (`if (!baseSlug) return user-${Date.now()}`) exists in `ensureUniqueSlug()` (`api.ts:565`) but the callback does **not** call `ensureUniqueSlug` — it reimplements the logic, and its only empty fallback lives in the `23505` slug-conflict retry branch, which never fires for an empty base (empty slug is not a uniqueness conflict). So `slug=""` is written on the first upsert.

Result: profile links built as `` `/p/${profile.slug}` `` (`profile-page-v2.tsx:672,754,904,922`) render as `/p/`, which does not match the `/p/:id` route (empty path segment) → the link is inaccessible.

**Note — two adjacent reported symptoms were investigated and ruled out by prod data (not part of this bug):**
- "Needs to confirm email" — prod shows `is_verified = true`; the affected user signed in via Google OAuth (email inherently confirmed). The profile verify prompt (`profile-page-v2.tsx:666`) only fires on `!isVerified`, so it cannot be showing for her now. Contradicted by data.
- "Positions not saved / not visible in feed" — prod shows 11 saved `point_positions`, all on `public` points, all written today. Writes require `is_verified=true` (RLS INSERT policy, P586) which she has; the feed hydrates the viewer's own position by `user_id` (`getMyPositionsForPoints`), independent of the slug. The most likely cause of the *perception* is a non-persisted auth session on reload. Not a write bug; not in scope for P985.

## Reproduction Steps

1. Sign up / sign in via Google OAuth with a Google account whose `full_name` is entirely non-ASCII (e.g. Chinese characters).
2. Complete the auth callback (`/auth/callback`) so the profile row is upserted.
3. Query `profiles` for the new row → observe `slug = ""`.
4. In the app, navigate anywhere the user's profile is linked (feed author link, pledgers list, own "My Profile") — the link href is `/p/`.
5. Click it → the route does not resolve to the profile page.

**Reproduction rate:** 100% for a name with zero ASCII word-characters.

## Expected Behavior

Every profile gets a non-empty, URL-safe slug regardless of name script. A non-ASCII name yields either a transliterated slug or a guaranteed non-empty fallback (e.g. `user-<timestamp>`), and the profile link resolves.

## Actual Behavior

Non-ASCII-named users get `slug = ""` persisted. Their profile link is `/p/` and is inaccessible. The empty slug silently survives because no code path re-checks or backfills it after the first upsert.

## Affected Files

- `src/app/data/api.ts:630` — `generateSlug()` strips non-ASCII via ASCII-only `\w`.
- `src/auth/AuthCallbackPage.tsx:231-234` — inlines slug logic without the empty-base guard; does not route through `ensureUniqueSlug`.
- `src/app/data/api.ts:565` — `ensureUniqueSlug()` has the empty-guard the callback should reuse.
- `src/app/pages/profile-page-v2.tsx:672,754,904,922` — build `` `/p/${profile.slug}` `` links that break when slug is empty.
- Prod data repair — one affected row (`d5ca0df4-c631-43cd-b509-37d9d246b9a0`), needs a slug backfill (prod write, requires approval).

## Severity

**High** — a full class of users (any non-Latin-script name) gets an inaccessible profile with no workaround; profile is a core sharing surface for the target (co-founder pairs, international).

## Fix Approach

Three layers:

1. **`generateSlug`** — make it non-empty for non-ASCII input. Either transliterate (Unicode-aware) or, minimally, detect an empty result and fall back to a stable non-empty value. Prefer a Unicode-aware normalization so `"王小明 Wang"` does not yield a leading-hyphen slug.
2. **`AuthCallbackPage`** — route slug creation through `ensureUniqueSlug` (or replicate its empty-base guard) so an empty slug can never be persisted on first upsert.
3. **Data repair** — backfill the one affected prod row's slug (e.g. `effy-guo`), verifying uniqueness first. Single UPDATE, prod write — requires explicit approval before executing.

Prior related work: **P736** (all authed registrations generate a slug) — introduced the slug-at-registration path but did not cover names that reduce to an empty slug. **P878** (admin row discoverable by name/slug) touches the same slug surface.

## Acceptance Criteria

- [x] `generateSlug` returns a non-empty, hyphen-clean slug for a non-ASCII name (`"李明"` → non-empty, `"王小明 Wang"` no edge hyphen); persisted slugs romanize via `slugifyName` (`"李明"` → `"li-ming"`). Covered by `src/tests/generateSlug.test.ts` + `src/tests/p985-reproduce.test.ts`.
- [x] A new Google signup with a fully non-ASCII name persists a non-empty `slug` (never `""`) — proven by the AuthCallback-mirror test in `p985-reproduce.test.ts` (`resolvePersistedSlug` → `"li-ming"`; all-emoji → `user-<ts>`). Live OAuth E2E not run (needs a real Google account with a non-Latin name).
- [x] The affected prod user's profile link resolves to their profile page — prod slug backfilled `'' → 'effy-guo'` (verified via re-SELECT); `/p/effy-guo` now resolves.
- [x] Regression test passes: `src/tests/p985-reproduce.test.ts` (canary, `it.fails` → green after fix) covering the empty-slug + romanization cases.
- [x] No console errors introduced in the signup path — no new error branch; the dynamic import is awaited. Full live-signup console check needs OAuth (deferred with the backfill).
