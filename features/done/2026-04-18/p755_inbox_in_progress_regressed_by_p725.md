---
id: P755
title: Inbox sender view loses in-progress state and progress fields after P725 migration
type: bug
status: all-done
completed_at: 2026-04-18
pipeline_plan: [fix]
pipeline_ran: [fix, ship]
tags: [letters, inbox, rpc, regression]
rank: 1
created_date: 2026-04-18
---

## Problem

A user who sends a letter via email to a registered recipient no longer sees the
recipient's in-progress row in their inbox while the recipient is filling out the
letter. The in-progress row only appears on completion. This worked as of P732
(closed 2026-04-17).

**Regression introduced by:** `20260417100000_p725_inbox_actor_slug.sql` — merged
same day as P732 closed. The `CREATE OR REPLACE FUNCTION get_inbox_items()` in P725
silently dropped several fields and changed the WHERE gate for Branch 2 (responses
on letters I sent).

## Root Cause

`supabase/migrations/20260417100000_p725_inbox_actor_slug.sql` used
`CREATE OR REPLACE FUNCTION get_inbox_items()` to add `actor_slug` but silently
dropped the following relative to the P699 version
(`20260415190000_p699_inbox_order_and_case_align.sql`):

**Both branches:**
- `steps_completed` JSON field — removed
- `total_steps` JSON field — removed

**Branch 2 (responses on letters I sent) only:**
- `completed_at` JSON field — removed
- Four-arm CASE for `type` collapsed to two arms — `recipient_in_progress` and
  `link_respondent_in_progress` arms dropped
- WHERE gate changed from
  `(ld.completed_at IS NOT NULL OR ld.status = 'in_progress')` to
  `ld.status = 'completed'` — **in-progress rows filtered out entirely**

**Outer query:**
- `ORDER BY` reverted from `(item->>'timestamp')::timestamptz DESC` (correct cast)
  to text-sort `item->>'timestamp' DESC` — silent sort regression

The frontend (`inbox-tab.tsx`, `sent-tab.tsx`) still switches on
`recipient_in_progress` / `link_respondent_in_progress` and reads
`steps_completed` / `total_steps` — those code paths are dead until the RPC emits
the fields again.

## Reproduction Steps

1. Sender creates a letter and sends it via email to a registered recipient.
2. Recipient opens the link and submits the first point/rating.
3. Sender refreshes their inbox.
4. Expected: inbox shows an in-progress row with "x of y steps" label.
5. Actual: inbox shows nothing until recipient fully completes the letter.

## Acceptance Criteria

- [ ] `e2e/integration/p699-sender-inbox-in-progress.spec.ts` fails on current HEAD (canary red)
- [ ] After migration applied, same test passes (canary green)
- [ ] `npm test -- p699-inbox-progress-label` passes (renderer contract check)
- [ ] `e2e/p732-inbox-results-on-first-step.spec.ts` still passes (no regression)
- [ ] Manual browser check: sender sees in-progress row with "x of y steps" as
  soon as recipient submits first point/rating

## Files Changed

- **New:** `supabase/migrations/20260418200000_p755_restore_inbox_in_progress_rpc.sql`
- No frontend changes required — consumer code already handles the restored shape.

## Canary Test

Pre-existing: `e2e/integration/p699-sender-inbox-in-progress.spec.ts`
