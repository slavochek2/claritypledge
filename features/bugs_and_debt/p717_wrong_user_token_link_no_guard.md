---
id: P717
title: Wrong authenticated user can open token-based letter link without warning
type: bug
status: qa
delivery_stage: fix
pipeline_plan: [reproduce, fix]
pipeline_ran: [reproduce, fix]
date_resolved: 2026-04-16
root_cause: wrong_user guard only checked receiver_profile_id (null on unclaimed deliveries); email comparison was never performed on the token path
resolution: Added email guard before claimLetterDelivery on token path; extended wrong_user screen with sign-out CTA
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

The `wrong_user` guard in `letter-reading-page.tsx:172-178` only fires when `receiver_profile_id` is SET and doesn't match the current user. Unclaimed deliveries have `receiver_profile_id = null`, so the wrong user falls through to `pageState = 'ready'`.

Token path (line 258+): if the wrong authenticated user proceeds, `claimLetterDelivery(token)` at line 280 claims the delivery under their account.

## Affected File

`src/app/pages/letter-reading-page.tsx` — load effect, authed-first branch (lines 154-203) and token path (lines 258-315)

## Fix

On the token path, when `currentUser` exists, compare `delivery.receiver_email` (from RPC) to `currentUser.email`. If mismatch → `pageState = 'wrong_user'`.

Extend the `wrong_user` render state to include a "Sign out" CTA. No email disclosure — just: "This link is for a different account. Sign out to open it as intended."

## Related

- `accept-agreement-page.tsx` has the same `wrong_user` pattern (no sign-out CTA) — note as follow-up surface.

## reproduce_artifact

```yaml
reproduce_artifact:
  test_file: src/tests/p717-wrong-user-token-guard.test.tsx
  root_cause: "wrong_user guard skips unclaimed deliveries (receiver_profile_id = null) — wrong authenticated user sees letter cover with no warning"
  confidence: high
  surfaces_in_scope: [letter-reading-page wrong_user state, token path claim guard]
  surfaces_deferred: [accept-agreement-page wrong-user state — no sign-out CTA]
  reproduced_at: 2026-04-16
```
