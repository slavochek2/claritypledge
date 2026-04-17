---
id: P731
title: Sent letter doesn't appear in recipient inbox without claiming via email link
type: bug
status: qa
delivery_stage: fix
pipeline_plan: [reproduce, fix, ship]
pipeline_ran: [reproduce, fix]
created: 2026-04-16
tags: []
rank: 1000734.0
created_date: 2026-04-16
---

## Problem

When a sender sends a letter to a known user (via "Add recipient" flow), the letter does not appear in the recipient's in-app Inbox tab — unless the recipient first clicks the email invitation link.

## Symptoms

- Recipient's Inbox tab stays empty (or shows only previously claimed letters) after a new letter is sent to them
- The email notification arrives, but the in-app inbox doesn't update on subsequent polls
- Intermittent: letter appears in inbox only after recipient claims it via the link

## Root Cause

`add_recipient_to_sealed_letter` inserts a `letter_deliveries` row with `receiver_profile_id = NULL` (only `receiver_email` is set). The `get_inbox_items` RPC Branch 1 requires `ld.receiver_profile_id = v_user_id` — so any delivery without `receiver_profile_id` set is invisible to the recipient. `receiver_profile_id` is only set when `claim_letter_delivery` is called (when recipient opens via the link).

**Fix:** In `add_recipient_to_sealed_letter`, look up `profiles.id` by `p_email`. If found, set `receiver_profile_id` at insert time so the letter appears in inbox immediately on the next poll.

## Affected Files

- `supabase/migrations/` — `add_recipient_to_sealed_letter` RPC (needs email → profile lookup)

## Reproduce Artifact

```yaml
reproduce_artifact:
  test_file: e2e/p731-inbox-letter-arrival.spec.ts
  root_cause: "add_recipient_to_sealed_letter creates delivery with receiver_profile_id=NULL; get_inbox_items Branch 1 requires receiver_profile_id=v_user_id — letter invisible until claimed"
  confidence: high
  surfaces_in_scope: [inbox-tab]
  surfaces_deferred: []
  reproduced_at: 2026-04-16
```
