---
status: all-done
type: change-request
rank: 1000006
changes: p466
tags:
  - redesign
  - p466
  - agreements
created_date: 2026-03-05
completed_at: "2026-03-06"
flow: dev
uat_file: features/uat/p476.md
test_files:
  - e2e/p476-accept-confirmation.spec.ts
  - e2e/a11y/p476-accessibility.spec.ts
---

# P476: Accept Page — Full-Screen Email Confirmation After Magic Link

> **Redesign of:** [P466: Agreement Creation — HelloSign Redesign](./p466_agreement_creation_hellosign_redesign.md) (unauthenticated accept flow section)
> **What was wrong:** After the unauthenticated partner clicks "Seal & Create Account" and the magic link is sent, the current design shows a tiny inline "Check your email" message buried inside the certificate footer. It is easy to overlook, provides no way to resend, and is visually disconnected from the significance of the action just taken. The pledge flow already has a better pattern — a dedicated full-screen confirmation page — but it was never applied to the agreement accept flow.

## Problem Statement

When an unauthenticated partner submits on the accept page, they are waiting for a magic link to arrive and need to understand: what happens next, what email to check, and what to do if the email doesn't arrive. The current inline state (a small icon + 2 lines of text inside the certificate footer) provides insufficient orientation and no resend escape hatch.

The pledge flow (`/sign-pledge/confirm` — `PledgeConfirmationPage`) solves this well: full-screen confirmation, email displayed prominently, resend capability, back navigation. This redesign applies the same pattern to the agreement accept flow — with copy and behavior corrected for the agreement context.

## Jobs To Be Done

- **Preserved from P466:** Partner can complete signing without a pre-existing account; magic link is sent to the invitation email; auto-accept fires when partner returns via the link.
- **Corrected:** Partner receives clear, full-screen orientation after submitting rather than a buried inline message that is easy to miss.
- **New:** Partner can resend the magic link from the confirmation screen without returning to the accept page.

## Current State

After `handleInlineSignup()` succeeds (OTP sent), `signupEmailSent` is set to `true`. The certificate footer renders:

```
┌────────────────────────────────────────┐
│        [agreement certificate]         │
│                                        │
│  [footer — replaces CTA buttons]       │
│  ✉  Check your email                  │
│  We sent a sign-in link to             │
│  partner@example.com. Click it         │
│  and we'll complete the signing        │
│  automatically.                        │
└────────────────────────────────────────┘
```

- No resend option
- No way to report the wrong email
- Visually buried under the full agreement text
- Easily missed — especially on mobile

## Root Cause

`accept-agreement-page.tsx` handles the post-signup state with a local boolean flag (`signupEmailSent`) that conditionally swaps the CTA buttons for an inline message. This was a minimal first implementation — it communicates the fact but provides no UX beyond it.

The `PledgeConfirmationPage` (at `/sign-pledge/confirm`) already provides the right UX for this moment, but was built only for the pledge flow. Three issues prevent naive reuse:

1. **Copy mismatch** — `pledge-confirmation-page.tsx:86`: "complete your **pledge**" → wrong context
2. **Resend uses wrong redirect** — `pledge-confirmation-page.tsx:27`: `signInWithEmail(email)` sends with no `emailRedirectTo`; the resent link lands at `/` instead of back at `/agreements/:id/accept?token=...`, breaking the auto-accept localStorage flow
3. **"Use different email" is wrong** — `pledge-confirmation-page.tsx:119–124`: Navigates to `/sign-pledge`; the partner's email is fixed by the invitation and cannot be changed

## Redesign

After `handleInlineSignup()` succeeds, navigate to a new `AgreementConfirmationPage` (or `/sign-pledge/confirm` with context params — see Options below) rather than setting `signupEmailSent = true`.

**After (redesign):**

```
┌────────────────────────────────────────┐
│                                        │
│          ✉                            │
│       (green circle)                   │
│                                        │
│      Almost Done!                      │
│                                        │
│  We've sent a sign-in link to:         │
│  ┌──────────────────────────────────┐  │
│  │  partner@example.com             │  │
│  └──────────────────────────────────┘  │
│                                        │
│  Click the link to complete signing    │
│  the Clarity Partner Agreement.        │
│                                        │
│  Link expires in 1 hour. Check spam   │
│  if you don't see it.                  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ Didn't receive the email?        │  │
│  │ [Resend sign-in link]            │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ← Back to agreement                   │
│                                        │
└────────────────────────────────────────┘
```

**Implementation approach — Option A (recommended): extract shared component**

Extract a `EmailConfirmationPage` (or `EmailConfirmationView`) used by both flows, with configurable:
- `context`: `'pledge'` | `'agreement'`
- `email`: string — the address to display
- `resendFn`: `() => Promise<void>` — caller provides the correct OTP call with the right `emailRedirectTo`
- `backTo`: string — where "Back" navigates
- `continueCopy`: string — replaces "complete your pledge" with caller-supplied text

This keeps `PledgeConfirmationPage` working unchanged and gives the accept flow a correctly-wired version.

**Option B (simpler, more coupling): pass context params to `PledgeConfirmationPage`**

Add optional query params: `?context=agreement&agreementId=...&token=...`. `PledgeConfirmationPage` reads these and adjusts copy + resend redirect. Less clean but fewer files.

Recommendation: Option A — the two flows have meaningfully different resend logic; coupling them via query params creates a fragile conditional in a shared page.

## Predecessor Sections Superseded

