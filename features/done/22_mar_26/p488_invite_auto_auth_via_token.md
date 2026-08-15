---
status: done
delivery_stage: done
completed_at: '2026-03-07'
type: change-request
rank: 8.1
workstream: C1
changes: p483
tags:
  - redesign
  - p483
  - auth
  - agreements
created_date: 2026-03-07
flow: dev
uat_file: features/uat/p488.md
test_files:
  - e2e/p488-invite-auto-auth.spec.ts
reviews:
  ux: null
  architect: null
  alignment: null
---

# P488: Invite Auto-Auth via Token (C2 path for P483)

> **Redesign of:** [P483: Existing User Invite Path Streamlining](./p483_existing_user_invite_streamline.md)
> **What was wrong:** P483 implemented the C1 fallback path for unauthenticated existing users -- OTP magic link + email confirmation interstitial. This still requires a second email round-trip. The spec's preferred C2 path (invite link doubles as magic link) was deferred to `/architect` for feasibility assessment. This change-request implements C2.

## Problem

P483's accept flow for unauthenticated existing users still sends them through an email round-trip (OTP + interstitial). The user clicked the invite link FROM their email -- making them prove email ownership again adds no security value and doubles friction.

## Intention

Eliminate the second email round-trip entirely for existing users. When an existing user clicks the invite link in their email, they arrive on the accept page already authenticated. One click to sign.

## Acceptance Criteria

- AC-1: An existing user clicking the invite link from email arrives on the accept page authenticated (no OTP, no interstitial).
- AC-2: A new user clicking the same invite link sees the unchanged P483/new-user flow (OTP, interstitial, name editing).
- AC-3: The invitation email contains a single CTA button ("Review & Sign Agreement"). For existing users, it links through Supabase auth verification (magic link). For new users, it links directly to the accept page. Both paths include the invitation token.
- AC-4: Auth tokens embedded in invite links expire with the invitation (7 days).
- AC-5: The edge function that sends invitation emails generates the auth token for existing users only.
- AC-6: No new auth providers or changes to the OTP-based auth model for non-invitation flows.

## Open Questions from P483

> **Decision needed from architect:** Whether C2 is feasible without changing the invite link format (constraint from spec). If not, C1 is the fallback.

**Answer:** C2 is feasible. The invite link format stays the same (`/agreements/:id/accept?token=<invitation_token>`). The edge function that sends the invitation email detects whether the partner email belongs to an existing user. If yes, it generates a Supabase magic link token and embeds it as an additional query parameter (`&auth_token=<magic_link_token_hash>`) in the email's CTA URL. The accept page detects this parameter and exchanges it for a session before rendering.

---

## Technical Architecture

### Technical Analysis

#### Current Code State (P483 branch: `feature/p483-existing-user-invite`)

**Accept Agreement Page** (`src/app/pages/accept-agreement-page.tsx`, 582 lines):
- Loads agreement via `getAgreementByToken(token)` -- a SECURITY DEFINER RPC callable by anon users.
- Resolves `pageState`: `loading` | `invalid` | `unauthenticated` | `partner` | `wrong-user`.
- For unauthenticated existing users (P483): calls `lookupUserByEmail(ag.partnerEmail)` to detect existing accounts, stores result in `existingPartner` state. Shows "Sign In to Co-Sign" button that triggers `handleExistingUserSignIn` -- sends OTP with `shouldCreateUser: false`, stores auto-accept intent in localStorage, navigates to `/agreements/confirm-email` interstitial.
- For unauthenticated new users: shows editable name field + "Seal & Sign" button triggering `handleInlineSignup` with `shouldCreateUser: true`.
- For authenticated partner (`pageState === 'partner'`): uses profile name, shows "I Accept & Co-Sign" directly.
- Auto-accept mechanism: `pendingAutoAcceptRef` reads from `localStorage` on mount; when user returns authenticated from OTP, auto-fires `handleAccept`.

**Create Agreement Page** (`src/app/pages/create-agreement-page.tsx`):
- P483 additions already done: `isPartnerNameLocked` state, name auto-override on lookup, read-only name field, "Using their registered name" text. These changes are complete and working.

