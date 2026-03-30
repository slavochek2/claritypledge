---
status: today
type: bug
rank: 1000029.0
workstream: foundation
severity: medium
date_reported: 2026-03-29
created_date: 2026-03-30
tags: [auth, email, brevo, pkce]
---

# BUG: P608 — Magic Link Reliability (PKCE + Resend + Monitoring)

## Problem

Supabase GoTrue has a confirmed silent SMTP failure bug ([#39691](https://github.com/supabase/supabase/issues/39691)) — when background email sending fails, `confirmation_sent_at` is set but the email never reaches Brevo. Additionally, Microsoft 365 ATP pre-fetches magic link URLs, consuming single-use tokens before users click them ([#713](https://github.com/supabase/auth/issues/713)).

**Incident (2026-03-29):** A user signed up with a corporate Microsoft 365 email domain. Supabase set `confirmation_sent_at` but Brevo transactional logs show zero records — the email never reached Brevo. `email_confirmed_at` was set 26 seconds later (likely by Microsoft ATP scanner consuming the token). User had to re-register with a personal email (which worked fine). See `.private/incidents/2026-03-29-magic-link-failure.md` for details.

## Symptoms

- User signs up with email → sees "check your email" → email never arrives
- Brevo transactional logs show zero records for the recipient
- Supabase auth shows `confirmation_sent_at` and even `email_confirmed_at` (from ATP scanner)
- User's auth record has `identities: 0` (scanner hit verify URL but didn't complete auth callback)

## Root Cause

Two independent issues:

1. **GoTrue background sending:** `sendEmail()` dispatches to a background goroutine and returns `nil` immediately. `confirmation_sent_at` is set before SMTP delivery confirms. If the goroutine's SMTP call fails, the error is only logged server-side — never propagated to the API or database. Community fix PR [#2224](https://github.com/supabase/auth/pull/2224) was never merged.

2. **Microsoft ATP Safe Links:** Corporate email systems (Microsoft 365, Google Workspace) pre-fetch URLs in incoming emails for malware scanning. This consumes single-use OTP tokens before the human clicks the link. Supabase documents this at [email-prefetching](https://supabase.com/docs/guides/auth/auth-email-templates#email-prefetching).

## Resolution — 3 changes

### 1. Enable PKCE flow (prevents ATP token consumption)

Add `flowType: 'pkce'` to Supabase client init. PKCE requires the original browser session to complete verification — scanners can't consume tokens.

**File:** `src/lib/supabase.ts`

```typescript
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
  },
});
```

May also need dashboard toggle: Supabase Dashboard → Authentication → URL Configuration.

### 2. Add "Resend" button to signup page

The signup page (`/signup`) shows "Use Different Email" after sending but no resend button. Add one, matching the existing pattern from `pledge-confirmation-page.tsx:19-38`.

**File:** `src/app/pages/signup-page.tsx` — add resend to `isSubmitted` state (around line 126)

**Pattern:** `src/app/pages/pledge-confirmation-page.tsx` → `handleResendLink()` calls `signInWithEmail(email)`

Also check: `src/app/components/pledge/login-form.tsx` — "Send Another Link" resets form, could upgrade to proper resend.

### 3. Monitoring: Mixpanel funnel + alert

**Code change:** Add `auth_method` property to `profile_created` and `login_complete` events (from `source` URL param) so Mixpanel can distinguish magic link vs Google OAuth completions.

**File:** `src/auth/AuthCallbackPage.tsx` — add `auth_method: source` to analytics events

**Mixpanel alert:** Configure a Custom Alert in Mixpanel UI:
- Trigger: `signup_magic_link_sent` count > 0 but `profile_created (auth_method=signup|pledge)` count = 0 in the same 24h window
- Send to: ops@claritypledge.com
- Check frequency: daily

**`/day` integration:** Add Brevo transactional log check to `/day` — compare Supabase auth signups (last 24h) vs Brevo sent count. Flag discrepancies.

**Note:** At current volume (few signups/week), individual tracking is more useful than percentage thresholds. Every unconfirmed magic link matters.

### 4. Pre-commit: flag user emails in specs

Add a broader email regex to pre-commit section 17 for `features/*.md` files — flag any `user@domain.tld` pattern that isn't `@claritypledge.com` or known safe patterns. Warning only (not blocking), since code examples may contain example emails.

**File:** `scripts/pre-commit-checks.sh` — extend section 17

## Key files

| File | Change |
|------|--------|
| `src/lib/supabase.ts` | Add `flowType: 'pkce'` to auth options |
| `src/app/pages/signup-page.tsx` | Add resend button |
| `src/auth/AuthCallbackPage.tsx` | Add `auth_method` to analytics events |
| `scripts/pre-commit-checks.sh` | Broader email regex for features/*.md |

## Existing patterns to reuse

- Resend: `src/app/pages/pledge-confirmation-page.tsx:19-38` — `handleResendLink()`
- Gateway functions: `src/app/data/api.ts:345-378` (`createProfile`) and `418-448` (`signInWithEmail`)
- Analytics: `signup_magic_link_sent` already tracked at `signup-page.tsx:98`

## What we're NOT doing

- **send_email hook** — would fix silent failure at source but requires edge function + Brevo HTTP API. Overkill at current volume.
- **Auto-retry** — Supabase doesn't expose SMTP failure events client-side. Resend button is pragmatic.
- **SPF/DNS changes** — Brevo uses own Envelope From domain; DNS is correct.

## Verification

1. **PKCE:** Sign up with test email → magic link URL contains `code` param (not `token`). Same browser works, different browser fails gracefully.
2. **Resend:** Sign up → "check your email" → click Resend → Brevo logs show second send.
3. **Monitoring:** Sign up via magic link → Mixpanel shows both `signup_magic_link_sent` and `profile_created` with `auth_method`.
4. **Microsoft domain:** Send magic link to a Microsoft 365 email address → verify link works when human clicks (ATP can't consume it).
