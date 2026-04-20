---
id: p695
title: Completed letter revisit shows reading flow instead of results
type: bug
status: all-done
completed_at: '2026-04-20'
severity: high
pipeline_ran:
  - fix
date_reported: 2026-04-12T00:00:00.000Z
tags: []
rank: 1000695
created_date: 2026-04-12T00:00:00.000Z
locked_at: '2026-04-20T09:56:30.362Z'
---

# P695: Completed Letter Revisit — Show Results Instead of Re-Reading

## Bug Description

**Severity:** High — recipient who revisits a completed letter sees the reading cover/flow again instead of results
**Reported:** 2026-04-12

**Symptoms:**
- Recipient completes reading a letter (rates all stories)
- Revisiting via inbox button or email link shows the letter cover ("Open the Letter")
- The inbox button stays "Read" (blue filled) even after completion
- Expected: completed letters show completion summary; inbox button shows "Results" (outline)

**Reproduction steps:**
1. Send a letter and complete it as recipient (rate all stories)
2. Open inbox — button shows "Read" (blue filled), not "Results"
3. Click the button — lands on letter cover, not completion summary
4. Re-click email link — same: cover loads, not completion summary

**Affected users:** All recipients who revisit completed letters

---

## Root Cause

Two independent gaps:

1. **Inbox button:** `get_inbox_items` SQL RPC doesn't expose `completed_at` in the received-letters branch. `InboxItem` type lacks `completed_at`. `inbox-tab.tsx` uses `item.type === 'received'` to choose blue/filled styling — always true for received items regardless of completion.

2. **Reading page:** `letter-reading-page.tsx` load effect sets `viewState` to `'cover'` unconditionally after loading data. It never checks `delivery.status === 'completed'` to skip to `'complete'`.

---

## Resolution

**Fixed:** 2026-04-12
**Root cause:** RPC missing `completed_at`, InboxItem type missing field, inbox-tab not checking completion, letter-reading-page not checking delivery status on load
**Resolution:** 5-change fix: SQL migration exposes `completed_at`, TypeScript type updated, service maps it, inbox-tab uses it for button styling/label, reading page skips to complete view if delivery already completed

**Files changed:**
- `supabase/migrations/20260412160000_p695_inbox_show_completed_received.sql` (new)
- `src/app/types/index.ts` (~line 1393)
- `src/app/data/letters-service.ts` (~line 735)
- `src/app/components/letters/inbox-tab.tsx` (~lines 155-163)
- `src/app/pages/letter-reading-page.tsx` (~lines 154, 220)

**Regression test:** `e2e/p695-completed-letter-revisit.spec.ts`

---

## Acceptance Criteria

- [x] Inbox: completed received letters show "Results" button (outline variant, no blue fill)
- [x] Inbox: pending received letters still show "Read" button (blue filled)
- [x] Clicking "Results" from inbox navigates to `/letter/:id` and shows completion summary (not cover)
- [x] Clicking email link for a completed letter shows completion summary (not cover)
- [x] New unread/unopen received letters: no regression — still show "Read" and open to cover
- [x] Regression test passes after fix

## Out of Scope

- Response navigation from sender's inbox (already correct — shows "Results" for `recipient_responded` / `link_respondent`)
- One-to-many public reading path (no delivery record, skip fires correctly)
