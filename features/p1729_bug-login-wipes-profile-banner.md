---
status: in-progress
type: bug
disclosure: public
rank: 20
severity: high
date_reported: '2026-11-25'
created_date: '2026-11-25'
tags:
  - profile
  - banner
  - auth
  - data-loss
delivery_stage: ship
pipeline_ran: [create-bug, reproduce, fix, ship]
---

# P1729: Signing in wipes the profile banner, and the next profile visit generates an AI one over it

## Summary

A hand-set profile banner was replaced by an AI-generated one twice in prod (2026-11-01 and
2026-11-25, profile `slava`). The phone banner was untouched both times. Follow-up to the
process-learnings entry "Add confirmation or undo, and find the trigger".

## Root Cause (proven: code, plus a rolled-back call on self-hosted TEST)

1. Every `/auth/callback` run (each sign-in) calls `upsert_my_profile(p_data)`
   (`src/auth/AuthCallbackPage.tsx`, `upsertData`). `p_data` carries no `bio`, `banner_url` or
   `banner_generation_attempted`.
2. The function's `ON CONFLICT (id) DO UPDATE` (latest definition:
   `supabase/migrations/20261008232000_p1321_profile_email_follows_auth.sql`) assigned all three
   from `EXCLUDED`, so a returning user's sign-in set `banner_url = NULL`,
   `banner_generation_attempted = false`, `bio = NULL`.
3. The owner's next visit to their own profile met the P504 lazy-generation condition
   (`!profile.bannerUrl && !profile.bannerGenerationAttempted`, `src/app/pages/profile-page-v2.tsx`)
   and generated a banner, which `saveBanner` stored with `banner_generation_attempted = true`.
4. `banner_mobile_url` is not in the function's column list, which is why the phone banner survived.
   This matches the 2026-11-25 prod state exactly (generated `banner_url`, attempted `true`, phone
   banner intact).

The upsert has listed `banner_url` since P877 (`20260602160000_p877_profiles_pii_column_grants.sql`),
and the line was carried verbatim through P880, P1104, P1212 and P1321. `bio` is wiped by the same
path on every sign-in.

## Reproduction

1. A profile has a hand-set `banner_url`.
2. The owner signs in (magic link or Google) and lands on `/auth/callback`.
3. `banner_url` is now NULL and `banner_generation_attempted` false.
4. The owner opens their profile: a generated banner is saved over it.

## Expected vs Actual

- Expected: signing in never changes the banner or bio; a banner changes only when the owner
  chooses to, after confirming.
- Actual: every sign-in clears them; the next own-profile visit replaces the banner.

## Affected Files

- `supabase/migrations/20261008232000_p1321_profile_email_follows_auth.sql` (`upsert_my_profile`)
- `src/auth/AuthCallbackPage.tsx` (`upsertData`)
- `src/app/pages/profile-page-v2.tsx` (P504 lazy effect, `useBanner` call)
- `src/app/components/shared/banner/use-banner.ts`

## Fix

- New migration `20261125110036_p1729_login_keeps_profile_banner.sql`: `upsert_my_profile` keeps
  the stored `bio` / `banner_url` / `banner_generation_attempted` when `p_data` lacks the key.
  Function body otherwise verbatim (diffed).
- `useBanner`: optional `confirmReplace` is asked before Regenerate **or** keyword Search replaces
  an existing banner; declining changes nothing and spends no generation. The profile page
  supplies it. Remove is unchanged (no confirmation).
- Lazy generation (now `src/app/pages/use-lazy-profile-banner.ts`) also requires that the page
  shows no banner. (A hidden-tab gate was tried and removed in review: it stopped new users'
  first banner in a background tab and raced the async auth lookup. `banner_generation_attempted`
  already limits generation to once per owner, now that sign-in no longer resets it.)
- [FOUNDER DECISION: confirmation wording] currently "Replace your current banner with a new
  generated one?" (native `window.confirm`). The shared `ConfirmDialog`
  (`src/app/components/shared/confirm-dialog.tsx`) was considered: it is controlled JSX, so the
  confirm becomes async and the profile page must hold dialog state and render it, which grows
  `profile-page-v2.tsx` (over its size limit). Not a clean swap; kept native confirm.

## Cost Budget

- The SQL change adds 0 RPCs and 0 Gemini calls per sign-in (same single `upsert_my_profile`).
- It removes the repeat generation that followed every sign-in for an owner with a banner. The
  bound is now one automatic generation per owner, plus any the owner asks for (each now
  confirmed). `banner_generation_attempted` stays true across sign-ins.
