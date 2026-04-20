---
status: all-done
completed_at: '2026-04-20'
type: bug
severity: medium
rank: 1000756.0
tags: [live, invite, waiting-room, p745]
created_date: '2026-04-18'
date_reported: '2026-04-18'
date_resolved: '2026-04-18'
pipeline_ran: [fix, ship]
---

# P756: Resend and Back-to-event buttons broken in P745 waiting room

## Problem

Two buttons exist in `clarity-live-page.tsx`'s waiting-room ("invite-status panel") that became broken and harmful once P745 moved to push-based (Realtime) invite delivery:

1. **Resend** (`handleResendInvite`) — conceptually broken. Delivery is now push-based via Supabase Realtime; there is nothing to resend. The button exists as dead UI.
2. **Back to event** (`← Back to event`) — actively harmful. It navigates away WITHOUT closing the invite row (`closed_at` stays NULL), orphaning the invite: the receiver's banner stays visible forever and the author's "Start Clarity Live now" button stays disabled indefinitely. The Cancel button already handles navigation to `returnTo` while properly closing the invite, making "Back to event" both redundant and dangerous.

## Symptoms

- Resend button visible in waiting room but does nothing meaningful
- Author clicking "Back to event" causes orphaned invite: receiver banner stuck, author trigger permanently disabled

## Root Cause

Buttons were built for an email-based invite flow. P745 replaced delivery with Supabase Realtime push. Resend is now inert; Back-to-event never properly closed the invite row.

## Reproduction Steps

1. Author triggers invite from `/live` waiting room
2. Click "Back to event" — observe invite row `closed_at` remains NULL
3. Receiver's banner remains visible; author cannot trigger a new invite

## Resolution

Remove both buttons and all their dead code:
- `handleResendInvite` function + `resendCooldown` state from `clarity-live-page.tsx`
- `resendLiveInvite` export from `api.ts`
- Resend `<Button>` from invite-status panel (keep surrounding div + "Invite sent to {name}" text)
- "Back to event" `{returnTo && <Button>}` block
- Stale mock entries in `p754` and `p740` test files

Keep: DB trigger `trg_live_invite_resend_rate_limit` (inert after removal, no migration needed).

## Files Changed

- `src/app/pages/clarity-live-page.tsx`
- `src/app/data/api.ts`
- `src/tests/p754-cancel-waiting-room-navigate.test.tsx`
- `src/tests/p740-joiner-leave-closes-invite.test.tsx`

## Regression Tests

- `npm test -- p745 p754 p740` — all three suites must pass
