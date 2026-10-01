---
status: week
type: bug
rank: 16
severity: low
date_reported: 2026-10-01
created_date: 2026-10-01
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [sentry-noise, auth, partners, rpc-grants]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1382: Partners badge reports "permission denied for get_my_pending_invitations" when the session drops on tab resume

## Summary

The Partners nav badge's tab-refocus refetch calls the authenticated-only RPC `get_my_pending_invitations` as `anon` when the Supabase client has lost its session but React still holds a `user`. The resulting `42501` is reported to Sentry as a DB error (JAVASCRIPT-REACT-3K, INBOX-P44). Same shape as P913, on a function P913's suppression does not cover.

## Root Cause

Confidence: medium (survived one disproof; the session-loss mechanism inside auth-js is inferred, not observed).

- **Grants are correct, verified on prod 2026-10-01:** `proacl = postgres=X, authenticated=X, service_role=X`, matching migration `20260901235000` L157-158, which revokes `anon` deliberately (P1222). Hypothesis "grant drift" is killed.
- **The caller ran as anon, not with an expired token:** the error is `42501`, not `PGRST303` (which `logDbError` already suppresses, P1011).
- **Evidence:** Sentry event `465e1d61ee97465abcc818894b0a94d1` (prod, 2026-09-30 08:31Z, release `7bd39811`, Android Chrome). The founder was viewing their own `/p/<slug>/partners`. The stack goes `usePendingPartnerInvitationCount` → `fetchCount` → `agreementsService.getIncomingInvitations` → `logDbError`. Replay `98c238c3`: `ui.focus`, then realtime `CHANNEL_ERROR` for the signed-in profile id `a99042ef-e740-446a-8734-389c8589cc17` at T+0. App state still holds the user while the client sends the anon key. The last sign-in was 07:43Z, so the JWT was ~48 min old.
- `usePendingPartnerInvitationCount` (and `profile-connections-page.tsx` L113) gate only on React `user.email`, never on a live Supabase session. `logDbError`'s P913 predicate `isExpiredSessionRpcDenied` is scoped to `_is_letter_*`, so this function's identical artifact reaches Sentry.
- "0 users impacted" is not evidence of an anonymous visitor. The app never calls `Sentry.setUser`.

## Invariants

- `get_my_pending_invitations` stays revoked from `anon` (P1222). The fix must never re-grant it.
- A genuine `permission denied` for a table, or for any function not known to be authenticated-only, must still reach Sentry (P913 scoping).

## Reproduction Steps

1. Sign in on a phone and open `/p/<own-slug>/partners`. The badge hook mounts.
2. Background the tab until the Supabase session is lost (a refresh token rotated elsewhere, or a failed refresh on resume).
3. Return to the tab. `visibilitychange` fires `fetchCount` with the stale `user`.
4. The RPC goes out as `anon` → `42501 permission denied for function get_my_pending_invitations` → Sentry.

**Reproduction rate:** intermittent (1 event in prod). The deterministic repro is at unit level: `logDbError` given that error object.

## Expected Behavior

No Sentry event for this artifact. The badge degrades to its last/0 count, as it already does.

## Actual Behavior

The Sentry error `DB error in getIncomingInvitations: permission denied for function get_my_pending_invitations`, code `42501`.

## Affected Files

- `src/app/data/db-error-logger.ts` L62-76: the `isExpiredSessionRpcDenied` predicate covers `_is_letter_*` only.
- `src/app/hooks/usePendingPartnerInvitationCount.ts`: the caller (refetch on `visibilitychange`).
- `src/app/data/agreements-service-real.ts` L713: the RPC call site.

## Severity

**Low.** One event, no broken user-visible flow. It is Sentry noise that masks real permission errors.

## Fix Approach

Extend P913's `isExpiredSessionRpcDenied` predicate to also match `permission denied for function get_my_pending_invitations`, keeping the function-name scoping. This follows the P913 decision (suppress the expired-session-as-anon artifact in the logger, caller already degrades) rather than adding a session probe to every caller. A session check in each caller would add an auth round-trip per poll and still race the SIGNED_OUT event.

## Acceptance Criteria

- [ ] `logDbError('getIncomingInvitations', {code:'42501', message:'permission denied for function get_my_pending_invitations'})` sends nothing to Sentry. Regression test in `src/tests/p1382-*.test.ts`.
- [ ] `42501 permission denied for table clarity_agreements` still reports.
- [ ] `42501 permission denied for function some_other_fn` still reports.
- [ ] No change to the function's grants (prod `proacl` unchanged).
