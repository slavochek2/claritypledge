---
status: in-progress
type: bug
rank: 5
severity: high
workstream: infrastructure
date_reported: '2026-09-10'
created_date: '2026-09-10'
drafted_by: opus
exec_model: opus
exec_effort: high
tags:
  - auth
  - session
  - routing
  - regression-risk
disclosure: public
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_file: e2e/p1297-reproduce.spec.ts
  unit_test_file: src/tests/p1297-reproduce.test.tsx
  root_cause: "AuthProvider reports 'checked, not loading, no user' whenever the profile fetch fails (3 tries, 1 s apart) or getSession() returns a retryable refresh error, although a usable stored session is held; every auth gate redirects on exactly that state, nothing retries, and the token stays in storage"
  confidence: high
  surfaces_in_scope: [auth-provider-profile-fetch-failure, auth-provider-retryable-refresh-failure, auth-provider-jwt-rejected-by-server]
  surfaces_deferred: []
  reproduced_at: 2026-11-26
  fix_shape: open
  fix_shape_why: "hold isLoading and retry (offline-readable pages that wait on isLoading would never settle, since the profile never loads offline) vs settle with the last-known profile cached for the stored session's user vs a new derived signed-out flag every gate reads"
---

# P1297: A signed-in user is bounced to /login on a cold page load, with a valid session in storage

## Summary

On a full page load of an auth-gated route, the app renders the login screen for a user who
is signed in — deterministically, while an unexpired Supabase session sits in `localStorage`.

## Root Cause

**Confirmed for now (2026-11-26, /reproduce; confidence high on the mechanism, the trigger on the
2026-09-10 device is not re-observed).** The provider, `src/auth/AuthContext.tsx`, turns "could
not confirm the session" into "nobody is signed in".

On a cold load auth-js returns an unexpired stored session from `localStorage` **without any
network call** (`GoTrueClient.__loadSession`), so the provider always holds a `session`. It then
has two ways to settle on `user: null, isLoading: false, sessionChecked: true`, the exact state
every auth gate redirects on:

- **A. Profile fetch fails.** `fetchProfileForUser` tries `get_profile_by_id` 3 times, 1 s apart.
  If all fail (network drop, 5xx, a token the server rejects) and there is no earlier profile in
  memory (a cold load never has one), it sets `user` to null and `isLoading` to false. Nothing
  retries later, so the login form stays up after the network recovers, and the session stays in
  storage. Any condition that lasts through 3 reloads (a phone's flaky radio, a VPN that drops
  requests, an unreachable server) gives the deterministic 3/3 of the original report.
- **B. Refresh fails on the network.** With the stored access token within 90 s of expiry (any
  phone reopened after an hour idle), auth-js refreshes on load. On a retryable failure it **keeps**
  the stored session but returns `{ session: null, error }` from `getSession()` and fires
  `INITIAL_SESSION` with `null` (`_emitInitialSession`). `initSession` treats the error as
  "checked, no session". P1441 already handles this case for writes (`session-guard.ts`,
  `'unreachable'`), but not for the provider.

**Falsified: the revocation hypothesis above.** Probe on TEST (self-hosted, active): sign a test
account in, revoke every session with a global sign-out from a second session, then replay the
first session's still-unexpired access token. `get_profile_by_id` → **200 with the profile**;
`/auth/v1/user` → 403. PostgREST checks only the JWT's signature and expiry, so a revoked session
keeps a working profile until the token expires. auth-js then fails the refresh non-retryably and
**removes** the stored session, which is a clean sign-out, not this bug. The suggested probe
(`/auth/v1/user`) would have returned 403 and confirmed the wrong cause.

**Also ruled out: a held auth lock.** auth-js waits on its lock with no timeout (`-1`), so a hung
lock shows an endless loader, never the login page.

**Evidence.**
- `e2e/p1297-reproduce.spec.ts` against the dev server and TEST: the control (healthy network) stays
  on `/transcribe`. With `get_profile_by_id` unreachable for the first 4 s of a cold load, the test
  user lands on `/login?redirect=%2Ftranscribe`, still there 12 s after the network is back, token
  still in `localStorage`. **2/2 failures** (first run + retry).
- `src/tests/p1297-reproduce.test.tsx` (provider): both controls pass. A, with the profile failing 5 times
  and then recovering, still has `user === null` after 20 s. B, with a retryable refresh error,
  passes through the redirect state.

**Scenario audit (Track B).**

