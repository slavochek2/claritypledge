---
status: all-done
type: bug
rank: 31
severity: medium
workstream: infrastructure
date_reported: '2026-10-13'
created_date: '2026-10-13'
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [sentry, observability, letters, error-handling]
disclosure: public
pipeline_ran: [create-bug, dev, ship]
completed_at: 2026-10-14
---

# P1475: Letter-helper 42501 is suppressed by function name alone, so a signed-in user losing EXECUTE would never reach Sentry

## Summary

`logDbError` silently drops every 42501 whose message contains `permission denied for function
_is_letter_`, whether or not the client has a session, and leaves no breadcrumb. A real grant
regression for signed-in users on the letter RLS helpers would therefore be invisible in production.

## Root Cause

`src/app/data/db-error-logger.ts:75-79` (P913):

```ts
const isExpiredSessionRpcDenied =
  error.code === '42501' &&
  msg.includes('permission denied for function _is_letter_');
if (isExpiredSessionRpcDenied) return;
```

P913 assumed that "a real authenticated user can never hit this — the grant is verified present on
prod". That holds only while the grant stays in place. The predicate cannot tell an anonymous
artifact (a stale `user` in React after the Supabase client dropped its session, so a background poll
such as `getUnreadLetterCount` runs as `anon`) from a signed-in user whose `EXECUTE` was revoked by a
bad migration. It also:

- over-matches any function whose name starts with `_is_letter_`, because it uses `includes()`;
- returns without calling `noteSuppression`, unlike the network-blip and PGRST303 branches in the
  same function (`:59`, `:99`), so the drop leaves no trace on the next captured event.

The same blind spot was found in P1382's first draft and rejected by three reviewers. P1382 shipped
the session-gated shape at the caller instead (`src/app/data/agreements-service-real.ts:728-737`) and
explicitly left this P913 branch for follow-up (decisions.md 2026-10-01).

## Invariants

- **Suppression of an anon 42501 happens at the caller, only when the client has no session**
  (decisions.md 2026-10-01 [technical], P1382). The rejected alternative is a function-name
  predicate in `logDbError`. Do not reintroduce one, session-gated or not.
- **The session read runs on the error path only.** A successful poll must not pay for
  `supabase.auth.getSession()`.