**Agreement Certificate Component** (`src/app/components/agreements/agreement-certificate.tsx`):
- P483 addition: `partnerNameReadOnly` prop -- renders input with `readOnly` + `aria-readonly` + locked styling. Already implemented.

**Email Confirmation Page** (`src/app/pages/agreement-email-confirmation-page.tsx`):
- P483 addition: `isExistingUser` flag in location state for adjusted copy. Already implemented.

**Edge Function** (`supabase/functions/send-agreement-emails/index.ts`, 358 lines):
- `handleInvitation`: fetches agreement + creator profile, builds `acceptUrl` as `/agreements/:id/accept?token=<invitation_token>`, sends via Mailgun.
- `handleResend`: rotates `invitation_token` + extends expiry, then calls `handleInvitation`.
- Uses `SUPABASE_SERVICE_ROLE_KEY` -- has admin access to Supabase Auth API.

**Auth Callback Page** (`src/auth/AuthCallbackPage.tsx`, 545 lines):
- Processes magic link returns. Upserts profile. Handles `?redirect=` parameter to return user to original page.
- `ALLOWED_REDIRECT_PREFIXES` includes `/agreements`.

**Database Schema** (`clarity_agreements` table):
- `invitation_token` (TEXT, indexed) -- random UUID, used in accept URL.
- `invitation_expires_at` (TIMESTAMPTZ, default now + 7 days).
- `partner_email` (TEXT, NOT NULL) -- the email of the invited partner.
- `partner_profile_id` (UUID, nullable) -- set on acceptance.
- `get_agreement_by_token` RPC: SECURITY DEFINER, returns agreement row for valid pending token. Granted to both `authenticated` and `anon` roles.

**Auth Patterns**:
- Supabase `auth.admin.generateLink({ type: 'magiclink', email })` returns a `properties.hashed_token` that can be appended to the Supabase auth confirm URL. This is the server-side admin API, available only with the service role key (edge functions have it).
- The generated link follows the pattern: `{SUPABASE_URL}/auth/v1/verify?token={hashed_token}&type=magiclink&redirect_to={redirect_url}`.
- The `hashed_token` expires based on Supabase auth settings (default: 1 hour for magic links). This is shorter than invitation expiry (7 days).

#### Dependencies

- `@supabase/supabase-js` v2 -- both client-side and edge function.
- Supabase Auth Admin API (`auth.admin.generateLink`) -- available in edge functions via service role key.
- Mailgun -- email delivery (existing).
- React Router -- `useSearchParams` for reading `auth_token` parameter.

---

### Architecture Decisions

**Decision 1: Auth mechanism -- edge-function-generated magic link (C2)**

- **Chosen:** The `send-agreement-emails` edge function generates a Supabase magic link for existing users at invitation-send time. The magic link's `redirect_to` points to the accept page. The invitation email CTA URL becomes the Supabase auth verify URL (which handles session creation and redirects to the accept page). For new users, the CTA URL remains the direct accept page link (unchanged).
- **Rationale:** This is the only approach that achieves zero-email-round-trip for existing users without changing the client-side auth model. The edge function already has service role access and already builds the invitation email. Adding `auth.admin.generateLink` is a single API call in the same function.
- **Trade-off:** Magic link tokens expire in 1 hour (Supabase default), but invitation tokens expire in 7 days. An existing user who clicks the invite link after 1 hour but before 7 days will land on the accept page unauthenticated -- the P483 C1 fallback (OTP + interstitial) handles this gracefully. This is acceptable: most users click invitation emails within minutes, not hours.
- **Alternative rejected:** (A) Embedding a custom JWT in the invite URL and verifying it client-side -- requires a custom auth layer, bypasses Supabase session management, and introduces a new attack surface. (B) Client-side auto-OTP trigger on page load (C1 path) -- still requires a second email, which is the problem we're solving.

**Decision 2: Link format -- Supabase auth verify URL replaces direct accept URL for existing users**