| Scenario on a cold load with a stored session | Today | Scope |
|---|---|---|
| Profile request fails briefly (network) | redirect to /login, token kept | in scope (A) |
| Profile RPC 5xx for a while | redirect to /login, token kept | in scope (A) |
| Server rejects the access token (401, e.g. expiry by the server clock, rotated signing key) | redirect to /login, token kept until its local expiry | in scope: refresh once, then a clean sign-out with the expired message |
| Refresh fails on the network (token near expiry) | redirect to /login, token kept | in scope (B) |
| Session revoked server-side, token unexpired | user shown (PostgREST accepts), clean sign-out at expiry | not affected, verified by probe |
| Offline cold load | redirect to /login | in scope: must not regress P1369 offline reading |
| Auth lock held by another tab | endless loader | not this bug |
| Profile genuinely absent (`not_found`) | user null | unchanged: no profile is not a signed-up user |

**All gates share the provider.** The redirect condition (`sessionChecked && !isLoading && !user`)
appears in about 30 pages, so the fix belongs in the provider, not per page.

## Invariants

- A page may only redirect to `/login` after the auth provider reports it has finished
  restoring, AND has been given a real chance to restore from storage. "Finished" must not be
  reachable while a stored credential has neither been accepted nor explicitly rejected.
- A revoked or unusable stored session must be **cleared** when it is discovered, not left in
  place. Leaving a dead token in `localStorage` makes every subsequent load look identical to
  a genuine sign-out and hides the real cause from anyone debugging it.

## Reproduction Steps

1. Sign in normally on a device.
2. Confirm `localStorage['sb-<project-ref>-auth-token']` exists and its `expires_at` is in the
   future.
3. Perform a **full page load** (not in-app navigation) of an auth-gated route — measured on
   `/transcribe`.
4. Observe: the login screen renders.
5. Reload twice more — same result each time.

**Reproduction rate:** 100% once it starts (3/3 loads). The transition into the state was not
captured; a session begins working and later enters it.

## Expected Behavior

A signed-in user with a usable stored session lands on the requested route. If the stored
session is genuinely unusable, the user is signed out cleanly — the dead credential is removed
and, ideally, the login screen explains that the session expired rather than appearing as if
the user had never signed in.

## Actual Behavior

The login screen renders, repeatedly, while a syntactically valid unexpired token remains in
storage. Signing in again works, and the state recurs later in the same working session —
observed **three times during one afternoon of device testing**, each requiring a manual
re-login before testing could continue.

## Affected Files

- Suspected: the auth provider that owns `user`, `authLoading` and `sessionChecked` — the
  session-restore path on cold start. Exact file not yet identified.
- `src/app/data/transcribe-service.ts` — `postSlicePayload` calls `supabase.auth.getSession()`
  per slice (~1 per 4s per participant). Suspected *trigger*, not the defect.
- `src/app/pages/transcribe-room-page.tsx:101-108` — the redirect. **Verified correct**; listed
  so the next investigator does not re-audit it.

## Severity

**High** — a signed-in user is told to sign in again, repeatedly, on a route they have access
to. Not a data-loss or security issue (it fails closed), but it breaks the entry point to any
gated feature and is invisible to anyone who does not think to inspect storage.

## Fix Approach

Run the disproof above first — it splits the problem cleanly and costs one request.

- **If the token is rejected server-side:** the bug is that a revoked session is not cleared and
  is not distinguished from "never signed in". Fix the sign-out path to clear storage and
  surface "your session expired". Then treat the per-slice `getSession()` cadence as a
  contributing cause and reduce it: the token only needs re-reading when it is near expiry, not
  once every 4 seconds.
- **If the token is accepted:** the fault is in the provider's restore path — it is settling
  `sessionChecked` before the restore resolves. Fix there, and add a regression test that mounts
  the provider with a valid stored session and asserts `user` is non-null once loading clears.

**Not P1236's defect** — verified: `git diff --name-only main...feature/p1236-...` returns
nothing under any auth, provider or context path. P1236 is where it was *observed*, and its
per-slice `getSession()` is a plausible amplifier, but the branch does not touch auth.

## Acceptance Criteria

- [ ] A signed-in user performing a full page load of an auth-gated route lands on that route,
      not on `/login` — verified on a physical device, not only in a test.
- [ ] A stored session that the server rejects is cleared from storage, and the user is told the
      session expired rather than being shown a bare sign-in screen.
- [ ] The state does not recur across a 30-minute session of ordinary use with a `/transcribe`
      room open (the cadence that surfaced it).
- [ ] A regression test covers the provider settling with a valid stored session: once loading
      clears, `user` is non-null.
- [ ] No console errors during the affected flow.
