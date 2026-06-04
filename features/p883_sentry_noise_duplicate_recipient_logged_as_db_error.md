---
status: qa
type: bug
rank: 1000773.0
severity: low
workstream: infra
date_reported: '2026-06-04'
created_date: '2026-06-04'
date_resolved: '2026-06-04'
root_cause: logDbError called before expected-constraint translation in addRecipientToSealed
resolution: Reordered — duplicate-constraint check first, Sentry report only for unexpected errors
tags: [sentry, noise, letters, error-handling]
delivery_stage: ship
pipeline_ran: [create-bug, fix, ship]
---

# P883: Expected duplicate-recipient case in addRecipientToSealed reported to Sentry as DB error (JAVASCRIPT-REACT-1X)

## Summary

Sentry issue JAVASCRIPT-REACT-1X ("DB error in addRecipientToSealed: duplicate key value violates unique constraint idx_letter_deliveries_unique_email", culprit `/letters`, 2 events, 0 users impacted) fires for a case the code already handles gracefully — adding a recipient who was already invited.

## Root Cause

In `src/app/data/letters-service.ts` `addRecipientToSealed()` (line ~904), `logDbError('addRecipientToSealed', error)` is called **before** the branch that detects the `idx_letter_deliveries_unique_email` / `idx_letter_deliveries_one_per_recipient` violations and converts them to the friendly "This person has already been invited to this letter." error. So the expected, user-recoverable duplicate-invite path still ships a Sentry error event every time.

The unique index itself (`supabase/migrations/20260405051035_p651_letter_onboarding_fixes.sql`) is correct and intentional — it's the error-reporting order that's wrong.

**Resolved during fix:** the UI (`letter-receiver-modal.tsx` batch path, ~line 418) catches per-row errors and surfaces `err.message` — the friendly "already been invited" message — in the row's error display. Users do get clear feedback; the 2 events were just the over-eager Sentry report.

## Reproduction Steps

1. As a verified user with a sealed letter, open the letter's receiver modal (`/letters` → letter → add recipient)
2. Add recipient `x@example.com` — succeeds
3. Add the same `x@example.com` again to the same letter
4. Observe: UI shows "already been invited" (expected), **and** a new Sentry error event appears on JAVASCRIPT-REACT-1X (the bug)

**Reproduction rate:** 100%

## Expected Behavior

Duplicate-invite attempts show the friendly message and produce **no** Sentry error event — it's an expected user action, not a defect.

## Actual Behavior

Every duplicate-invite attempt logs a "DB error" to Sentry, keeping the issue perpetually unresolved and polluting weekly reviews.

## Affected Files

- `src/app/data/letters-service.ts` — `addRecipientToSealed()`, ~line 904: `logDbError` called before the expected-constraint check

## Severity

**Low** — observability noise; the user-facing path already behaves correctly.

## Fix Approach

Reorder: check for the two known unique-constraint messages first and throw the friendly error **without** calling `logDbError`; only call `logDbError` for unexpected errors. Grep for the same pattern (expected-constraint handled after `logDbError`) elsewhere in `letters-service.ts` and fix all instances at once. After deploy, resolve JAVASCRIPT-REACT-1X in Sentry.

## Acceptance Criteria

- [x] Duplicate-invite attempt shows "This person has already been invited to this letter." and produces no Sentry event (verify via unit test that the Sentry/log path is not invoked for constraint-violation errors)
- [x] Unexpected DB errors in `addRecipientToSealed` are still reported to Sentry
- [ ] [post-deploy] After deploy: JAVASCRIPT-REACT-1X resolved and does not regress for 7 days

## Resolution

**Fixed:** 2026-06-04
**Root cause:** `logDbError('addRecipientToSealed', error)` ran before the branch translating the two expected unique-constraint violations to the friendly error, so every duplicate-invite shipped a Sentry event.
**Resolution:** Reordered — constraint check first (friendly error, no Sentry report), `logDbError` only for unexpected errors. Constraint name verified to surface in `error.message` via the prod Sentry events themselves.

**Files changed:**
- `src/app/data/letters-service.ts` (`addRecipientToSealed`, ~line 904)

**Regression test:** `src/tests/p883-duplicate-recipient-no-sentry.test.ts` (failed before fix, passes after; unexpected-error path still reported)

**Surface audit:** `rsvpToEvent` (`events-service-real.ts:562`) has the same bug class → filed as P897. `stories-service-real.ts`, `badge-service-real.ts`, `api.ts` already guard correctly.