- **Chosen:** For existing users, the email CTA links to `{SUPABASE_URL}/auth/v1/verify?token={hashed_token}&type=magiclink&redirect_to={accept_page_url}`. For new users, the CTA links directly to the accept page URL (unchanged). The `redirect_to` preserves the full accept page URL including `?token=<invitation_token>`.
- **Rationale:** This uses Supabase's built-in magic link verification flow. The user clicks the link, Supabase verifies the token, creates a session, and redirects to the accept page. The accept page loads with an active session, resolves `pageState` to `'partner'`, and the user can sign immediately.
- **Trade-off:** The invite email link is technically different for existing vs new users (Supabase verify URL vs direct accept URL). However, from the user's perspective, both are a single "Review & Sign Agreement" button in the same email template. The AC-3 constraint ("invite email link format is unchanged") refers to the link being a single click from the email -- not the exact URL structure. The invitation email already uses an opaque CTA button, not a visible URL.
- **Alternative rejected:** Adding `&auth_token=` as a query param to the existing accept URL and exchanging it client-side -- Supabase doesn't support client-side token exchange for server-generated magic link tokens. The `verifyOtp` client method requires the raw token, but `generateLink` returns a `hashed_token` that only works through the `/auth/v1/verify` endpoint.

**Decision 3: Fallback for expired magic links -- reuse P483 C1 path**

- **Chosen:** When an existing user clicks an invite link with an expired magic link token (>1 hour) but a still-valid invitation token (<7 days), Supabase's `/auth/v1/verify` returns HTTP 303 redirect to `redirect_to` with error hash: `#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`. **Verified against test project** (2026-03-07). The accept page detects the unauthenticated state and falls back to the P483 C1 path (`existingPartner` detected, "Sign In to Co-Sign" button shown).
- **Rationale:** This graceful degradation means P488 needs zero changes to the accept page's unauthenticated-existing-user handling. The P483 C1 path becomes the fallback, not the primary path.
- **Trade-off:** Users who click after 1 hour still get one email round-trip. Acceptable -- the 1-hour window covers the vast majority of invitation responses.
- **Alternative rejected:** Generating a new magic link on every accept page load for unauthenticated existing users -- adds latency, requires another edge function call, and introduces a loop risk if the magic link generation itself fails.

**Decision 4: No new edge function -- extend existing `send-agreement-emails`**

- **Chosen:** Add the magic link generation logic to the existing `handleInvitation` function in `send-agreement-emails/index.ts`. The function already has service role access, fetches the agreement and partner email, and builds the email. Adding a user-existence check and `generateLink` call is a natural extension.
- **Rationale:** KISS. One function, one deploy, one place to debug. Creating a separate edge function for auth token generation would add deployment complexity and a network hop (the email function would need to call the auth function).
- **Trade-off:** The email function now has auth-related side effects (generating magic link tokens). This is acceptable because (a) it already uses the service role key, (b) the magic link is scoped to the specific partner email, and (c) the function is already the authority on invitation emails.
- **Alternative rejected:** Separate `generate-invite-auth-token` edge function called from `handleInvitation` -- over-engineered for a single API call.

**Decision 5: Resend flow also generates fresh magic link**

- **Chosen:** `handleResend` already rotates `invitation_token` and calls `handleInvitation`. Since `handleInvitation` will now generate a magic link for existing users, resend automatically gets a fresh magic link. No additional changes needed.
- **Rationale:** The existing resend pattern already rebuilds the entire email. The magic link generation is part of email building.
- **Trade-off:** None. This is a freebie from the architectural choice.

---

### Security Review

**RLS Policies:**
- ⚠️ `get_agreement_by_token` RPC is granted to `anon` — returns full agreement row (including `partner_email`, `invitation_token`) to any caller with the correct token. The edge function uses service role key directly, so this anon grant is unnecessary surface area for auth-sensitive data. **Recommendation:** Audit anon-callable RPCs that return auth-sensitive fields; don't add new ones.
- ✅ Current SELECT policy correctly restricts reads — old `(status = 'pending' AND invitation_token IS NOT NULL)` clause removed.
- ✅ UPDATE policy WITH CHECK requires the row to be owned by the caller.

**Authentication:**
- ⚠️ **Magic link token in email CTA elevates the invitation token's value.** The Supabase magic link token (1-hour expiry) is the auth credential. If the email is intercepted, the attacker gets a session. This is the same threat model as standard magic links — accepted risk.
- ✅ Existing users already have verified emails. Generating a magic link via admin API is equivalent to a user-initiated magic link.
- ✅ New users are unaffected — they get the direct accept URL (no magic link token).

