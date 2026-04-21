---
status: all-done
type: story
rank: 1000748.0
workstream: C2
created_date: '2026-04-21'
completed_at: '2026-04-21'
tags: [letters, public-letter, delivery, authed-reader]
pipeline_ran: [create-spec, fix, ship]
---

# P778: Authed Reader of Public Letter Matches Email-Delivery Parity

## Problem

**Situation:** When a logged-in user opens a public one-to-many letter link today, `LetterReadingPage` routes them through `getLetterForPublicReading` → `pageState='ready_public'` → `LetterReadingFlowPublic` with `mode:'local'`. Responses are buffered in localStorage and submitted as a single batch at end-of-reading.

**Complication:** Three things fail relative to the email/token-delivery flow: (1) the cover shows "For you" instead of the reader's actual first name; (2) no `letter_deliveries` row exists during reading, so the author is blind until the batch completes; (3) `useOpenLiveInvite` cannot resolve the reader mid-reading because it does a `letter_id + receiver_profile_id` lookup and finds nothing.

**Question:** How do we give a logged-in, non-sender reader clicking a public letter link the same per-step-write experience as an email recipient — name on cover, live delivery row, author inbox visibility from the first point response?

## Appetite

Medium blast radius — touches the authed-public branch of `letter-reading-page.tsx` and `submitPointResponse` in `letters-service.ts`; anon and token paths are disjoint and unchanged. Reversible: the new RPC is idempotent and the code change is a branch swap with no schema breaking changes. Low decision density — architecture fully specified in the architect plan; no open UX or product questions.

## Solution

1. **New DB RPC `create_letter_delivery_on_open`** — SECURITY DEFINER RPC that inserts a `letter_deliveries` row with `status='opened'`, `receiver_profile_id=auth.uid()` on first call; returns the existing row unchanged on repeat calls (idempotent by `(letter_id, receiver_profile_id)` unique check). Sibling to P707's `create_letter_delivery` RPC.

2. **Status advancement in `submitPointResponse`** — after the first `letter_point_responses` INSERT, conditionally UPDATE the delivery to `status='in_progress'` (`.eq('status','opened')` guard makes it idempotent). This makes the delivery visible to `get_inbox_items`, which filters `completed_at IS NOT NULL OR status='in_progress'`.

3. **Authed-public branch restructure in `letter-reading-page.tsx`** — replace the current `ready_public` fallthrough with a call to the new RPC on cover-click. Populate `receiverDisplayName` from `currentUser.user_metadata.name`. Route to `pageState='ready'` (not `'ready_public'`), which uses `LetterReadingFlow` in remote mode — per-step DB writes via existing `useLetterReadingState`. Delete now-redundant dead code (separate completed-delivery SELECT).

Anon readers (no session) and token/email readers remain fully unchanged.

## Risks / Non-Goals

### Risks
- **Ghost deliveries.** A reader who opens and bails leaves an `opened`-status row. Mitigated: `get_inbox_items` excludes `status='opened'` rows — author never sees them. Matches "author doesn't see anon readers who bailed" baseline.
- **Idempotency edge case.** Reader closes and re-opens before completing. The RPC must return the existing row (including its current status if already advanced). RPC uniqueness check + catch on `unique_violation` — mirrors P707 pattern exactly.
- **Sender opens own letter.** Existing `sender_id === currentUser.id` intercept fires before the RPC call — sender path unchanged.

### Non-Goals
- Do NOT add realtime streaming of point-responses to author's results page (`postgres_changes` subscription — separate spec)
- Do NOT pre-load `/live` from `letter_point_responses` — that feature doesn't exist yet
- Do NOT extract a shared `_insert_letter_delivery_impl` helper between P707 and the new RPC — drift cleanup deferred
- Do NOT touch `submitRating` or `stories_rated` increment — verified against token-path reference RPC; inbox progress comes from point-response row count, not this counter
- Do NOT change anon reader flow (local buffering + signup redirect)
- Do NOT change token/email delivery flow

## Done-When

- [ ] Authed non-sender reader opening a public one-to-many letter sees "For {first name}" on the cover
- [ ] A `letter_deliveries` row with `status='opened'` exists in DB immediately after cover-click (before any responses)
- [ ] After the reader submits their first point response, the delivery row shows `status='in_progress'`
- [ ] Author's inbox lists the delivery as in-progress from the first point response onward
- [ ] Re-opening the same public letter link returns the same delivery row (no duplicate row)
- [ ] Prior point-response positions rehydrate correctly when the reader re-opens a partial reading
- [ ] `useOpenLiveInvite` banner arms for the authed reader without additional wiring
- [ ] Anon reader (no session) still routes through local-buffer + signup-redirect unchanged
- [ ] Token/email reader flow unaffected
- [ ] Sender opening their own public letter still hits the `own_letter` intercept screen

## Acceptance Criteria

- [ ] Canary test (unit): authed non-sender → RPC called, `pageState` = `'ready'` (not `'ready_public'`), cover receives correct first name
- [ ] Canary test (unit): anon + no-token → `pageState` = `'ready_public'`, RPC NOT called
- [ ] Integration test (DB): RPC inserts `status='opened'`, `completed_at IS NULL`, `receiver_profile_id = auth.uid()`; calling twice returns same row
- [ ] Integration test (inbox visibility): delivery with 0 responses NOT in `get_inbox_items`; after first `submitPointResponse`, delivery IS in `get_inbox_items` with `status='in_progress'`
- [ ] All existing letter-reading tests pass (no regressions)

## UX Notes

- Cover: "For {first name}" populated from `currentUser.user_metadata.name.split(' ')[0]`; falls back to existing "For you" if name absent
- No TOS consent gate — reader already has a profile (`isEmailDelivery=false` → `needsConsent=false`)
- No behavioral change visible to user for completed re-reads: existing P695 `wasAlreadyCompleted` / `viewState='complete'` pattern fires as before (delivery row has `completed_at` set — RPC returns it unchanged)
