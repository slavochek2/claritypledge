---
id: P732
title: Inbox results arrive on first step, not only on completion
type: bug
status: in-progress
delivery_stage: reproduce
pipeline_ran: [reproduce]
reproduce_artifact:
  test_file: src/tests/p732-inbox-results-on-first-step.test.ts
  root_cause: "updateDeliveryStatus('in_progress') only fires in nextStory() at story-0→1 transition; single-story letters skip it entirely, going straight to completed"
  confidence: high
  reproduced_at: 2026-04-16
---

## Problem

When a recipient opens a letter and submits their first answer (step 1), the author sees no entry in their inbox Results tab. The result row only appears once the recipient completes the entire letter.

For single-story letters this means: the row never appears as `in_progress` — the delivery jumps straight from `opened` to `completed`, and the author only gets the notification at the very end.

## Root Cause

In `useLetterReadingState.ts`, the `in_progress` status update is only triggered inside `nextStory()` when advancing from story index 0 → 1 (line 567). Single-story letters never make this transition — `nextStory()` goes straight to `completed`. Multi-story letters show the row only after the recipient finishes story 1 entirely.

Neither `submitPointPosition` nor `submitStoryRating` ever calls `updateDeliveryStatus('in_progress')`, so the delivery remains at `opened` through all intermediate steps.

The `get_inbox_items` DB function (migration `20260415190000_p699_inbox_order_and_case_align.sql`, line 117) already gates the sender's view on `completed_at IS NOT NULL OR status = 'in_progress'`. The DB side is correct — the frontend just never transitions to `in_progress` early enough.

## Expected Behaviour

- As soon as the recipient submits their first answer (point position or story rating), the delivery status transitions to `in_progress`.
- The author's inbox immediately shows a result row for that recipient.
- `steps_completed` increments live with each subsequent answer (already works via the dynamic COUNT in `get_inbox_items`).

## Fix

In `useLetterReadingState.ts`:
1. Add a `hasMarkedInProgress` ref (fires once, never resets).
2. At the top of `submitPointPosition` and `submitStoryRating` (remote/token paths), fire `updateDeliveryStatus(deliveryId, 'in_progress')` on first call.
3. Remove the `in_progress` block from `nextStory()` (it becomes redundant — by story 1→2 transition, `in_progress` is already set).

Files: `src/app/hooks/useLetterReadingState.ts`
