---
status: all-done
completed_at: 2026-04-17
type: bug
rank: 1000720.0
severity: medium
workstream: letters
date_reported: '2026-04-16'
created_date: '2026-04-16'
tags: [letters, inbox, sent-tab, polling]
pipeline_ran: [create-bug, reproduce, fix]
date_resolved: '2026-04-16'
root_cause: sent-tab.tsx and inbox-tab.tsx called fetchData/fetchItems once on mount with no polling or subscription; DB changes from recipient interactions were invisible until manual page refresh
resolution: Added 15s setInterval polling + visibilitychange listener to both SentTab and InboxTab useEffects, with cleanup on unmount; canary test updated to 20s timeout to match polling cycle
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

When a recipient submits a step, the DB updates but both tabs have no mechanism
to learn about it — the sender must manually refresh.

## Why Not Supabase Realtime

Realtime was evaluated and rejected:
- `letter_deliveries` has no `sender_id` column (it's on `clarity_letters` via join) — cannot filter the subscription server-side for the sender. Unfiltered subscriptions leak event metadata across all users' WebSockets.
- Step counts (`steps_completed`, `total_steps`) are computed by the `get_deliveries_with_progress` RPC from `story_ratings` and `point_responses` child tables. A `letter_deliveries` subscription never fires when a recipient completes a step — step counts stay frozen.

## Reproduction

1. Sender creates a letter with at least one story/point and sends it to a
   recipient via email invite
2. Recipient opens via email link (P715 flow — gets new account)
3. Recipient responds to at least one step
4. Sender observes their Sent tab — **no update appears** (stale status remains)
5. Sender manually refreshes page — sent card now shows "In progress" + step count

## Solution

Add **polling + visibility API** to both components. Same pattern in both files:

```tsx
useEffect(() => {
  fetchData(); // or fetchItems() in inbox-tab
  const interval = setInterval(fetchData, 15_000);
  const onVisible = () => { if (document.visibilityState === 'visible') fetchData(); };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisible);
  };
}, [fetchData]); // fetchData/fetchItems identity is stable via useCallback
```

- 15s poll catches delivery status transitions AND step count updates from child tables
- Visibility handler re-fetches immediately when user returns to the tab
- Cleanup on unmount prevents memory leaks and setState-on-unmounted-component

## Affected Files

| File | Change needed |
|------|--------------|
| `src/app/components/letters/sent-tab.tsx` | Replace mount-only `useEffect` with polling + visibility pattern |
| `src/app/components/letters/inbox-tab.tsx` | Same replacement |

## Acceptance Criteria

- [x] Sent tab updates delivery status (Sent → In progress → Completed) without page refresh when recipient interacts
- [x] "x of y steps" progress counter appears in sent tab `RecipientRow` without page refresh when recipient makes progress
- [x] Inbox tab shows new `recipient_responded` / `recipient_in_progress` items without page refresh
- [x] Cleanup on unmount: interval + visibilitychange listener both removed
- [x] Canary test `e2e/p720-sent-tab-realtime.spec.ts` passes
- [ ] `npm test` passes