- **A suppression leaves a trace.** Every dropped error records a `db-error-suppressed` breadcrumb
  (P990's rule, `db-error-logger.ts:16-22`).

## Reproduction Steps

Code-level. A live reproduction would require revoking a prod grant, which is out of bounds.

1. In a unit test, set production mode (`isDev` false) and mock `@sentry/react`.
2. Call `logDbError('getUnreadLetterCount.received', { code: '42501', message: 'permission denied
   for function _is_letter_receiver', details: null, hint: null })`.
3. Observe: `Sentry.captureException` is **not** called, and `Sentry.addBreadcrumb` is **not**
   called. The same happens whether or not a session exists, because `logDbError` never looks.

**Reproduction rate:** 100% (deterministic code path).

## Expected Behavior

- A 42501 on a letter helper **with** a client session is captured in Sentry like any other DB error.
- A 42501 on a letter helper **without** a client session, from a background poll whose caller
  already degrades gracefully, is dropped at that caller and leaves a `db-error-suppressed`
  breadcrumb.

## Actual Behavior

Both cases are dropped inside `logDbError`, with no breadcrumb.

## Affected Files

- `src/app/data/db-error-logger.ts:65-79`: the name predicate to remove.
- `src/app/data/letters-service.ts:1275` `getUnreadLetterCount`: the documented polling caller
  (badge, via `src/app/hooks/useUnreadLetterCount.ts`). Its three `logDbError` calls (`.ownLetters`,
  `.received`, `.responses`) need the session-gated branch.
- `src/tests/db-error-logger.test.ts`: existing suite.
- `src/tests/p1382-pending-invitations-anon-no-sentry.test.ts`: the pattern to mirror.

## Severity

**Medium.** Nothing is broken for users today, but the one signal that would catch a broken letter
grant for every signed-in user is switched off.

## Fix Approach

1. Delete the `isExpiredSessionRpcDenied` branch from `logDbError`, with its comment.
2. In `getUnreadLetterCount`, on any `error.code === '42501'`, read `supabase.auth.getSession()`
   **once**. With no session, return `0` without calling `logDbError`, and record a
   `db-error-suppressed` breadcrumb with `reason: 'no-session'`. To do that, export a narrow helper
   from `db-error-logger.ts` (for example, `noteNoSessionSuppression(context)`) rather than calling
   Sentry directly from the service. With a session, log as today.
3. Before finishing, check whether any **other** background poller reads letter tables, using
   `grep -rn "setInterval\|refetchInterval" src/app/hooks` near letter services. Apply the same
   branch only to pollers that already degrade to an empty or zero result. Do not touch
   user-initiated reads. List what was found in the fix notes.

## Acceptance Criteria

- [x] `logDbError` with `{ code: '42501', message: 'permission denied for function
      _is_letter_receiver' }` in production mode calls `Sentry.captureException` (new test in
      `src/tests/db-error-logger.test.ts`). This test was seen to fail before the change.
      *Evidence (dev): pre-fix run `× reports 42501 "permission denied for function
      _is_letter_receiver" — no function-name suppression` (and `_sender`); post-fix ✓.*
- [x] `getUnreadLetterCount` with a 42501 and **no** session returns `0`, does not call
      `captureException`, and records a `db-error-suppressed` breadcrumb with reason `no-session`
      (new test, mirroring the P1382 canary).
      *Evidence (dev): `src/tests/p1475-unread-count-anon-no-sentry.test.ts`, all-denied case plus
      one case per read site (5); all failed pre-fix, all ✓ post-fix.*
- [x] `getUnreadLetterCount` with a 42501 **and** a session calls `captureException` (new test).
      *Evidence (dev): 5 per-site cases plus a several-errors case (session read once, 3 captures);
      failed pre-fix, ✓ post-fix. Mutation (caller suppresses every 42501 regardless of session)
      → `6 failed | 8 passed`; restored → `14 passed`.*
- [x] `getUnreadLetterCount` on a successful query does not call `supabase.auth.getSession()`
      (asserted in the test).
      *Evidence (dev): `control: success path counts every branch and never reads the session` ✓
      (returns 3, `getSession` not called); a non-42501 error also never reads it ✓.*
- [x] `npx vitest run src/tests/db-error-logger.test.ts src/tests/p1382-pending-invitations-anon-no-sentry.test.ts`
      passes, along with the new tests.
      *Evidence (dev): with p1475 + p913 added → `Test Files 4 passed (4) · Tests 34 passed (34)`.*
- [x] `grep -n "_is_letter_" src/app/data/db-error-logger.ts` returns nothing.
      *Evidence (dev): no output, grep exit=1.*

## Fix Notes (dev)

- **All five reads in `getUnreadLetterCount` are gated, not three.** The old `includes('_is_letter_')`
  also matched `_is_letter_participant` (P904), which `story_explain_backs` RLS calls. The session is
  read at most once per call, and the first anon 42501 returns `0` with one breadcrumb.
- **`src/tests/p913-unread-count-anon-no-sentry.test.ts`:** its two `_is_letter_*` cases asserted the
  removed name predicate ("skips Sentry"). They are inverted to "reports" and point at the P1475 canary.
  This follows AC1 and the decisions.md 2026-10-01 ruling. The table-42501 and 42P01 cases are unchanged.
- **Other letter pollers (step 3):** `grep setInterval|refetchInterval|visibilitychange` found
  `inbox-tab.tsx` (15s), `sent-tab.tsx` (15s), `letter-results-page.tsx` (visibility) and
  `usePendingPartnerInvitationCount` (P1382, already gated). None is changed:
  - `getInboxItems`, `getAllSentLetters` and `getDeliveriesForLetters` call `requireAuth()` first, so
    they never query without a session.
  - `getUnreadExplainBackCountsByDelivery` runs only after `getInboxItems` passed `requireAuth()` in
    the same tick, and its table policy is `TO authenticated`, so anon gets empty rows, not 42501.
  - The letter-results refetch is a page view whose failure goes to `not-found`, not a degrade-to-zero
    badge.
- **Residual exposure:** `clarity_letters`, `letter_deliveries`, `letter_story_snapshots`,
  `letter_predictions` and `letter_point_responses` have SELECT policies with no role scope. A
  user-initiated read of these tables can still run as anon, with a stale React `user`, no session
  and no `requireAuth`. Those reads are `getLetterForReading`, `getLetterPointResponses`,
  `updateDeliveryStatus`, `findLetterPreloadForStory` and `docsService.getDocsByUser`. They used to
  drop this 42501 silently and will now report it. That is deliberate under this spec's non-goal of
  leaving user-initiated reads alone. If it becomes Sentry noise, gate it at the caller.

## Non-Goals

- Do NOT add a CI job for `e2e/integration/` (the P1222 grant test runs in no CI job). Separate
  concern.
- Do NOT change the PGRST303 or network-blip branches.
- Do NOT change RLS policies or grants on the letter helpers.
- Do NOT add a function-name or message-shape predicate to `logDbError` or `sentryBeforeSend`
  (P883, decisions.md 2026-10-01).

## Related

- P913: the original suppression. P1382: the session-gated shape this follows.
- P990: suppressions must leave a breadcrumb.
- decisions.md 2026-07-15 [technical]: the Sentry noise ladder, whose rung 2 is the choke-point
  suppression P913 used. For this anon class, rung 2 is narrowed by the 2026-10-01 ruling.

Promoted from the task inbox, 2026-10-13.