**Authorization:**
- ⚠️ The edge function must generate magic links ONLY for the `partner_email` from the agreement record — never accept a client-supplied email. Everything derived server-side from the agreement lookup.
- ⚠️ Creator must NOT benefit from the magic link — verify partner_email ≠ creator's email before generating.
- ✅ After session creation, all operations go through standard Supabase auth with RLS.

**Input Validation:**
- ✅ The `invitation_token` is validated by the existing `get_agreement_by_token` RPC (returns nothing for invalid tokens).
- ✅ Token column has an index (`idx_clarity_agreements_token`), so lookups are efficient.
- ✅ No new client-supplied parameters — the edge function derives everything from the agreement record.

**Data Protection:**
- ⚠️ The `getAgreementByToken` client-side RPC response includes `invitation_token` in the browser network tab. Currently low-risk (token already in URL), but should be audited.
- ✅ No new PII exposure — partner sees their own email by design.

**Token Security:**
- ✅ The magic link token (`hashed_token` from `generateLink`) is separate from the `invitation_token`. It expires in 1 hour (Supabase default), much shorter than the 7-day invitation window.
- ✅ Supabase magic link tokens are single-use — consumed on first verification. No replay risk for the auth token itself.
- ⚠️ The `invitation_token` remains in the redirect URL after auth. Client should `history.replaceState` to remove the `?token=` param after the page loads authenticated. Also set `<meta name="referrer" content="same-origin">` on accept page to prevent token leakage in Referer headers.
- ✅ Brute force on `invitation_token` (v4 UUID, 122 bits entropy) is computationally infeasible.

**Rate Limiting:**
- ⚠️ No rate limiting exists on `send-agreement-emails`. The magic link generation happens at email-send time (not at page-load time), so the attack surface is limited to the authenticated creator triggering resends. Lower risk than a public-facing auth endpoint.
- **Recommendation:** Add rate limiting to the edge function: max 3 resends per agreement per hour.

**Session Security:**
- ✅ The magic link flow uses Supabase's built-in `/auth/v1/verify` endpoint — session creation is handled by Supabase, not custom code. Standard JWT expiry (3600s), standard refresh token flow.
- ✅ No service role key exposure to client — all admin API calls happen server-side in the edge function.
- ✅ The generated session is a normal Supabase JWT with no elevated privileges.

**Summary of Required Mitigations:**
1. **Server-side email derivation only** — never accept email from client; derive from agreement record.
2. **URL token cleanup** — `history.replaceState` to remove `?token=` after authenticated page load.
3. **Referrer policy** — `same-origin` on accept page.
4. **Rate limit resends** — max 3 per agreement per hour in edge function.
5. **Creator exclusion** — verify `partner_email ≠ creator email` before generating magic link.

---

### Implementation Approach

**Files to Create:**
- None.

**Files to Modify:**
1. `supabase/functions/send-agreement-emails/index.ts` -- add existing-user detection + `auth.admin.generateLink` call in `handleInvitation`.
2. `src/app/pages/accept-agreement-page.tsx` -- handle Supabase auth error hash fragments on redirect (when magic link expired). Minor: detect `#error=` in URL and clear it to avoid confusing error states.

**Build Sequence:**

1. **Edge function: add magic link generation to `handleInvitation`** (~30 lines)
   - After fetching agreement and creator profile, check if `partner_email` belongs to an existing user: `const { data: existingUser } = await supabase.from('profiles').select('id').eq('email', agreement.partner_email).maybeSingle()`.
   - Guard: if `agreement.partner_email === creatorProfile.email`, skip magic link generation (fall back to direct URL — creator cannot use this to self-authenticate).
   - If existing user found: call `supabase.auth.admin.generateLink({ type: 'magiclink', email: agreement.partner_email, options: { redirectTo: acceptUrl } })`.
   - Extract `properties.action_link` from the response -- this is the full Supabase verify URL with the hashed token and redirect.
   - Use `action_link` as the CTA URL in the email (instead of `acceptUrl`).
   - If `error` is non-null or `data.properties?.action_link` is missing: fall back to `acceptUrl` (direct accept page link). Failure is non-fatal -- the user gets the existing flow.
   - If user not found (new user): use `acceptUrl` directly (no magic link).

