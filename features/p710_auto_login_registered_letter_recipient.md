---
id: p710
status: qa
type: story
delivery_stage: fix
pipeline_ran: [fix, fix.2]
created_at: 2026-04-15
tags: []
rank: 1000722.0
created_date: 2026-04-15
---

# P710: Auto-login existing users from letter invite email

## Problem

When a registered user receives a 1-to-1 Clarity Letter invite, clicking "Open the Letter" in the email lands them on the letter cover page without a session. They see the TOS checkbox (which they already accepted at signup) and must click "Open the Letter" again to go through `create-and-open-letter` account flow.

Since they're already registered, the expected UX is: click email → land on letter cover already authenticated, TOS hidden.

## Solution

At send time (`send-letter-emails`), check if `receiver_email` belongs to a registered user. If yes, generate a Supabase admin magic link (`generateLink`) with `redirectTo` pointing to the letter URL. Use the returned `action_link` as the email CTA. When clicked, Supabase verifies the OTP and redirects with session tokens in the hash — the user lands already authenticated.

On the letter page (`letter-reading-page.tsx`), add a secondary effect: if `currentUser` becomes populated after the initial load (late auth-state settlement) and a token is present but the delivery is unclaimed, call `claimLetterDelivery(token)` to link the delivery.

Unregistered recipients: no change — keep plain token URL, existing anon→TOS→account creation flow.

## Files

- `supabase/functions/send-letter-emails/index.ts` — magic link generation for registered recipients
- `src/app/pages/letter-reading-page.tsx` — late-auth claim effect

## Acceptance Criteria

- [x] Registered recipient clicking email link lands on letter cover already authenticated (no TOS)
- [x] Unregistered recipient flow unchanged (cover + TOS + account creation)
- [x] If `generateLink` fails, falls back to plain token URL (no email sending failure)
- [x] Expired OTP fallback: user lands on cover as anon-with-token (cover + TOS shown, no white screen)
- [x] Already-authenticated user who revisits the email link — page loads correctly
- [x] Late auth settlement: delivery is claimed when currentUser appears after initial load
- [x] Registered recipient sees letter in Inbox BEFORE clicking the email link

## QA Fix (2026-04-16)

**Root cause discovered during QA:** `send-letter-emails` created the delivery row with
`receiver_profile_id = NULL`. `get_inbox_items()` filters `WHERE receiver_profile_id = auth.uid()`
so the row was invisible until the email link was clicked and `claim_letter_delivery` ran.

**Fix:** When `isRegistered=true` and the auth user's ID is available, immediately UPDATE
`letter_deliveries SET receiver_profile_id = <userId>` at send time (guarded with
`.is('receiver_profile_id', null)` for idempotency). `claim_letter_delivery` on email click
remains idempotent — already handles same-user re-claim.

**Unregistered recipients:** No change — no account yet, can't see inbox anyway.

**Files changed:**
- `supabase/functions/send-letter-emails/index.ts` — pre-claim UPDATE after `isRegistered` check
- `src/tests/p710-inbox-registered-recipient.test.ts` — regression tests (4 pass)

## Verification

Manual E2E tests with email aliases (see plan `~/.claude/plans/effervescent-skipping-karp.md`, Verification section).
