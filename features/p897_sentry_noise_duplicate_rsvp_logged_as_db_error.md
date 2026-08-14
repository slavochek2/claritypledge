---
status: backlog
type: bug
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
delivery_stage: create-bug
pipeline_ran:
  - create-bug
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

Check `error.code === '23505'` before `logDbError`; for duplicates skip the Sentry report (decide return semantics: arguably `true`, since the desired state — RSVP exists — holds; current code returns `false`). Keep `logDbError` for all other errors. Mirror the P883 pattern and the `badge-service-real.ts` guard. Add a unit test asserting `logDbError` is NOT called for 23505 and IS called for other errors.

## Acceptance Criteria

- [ ] Duplicate RSVP (23505) produces no Sentry/logDbError call (verified by unit test)
- [ ] Unexpected insert errors in `rsvpToEvent` are still reported via `logDbError`
- [ ] RSVP flow on `/events` behaves unchanged for the user
