---
status: qa
type: bug
rank: 1000800.0
severity: low
workstream: infra
date_reported: '2026-06-10'
created_date: '2026-06-10'
tags: [sentry, noise, letters, error-handling, auth]
flow: fix
delivery_stage: fix
pipeline_plan: [create-bug, fix, ship]
pipeline_ran: [create-bug, fix]
reproduce_artifact:
  test_file: src/tests/p913-unread-count-anon-no-sentry.test.ts
  confidence: high
  root_cause: >-
    getUnreadLetterCount runs as the anon Postgres role when a logged-in user's
    token has silently expired (SPA still holds a stale user in context). The
    RLS SELECT policies on clarity_letters / letter_deliveries invoke the
    SECURITY DEFINER helpers _is_letter_receiver / _is_letter_sender, which were
    deliberately revoked from anon in p651 (granted to authenticated only).
    anon hitting them returns 42501 "permission denied for function". logDbError
    then reports it to Sentry as a DB error, though the function already degrades
    gracefully (returns 0) and no user is impacted.
  surfaces_in_scope:
    - src/app/data/db-error-logger.ts (logDbError — central report point)
  surfaces_deferred:
    - >-
      Root cause (authenticated-only queries firing as anon on token expiry while
      a tab is open) is an auth-refresh/logout UX concern — its own spec, not this fix.
---

# P913: getUnreadLetterCount permission-denied reported to Sentry as DB error (JAVASCRIPT-REACT-1Y / 1Z / 1V)

## Summary

Sentry issues JAVASCRIPT-REACT-1Y and 1Z ("DB error in getUnreadLetterCount.received: permission denied for function _is_letter_receiver", culprits `/feed` and `/letter/:id/compose`, 1–2 events each, **0 users impacted**) — plus the already-"resolved"-but-recurring 1V (`getUnreadLetterCount.ownLetters`) — fire for a transient the code already handles gracefully.

## Root Cause

`getUnreadLetterCount()` (`src/app/data/letters-service.ts` ~line 1223) queries `clarity_letters` (`.ownLetters` branch) and `letter_deliveries` (`.received` branch). Both tables' RLS SELECT policies invoke the `SECURITY DEFINER` helper functions `_is_letter_receiver` / `_is_letter_sender`. Migration p651 (`20260405051035_p651_letter_onboarding_fixes.sql`) deliberately **revoked these helpers from `anon`** and granted EXECUTE to `authenticated` only (bug #6 hardening).

When a logged-in user leaves a tab open and their token silently expires (refresh token gone), the SPA still holds a stale `user` in `AuthContext`. `useUnreadLetterCount` (`src/app/hooks/useUnreadLetterCount.ts`) re-fires the background poll on mount and on `visibilitychange` (tab refocus). The PostgREST request now goes out as the `anon` role → RLS invokes the helper → `anon` can't execute it → `42501 permission denied for function`.

`getUnreadLetterCount` already swallows this gracefully (`logDbError(...)` then `return 0`). The only damage is a misleading "DB error" in Sentry — exactly the class the existing `isNetworkBlip` early-return in `logDbError` was built to suppress. This is the P882/P883 pattern: classify the expected transient before the Sentry call.

**Verified this session (not inferred):**
- Prod ACL query (`pg_proc.proacl`): both helpers are `{postgres=X, authenticated=X, service_role=X}` — `anon` absent. A real logged-in user **cannot** hit this.
- Reproduced on prod as `anon` (anon key, no user JWT):
  - `GET /rest/v1/clarity_letters?sender_id=eq...` → `{"code":"42501","message":"permission denied for function _is_letter_receiver"}`
  - `GET /rest/v1/letter_deliveries?receiver_profile_id=eq...` → `{"code":"42501","message":"permission denied for function _is_letter_sender"}`

## Reproduction Steps

1. Sign in; leave the tab open until the Supabase refresh token expires (or invalidate the session while the SPA keeps its `user`).
2. Refocus the tab → `useUnreadLetterCount` fires `getUnreadLetterCount`.
3. The request runs as `anon`; RLS invokes `_is_letter_receiver` / `_is_letter_sender`.
4. Observe: badge shows 0 (graceful), **and** a new Sentry "DB error" event appears (the bug).

**Reproduction rate:** 100% for an expired-token-as-anon request (verified directly via anon REST call on prod).

## Expected Behavior

The expired-token-as-anon permission-denied transient produces **no** Sentry event — it is an expected consequence of token expiry, not a defect, and no user is impacted.

## Actual Behavior

Every such poll ships a "DB error in getUnreadLetterCount.*" event to Sentry, keeping the issues perpetually unresolved (1V was marked resolved without a code fix and recurred).

## Affected Files

- `src/app/data/db-error-logger.ts` — `logDbError()`: add a scoped early-return for `42501 permission denied for function _is_letter_*`, mirroring the existing `isNetworkBlip` branch.

## Severity

**Low** — observability noise; `users=0`, the user-facing path already behaves correctly.

## Fix Approach

In `logDbError`, after the `isNetworkBlip` check, add an `isExpiredSessionRpcDenied` early-return: drop the event when `error.code === '42501'` AND the message names the `_is_letter_` RLS helper functions. Scope precisely — do NOT suppress all `42501` (a genuine "permission denied for table X" RLS bug must stay visible). After deploy, resolve 1Y / 1Z in Sentry.

## Acceptance Criteria

- [x] `logDbError` does NOT call `Sentry.captureException` for a `42501` "permission denied for function _is_letter_receiver" or "_is_letter_sender" error (verified via unit canary)
- [x] `logDbError` STILL calls `Sentry.captureException` for a generic `42501` (e.g., "permission denied for table letter_deliveries") — filter is scoped, not blanket
- [x] `logDbError` STILL reports other real DB errors (e.g., `42P01`) and existing network-blip filtering is unchanged
- [ ] [post-deploy] After deploy: JAVASCRIPT-REACT-1Y and 1Z resolved and do not regress for 7 days

## Out of Scope / Deferred

- The deeper root cause — authenticated-only queries firing as `anon` when the refresh token expires while a tab is open — is an auth-refresh/logout UX concern. Deferred to its own spec; this fix only stops the non-actionable Sentry noise.
