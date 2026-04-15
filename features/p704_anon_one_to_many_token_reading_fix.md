---
id: p704
type: bug
status: in-progress
severity: high
delivery_stage: fix
pipeline_ran: [fix]
date_reported: 2026-04-14
branch: feature/letters-ship
worktree: w2
tags: []
rank: 1000707.0
created_date: 2026-04-14
---

# P704: Anon One-to-Many Token Reading — HTTP 400 on Every Interaction

## Bug Description

**Severity:** High (blocks all anon recipients of one-to-many letters from interacting)

**Symptoms:**
- Every point position submit, story rating, and delivery-status update returns HTTP 400.
- Console: `Error: Authentication required for one-to-many responses`
- The UI is functionally unusable for anonymous one-to-many recipients who arrive via token link.

**Reproduction steps:**
1. Sender creates a one-to-many letter and shares the token URL with a recipient.
2. Recipient opens `/letter/<deliveryId>?token=<t>` in an incognito window (anon).
3. Clicks "Open Letter" → cover updates but every per-point submit + story rating fires a 400.

## Root Cause

P684 added RPC guards in `supabase/migrations/20260412000001_p684_anon_rpc_auth_guard.sql`:
- Four `*_by_token` RPCs raise `'Authentication required for one-to-many responses'`
  when `letter.mode = 'one-to-many' AND auth.uid() IS NULL`.

The client-side `letter-reading-page.tsx` sets `pageState = 'ready'` when a token is present,
and the `ready` block unconditionally calls `updateDeliveryStatusByToken` on open and uses
`LetterReadingFlow` which calls `submitPointResponseByToken` / `submitRatingByToken` during reading.
Neither call is gated on `letter.mode + session`.

The `ready_public` path (no token, one-to-many) already uses `LetterReadingFlowPublic` in
`mode: 'local'` — no RPCs during reading, responses buffered and submitted atomically via
`confirm-letter-response` after signup. The token path needs the same treatment.

## Fix (Client-Only — No Migration)

Introduce `bufferOnly = letter.mode === 'one-to-many' && !session` in the `ready` render block:

1. **`onOpen`**: When `bufferOnly`, skip `updateDeliveryStatusByToken`; just set `viewState = 'reading'`.
2. **`viewState === 'reading'`**: When `bufferOnly`, render `<LetterReadingFlowPublic>` (already exists)
   with `letter.id` as `letterId` and an inline `onComplete` that stores the draft in sessionStorage
   using `letter.id` as key and navigates to the signup → confirm flow.

No changes to `useLetterReadingState.ts`, `letters-service.ts`, or edge functions.
The `confirm-letter-response` path and `letter-response-confirm-page.tsx` work as-is.

## Acceptance Criteria

- [ ] Anon one-to-many token recipient: no 400 errors; positions + ratings update UI silently;
      Submit triggers signup; after magic-link, `confirm-letter-response` persists all responses.
- [ ] Anon one-to-one token recipient: existing `handleOneToOneOpen` + token RPCs unchanged.
- [ ] Authenticated one-to-many reader: existing `submitLetterResponseAuthenticated` flow unchanged.
- [ ] Canary test `e2e/p704-anon-one-to-many-token.spec.ts` passes.

## Files Changed

- `src/app/pages/letter-reading-page.tsx` — `bufferOnly` predicate + conditional render