- One lazy trigger (or one confirmed Regenerate/Search) for a profile, read from
  `use-banner.ts`, `banner-utils.ts` `generateAIBannerResult`, `generate-banner/index.ts` and
  `_shared/artist-banner.ts` / `artist-banner-run.ts`:
  - Client: 1 POST to `generate-banner` (no client retry), then on success 1 `profiles` PATCH
    (`saveBanner`). `getSession` is local.
  - Pre-checks: 1 `auth.getUser` (token validation), then rate-limit reservation 1: 1 INSERT into
    `ai_rate_limits` + 2 COUNT reads (5-minute burst, 24-hour daily), + 1 DELETE if refused. Then
    1 `profiles` read (`fetchProfileData`: owner check, current banner and artist).
  - Generation: up to `MAX_ATTEMPTS = 3` attempts. Each attempt = 1 image request to
    `gemini-3.1-flash-image-preview`, falling back to `gemini-3-pro-image-preview` on failure (so
    1 to 2 billable image calls; a timeout counts as billed), plus 1 vision call. Attempts 2 and 3
    each first run another reservation (INSERT + 2 COUNTs, + DELETE if refused); a refusal stops
    the retries. Worst case per trigger: 6 image calls + 3 vision calls + 3 reservations
    (3 INSERTs, 6 COUNTs), all inside one `BUDGET_MS` window. Non-prod projects skip Gemini
    entirely (P1565 placeholder).
  - After: 1 Storage upload, 1 old-banner delete (`cleanupOldBanner`), 1 `banner_credit` UPDATE.
    On failure instead: 1 `banner_generation_attempted` UPDATE (`markProfileAttempted`).
- The confirmation adds no network calls; declining spends nothing.

## Risks / Non-Goals

- **Undo is a non-goal.** generate-banner deletes the previous banner object
  (`supabase/functions/generate-banner/index.ts`, `cleanupOldBanner`), so an Undo after
  Regenerate or Search would restore a dead URL, and an older toast could overwrite a newer
  banner. A correct Undo needs old objects kept, which is out of scope. Dropped after review.

## Known limitations (pre-existing, not fixed here)

- Round-5 review: `useBanner` keeps its local banner state across client-side profile navigation, so visiting a profile that has a banner and then your own (no banner) can skip the automatic generation until a reload. This fails safe (no unwanted generation); the next full load generates.
- The "one automatic generation per owner" bound is enforced by the server-stored `banner_generation_attempted` flag, not by the client; a cleared flag allows another automatic generation.

- `saveBanner` in `profile-page-v2.tsx` ignores the `{ error }` returned by `updateProfile`, so a
  failed banner write still shows as saved.
- Sign-in still overwrites `role`, `linkedin_url`, `reason`, `avatar_*` through the same
  unconditional ON CONFLICT pattern (the client fills them from the existing profile, so the
  damage is narrower). Separate bug.
- The banner-credit concerns raised for Undo are moot with Undo removed. `banner_credit` is not
  touched by `upsert_my_profile`, so nothing changes there.
- A cached empty profile snapshot restored on browser Back could still meet the lazy condition.
  Moot in practice now that sign-in no longer empties the banner.
- A save that fails after generate-banner has already deleted the old object (generate-banner
  `cleanupOldBanner`, plus `saveBanner` ignoring errors) loses the old banner.
- Other `useBanner` call sites (events, stories) do not pass `confirmReplace`. Out of scope.

## Acceptance Criteria

- [x] The latest `upsert_my_profile` does not overwrite `banner_url`, `banner_generation_attempted`
  or `bio` when `p_data` omits them (`src/tests/p1729-login-keeps-profile-banner.test.ts`: 3 failed
  before the migration, all pass after).
- [x] Regenerate over an existing profile banner asks first; declining changes nothing.
- [x] Search over an existing banner asks first too; declining generates nothing, confirming
  generates (`src/tests/p1729-banner-confirm.test.ts`).
- [x] Lazy generation never runs over a shown banner, and still runs once for your own profile
  after viewing another one without a remount (same file).
- [x] A swapped CASE (present/absent arms) fails the SQL test (control run: 1 failed, reverted).
- [x] Rolled-back dry run on self-hosted TEST as role `authenticated`: with the old function a
  sign-in-shaped call took the banner from present to wiped (attempted true to false); with the
  new one it was kept, and an explicit `banner_url: null` still cleared it. Migration then applied
  to self-hosted TEST (`migrate.sh --list`: no pending; version added to `test.migrations`).

## Unproven

- The "3 regenerations in ~80 s" on 2026-11-01 is not explained by this path alone (one sign-in
  gives one lazy generation per page mount, and the effect guards with a ref). Candidates:
  several tabs/devices opening the profile after a sign-in, or repeated sign-ins. Not checked.
- The anon storage listing of `banners/profile/<id>/` returned empty (anon listing is revoked,
  decisions.md P1603), so the earlier generated files could not be dated.

## Post-ship (after merge; migrate.sh applies only migrations committed on main)

- [ ] Migration applied to prod; founder signs in, banner `/banners/slava-desktop.jpg` survives.
- [ ] Founder decides whether `bio` was lost in prod and needs restoring (prod `bio` reads NULL).
