---
status: all-done
type: story
rank: 8.0
workstream: C1
tags: [agreements, auth, new-users, friction]
created_date: 2026-03-16
completed_at: '2026-03-16'
flow: dev
uat_file: features/uat/p527.md
test_files:
  - e2e/p527-direct-sign.spec.ts
reviews:
  ux: null
  architect: null
  alignment: null
---

# P527: Direct Sign for New Users — Eliminate Email Round-Trip

## Problem Statement

**Current state:** When a new user (no existing account) receives an invitation to sign a Clarity Partner Agreement, they click the link in their email, land on the accept page, enter their name, and click "Seal & Sign." At this point, the system sends them a magic link email, redirects to a "check your email" confirmation page, and they must open a second email, click a second link, and return to the accept page where auto-accept fires.

**Pain points:**
- **Redundant email verification.** The user clicked the invitation link FROM their email inbox — they've already proven they control that email address. Sending them back to email to prove it again adds zero security value.
- **Drop-off risk at the critical moment.** After clicking "Seal & Sign" (highest engagement), the user is told to leave the page and check email. Context switches kill conversion — every extra step loses users.
- **Asymmetric experience.** P488 already eliminated this round-trip for existing users. New users — who are the majority of invited partners — still get the worse experience.
- **Confusing mental model.** "I just signed... but actually I didn't? I need to go to email first?" The two-step creates uncertainty about whether the agreement is actually signed.

**Who's affected:** Every new user invited to co-sign a partner agreement. This is the primary onboarding path for new ClarityPledge users — the partner agreement invitation is often their first interaction with the product.

## Intention (Why This Matters)

**Strategic importance:** The partner agreement is the core trust-building artifact. A frictionless signing experience directly impacts whether invited partners complete the agreement and become active users. Every new user who completes signing becomes a potential inviter themselves — network effects depend on this conversion.

**Why now:** P488 solved this for existing users (March 2026). New users remain on the friction path. With the architecture proven for existing users, extending it to new users is the natural completion.

**Impact if not solved:** New-user signing completion rate stays artificially low. The "check your email" step is the single highest drop-off risk in the agreement flow — users who don't return within minutes often never return.

## Business Requirements

