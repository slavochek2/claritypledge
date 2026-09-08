---
status: qa
type: bug
disclosure: public
rank: 65
severity: low
workstream: infra
date_reported: '2026-06-04'
created_date: '2026-06-04'
tags:
  - sentry
  - noise
  - events
  - error-handling
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
---

# P897: Expected duplicate-RSVP case in rsvpToEvent reported to Sentry as DB error

## Summary

`rsvpToEvent` in `src/app/data/events-service-real.ts` calls `logDbError` for 23505 unique violations (user RSVPs to an event they already RSVP'd to) — an expected, user-recoverable case its own inline comment acknowledges ("23505 = unique violation (already RSVP'd)"). Same bug class as P883 (`addRecipientToSealed`), discovered during the P883 surface audit.

## Root Cause

In `rsvpToEvent`, the error branch logs every insert error to Sentry before (and regardless of) classifying it:

```ts
if (error) {
  // 23505 = unique violation (already RSVP'd)
  logDbError('rsvpToEvent', error);
  return false;
}
```

The comment shows the duplicate case was recognized as expected, but the code still ships a Sentry error event for it. Contrast with the correct sibling patterns: `stories-service-real.ts:604` (`if (error.code === '23505') return true;` before logging) and `badge-service-real.ts:62` (`if (error?.code !== '23505')` guard around `logDbError`).

## Reproduction Steps

1. As an authenticated user, RSVP to an event on `/events` — succeeds
2. Trigger a second RSVP insert for the same event/profile pair (e.g., double-click race, or re-invoking the RSVP action while state is stale)
3. Observe: insert fails with 23505, `logDbError` ships a Sentry error event for the expected duplicate

**Reproduction rate:** 100% (whenever a duplicate insert reaches the DB)

## Expected Behavior

Duplicate RSVP attempts produce no Sentry error event — handled as an expected idempotent case. Unexpected insert errors are still reported.

## Actual Behavior

Every duplicate RSVP logs a "DB error in rsvpToEvent" event to Sentry, polluting observability with non-defects.

## Affected Files

- `src/app/data/events-service-real.ts` — `rsvpToEvent`, ~line 560-564: `logDbError` called without a 23505 guard

## Severity

**Low** — observability noise only; user-facing behavior unaffected.

## Fix Approach

**Done:** check `error.code === '23505'` before `logDbError`; for duplicates skip the Sentry report (decide return semantics: arguably `true`, since the desired state — RSVP exists — holds; current code returns `false`). Keep `logDbError` for all other errors. Mirror the P883 pattern and the `badge-service-real.ts` guard. Add a unit test asserting `logDbError` is NOT called for 23505 and IS called for other errors.

## Acceptance Criteria

- [x] Duplicate RSVP (23505) produces no Sentry/logDbError call (verified by unit test) — `src/tests/p897-duplicate-rsvp-no-sentry.test.ts` case 1 asserts `logDbError` is never called on a 23505 insert error. It failed before the fix (`Number of calls: 1`) and passes after.
- [x] Unexpected insert errors in `rsvpToEvent` are still reported via `logDbError` — two further cases in the same file: a 42501 permission error and an error carrying no `code` at all. Both assert `logDbError('rsvpToEvent', error)` is called exactly once. Guard is `error.code !== '23505'`, so a missing code still logs.
- [x] RSVP flow on `/events` behaves unchanged for the user — the return value stays `false` for a duplicate; only the Sentry report is suppressed. `src/tests/events-service-real.test.ts` (28 tests, including `returns false on duplicate RSVP`) and `src/tests/events-service.test.ts` both still pass: 66/66 green across the three files. See the Fix Approach note on return semantics — switching `false` to `true` was deliberately NOT done, because an existing test pins `false` and the change would alter what the user sees.

## Return-semantics decision (P897 fix)

The Fix Approach left the return value open ("arguably `true`, since the desired state — RSVP
exists — holds"). This fix keeps `false` and suppresses only the Sentry report, for two reasons:

1. `src/tests/events-service-real.test.ts` already pins `returns false on duplicate RSVP`. Tests
   are specs in this repo, so flipping the return would mean changing a spec, not fixing a bug.
2. Acceptance criterion 3 requires the `/events` RSVP flow to behave unchanged for the user.
   `EventDetail.tsx:299` branches on the boolean, so returning `true` is a user-visible change.

[FOUNDER DECISION: should a duplicate RSVP return `true` (idempotent success, matching
`stories-service-real.ts:613`) so a double-click race stops showing an error to a user who is in
fact RSVP'd? That is a separate, user-visible change and is not made here.]

## Code-review findings (codex, adversarial pass)

Verdict: **BLOCK** — but on pre-existing RSVP integrity, not on this change. The reviewer's own
closing line: *"The P897 branch itself correctly suppresses `logDbError` for `23505`; the new test
verifies that seam."* All three findings predate this fix and none is reachable from the diff.
Recorded here rather than acted on, because each is a separate defect needing its own spec:

1. **[HIGH] RSVP rules are enforced only in browser code.** `rsvpToEvent` checks event status and
   capacity client-side, while the insert policy (`supabase/migrations/20260118_create_events.sql:73`)
   lets any authenticated user insert their own RSVP with no status, time or capacity check. A
   direct Supabase call can RSVP to a cancelled, past or full event.
2. **[HIGH] Capacity can be exceeded.** The count and the insert are two statements, so two users
   taking the last seat can both pass the check. The unique constraint guarantees one RSVP per
   attendee, never the seat total.
3. **[MEDIUM] The post-auth RSVP path accepts expired events.** `src/auth/AuthCallbackPage.tsx:600`
   calls `rsvpToEvent` after signup without the UI's past-event guard, and `rsvpToEvent` rejects
   only cancelled events.

[FOUNDER DECISION: findings 1-3 need their own P-numbers. They were not filed during this
overnight run because filing three security-shaped specs unprompted is a scope call, not a fix.]
