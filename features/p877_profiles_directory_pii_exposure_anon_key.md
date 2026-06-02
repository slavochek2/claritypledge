---
status: in-progress
type: bug
rank: 1000767
severity: high
workstream: C1
date_reported: '2026-06-02'
created_date: '2026-06-02'
tags: [security, privacy, rls, profiles, gdpr]
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_file: e2e/integration/p877-reproduce.spec.ts
  root_cause: "profiles RLS SELECT is using(true) with no column scoping; default grants give anon+authenticated SELECT on all columns. RLS is row-level only — the column gate (REVOKE SELECT) was never applied."
  confidence: high
  reproduced_at: '2026-06-02'
  scope_confirmed: all-3-columns-plus-authenticated-revoke
  scenarios_in_scope: [anon-email, anon-linkedin_url, anon-reason, authenticated-cross-user-email]
  regression_guard: [anon-display-columns-still-readable]
  fix_must_add:
    - "get_my_profile() SECURITY DEFINER accessor (auth.uid()=id) — preserves own-email self-read after the authenticated-role REVOKE"
    - "get_featured_profiles() SECURITY DEFINER RPC — preserves the public signature wall (linkedin_url+reason for verified+pledged); blanket REVOKE otherwise breaks clarity-tax-section, signature-wall, sign-pledge-page"
  client_refactor_sites: [agreements-service-real.ts:341, api.ts:164, api.ts:208, api.ts:302, api.ts:745, AuthCallbackPage.tsx:133]
---

# P877: Full profiles directory (emails + LinkedIn + reason) readable via public anon key

## Summary

The public anon key (shipped in the browser bundle) can read every user's `email`, `linkedin_url`, and `reason` free-text from the `profiles` table in a single unauthenticated request — the entire user directory is harvestable as PII.

## Root Cause

The `profiles` RLS SELECT policy is `using (true)` (`supabase/migrations/20250101_initial_schema.sql:40-42`) with no column-level restriction, and the default Supabase grants give `anon` + `authenticated` roles SELECT on **all** columns. RLS is row-level only — it does not gate columns — so nothing prevents an anon caller from selecting `email`. Column-level GRANT/REVOKE (the only mechanism that would scope columns) was never applied.

Aggravating application code: `src/app/data/agreements-service-real.ts:336` (`lookupUserByEmail`) selects and returns `email` to the client, and several profile reads use `select('*')`, so even legitimate client paths pull email into the browser.

### Confirmed (reproduce, 2026-06-02)

Hypothesis survived its disproof. Anon-key REST read against the **test** DB (`gfjctyxqlwexxwsmkakq`) returned `HTTP/2 206`, `content-range: 0-2/704` — every one of the 704 rows is anon-readable, with `email`, `linkedin_url`, and `reason` all populated and returned. Canary `e2e/integration/p877-reproduce.spec.ts` reproduces this at the SDK level: anon SELECT of each column returns `{ error: null }` + the value (must be `42501` after the fix). Confidence: **high**.

**Surface-audit finding that reshapes the fix (do NOT blanket-REVOKE blindly):** `getFeaturedProfiles()` (`src/app/data/api.ts:208`) reads `linkedin_url` + `reason` via the **anon key** and renders them on three public, pre-auth surfaces — `clarity-tax-section`, `signature-wall`, `sign-pledge-page`. For verified+pledged users those fields are public **by design**; the leak is that the raw anon query also exposes them for `has_pledged=false` /live guests who never consented. So the fix for `linkedin_url`/`reason` is not a bare column REVOKE — it must route the wall through a `get_featured_profiles()` SECURITY DEFINER RPC (opted-in subset only), *then* revoke direct anon table access. `email` has no such public surface — clean REVOKE.

## Invariants

- Column-level grants and RLS are orthogonal in Postgres. RLS `using(true)` may remain; the column gate must be a `REVOKE SELECT (col) ... FROM anon, authenticated`.
- A user must always be able to read **their own** email (own-row self-read). Any column REVOKE that also hits the `authenticated` role breaks this and MUST be paired with a self-scoped accessor (e.g. a `SECURITY DEFINER get_my_profile()` gated by `auth.uid() = id`).
- Email must never be serialized back to the browser for *other* users. Addressing an invite to another user must resolve `profiles.email` server-side (by `profile_id`), never client-side.

## Reproduction Steps

