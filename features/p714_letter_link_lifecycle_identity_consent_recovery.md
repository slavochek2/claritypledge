---
status: qa
type: bug
rank: 1000708.0
severity: high
workstream: letters
date_reported: '2026-04-15'
created_date: '2026-04-15'
tags: [letters, private-letter, auth, token, recovery]
delivery_stage: fix
pipeline_ran: [create-bug, fix]
---

# P714: Letter link lifecycle — identity, consent, and recovery

## Summary

A new recipient clicks "Open the Letter" in a private invitation email, gets authenticated successfully, but immediately hits "This sign-in link has expired" on their first engagement (rating a story or submitting a position) — making the letter unusable on first attempt.

## Root Cause

Three compounding failures:

1. **Token-after-auth bug:** `letter-reading-page.tsx:862` passes `token` to `LetterReadingFlow` unconditionally even after a session is minted. The hook (`useLetterReadingState.ts:235–237, 441`) continues using token-path RPCs with the now-consumed token (`invitation_expires_at = NOW()` set by `create-and-open-letter/index.ts:398–406`). Hook has no re-init on auth change — it never switches to the authed RPC path.

2. **Dead-end recovery copy:** `LetterResponseLinkExpired` (`letter-response-link-expired.tsx:19–24`) shows "sign-in link has expired" (wrong — P683 removed time-based expiry) and offers an "Open the letter" link that loops back to the same broken URL. No path to re-login, no context that the recipient now has an account.

3. **Missing TOS in email:** `send-letter-emails/index.ts:237–244` has no consent language near the CTA. TOS is only captured on the letter-cover click (works), but recipients see no advance notice in the email.

## Reproduction Steps

1. Send a private letter to a fresh email address (non-user)
2. As that recipient, click "Open the Letter" in the invitation email
3. On the letter-cover page, click "Open" — account is created, session is minted, `invitation_expires_at` is set to NOW()
4. Attempt to rate a story or submit a position in the letter
5. Observe: "This sign-in link has expired" error — action blocked

**Reproduction rate:** 100% on first-time recipients

## Expected Behavior

After clicking "Open the Letter" and passing the letter-cover TOS screen, the recipient can rate stories and submit positions without interruption. The session (not the token) governs all subsequent writes.

## Actual Behavior

First engagement fails with "This sign-in link has expired." The token-path RPC rejects writes because `invitation_expires_at` is now in the past. Recovery UI offers a dead-end link back to the same broken URL.

## Affected Files

- `src/app/pages/letter-reading-page.tsx` — line ~862 (token prop passed unconditionally), line ~944 (dead-end LetterResponseLinkExpired call site)
- `src/app/hooks/useLetterReadingState.ts` — lines ~235–237, ~441 (RPC selection, no re-init on auth change)
- `src/app/components/letters/letter-response-link-expired.tsx` — lines 19–24 (wrong copy, dead-end link)
- `src/app/pages/letter-response-confirm-page.tsx` — line ~240 (second LetterResponseLinkExpired call site)
- `src/app/pages/signup-page.tsx` — existing `source=letter-response` recovery flow (reuse, don't duplicate)
- `supabase/functions/send-letter-emails/index.ts` — lines ~237–244 (email body, missing TOS line)
- `supabase/functions/create-and-open-letter/index.ts` — lines ~398–406 (reference only — sets `invitation_expires_at=NOW()`)

## Severity

**High** — blocks every first-time private letter recipient from completing the letter on first attempt; the product's core private-letter flow is non-functional for new users.

## Fix Approach

Three coordinated changes (sequence matters):

**Change 1 (token-after-auth):** At `letter-reading-page.tsx:862`, pass `token={session ? undefined : (token || undefined)}` so the hook receives no token once a session exists. Verify the hook's authed branch covers all three writes (`submitPointResponse`, `submitRating`, `revealPrediction`). Add missing authed-path variants if any are absent. Write a failing canary test first.

**Change 2 (dead-end recovery):** Replace both `<LetterResponseLinkExpired />` render sites with navigation to `signup-page` parametrized by `source=letter-response&letterId=...&senderName=...`. The signup-page already handles this source with "Save your responses" copy and OTP re-issue. Delete `letter-response-link-expired.tsx` if no other consumers.

**Change 3 (email TOS):** Add one line below the "Open the Letter" button in the email template: "By opening this letter, you'll create a Clarity Pledge account. [Terms of Service] · [Privacy Policy]."

## Acceptance Criteria

- [ ] Golden path: new recipient clicks "Open the Letter" → passes letter-cover → rates stories and submits positions **without** hitting any "expired" error — completes letter end-to-end
- [ ] Re-click with active session (token consumed, session valid): zero-friction resume via account path; no "expired" copy shown
- [ ] Re-click after session lost (cookies cleared): lands on signup-page "Save your responses" with `senderName` and `letterId` prefilled; not the dead-end expired component
- [ ] Invalid token URL (e.g. `/letter/{id}/confirm?token_hash=invalid`): renders signup-page recovery, not `LetterResponseLinkExpired`
- [ ] Private letter email contains TOS line with working Terms and Privacy links near the CTA
- [ ] No "expires in X" or "sign-in link has expired" copy anywhere in the private-letter email or UI
- [ ] Public letter flow unchanged (no regression)
- [ ] Canary regression test passes: `e2e/p714-letter-link-lifecycle.spec.ts`
- [ ] `npm test` passes with no new failures