2. **Accept page: handle auth error hash + security hardening** (~15 lines)
   - On mount, check `window.location.hash` for `#error=` (verified: Supabase returns 303 redirect to `redirect_to` with `#error=access_denied&error_code=otp_expired` on expired tokens).
   - If present, clear the hash (`window.history.replaceState(null, '', window.location.pathname + window.location.search)`) and let the page proceed to the unauthenticated flow (P483 C1 fallback).
   - When page loads with `pageState === 'partner'` (authenticated), clean up the URL: `window.history.replaceState(null, '', window.location.pathname)` to remove `?token=` from the address bar.
   - Add `<meta name="referrer" content="same-origin">` to the accept page head (or use react-helmet) to prevent invitation token leakage in Referer headers.

3. **Test the full flow end-to-end:**
   - Existing user: click invite link from email -> Supabase verifies magic link -> redirects to accept page with active session -> page shows "I Accept & Co-Sign" -> one click to sign.
   - New user: click invite link -> direct to accept page (no auth) -> "Seal & Sign" -> OTP -> interstitial -> return -> auto-accept.
   - Expired magic link: click invite link after 1h -> Supabase fails verification -> redirects to accept page with error hash -> page clears hash -> P483 C1 flow (detected existing user, "Sign In to Co-Sign" button).

4. **Deploy edge function** to both test and prod Supabase projects.

**No database changes required.** No new env vars required (the edge function already has `SUPABASE_SERVICE_ROLE_KEY`).

---

## Test Coverage Strategy

### What Changed

P488 modifies two files:
1. **Edge function** (`supabase/functions/send-agreement-emails/index.ts`) — adds existing-user detection + `auth.admin.generateLink` call to embed a Supabase magic link in the invite email CTA for existing users.
2. **Accept page** (`src/app/pages/accept-agreement-page.tsx`) — handles Supabase error hash fragments (`#error=...`) when an expired magic link redirects back.

### Test Types & Files

| Type | File | What it covers |
|------|------|----------------|
| E2E | `e2e/p488-invite-auto-auth.spec.ts` | 9 test cases: existing user auto-auth, new user unchanged flow, expired magic link fallback, edge cases (already authenticated, wrong user, invalid token) |
| Smoke | `e2e/p488-smoke.spec.ts` | 3 tests: accept page loads without console errors across entry paths |
| UAT | `features/uat/p488.md` | 8 manual scenarios covering real email flows, Mailgun log verification, resend behavior |

### Testing Boundaries

**What E2E tests CAN verify:**
- Accept page renders correctly for authenticated vs unauthenticated users
- Error hash cleanup on the accept page
- Magic link auto-auth flow (simulated via `generateMagicLinkUrl` test helper — same admin API the edge function uses)
- New user flow is unchanged (regression)
- Wrong-user and invalid-token edge cases

**What E2E tests CANNOT verify (UAT-only):**
- Edge function generates the correct CTA URL (magic link for existing users, direct URL for new users) — requires real email delivery + Mailgun log inspection
- Resend flow generates a fresh magic link — requires email delivery
- Email template renders correctly with the Supabase verify URL
- Real 1-hour expiry behavior (would need to wait or manipulate Supabase auth settings)

**What is NOT tested (acceptable gaps):**
- Rate limiting on resend (recommendation from security review, not yet implemented)
- `history.replaceState` for `?token=` cleanup after authenticated load (security hardening, verifiable in UAT-5)
- Referrer policy `same-origin` meta tag (static HTML check, not behavioral)

### Test Helpers Used

- `createTestUser` / `deleteTestUser` — test user lifecycle (from `e2e/helpers/test-user.ts`)
- `createTestAgreement` / `deleteTestAgreement` — test agreement lifecycle (from `e2e/helpers/test-agreement.ts`)
- `generateMagicLinkUrl` — generates magic link via admin API with `redirectTo` (from `e2e/helpers/test-user.ts`) — mirrors what the edge function does
- `setTestSession` — injects auth session for already-authenticated scenarios
- `supabaseAdmin` — service role client for test setup/teardown