1. Obtain the public anon key (it is shipped in the production JS bundle; also `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`). No login required.
2. Run, unauthenticated:
   `curl -sI "https://<ref>.supabase.co/rest/v1/profiles?select=email,name,slug,linkedin_url,reason" -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" -H "Prefer: count=exact" -H "Range: 0-0"`
3. Observe the response: `HTTP/2 200` with `content-range: 0-N/TOTAL` — every row is readable, and dropping the `Range` header returns all rows including `email`.

**Reproduction rate:** 100% (verified live this session — prod ref `besjtuodziykmjidubzw`: 58 rows; test ref `gfjctyxqlwexxwsmkakq`: 704 rows; all emails returned with HTTP 200).

## Expected Behavior

The public anon key (and ideally the authenticated role, for *other* users' rows) cannot read `email`, `linkedin_url`, or `reason` from `profiles`. Display-only fields (name, slug, avatar, has_pledged, is_verified) remain readable. A user can still read their own email via an authenticated self-scoped path.

## Actual Behavior

`GET /rest/v1/profiles?select=email,...` with the anon key returns HTTP 200 and all rows including every email — a complete PII directory dump with no authentication.

## Affected Files

- `supabase/migrations/20250101_initial_schema.sql` — line 40-42, the `using(true)` SELECT policy with no column scoping (root)
- `src/app/data/agreements-service-real.ts` — line 336, `lookupUserByEmail` returns `email` to the client
- `src/app/data/api.ts` — multiple `from('profiles').select('*')` reads (e.g. ~163, 207, 301, 744)
- `src/auth/AuthCallbackPage.tsx` — ~7 profile reads, including legitimate own-row email reads that will break under a blanket `authenticated` column REVOKE (needs the self-scoped accessor)
- The subset of the ~30 `from('profiles')` call sites across `letters-service.ts`, `calibration-service-real.ts`, `clarity-live-page.tsx`, `letter-reading-page.tsx` that name `email`/`linkedin_url`/`reason` or use `select('*')`

## Severity

**High** — live exposure of personal data (email + LinkedIn + self-disclosed "reason" text) for the entire prod user base with no authentication. Email is personal data under GDPR; unrestricted anon bulk export breaches data-minimisation and is a reportable exposure. Not "critical" only because it is a confidentiality leak rather than active data loss or auth bypass.

## Fix Approach

Two ordered steps — **flip the REVOKE last**, after the client refactor ships, or production reads 403.

1. **Refactor reads off the sensitive columns.** Replace `select('*')` and email-bearing profile reads with explicit display-column lists. Drop `email` from `lookupUserByEmail`'s select; where a caller needs to address an invite, switch to passing/resolving `profile_id` server-side. Add a `SECURITY DEFINER get_my_profile()` (gated `auth.uid() = id`) for the legitimate own-email reads in `AuthCallbackPage`. Grep all `from('profiles')` callers first (per `.claude/rules/src.md`).
2. **Apply the column gate:** `REVOKE SELECT (email, linkedin_url, reason) ON public.profiles FROM anon, authenticated;` RLS `using(true)` can remain. Re-evaluate whether `bio`/`role` also belong in the revoked set.

Precedent for the SECURITY DEFINER + REVOKE/GRANT shape already in-repo: `supabase/migrations/20260411120000_p683_auth_user_lookup_rpc.sql`.

This bug is the prerequisite for the P-number that adds the relationship-scoped people-picker (search must never return email; it resolves to `profile_id`). File the picker separately via `/create-spec`.

## Acceptance Criteria

- [ ] Unauthenticated `GET /rest/v1/profiles?select=email` with the anon key returns an error (e.g. 403/`42501`), not 200 with rows — verified against test, then prod
- [ ] `linkedin_url` and `reason` are likewise not readable via the anon key
- [ ] Display fields (name, slug, avatar_url, avatar_color, has_pledged, is_verified) still readable where the app needs them — no broken avatars/names in letters, agreements, feed, live
- [ ] A logged-in user can still see their own email in settings/profile (own-row self-read works via the new accessor)
- [ ] Sending a letter and creating/accepting an agreement still work end-to-end (the `lookupUserByEmail` → `profile_id` refactor did not break addressing)
- [ ] No console errors during signup/verify (`AuthCallbackPage`), letter compose, and agreement create/accept flows
- [ ] Regression coverage exists for the anon-key column denial