**Must-haves:**
- New user clicks invitation link → enters name → clicks "Sign" → immediately sees their signed agreement (authenticated, no email round-trip)
- Account is created automatically as part of the signing action
- The signed agreement is immediately active (both parties' signatures recorded)
- The new user has a valid session after signing (can navigate the app, see their agreements)
- Creator receives the "agreement accepted" email notification (unchanged)

**Success conditions:**
- New-user signing is a single continuous flow: email → accept page → sign → see agreement
- Zero emails sent to the partner as part of the signing process itself
- The partner's account is fully functional after signing (profile created, can log in again via magic link)

**Constraints:**
- Must not change the existing-user flow (P488 magic link approach stays)
- Must not change the invitation email format or content
- Must not change the `accept_agreement` RPC contract
- Must not weaken security — the invitation token (clicked from email) is the proof of email ownership
- Must not require the partner to set a password
- Email forwarding trade-off accepted: anyone with the invitation link can sign as the partner email. This is the same trust model as DocuSign/HelloSign — the token proves inbox access at click time. The creator trusts the email recipient; forwarding is a social trust issue, not a technical one.

## User Stories

**As an invited partner (new to ClarityPledge):**
- I want to sign the agreement immediately after entering my name, so that I don't have to leave the page and check email
- I want to see the signed agreement right after signing, so that I know it's done
- I want to be logged in after signing, so that I can explore my new account

**As the agreement creator:**
- I want my partner to complete signing without friction, so that I don't have to follow up with "did you check your email?"
- I want to receive the acceptance notification as usual, so that I know the agreement is active

## Jobs to Be Done

**When I receive an invitation to sign a partner agreement:**
- I want to complete it in one sitting without interruption, so I can move on with my day (motivation: momentum — I'm acting on the email NOW, don't make me come back later)

**When I just signed an agreement:**
- I want immediate confirmation that it's done, so I feel confident the commitment is real (motivation: closure — uncertainty about whether "it worked" undermines trust)

**When I've just created an account by signing:**
- I want to see what this product is about, so I can understand what I just joined (motivation: orientation — deferred, out of scope for P527)

## Outcomes (Success Metrics)

**Friction reduction:**
- Reduce new-user signing steps from 6 (click invite → enter name → click sign → check email → click magic link → auto-accept) to 3 (click invite → enter name → click sign)
- Eliminate 100% of "check your email" interstitial views for new-user signing

**Conversion improvement:**
- New-user agreement completion rate should increase (measurable via Mixpanel: compare "invitation opened" → "agreement active" conversion before/after)

**Experience parity:**
- New users and existing users have the same number of steps to sign (both: click invite → sign → done)

## Acceptance Criteria

- [ ] AC-1: A new user (no existing account) who clicks the invitation link, enters their name, and clicks "Sign" immediately sees the signed agreement — no email confirmation step, no redirect to "check your email"
- [ ] AC-2: After signing, the new user is authenticated with a valid session (can navigate to other pages, session persists across page refreshes)
- [ ] AC-3: After signing, the new user has a complete profile (name from the form, email from the invitation, auto-generated avatar color and slug)
- [ ] AC-4: The agreement status is `active` with both `partner_profile_id` and `partner_signed_at` set
- [ ] AC-5: The creator receives the "agreement accepted" email notification (same as today)
- [ ] AC-6: The existing-user flow (P488 magic link in invitation email) is unchanged
- [ ] AC-7: The email confirmation page (`/agreements/confirm-email`) is no longer shown for new-user signing (but remains available for other flows if needed)
- [ ] AC-8: If the server-side edge function returns a non-2xx response or the client request times out (>10s), the system falls back to the current OTP flow (graceful degradation, not a hard error)
- [ ] AC-9: The invitation token is consumed on successful signing (agreement status changes to `active`), preventing replay
- [ ] AC-10: The decline flow for new users is unchanged (no account needed to decline)

## Next Steps

1. Run `/challenge-prd` to stress-test assumptions
2. Run `/architect` for technical architecture (edge function design, session handling)
3. Run `/generate-tests` for test automation
4. Run `/spec-review` to validate against tests
5. Run `/dev` to implement
6. Run `/verify` for live browser UAT

---

## Technical Architecture

### Technical Analysis

#### Current Code State

**Accept Agreement Page** (`src/app/pages/accept-agreement-page.tsx`, 608 lines):
- Route: `/agreements/:id/accept?token=[token]`
- Resolves `pageState`: `loading` | `invalid` | `unauthenticated` | `partner` | `wrong-user`.
- **Unauthenticated new-user flow** (`handleInlineSignup`, line 316): Calls `supabase.auth.signInWithOtp()` with `shouldCreateUser: true`, passing `name` and `avatar_color` in user metadata. Stores auto-accept intent in `localStorage`. Navigates to `/agreements/confirm-email` interstitial. User must check email, click magic link, return through `AuthCallbackPage` (which upserts profile), then auto-accept fires via `pendingAutoAcceptRef`.
- **Unauthenticated existing-user flow** (`handleExistingUserSignIn`, line 276): P488 solved this — edge function embeds a magic link in the invitation email CTA so existing users arrive pre-authenticated. Fallback: OTP with `shouldCreateUser: false`.
- **Authenticated partner flow** (`handleAccept`, line 173): Calls `agreementsService.acceptAgreement()` which invokes the `accept_agreement` SECURITY DEFINER RPC. Requires `currentUser.id` as `partnerId`.

**`accept_agreement` RPC** (migration `20260302150000`):
- Signature: `accept_agreement(p_agreement_id UUID, p_token TEXT, p_partner_id UUID, p_partner_display_name TEXT DEFAULT NULL) RETURNS BOOLEAN`
- SECURITY DEFINER. Updates `partner_profile_id`, `partner_signed_at`, `status = 'active'`, `partner_display_name`. Validates `invitation_token` match and `status = 'pending'`.
- **Granted to `authenticated` role only** — requires a valid Supabase session.

**AuthCallbackPage** (`src/auth/AuthCallbackPage.tsx`, 613 lines):
- The ONLY place profiles are created. Upserts to `profiles` table with `is_verified: true`.
- Generates slug via `generateSlug(name)` with retry logic for uniqueness conflicts.
- Sets `avatar_color` from `user_metadata`, `avatar_provider`, `accepted_terms_version`.
- Handles redirect via `?redirect=` URL param.

**Profile Creation Pattern:**
- `profiles.id` references `auth.users` — a profile row MUST have a corresponding `auth.users` entry.
- Profile creation always flows through `AuthCallbackPage` after Supabase auth confirms the user.
- RLS: `INSERT` policy requires `auth.uid() = id`. Service role can bypass via separate policy.
- Key fields: `id` (UUID from auth.users), `email` (unique), `name`, `slug` (unique), `avatar_color`, `avatar_url`, `avatar_provider`, `is_verified`, `has_pledged`, `accepted_terms_version`.

**Avatar Color Generation:**
- `getRandomColor()` in `api.ts`: picks from `["#0044CC", "#002B5C", "#FFD700", "#FF6B6B", "#4ECDC4"]`.
- Same palette hardcoded in `handleInlineSignup` and `AgreementEmailConfirmationPage`.

**Slug Generation:**
- `generateSlug(name)` in `api.ts`: lowercases, strips special chars, replaces spaces with hyphens.
- `ensureUniqueSlug(name)` checks DB for conflicts and appends `-N` suffix.

**Edge Function** (`supabase/functions/send-agreement-emails/index.ts`):
- Uses `SUPABASE_SERVICE_ROLE_KEY` — has full admin access including `auth.admin.*`.
- P488 already uses `supabase.auth.admin.generateLink()` for existing-user magic links.
- Supabase Admin API also provides `supabase.auth.admin.createUser()` which can create a user with `email_confirm: true` (pre-verified), returning the new user's ID.

#### Dependencies

- `@supabase/supabase-js` v2 — client-side and edge function.
- Supabase Auth Admin API (`auth.admin.createUser`) — available in edge functions via service role key.
- `accept_agreement` RPC — requires `authenticated` role (valid session with `auth.uid()`).
- Profile `INSERT` RLS — requires `auth.uid() = id` (or service role bypass).

---

### Architecture Decisions

**Decision 1: Server-side account creation via new edge function**

- **Chosen:** Create a new edge function `create-and-sign` that: (1) creates the auth user via `auth.admin.createUser({ email, email_confirm: true })`, (2) creates the profile row via service role (bypassing RLS), (3) calls `accept_agreement` RPC via service role, (4) generates a session via `auth.admin.generateLink({ type: 'magiclink' })` + returns the `action_link` to the client, (5) client exchanges the link for a session via Supabase's token hash verification. The client calls this function instead of `signInWithOtp` when the user is new and unauthenticated.
- **Rationale:** The `accept_agreement` RPC requires a valid `p_partner_id` (auth user UUID). The profile `INSERT` policy requires `auth.uid() = id`. Both need an `auth.users` entry to exist first. `auth.admin.createUser` with `email_confirm: true` creates the user as pre-verified (the invitation email click is the proof of email ownership — same rationale as DocuSign). The edge function with service role can then insert the profile and call the RPC in one atomic-ish server-side transaction.
- **Trade-off:** Adds a new edge function (deploy complexity). The alternative of extending `send-agreement-emails` was rejected because that function runs at invitation-send time, not at sign time.
- **Alternative rejected:** (A) Client-side `signInWithOtp` + `shouldCreateUser: true` without email round-trip — impossible, Supabase OTP always sends an email for new users; the token must be confirmed via the email link. (B) Custom JWT generation — bypasses Supabase session management, introduces custom auth surface area. (C) Extending `accept_agreement` RPC to also create auth users — RPCs run as `postgres` role but don't have access to `auth.admin` APIs (that's a GoTrueAdmin HTTP API, not a SQL function).

