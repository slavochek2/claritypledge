---
status: in-progress
type: bug
rank: 1000720.0
severity: medium
workstream: letters
date_reported: '2026-04-16'
created_date: '2026-04-16'
tags: [letters, inbox, sent-tab, realtime]
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_file: e2e/p720-sent-tab-realtime.spec.ts
  root_cause: "sent-tab.tsx has no Supabase real-time subscription — fetchData() called once on mount; delivery status changes in DB are invisible until manual page refresh"
  confidence: high
  surfaces_in_scope: [sent-tab, inbox-tab]
  surfaces_deferred: []
  reproduced_at: '2026-04-16'
---

# P720: Sent tab and inbox tab don't update when recipient responds

## Problem

After a recipient opens a letter, responds to steps, and submits — the sender's
**Sent tab** and **Inbox tab** remain stale. No update appears until the sender
manually refreshes the page.

Two visible symptoms:
1. Sent letter card continues to show the old delivery status (e.g. "Sent" or "Opened") even after recipient reaches "In progress" or "Completed".
2. No "x of y steps" progress counter appears for in-progress deliveries.

The underlying data IS written to DB correctly (recipient is authenticated via
P715 flow; responses are saved). The gap is purely in the sender's UI — neither
`sent-tab.tsx` nor `inbox-tab.tsx` subscribes to real-time changes.

## Root Cause

Both tabs fetch data once on mount only:

```ts
// sent-tab.tsx
useEffect(() => {
  fetchData();
}, [fetchData]);

// inbox-tab.tsx
useEffect(() => {
  fetchItems();
}, [fetchItems]);
```

No Supabase real-time subscription is set up for `letter_deliveries` changes.
When a recipient submits a step, `letter_deliveries.status` changes to
`in_progress` and `get_deliveries_with_progress` RPC would return updated
`steps_completed` — but the sender's tab never re-queries.

## Reproduction

1. Sender creates a letter with at least one story/point and sends it to a
   recipient via email invite
2. Recipient opens via email link (P715 flow — gets new account)
3. Recipient responds to at least one step
4. Sender observes their Sent tab — **no update appears** (stale status remains)
5. Sender manually refreshes page — sent card now shows "In progress" + step count

## Affected Files

| File | Change needed |
|------|--------------|
| `src/app/components/letters/sent-tab.tsx` | Add Supabase real-time subscription on `letter_deliveries` for sender's letters; call `fetchData()` on INSERT/UPDATE |
| `src/app/components/letters/inbox-tab.tsx` | Add Supabase real-time subscription; call `fetchItems()` on relevant changes |

## Acceptance Criteria

- [ ] Sent tab updates delivery status (Sent → In progress → Completed) without page refresh when recipient interacts
- [ ] "x of y steps" progress counter appears in sent tab `RecipientRow` without page refresh when recipient makes progress
- [ ] Inbox tab shows new `recipient_responded` / `recipient_in_progress` items without page refresh
- [ ] No duplicate subscription on component re-renders (cleanup on unmount)
- [ ] `npm test` passes
