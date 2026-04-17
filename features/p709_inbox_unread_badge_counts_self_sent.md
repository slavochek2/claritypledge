---
id: p709
type: bug
status: qa
severity: high
delivery_stage: fix
pipeline_ran: [fix]
date_reported: 2026-04-15
date_resolved: 2026-04-15
root_cause: getUnreadLetterCount Branch 1 counted all received deliveries with no self-sent exclusion; get_inbox_items RPC excluded self-sent via sender_id != v_user_id but count query was never updated to match.
resolution: Two-step pattern — fetch own letter IDs upfront (select id + status), exclude from Branch 1 via .not('letter_id','in',...), consolidate Branch 2 to reuse same result.
branch: feature/letters-ship
worktree: w2
tags: []
rank: 1000709.0
created_date: 2026-04-15
---

# P709: Inbox Unread Badge Counts Self-Sent Letters

## Bug Description

**Severity:** High (inbox badge shows phantom unread items)

**Symptoms:**
- "Inbox (1)" badge appears but no row shows as unread.
- Badge count never reaches zero even after reading all letters.

**Reproduction steps:**
1. User sends a one-to-many letter to themselves (or any delivery where sender = receiver profile).
2. Open the inbox.
3. Expected: badge shows only truly unread received letters.
4. Actual: badge inflated by self-sent letter deliveries with `read_at IS NULL`.

## Root Cause

`getUnreadLetterCount` Branch 1 counts all `letter_deliveries WHERE receiver_profile_id = userId AND read_at IS NULL` with no join — it includes self-sent letters.

The `get_inbox_items` RPC excludes self-sent via `AND cl.sender_id != v_user_id` (added in migration `20260412134713`). The count query was never updated to match.

DB confirmed: orphan delivery `2571ece6` has `letter_id = 64c1d20e`, which is in the user's own sealed letters — proving self-sent.

## Fix

Two-step pattern (mirrors existing Branch 2 style, no embed-filter risk):
1. Fetch all letter IDs the user sent: `clarity_letters WHERE sender_id = userId`
2. Count unread received deliveries excluding those IDs: `letter_deliveries WHERE receiver_profile_id = userId AND letter_id NOT IN (ownIds) AND read_at IS NULL`

Consolidate Branch 2's separate sealed-letters fetch into the same up-front query.

## Acceptance Criteria

- [x] `getUnreadLetterCount` excludes self-sent letters from Branch 1 count
- [x] Branch 2 (responses to my letters) still counts correctly
- [x] Canary test `src/tests/p709-unread-count-self-sent.test.ts` passes: asserts `.not` filter args + count = 0 for self-sent delivery
- [x] `npm test` — full suite green

## Files Changed

- `src/app/data/letters-service.ts` — refactor `getUnreadLetterCount`: fetch own letter IDs once, exclude from Branch 1, consolidate Branch 2
- `src/tests/p709-unread-count-self-sent.test.ts` — new canary test
