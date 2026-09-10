---
status: week
type: bug
rank: 92
severity: high
workstream: infrastructure
date_reported: '2026-09-10'
created_date: '2026-09-10'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [auth, session, routing, regression-risk]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1297: A signed-in user is bounced to /login on a cold page load, with a valid session in storage

## Summary

On a full page load of an auth-gated route, the app renders the login screen for a user who
is signed in — deterministically, while an unexpired Supabase session sits in `localStorage`.

## Root Cause

**Under investigation.** What is established by measurement (2026-09-10, Android Chrome 152
against the dev server, `/transcribe`):

- `localStorage` held `sb-<ref>-auth-token` with `expires_at` **45 minutes in the future**.
- Three consecutive full page loads each rendered the login screen. **Not intermittent** —
  reproduced 3/3, so this is not the classic mount-order race.
- The consuming page's own guard is correct and is not the cause. `transcribe-room-page.tsx`
  gates on `if (!sessionChecked || authLoading) return;` before redirecting, so the redirect
  can only fire once auth has reported itself finished. The provider is therefore answering
  "checked, not loading, **no user**" while credentials are present.

Leading hypothesis, **unverified**: the stored *access* token is unexpired but the *session*
has been revoked server-side, so restore-from-storage fails and the provider settles on
"no user". Supabase rotates refresh tokens on use and invalidates a session when a rotated
token is replayed, which the P1236 room can plausibly provoke: `postSlicePayload` calls
`supabase.auth.getSession()` on **every slice** — roughly one call every 4 seconds per
participant — and each of those may attempt a refresh near expiry.

Cheapest disproof, not yet run: replay the stored access token against `/auth/v1/user` and
read the status. 200 falsifies the revocation hypothesis and moves the fault into the
provider's restore path; 401/403 confirms it. A first attempt at this probe returned nothing
useful because `import.meta.env` is not reachable from a bare `Runtime.evaluate` — pass the
project URL and publishable key in explicitly, or run the probe from a module context.

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
