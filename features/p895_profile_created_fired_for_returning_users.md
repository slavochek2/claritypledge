---
status: in-progress
type: bug
rank: 7
severity: medium
workstream: analytics
date_reported: '2026-06-04'
created_date: '2026-06-04'
tags: [mixpanel, analytics, auth-callback]
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_file: src/tests/p895-reproduce.test.tsx
  root_cause: "AuthCallbackPage.tsx:86 derives isReturningUser from auth-context user, which is null whenever AuthContext's profile fetch returns null (not_found blip or 3x transient server errors on first load, AuthContext.tsx:141-144). The page's own getProfile fallback (AuthCallbackPage.tsx:110) finds the profile, but the flag is never re-derived — so line 459 fires profile_created for a returning login."
  confidence: high
  surfaces_in_scope: [auth-callback-analytics]
  surfaces_deferred: []
  scenarios_pinned: [returning-user-context-fetch-null, new-user-signup, live-migration-counts-as-signup]
  reproduced_at: 2026-06-06
---

# P895: `profile_created` fires for returning users — `isReturningUser` misclassification inflates signup metrics

## Summary

`AuthCallbackPage.tsx:446` fires `analytics.track(isReturningUser ? 'login_complete' : 'profile_created', ...)`. During the P881 reproduction session, a `profile_created` event was observed in prod Mixpanel for the founder's long-existing profile (event properties: `registration_source: login`, `has_pledged: true`, profile created far before the 30-day window). The `isReturningUser` flag evaluated false for an existing user, so a login was recorded as a signup.

## Impact

- `profile_created` over-counts: funnel/activation boards count returning logins as new signups.
- Compounds P881 (under-count): the two errors partially mask each other, making both harder to see.

## Reproduction Evidence

- Prod Mixpanel, Events feed, 30D window: 7 `profile_created` events vs 6 actual DB signups with a captured event; the 7th belongs to a profile created long before the window, with `registration_source: login`.
- **2026-06-06 (confirmed live):** `$distinct_id` breakdown over the last 2 days shows exactly 1 `profile_created` — attributed to the founder's long-existing profile (a returning login). A real user's genuine signup the same morning (08:02 UTC, confirmed in prod `profiles`) fired no `profile_created` at all (their client likely blocks Mixpanel — separate known limitation, not this bug). Net: the only `profile_created` in the window is a misclassified returning login.

## Root Cause (confirmed via /reproduce, 2026-06-06)

`AuthCallbackPage.tsx:86` derives `const isReturningUser = !!user` from the **auth context's `user`** — which is `null` for an existing user whenever `AuthContext`'s profile fetch returns null on first load (`not_found` blip, or 3× transient server errors → `fetchProfileForUser` returns null → `setUser(null)`, `AuthContext.tsx:141-144`). The page *knows* the context is unreliable — `AuthCallbackPage.tsx:105-111` falls back to a direct `getProfile(authUser.id)` into `existingProfile` — but `isReturningUser` is never re-derived after that authoritative fetch. Result: `AuthCallbackPage.tsx:459` fires `profile_created` for a returning login, carrying the self-contradicting properties observed in prod (`registration_source: login` + `has_pledged: true` + preserved slug — pledge/slug can only be preserved if the profile already existed).

**Reproduction:** deterministic component test — context fetch returns null, page fetch returns the existing profile → `profile_created` fires (canary FAILS asserting `login_complete`). 100% rate under the trigger condition. The bug is transient-dependent in prod (requires the context fetch to miss while the page fetch hits), which is why only some returning logins misclassify.

**`isReturningUser` blast radius (all in `AuthCallbackPage.tsx`, all fixed by re-derivation):**
- `:91` status text — returning user sees "Creating your profile..."
- `:446` `registrationSource` fallback — legacy no-source login misattributed as `pledge`
- `:459` event name — the reported bug

**Scope decisions (founder, /reproduce session):**
- `/live` migration (anon profile → new auth id) **stays a signup**: fires `profile_created` with `registration_source: live`. Pinned by a guard test — the fix must NOT classify the migration path as returning even though it populates `existingProfile`.
- Deleted-account re-login correctly fires `profile_created` (new row) — pinned by the new-user guard test.

**Fix direction for `/fix`:** derive returning-ness from the authoritative profile lookup (`getProfile(authUser.id)` result at `:110`), not the context `user` — while keeping the `/live` migration branch classified as a signup.

**Canary contract (P835 `it.fails` convention):** the returning-user canary in `src/tests/p895-reproduce.test.tsx` is committed under `it.fails(...)` so the suite stays green while the bug exists. When the fix lands, the inner assertions pass → `it.fails` flips RED → `/fix` must remove `.fails` (convert to plain `it()`) in the fix commit. The two guard tests (new-user, /live-migration) are plain `it()` and must keep passing.

## Affected Files

- `src/auth/AuthCallbackPage.tsx` — line 446 and the `isReturningUser` derivation upstream of it

## Acceptance Criteria

- [x] Root cause of the misclassification confirmed with a failing test (`src/tests/p895-reproduce.test.tsx`, /reproduce 2026-06-06)
- [ ] A returning-user login fires `login_complete`, never `profile_created`
- [ ] A genuinely new signup still fires `profile_created`

## Related

- P881 — `profile_created` under-count (loss); discovered during its `/reproduce` session
