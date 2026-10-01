---
status: all-done
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
pipeline_ran: [create-bug, reproduce, fix, ship]
reproduce_artifact:
  test_file: src/tests/p1382-pending-invitations-anon-no-sentry.test.ts
  root_cause: "Badge refetch on tab resume runs get_my_pending_invitations as anon after the client drops its session; P913's 42501 suppression covers only _is_letter_* so it reaches Sentry"
  confidence: medium
  surfaces_in_scope: [partners-badge, partners-page-incoming]
  reproduced_at: 2026-10-01
completed_at: 2026-10-01
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

**Reproduction rate:** intermittent (1 event in prod). Deterministic at unit level: the RPC mocked to return 42501 with `getSession()` returning no session.

## Expected Behavior

No Sentry event for this artifact. The badge degrades to its last/0 count, as it already does.

## Actual Behavior

The Sentry error `DB error in getIncomingInvitations: permission denied for function get_my_pending_invitations`, code `42501`.

## Affected Files

- `src/app/data/db-error-logger.ts` L62-76: P913's `isExpiredSessionRpcDenied` covers `_is_letter_*` only (left unchanged, see Fix Approach).
- `src/app/hooks/usePendingPartnerInvitationCount.ts`: the caller (refetch on `visibilitychange`).
- `src/app/data/agreements-service-real.ts` L713: the RPC call site.

## Severity

**Low.** One event, no broken user-visible flow. It is Sentry noise that masks real permission errors.

## Fix Approach

In `getIncomingInvitations`'s RPC error branch: on `42501`, read `supabase.auth.getSession()` (local storage, error path only, so a successful poll pays nothing). With no session, return `[]` without logging. With a session present, log as before, because that means signed-in users lost EXECUTE.

**Rejected: extending P913's function-name predicate in `logDbError`** (first draft of this fix). Review (Opus, Codex, Gemini, 2026-10-01) found three problems. It cannot tell an anon artifact from a real grant regression, and the only test covering this RPC's grant (`e2e/integration/p1222-public-agreement-pii.spec.ts:326`) runs in no CI job, so a regression would be silent in prod. Its `includes` match also swallows any prefixed function name. And that branch drops errors without a `noteSuppression` breadcrumb. P913's `_is_letter_*` suppression has the same blind spot. That is out of scope here and filed as a follow-up.

## Acceptance Criteria

- [x] A 42501 from `get_my_pending_invitations` with no client session is not logged, and the badge gets `[]`. Covered by `src/tests/p1382-pending-invitations-anon-no-sentry.test.ts`.
- [x] The same 42501 with a session present still reaches `logDbError` (grant regression stays visible).
- [x] A non-42501 error with no session still reaches `logDbError`.
- [x] No change to the function's grants: the branch diff touches no `supabase/migrations` file (0 matches, 2026-10-01).