**Decision 2: Profile creation in the edge function, not AuthCallbackPage**

- **Chosen:** The new edge function creates the profile directly using service role INSERT (bypassing RLS). This duplicates the profile creation logic from `AuthCallbackPage` but is necessary because the user never visits `AuthCallbackPage` in this flow.
- **Rationale:** The current architecture has a single profile creation path (`AuthCallbackPage`). P527's flow skips the auth callback entirely — the user goes from accept page to signed agreement without a page redirect. The profile must exist before `accept_agreement` RPC runs (it sets `partner_profile_id`). Creating it server-side in the same function call is the only way to achieve single-step signing.
- **Trade-off:** Two profile creation paths (AuthCallbackPage for normal flows, edge function for agreement signing). Must keep them in sync for required fields. Mitigated by: (a) the edge function creates a minimal profile (name, email, slug, avatar_color, is_verified, has_pledged, accepted_terms_version), (b) AuthCallbackPage upserts with `ON CONFLICT id` so if the user later logs in normally, their profile gets enriched.
- **Alternative rejected:** Redirecting through `AuthCallbackPage` after `createUser` — this reintroduces a redirect chain and makes the flow non-instant.

**Decision 3: Session establishment via magic link token exchange**

- **Chosen:** After creating the user and accepting the agreement server-side, the edge function calls `auth.admin.generateLink({ type: 'magiclink', email })` and returns the `action_link` URL to the client. The client extracts the token hash from this URL and calls `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })` to establish a session without any redirect.
- **Rationale:** The client needs a valid Supabase session after signing so the user can navigate the app. `auth.admin.generateLink` returns a URL containing a `token_hash` parameter. The client can exchange this for a session using `verifyOtp` — this is a documented Supabase pattern for server-generated magic links. No email is sent; the token is returned directly in the API response.
- **Trade-off:** Passes a short-lived auth token through the API response body. This is acceptable because: (a) the edge function is called over HTTPS, (b) the token is single-use and expires in 1 hour, (c) the same pattern is used by Supabase's own PKCE flow.
- **Alternative rejected:** (A) `auth.admin.createUser` returns the user object but not a session — can't use it directly for client auth. (B) Setting `session` directly via service role — Supabase JS client doesn't support injecting server-created sessions.