| Section | P466 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| Unauthenticated accept flow — post-submit state | Implicit: shows inline "Check your email" message in certificate footer (implemented as `signupEmailSent` boolean flag) | Superseded | Full-screen email confirmation page with correct copy, resend, and back navigation |
| Resend behavior | Not specified (no resend in P466 unauthenticated flow) | Extended | Resend must use `supabase.auth.signInWithOtp` with `emailRedirectTo` pointing back to the accept page |

P466's core AC (partner name pre-fill, editable name, `accept_agreement` RPC params, fallback chain) are all **still valid** — this redesign only changes what happens *after* "Seal & Create Account" is clicked and the OTP is sent.

## Requirements

1. After `handleInlineSignup()` succeeds, navigate away from the accept page to a full-screen email confirmation state instead of setting `signupEmailSent = true` on the accept page.
2. Confirmation screen shows the partner's email address prominently.
3. Copy must reference "completing the agreement" — not "pledge".
4. Resend sends a new OTP via `supabase.auth.signInWithOtp` with:
   - `email: agreement.partnerEmail`
   - `emailRedirectTo`: the original accept page URL (same as what `handleInlineSignup` used)
   - `shouldCreateUser: true`
   - `data: { name: partnerDisplayName }` — preserve the name they entered
5. "Back" navigates to the accept page (so they can decline or use a different approach).
6. No "Use different email" option — email is fixed by the invitation.
7. The `localStorage` key `clarity-pending-accept-${agreementId}` must still be set before the OTP call (so auto-accept fires when they return).

## What Stays the Same

- The OTP call itself in `handleInlineSignup` — same params, same flow
- The auto-accept mechanism (localStorage → OTP redirect → `acceptAgreement` fires on return)
- All authenticated accept flow (`pageState === 'partner'`) — unchanged
- `CelebrationDialog` — unchanged
- `PledgeConfirmationPage` at `/sign-pledge/confirm` — unchanged (not modified)
- All other agreement surfaces: `agreement-page.tsx`, `create-agreement-page.tsx`, `agreement-certificate.tsx`
- All P422 and P472 AC not mentioned above

## Surfaces in Scope

**In scope:**
- `src/app/pages/accept-agreement-page.tsx` — remove `signupEmailSent` state, navigate after inline signup success
- New: `src/app/pages/agreement-email-confirmation-page.tsx` (if Option A) — new confirmation page, wired with agreement-specific copy + resend
- `src/App.tsx` — add route for the new page (if Option A adds a new route), OR no route change needed if confirmation is rendered inline via state/query param

**Out of scope:**
- `src/app/pages/pledge-confirmation-page.tsx` — NOT modified
- `src/app/components/agreements/agreement-certificate.tsx` — NOT modified
- `src/app/pages/create-agreement-page.tsx` — NOT modified
- Any DB migrations — no schema changes

## Acceptance Criteria

- [x] After clicking "Seal & Create Account" and OTP is sent successfully, the user sees a full-screen email confirmation — not an inline message inside the certificate
- [x] Confirmation screen shows the partner's email address prominently
- [x] Copy says "complete signing the Clarity Partner Agreement" (or equivalent agreement-specific language) — not "complete your pledge"
- [x] Resend button sends a new OTP with `emailRedirectTo` pointing back to the original accept page URL
- [x] After resending, the `localStorage` key `clarity-pending-accept-${agreementId}` is re-set so auto-accept still fires on return
- [x] "Back" button returns to the accept page (partner can then decline or copy the link to try a different browser)
- [x] "Use different email" button is absent — no path to change the email
- [x] The pledge confirmation page (`/sign-pledge/confirm`) is visually and functionally unchanged
- [x] Authenticated accept flow (`pageState === 'partner'` + `CelebrationDialog`) is visually and functionally unchanged
- [x] All P466 AC for partner name pre-fill and editable name still pass

## Next Steps

Run `/dev features/p476_accept_page_email_confirmation_redesign.md`.

## Test Coverage Strategy

**What's Tested:**
- Unauthenticated accept flow — redirect to full-screen confirmation (E2E) — primary AC
- Confirmation page copy is agreement-specific, not pledge-specific (E2E)
- Resend button present and functional (E2E)
- Back navigation to accept page (E2E)
- "Use different email" is absent (E2E)
- Authenticated flow (CelebrationDialog) unchanged (E2E)
- Old inline "Check your email" is gone (E2E)
- New confirmation page loads (smoke)
- /sign-pledge/confirm (PledgeConfirmationPage) still loads unchanged (smoke)
- Keyboard accessibility of confirmation page elements (a11y)

**What's NOT Tested:**
- Actual OTP email delivery — mocked at network layer; real delivery is Supabase's responsibility
- Auto-accept localStorage flow end-to-end — requires real magic link click; covered by UAT-3 manual check
- Resend OTP emailRedirectTo correctness — cannot assert network param in Playwright without interception; covered by UAT-3
- PledgeConfirmationPage visual regression — no code changes to that file; existing tests cover it

**Test Pyramid:**
```
     /\
    /  \   ~9 E2E tests
   /____\
  /  0 INT \
 /___________\
/   0 UNIT   \
_______________
```

**Files Generated:**
- `e2e/p476-accept-confirmation.spec.ts`
- `e2e/p476-smoke.spec.ts`
- `e2e/a11y/p476-accessibility.spec.ts`
- `features/uat/p476.md`

**Total:** ~18 automated tests + 7 UAT scenarios
