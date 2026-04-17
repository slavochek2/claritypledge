---
id: P728
title: Add recipient shows raw DB constraint error on duplicate email
type: bug
status: all-done
completed_at: 2026-04-17
pipeline_plan: [reproduce, fix, ship]
pipeline_ran: [reproduce, fix]
created: 2026-04-16
tags: []
rank: 1000733.0
created_date: 2026-04-16
---

## Problem

When a user tries to add a recipient who has already been invited to a letter, the modal surfaces the raw Postgres unique constraint error verbatim: `"duplicate key value violates unique constraint 'idx_letter_deliveries_unique_email'"`.

## Symptoms

- User sees raw DB error string in the modal
- No actionable guidance ("this person is already invited")
- Console shows unhandled error from letters-service

## Root Cause

The service layer propagates the Postgres error directly to the UI without translating it to a user-friendly message. The `LetterReceiverModal` receives the error and shows it as-is without checking for known constraint names.

## Affected Files

- `src/app/components/letters/letter-receiver-modal.tsx` — error display
- `src/app/data/letters-service.ts` — error propagation (add delivery call)

## Fix Approach

Catch the Postgres unique constraint error in the service or modal, detect `idx_letter_deliveries_unique_email` in the error message, and surface: `"This person has already been invited to this letter."` Optionally prevent the send button from firing if the email is already in the deliveries list.

## Acceptance Criteria

- [x] Duplicate email shows "This person has already been invited to this letter." instead of raw constraint error
- [x] Raw constraint string never visible to user
- [x] Regression test passes

## Resolution

**Root cause:** `addRecipientToSealed` threw `Failed to add recipient: ${error.message}` with raw Postgres constraint error. Modal displayed it verbatim.

**Fix:** Defense-in-depth at two layers:
1. **Service** (`letters-service.ts:803`): detects `idx_letter_deliveries_unique_email` in error, throws friendly message
2. **Modal** (`letter-receiver-modal.tsx:421`): catch block also detects constraint name as fallback

**Files changed:**
- `src/app/data/letters-service.ts` (line 803)
- `src/app/components/letters/letter-receiver-modal.tsx` (line 421)

**Regression test:** `src/tests/p728-add-recipient-duplicate-error.test.tsx`

date_resolved: 2026-04-16

## Reproduce Artifact

```yaml
reproduce_artifact:
  test_file: src/tests/p728-add-recipient-duplicate-error.test.tsx
  root_cause: "Raw Postgres unique constraint error propagated to UI without translation to user-friendly message"
  confidence: high
  surfaces_in_scope: [letter-receiver-modal]
  surfaces_deferred: []
  reproduced_at: 2026-04-16
```