**Decision 4: Graceful fallback to current OTP flow**

- **Chosen:** If the edge function returns a non-2xx response or the request times out (>10s), the client falls back to the existing `handleInlineSignup` flow (OTP + email confirmation). The edge function call is wrapped in a try/catch; on failure, the existing code path executes.
- **Rationale:** AC-8 requires graceful degradation. The current flow works; P527 is an optimization. If the optimization fails, the user gets the slightly worse but functional experience.
- **Trade-off:** The fallback may create a duplicate user attempt if `createUser` succeeded but the response was lost (network timeout). Mitigated by: `createUser` with `email_confirm: true` is idempotent on email — Supabase returns an error if the user already exists, and the OTP flow with `shouldCreateUser: true` will find the existing user and send the magic link.
- **Alternative rejected:** No fallback (hard error) — unacceptable for a critical signing flow.

**Decision 5: Slug generation server-side with uniqueness check**

- **Chosen:** The edge function generates the slug using the same `generateSlug` logic (lowercase, strip special chars, replace spaces with hyphens), then queries `profiles` for conflicts and appends `-N` suffix if needed. This mirrors `AuthCallbackPage`'s slug logic.
- **Rationale:** Slugs must be unique (DB constraint). The edge function must generate one before inserting the profile. The logic is simple enough to duplicate (5 lines of string manipulation + a conflict query).
- **Trade-off:** Slug generation logic exists in two places. Acceptable because: (a) it's simple string manipulation, (b) the edge function version is a fallback — most users will eventually pass through `AuthCallbackPage` on subsequent logins where the upsert preserves the existing slug.
- **Alternative rejected:** Importing shared code between the Vite app and Deno edge function — different runtimes, not worth the build complexity for 5 lines.

**Decision 6: Do not change `accept_agreement` RPC contract**

- **Chosen:** The RPC signature and behavior are unchanged. The edge function calls it with service role key (bypassing the `authenticated` role grant) using the newly created user's ID as `p_partner_id`.
- **Rationale:** PRD constraint. The RPC is SECURITY DEFINER and validates `invitation_token` + `status = 'pending'` — these guards remain. Service role can call any function regardless of GRANT.
- **Trade-off:** None. This is a constraint, not a choice.

---

### Security Review

