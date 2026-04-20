---
id: P717
title: Wrong authenticated user can open token-based letter link without warning
type: bug
status: all-done
completed_at: '2026-04-20'
pipeline_plan: [reproduce, fix]
pipeline_ran: [reproduce, fix, fix.2]
date_resolved: 2026-04-16
root_cause: get_letter_for_reading RPC omitted receiver_email; email guards in letter-reading-page.tsx always checked undefined
resolution: Migration adds receiver_email to RPC delivery JSON; email guards now fire correctly on both authed-first and token paths
tags: []
rank: 1000721.0
created_date: 2026-04-16
---

## Summary

When user A is logged in and visits a token-based letter invitation link intended for user B, they see the letter cover with no warning and no sign-out CTA. If they click "Open the Letter", `create-and-open-letter` is invoked and may claim the delivery under the wrong account.

## Reproduction Steps

1. Send a letter to user B (creates a delivery with `receiver_profile_id = null`)
2. Log in as a different user A in the same browser
3. Open the letter link `/letter/:id?token=xxx`
4. Expected: warning "This link is for a different account. Sign out to use it as intended."
5. Actual: Letter cover renders normally with no warning; TOS text is hidden (because `isAuthenticated=true`)

## Root Cause

**Layer 1 (found in /reproduce):** The `wrong_user` guard in `letter-reading-page.tsx:172-178` only fires when `receiver_profile_id` is SET and doesn't match the current user. Unclaimed deliveries (`receiver_profile_id = null`) fall through to `pageState = 'ready'`.

**Layer 2 (found during fix.2 browser verification):** The fix added email-based guards to both the authed-first and token paths, but both silently skip because `delivery.receiver_email` is always `undefined` at runtime. The `get_letter_for_reading` RPC (`supabase/migrations/20260412180000_fix_reading_rpc_drop_expiry_check.sql`, line 70) deliberately omits `receiver_email` from the delivery JSON it returns — comment reads "NO receiver_email (redacted)". The authed-first path (`getLetterForReading`) also doesn't surface it when the sender reads — though `select('*')` is used, RLS or the sender's read path is irrelevant because the guard still checks a field that is undefined. Unit tests passed because mocks hardcode `receiver_email: 'bob@example.com'` — they don't reflect the real RPC response shape.

**Confirmed via browser (2026-04-16):** Navigated to unclaimed delivery while logged in as the sender. Saw "Open the Letter" — no wrong_user screen.

## Affected Files

- `src/app/pages/letter-reading-page.tsx` — email guards added but ineffective (receiver_email always undefined)
- `supabase/migrations/20260412180000_fix_reading_rpc_drop_expiry_check.sql` — RPC strips receiver_email

## Fix (remaining)

Add `receiver_email` to the delivery JSON in `get_letter_for_reading` RPC via a new migration. The email guards in `letter-reading-page.tsx` already exist and will work once the RPC returns the field.

Also update the canary test: current mock `receiver_email: 'bob@example.com'` masks the RPC shape mismatch. Test should verify behavior works end-to-end or explicitly document the mock assumption.

## What Was Done

1. Added `wrong_user` screen with Sign out CTA to `letter-reading-page.tsx` ✓
2. Added email guard on token path ✓  
3. Added email guard on authed-first path ✓
4. Added 4 canary unit tests — all pass ✓
5. **Still needed:** Migration to add `receiver_email` to the RPC response

## Related

- `accept-agreement-page.tsx` has the same `wrong_user` pattern (no sign-out CTA) — deferred follow-up

## reproduce_artifact

```yaml
reproduce_artifact:
  test_file: src/tests/p717-wrong-user-token-guard.test.tsx
  root_cause: >
    get_letter_for_reading RPC omits receiver_email from delivery JSON
    (migration 20260412180000, line 70: "NO receiver_email (redacted)").
    Email guards in letter-reading-page.tsx check delivery.receiver_email
    which is always undefined — both guards silently skip.
    Secondary: wrong_user guard at line 172-178 also skips unclaimed
    deliveries (receiver_profile_id = null).
  confidence: high
  browser_reproduced: true
  browser_evidence: >
    Navigated to /letter/2efedc38?token=722c8a29 while logged in as sender.
    Delivery receiver_profile_id=null. Saw letter cover ("Open the Letter"),
    not wrong_user screen. Screenshot captured 2026-04-16 17:06.
  unit_test_caveat: >
    All 4 unit tests pass because mocks hardcode receiver_email on the
    delivery object. Real RPC never returns this field. Tests verify
    guard logic but not RPC data shape.
  surfaces_in_scope: [letter-reading-page wrong_user state, token path claim guard, authed-first path]
  surfaces_deferred: [accept-agreement-page wrong-user state — no sign-out CTA]
  reproduced_at: 2026-04-16
```
