---
status: week
type: bug
rank: 1000720.0
severity: high
workstream: letters
date_reported: '2026-04-16'
created_date: '2026-04-16'
tags: [letter-delivery, rpc, stories-rated, data-integrity]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P721: stories_rated Guard Regression — inbox shows "9 of 8 steps"

## Summary

The inbox displays "9 of 8 steps" for a letter because `submit_rating_by_token` lost its `IF FOUND` guard during the P683/P684 rewrite, allowing duplicate calls to inflate `stories_rated` past the actual story count.

## Root Cause

`submit_rating_by_token` was rewritten in P683 (`20260411201933`) and the rewrite was inherited by P684 (`20260412000001`, current live version). Both lost the `IF FOUND` guard that was added in P651. The guard ensured `stories_rated` only incremented when a new `story_verifications` row was actually inserted (`ON CONFLICT DO NOTHING`). Without it, retries and double-submits increment the counter unconditionally, producing `steps_completed > total_steps`.

## Reproduction Steps

1. As a letter receiver with a delivery containing multiple stories, submit a rating for one story
2. Trigger a duplicate call — reload before response completes, or call `submit_rating_by_token` RPC twice with the same token and story_id
3. Navigate to inbox
4. Observe: progress label shows e.g. "9 of 8 steps" instead of "8 of 8 steps"

**Reproduction rate:** 100% on duplicate submission; intermittent in prod (network retries, double-click)

## Expected Behavior

`stories_rated` increments at most once per story per delivery. Inbox label never exceeds `total_steps`.

## Actual Behavior

`stories_rated` increments on every call regardless of whether `story_verifications` insert was a no-op. Inbox label can exceed `total_steps`.

## Affected Files

- `supabase/migrations/20260412000001_p684_anon_rpc_auth_guard.sql` — lines 66–122: `submit_rating_by_token` missing `IF FOUND` after `ON CONFLICT DO NOTHING`
- `supabase/migrations/20260411201933_p683_*.sql` — same regression, earlier version
- `supabase/migrations/20260415190000_p699_inbox_order_and_case_align.sql` — `get_inbox_items()` `steps_completed` calculation lacks `LEAST(...)` cap

## Severity

**High** — data integrity issue producing impossible progress values in the inbox; affects any delivery where a rating was submitted more than once (retries, double-submits).

## Fix Approach

1. `CREATE OR REPLACE FUNCTION submit_rating_by_token` — restore `IF FOUND` guard after `ON CONFLICT DO NOTHING`
2. Data repair: reset `stories_rated` to actual `COUNT(DISTINCT sv.story_id)` for deliveries where it exceeds the real story count
3. Cap `steps_completed` with `LEAST(..., total_steps)` in `get_inbox_items()` as defence in depth

## Acceptance Criteria

- [ ] Submitting a rating twice for the same story does not increment `stories_rated` more than once
- [ ] Inbox label never displays more steps completed than total steps (e.g., no "9 of 8 steps")
- [ ] Existing dirty data repaired: affected deliveries show correct count after migration
- [ ] Unit test: inbox label with `steps_completed: 9, total_steps: 8` renders as "8 of 8 steps"
- [ ] No console errors during rating submission flow