**RLS Policies:**
- ✅ The new edge function uses the service role key, bypassing RLS entirely. Same pattern as `send-agreement-emails` — correct for server-side account creation + agreement acceptance.
- ⚠️ Existing `get_agreement_by_token` RPC (granted to `anon`) returns the full agreement row including `partner_email` and `invitation_token`. P527 does not worsen this existing surface, but it remains an audit item.
- ✅ The `accept_agreement` RPC is `SECURITY DEFINER` and validates `invitation_token` + `status = 'pending'`. When called from the edge function via service role, it operates correctly.

**Authentication:**
- ⚠️ **Server-side `createUser` with `email_confirm: true` skips email verification.** Justified by the invitation link proving inbox access (same trust model as DocuSign/HelloSign). Edge function MUST derive email exclusively from `clarity_agreements.partner_email` — never from client-supplied fields.
- ⚠️ **Session generation:** Edge function generates a magic link via `auth.admin.generateLink` and returns the `hashed_token` in the response body (not URL parameters — avoids Referer header leakage).
- ⚠️ **Profile creation atomicity:** If `accept_agreement` RPC fails after user/profile creation, partial state results. Edge function must NOT return session tokens on partial failure. If `createUser` succeeds but later steps fail, the OTP fallback handles it (user exists → P488 existing-user flow kicks in on retry).

**Authorization:**
- ⚠️ **Email pinning (CRITICAL):** Client sends only `{ token, partnerName }`. Edge function derives email from the agreement record — never accepts email from client payload.
- ⚠️ **Creator self-sign prevention:** Edge function must verify `agreement.partner_email !== creator.email` before proceeding.
- ✅ **Existing user guard:** Edge function checks if auth user exists for the email before calling `createUser`. If exists, returns error code directing client to P488 flow.
- ⚠️ **Partner ID derivation:** The `p_partner_id` passed to `accept_agreement` RPC must be the ID returned by `createUser` — never from the client request.

**Input Validation:**
- ⚠️ `partnerName` is user-supplied free text — must be trimmed, length-capped (100 chars), reject if empty. React's JSX escaping handles XSS for rendering, but server-side validation still required.
- ⚠️ Token format: validate UUID format before querying to prevent SQL edge cases.
- ✅ No email in client request — derived server-side from agreement record.

**Data Protection:**
- ✅ No new PII exposure. Partner email already visible on accept page UI.
- ⚠️ Error messages must be generic ("Sign-up failed") — never reveal whether an email is already registered.
- ✅ P488's `<meta name="referrer" content="same-origin">` remains on accept page.

**Token Security:**
- ✅ Invitation token (v4 UUID, 122 bits entropy) sufficient as credential. Brute-force infeasible.
- ⚠️ **Replay protection:** `accept_agreement` RPC requires `status = 'pending'` but edge function runs `createUser` before the RPC. Must check `status = 'pending'` AND `invitation_expires_at > now()` BEFORE calling `createUser`.
- ⚠️ Client must `history.replaceState` to remove `?token=` immediately after successful signing (existing P488 pattern — verify it fires for new direct-sign path).

**Rate Limiting:**
- ⚠️ `auth.admin.createUser` bypasses Supabase's built-in auth rate limits. Edge function should implement rate limiting: max 5 requests per IP per hour.
- ⚠️ Existing `send-agreement-emails` rate limiting gap (P488 security review) remains unaddressed.

**Summary of Required Mitigations:**
1. **Email pinning (CRITICAL):** Derive email from DB, never from client.
2. **Early status check (HIGH):** Verify `status = 'pending'` + expiry BEFORE `createUser`.
3. **Existing user guard (HIGH):** Check for existing auth user before `createUser`.
4. **Creator self-sign prevention (HIGH):** Verify partner_email ≠ creator email.
5. **Partner ID derivation (HIGH):** Use `createUser` return value, never client input.
6. **Atomicity (MEDIUM):** Don't return session tokens if accept_agreement fails.
7. **Input validation (MEDIUM):** Trim + cap partnerName at 100 chars server-side.
8. **Token format validation (LOW):** Validate UUID format before querying.
9. **Rate limiting (MEDIUM):** Max 5 requests/IP/hour on the edge function.
10. **Generic errors (LOW):** Don't leak registration state in error messages.
11. **URL cleanup (LOW):** `history.replaceState` after successful signing.

---

### Implementation Approach

**Files to Create:**
1. `supabase/functions/create-and-sign/index.ts` — New edge function that handles server-side user creation + agreement acceptance + session token generation for new users.

**Files to Modify:**
1. `src/app/pages/accept-agreement-page.tsx` — Replace `handleInlineSignup` for new users: call `create-and-sign` edge function first, fall back to existing OTP flow on failure. After success, exchange the returned token for a session, then navigate to the signed agreement.
2. `src/lib/agreement-emails.ts` — Add a new `invokeCreateAndSign` helper (or extend the existing pattern) for calling the new edge function.

**Files Unchanged:**
- `supabase/functions/send-agreement-emails/index.ts` — No changes. Invitation emails stay the same.
- `accept_agreement` RPC migration — No changes to the contract.
- `src/auth/AuthCallbackPage.tsx` — No changes. Normal login flows unaffected.
- `src/app/pages/agreement-email-confirmation-page.tsx` — Stays available for OTP fallback path.

**Build Sequence:**

1. **Create edge function `create-and-sign`** (~80 lines)
   - Accept POST body: `{ agreementId, token, partnerName }`. **No email in client payload** — email is derived server-side from the agreement record (security mitigation #1).
   - Validate: fetch agreement by ID using service role, verify `invitation_token` matches `token`, verify `status = 'pending'`, verify `invitation_expires_at > now()`. Extract `partner_email` from the agreement row.
   - Guard: verify `partner_email !== creator email` (fetch creator profile to compare).
   - Check if user already exists: `supabase.from('profiles').select('id').eq('email', partner_email).maybeSingle()`. If exists, return `{ error: 'USER_EXISTS' }` (client switches to P488 flow).
   - Create auth user: `supabase.auth.admin.createUser({ email: partner_email, email_confirm: true, user_metadata: { name: partnerName } })`. Extract `user.id`.
   - Generate slug: lowercase name, strip special chars, check uniqueness against profiles table, append `-N` if conflict.
   - Insert profile: service role INSERT into `profiles` with `id`, `email`, `name`, `slug`, `avatar_color` (random from palette), `is_verified: true`, `has_pledged: false`, `accepted_terms_version: 'v1.1'` (NOTE: on ToS version bump, update this edge function too — Deno runtime cannot import `CURRENT_TERMS_VERSION` from the Vite app), `pledge_version: 2`. Omit `avatar_url` and `avatar_provider` (null defaults, enriched on subsequent AuthCallbackPage login).
   - Accept agreement: call `accept_agreement` RPC via service role with `p_agreement_id`, `p_token`, `p_partner_id` (new user ID), `p_partner_display_name` (partnerName). **NOTE:** Requires `GRANT EXECUTE ON FUNCTION accept_agreement(...) TO service_role;` — add a migration if not already granted (verify on test project first).
   - Generate session token: `supabase.auth.admin.generateLink({ type: 'magiclink', email: partner_email })`. Extract `properties.hashed_token` from response.
   - Fire-and-forget: trigger `send-agreement-emails` with action `'accepted'` (reuse existing email notification). **This is the ONLY accepted-email trigger** — the client must NOT also fire `invokeAgreementEmails`.
   - Return: `{ ok: true, hashedToken, redirectTo: '/agreements/{agreementId}' }`.
   - Error handling: if any step after `createUser` fails, the user exists but the agreement isn't signed. The OTP fallback will handle this gracefully (user exists, P488 flow kicks in on next attempt).

2. **Modify accept page: add direct-sign flow** (~40 lines changed)
   - In the `handleInlineSignup` function (or a new `handleDirectSign` wrapper):
     - Call `supabase.functions.invoke('create-and-sign', { body: { agreementId, token, partnerName: partnerDisplayName.trim() } })`. **No email sent** — edge function derives it from the agreement record.
     - On success: extract `hashedToken` from response. Call `supabase.auth.verifyOtp({ token_hash: hashedToken, type: 'magiclink' })` to establish client session. **NOTE:** `verifyOtp` is a new Supabase API call not currently used in the codebase — verify the exact parameter shape against Supabase JS v2 SDK docs.
     - After session established: show success toast, navigate to `/agreements/${agreementId}`. **Do NOT fire `invokeAgreementEmails`** — the edge function already sent the accepted-email notification server-side.
     - On failure (non-2xx, timeout, verifyOtp error): fall back to existing `handleInlineSignup` code (OTP + email confirmation).
   - Button label changes from "Seal & Sign" to "Sign" per PRD (or keep current — this is a UX decision, not architectural).

3. **Deploy edge function** to test project, then prod.
   - `supabase functions deploy create-and-sign --project-ref <ref> --no-verify-jwt`
   - The `--no-verify-jwt` flag is needed because the caller is unauthenticated (anon).

4. **Test the full flow:**
   - New user: click invite → enter name → click Sign → account created server-side → agreement accepted → session returned → user sees signed agreement.
   - Fallback: simulate edge function failure → user gets OTP flow (existing behavior).
   - Existing user: unchanged (P488 magic link in invitation email).
   - Decline: unchanged (no account needed).

**Pre-deploy Checklist:**

### Secrets to provision
- No new secrets needed — the edge function uses existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (available to all edge functions by default).

### Deploy commands
- [ ] `supabase functions deploy create-and-sign --project-ref gfjctyxqlwexxwsmkakq --no-verify-jwt` (test)
- [ ] `supabase functions deploy create-and-sign --project-ref besjtuodziykmjidubzw --no-verify-jwt` (prod)

### Post-deploy verification
- [ ] Smoke test: call edge function with test data on test project
- [ ] Full UAT: new user signs agreement via invitation link on prod
- [ ] Check Sentry for new errors in first 10 minutes

---

## Test Coverage Strategy

### What Changed

P527 adds one new edge function and modifies one client page:
1. **Edge function** (`supabase/functions/create-and-sign/index.ts`) — server-side user creation + profile insert + agreement acceptance + session token generation.
2. **Accept page** (`src/app/pages/accept-agreement-page.tsx`) — calls the new edge function instead of `signInWithOtp` for new users; falls back to OTP on failure.

### Test Types & Files

| Type | File | What it covers |
|------|------|----------------|
| E2E | `e2e/p527-direct-sign.spec.ts` | 10 tests: happy path (direct sign, session, profile, agreement state), existing user regression, fallback to OTP, decline unchanged, replay protection, expired token, empty name validation |
| Smoke | `e2e/p527-smoke.spec.ts` | 3 tests: page loads without errors, UI elements present, edge function endpoint reachable |
| UAT | `features/uat/p527.md` | 8 manual scenarios: full flow, profile completeness, session persistence, creator notification, existing user regression, fallback, decline, replay |

### Testing Boundaries

**What E2E tests CAN verify:**
- Full direct-sign flow (edge function called, session established, agreement active)
- Profile completeness (DB assertions via supabaseAdmin)
- Agreement state transitions (status, partner_profile_id, partner_signed_at)
- Fallback behavior (intercept edge function → verify OTP flow fires)
- Decline flow unchanged
- Token replay protection
- Expired token handling
- Input validation (empty name)

**What E2E tests CANNOT verify (UAT-only):**
- Creator email notification delivery (requires real Mailgun delivery)
- Session persistence across browser close/reopen (requires manual test)
- Edge function unavailability fallback (requires temporary undeploy)
- Real invitation email click → accept page → sign flow (requires real email)

**What is NOT tested (acceptable gaps):**
- Rate limiting on the edge function (security recommendation, not yet implemented)
- Slug uniqueness conflict resolution (covered by existing AuthCallbackPage tests + simple string logic)
- Avatar color randomness (non-deterministic, visual only)

### Test Pyramid

```
     /\
    /  \   10 E2E tests
   /____\
  / 0 INT  \
 /__________\
/ 0 UNIT    \
```

No unit tests needed — the edge function is a server-side orchestration (create user → insert profile → accept agreement → generate token). No complex business logic to unit-test in isolation. The E2E tests exercise the full flow.

No integration tests needed — the edge function IS the integration layer. E2E tests hit the real edge function on the test project.

### Files Generated

- `e2e/p527-direct-sign.spec.ts` (10 E2E tests)
- `e2e/p527-smoke.spec.ts` (3 smoke tests)
- `features/uat/p527.md` (8 UAT scenarios)

**Total:** 13 automated tests + 8 UAT scenarios
