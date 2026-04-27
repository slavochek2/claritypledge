---
status: backlog
type: story
rank: 1000684
created_date: '2026-04-10'
tags:
  - letters
  - compliance
  - gdpr
  - tos
  - one-to-many
flow: dev
pipeline_plan:
  - create-spec
  - challenge-prd
  - ux
  - architect
  - ui
  - generate-tests
  - dev
  - verify
pipeline_ran:
  - create-spec
  - challenge-prd
  - challenge-prd.2
  - ux
  - architect
  - ui
  - generate-tests
  - spec-review
  - spec-review.2
  - decompose
delivery_stage: decompose
locked_at: '2026-04-25T12:28:09.518Z'
---

# P684: One-to-Many Letter — Account Gates Response Submission

## Problem

**Situation:** ClarityPledge supports one-to-many letters where a sender shares stories via a public link. Currently, anonymous readers can read AND submit ratings/positions without any authentication — responses are written to the database via token-based RPCs during reading.

**Complication:** Anonymous responses are useless for the letter's purpose. Letters are prep for /live sessions — the sender needs to know WHO responded and HOW to prepare for the conversation. Anonymous ratings ("Reader #3 scored 2/5") provide no actionable signal. Additionally, creating database records for anonymous users without TOS acceptance is a GDPR gap — we're processing data without consent or disclosure.

**Question:** How do we gate response submission behind account creation in one-to-many letters, so every response has an identified owner and proper consent?

## Appetite

- **Blast radius:** Medium — changes the one-to-many reading flow to require signup before rating. Touches `useLetterReadingState`, letter completion flow, requires two new edge functions, and adds a new `letter_response_pending` table.
- **Reversibility:** Fully reversible — remove the gate, anonymous submission resumes. One additive schema change (new table), no destructive migrations.
- **Decision density:** Low — key decisions made: account required before responses can be submitted, inline signup form (not redirect), no skip option, ratings persisted server-side at signin-request time (no cross-device data loss).

## Dependencies

**P684 depends on `feature/letters-ship` (w2) merging to main first.** The 4 response RPCs that P684 guards (`submit_rating_by_token`, `submit_point_response_by_token`, `reveal_prediction_by_token`, `update_delivery_status_by_token`) plus the letter reading page (`letter-reading-page.tsx`), state hook (`useLetterReadingState.ts`), and `letters-service.ts` RPC wrappers all live on `feature/letters-ship` and do not exist on main. See Tech Architecture — Reuse Inventory for the full list.

**Do not run `/dev` on P684 until w2 is merged to main.** Running pipeline skills that assume these files exist will fail spec-review and dev gates.

### Reconciliation pass 2026-04-11 (post P683/P690–P693)

This spec was drafted 2026-04-10 before P683 shipped and before P690–P693 landed on w2. A reconciliation pass on 2026-04-11 updated the technical layer against w2's current state. Summary of what changed — implementing agents should read these sections for the rewritten guidance:

- **AD2 (auth guard plan)** — rewritten from blanket `auth.uid() IS NOT NULL` to **mode-gated** (rejects only when joined letter `mode = 'one-to-many'`). A blanket guard would regress P648/P683/P691 (one-to-one token-as-session-bootstrap, sentinel UUID path is LIVE code).
- **AD1 step 2–3** — look up users via `get_auth_user_by_email()` SECURITY DEFINER RPC (not `profiles.email`), with orphan-profile self-heal per P683 commit 3208215e.
- **AD7** — canonical reference pattern is now `create-and-open-letter` (which already implements unified `createUser` + `generateLink`), not `send-agreement-emails.handleInvitation()` (which still has split branches on w2).
- **AD3** — added P690 SECURITY DEFINER invariant: anon readers must load stories server-side because source `clarity_docs` rows may carry `visibility = 'private'`.
- **AD4** — rewritten against the w2 P691/P693 3-branch reading page structure; added AD4.1 with P692 `getSession()` rule and P693 `!!session` anti-flash rule for the confirm route.
- **Build Sequence step 1** — clone RPCs from `20260411201933_p683_engagement_rpcs_drop_expiry_check.sql`, not the P642 original (CREATE OR REPLACE migration source rule, P683 KDD).
- **Test Coverage** — RPC auth-guard tests now assert BOTH the one-to-many reject AND the one-to-one accept for each of the 4 RPCs; added MutationObserver no-flash canary on the confirm route.

KDD sources: `docs/decisions.md` entries from commits 9b8d780a, 50a1dbd3, 3208215e, 54f7c6f0, 43911b8a, bba31e13.

## Solution

### Gate: account required to persist responses (one-to-many)

- Unauthenticated readers can **read and interact with the entire letter freely** — rating stories, positioning on points — without any signup prompt during reading
- All ratings and positions are captured in **local state only** (component state + localStorage) during the reading flow
- **At the end of the letter** (after the last story/point), the reader sees an end-of-letter signup form that persists their responses
- Already-authenticated readers (logged in via another tab, from the app, or via return visit) skip the signup form entirely — their responses save to the DB in real time during reading, and the end-of-letter screen is a plain success confirmation

### End-of-letter signup form (unauthenticated readers only)

- Heading: "Share your responses with [SenderName]"
- Name field (text input)
- Email field (email input)
- TOS checkbox: "I accept the [Terms] and [Privacy Policy]. We'll create an account to save your responses."
- "Send my responses" button (disabled until all fields filled + checkbox checked)
- No skip option — the responses are either persisted (via signup) or discarded (reader closes the tab)

### Account creation flow — branded magic-link email with server-side pending row

**Extends the agreement invitation pattern at `supabase/functions/send-agreement-emails/index.ts handleInvitation()`.** Today that function only calls `generateLink` for **existing** users; the new-user branch uses the raw `acceptUrl`. P684 **unifies both branches through `generateLink`** (creating the auth user first for new emails) so timing and email shape are identical — that's how we close the enumeration oracle.

**Two edge functions** split across the email round-trip:

1. `request-letter-response-signin` validates + creates auth user if needed + mints magic link + writes `letter_response_pending` row + sends branded email.
2. `confirm-letter-response` reads the pending row server-side after magic link auth and atomically creates delivery + responses + terms_acceptances.

Full specs in AD1.

See UX Flow 2 for the end-to-end sequence and AD1 for server-side steps.

### Anonymous RPC lockdown (one-to-many)

Add `auth.uid() IS NOT NULL` guard inside all 4 response RPCs (`submit_rating_by_token`, `submit_point_response_by_token`, `reveal_prediction_by_token`, `update_delivery_status_by_token`). Server-side enforcement, not client-only. See BLOCK-2 and AD2.

## Risks / Non-Goals

### Risks

- Signup friction may reduce response rates. Mitigation: the signup prompt appears at the moment of engagement (they've already invested in reading), and the form is minimal (3 fields + checkbox). Users who don't want to respond can still read freely.
- Email already has an account — edge case. Mitigation: link delivery to existing profile, send magic link, continue seamlessly.
- Auth session must survive the transition from unauthenticated to authenticated mid-reading. Mitigation: `verifyOtp` with hashed token (same pattern as one-to-one letter flow).

### Non-Goals

- Do NOT allow anonymous response submission — every response needs an identified owner
- Do NOT redirect to /signup page — keep inline to preserve reading context
- Do NOT add Google OAuth to this flow (email-only for simplicity)
- Do NOT add onboarding or app exploration after completing the letter
- Do NOT modify the one-to-one letter flow (that's P683)
- Do NOT build the scheduled cleanup job for expired `letter_response_pending` rows in this spec — tracked as follow-up. Expired rows simply return an "expired" error on confirm until swept.
- Rate limiting of the `request-letter-response-signin` endpoint — deferred to a follow-up if abuse is observed in prod. Supabase's built-in global auth rate limit on `admin.generateLink` is the v1 floor.

## Done-When

- [ ] Unauthenticated readers can read the full letter and interact with all rating/positioning controls without any signup prompt during reading
- [ ] Ratings and positions captured in local state only during unauthenticated reading (zero DB writes)
- [ ] End-of-letter signup form includes name, email, TOS checkbox with account creation disclosure
- [ ] "Send me the link" button disabled until all fields filled and checkbox checked
- [ ] Clicking "Send me the link" shows "Check your email" screen — no session returned yet
- [ ] Branded Mailgun email sent via dedicated `letter-response-signin` template (no Supabase default template exposure)
- [ ] Edge function response is identical for new and existing accounts (no enumeration oracle), with `generateLink` called for both branches to equalize timing
- [ ] Server-side validation: `termsAccepted === true`, `termsVersion` in allowlist, ratings payload shape valid, IP hash computed server-side from request headers using `_shared/hash-ip.ts`
- [ ] `request-letter-response-signin` writes a `letter_response_pending` row with ratings + positions + terms_version at signin-request time (not at confirm time)
- [ ] `confirm-letter-response` uses two-client pattern: user-JWT client for `auth.uid()` lookup, service-role client for all writes
- [ ] Magic link click on any device (cross-device safe) lands on `/letter/{letterId}/confirm` which calls `confirm-letter-response` — edge function reads pending row, creates delivery + responses + terms_acceptances atomically, deletes pending row
- [ ] `terms_acceptances` row written server-side for new accounts (not for existing accounts — they already have one)
- [ ] Delivery row created only after magic link confirmation — never at page load, never at form submit
- [ ] No delivery rows exist for readers who browsed but never completed the signup confirmation
- [ ] Authenticated readers (existing session) skip the signup form entirely — responses save in real time
- [ ] Authenticated one-to-many readers submit via `submitLetterResponseAuthenticated()` (inline sequential inserts under the user's JWT): creates `letter_deliveries`, inserts response rows, inserts (or no-ops) `terms_acceptances` — no new RPC, no email round-trip
- [ ] Sender sees reader name (from `letter_deliveries.receiver_name`, not `profiles.name`) in results view
- [ ] Response RPCs enforce `auth.uid() IS NOT NULL` server-side (not client-gate only)
- [ ] Completion screen shows "Your responses have been shared with [SenderName]. You can close this tab." (no `window.close()`)
- [ ] Expired pending row on confirm (>24h) shows "This link expired — please read the letter again" message

## Acceptance Criteria

- [ ] GDPR Article 13 compliant: account creation disclosed at point of consent
- [ ] Audit trail: `terms_acceptances` row with IP hash and user agent
- [ ] Zero anonymous response rows in DB for one-to-many letters (all responses have `receiver_profile_id`)
- [ ] Sender can see individual reader responses with names
- [ ] Form validation: valid email format, name not empty
- [ ] Anonymous browse (read without auth) still works
- [ ] Response RPCs reject anonymous callers (server-side auth check, not client-only)
- [ ] Zero delivery rows for readers who only browsed (never signed up)

## UX Notes

States for the reading flow:
- **Reading (unauthenticated):** stories and points visible, rating/positioning controls fully interactive — captured in local state. No visual muting, no signup prompt during reading.
- **Reading (authenticated):** same as above, but responses persist to the DB in real time via token RPCs (auth check passes).
- **End-of-letter signup (unauthenticated):** form with name, email, TOS checkbox, "Send my responses" button. Disabled until all three filled.
- **Submitting:** spinner on button, form fields disabled.
- **Check your email:** transitions from the signup form. Shows the typed email and expiry note ("Link expires in 1 hour"). No resend button in v1.
- **Confirm route loading:** brief spinner while the edge function reads the server-side pending row and writes the delivery row + responses.
- **Completion (both paths):** "Your responses have been shared with [SenderName]." + "You can close this tab."

## Resolved Decisions

**BLOCK-1 (Delivery row lifecycle):** Delivery row is created atomically at **magic-link confirmation** (not at page load, not at form submit). No anonymous delivery rows exist. Reading progress before signup is UI-only state (component state + localStorage) — no server-side persistence needed. Browse-only readers leave zero DB footprint.

**BLOCK-2 (Anonymous RPC lockdown):** Add `auth.uid() IS NOT NULL` check inside each response RPC (`submit_rating_by_token`, `submit_point_response_by_token`, `reveal_prediction_by_token`, `update_delivery_status_by_token`). This is safe for one-to-one because `create-and-open-letter` authenticates users before any RPCs run. Client-side gate alone rejected — server must enforce.

**BLOCK-3 (Signup timing — defer to end of letter):** Signup is deferred to the **end of the letter**, not triggered on first rating interaction. Rationale: (a) reader invests in reading before being asked to commit — better conversion; (b) no need for "muted controls" visual pattern — all controls are fully interactive in local state; (c) completion screen after magic-link return is a natural terminus; (d) matches the actual goal — "share my responses" is a commit action that makes sense after the responses exist, not before.

- **BLOCK-4 (Email enumeration oracle):** New and existing accounts get identical client response ("Check your email"). Timing equalized via uniform generateLink call. Why: prevents account-existence leakage via public letter URL.

- **BLOCK-5 (Branded email):** Magic link delivered via custom Mailgun email using new template (not Supabase default). Why: branded trust + reuses established send-agreement-emails pattern.

**WARN (window.close):** Replaced "Done" button with static "You can close this tab." message. `window.close()` doesn't work for user-opened tabs.

## UX Design

### User Flows

#### Flow 1: Browse-only (no completion)

1. Reader opens public link `/letter/{letter_id}`
2. Letter content loads: sender intro, stories with rating controls, points with positioning controls
3. Reader reads stories and points freely — rating controls and positioning controls are fully interactive, captured in local state
4. Reader stops partway, closes the tab
5. Zero DB footprint left behind (no delivery row, no responses, no `terms_acceptances` row)

#### Flow 2: Full read + sign up (primary happy path — unauthenticated)

1. Reader opens public link, reads the full letter
2. Throughout reading: taps rating controls and positioning controls freely — all captured in local state (localStorage-backed draft keyed by `p684_letter_draft:{letterId}`)
3. After the last story/point: end-of-letter screen appears with the signup form (name, email, TOS checkbox, "Send me the link" button)
4. Reader fills in name + email, checks TOS, taps "Send me the link"
5. Frontend calls `request-letter-response-signin` with `{ letterId, name, email, termsAccepted, termsVersion, ratings, positions }` → shows spinner on button
6. Screen transitions to "Check your email" state: "We sent a link to [email]. Click it to save your responses."
7. Reader opens their email, taps the CTA button
8. Supabase auto-authenticates the reader, redirect to `/letter/{letterId}/confirm`
9. Confirm route calls `confirm-letter-response` (no body beyond letterId — user_id from JWT) → edge function reads the pending row, atomically creates delivery + responses + terms_acceptances, deletes the pending row
10. Redirect to completion screen: "Your responses have been shared with [SenderName]. You can close this tab."

#### Flow 3: Existing account — identical to Flow 2 from the client's perspective (no enumeration oracle; see BLOCK-4).

#### Flow 4: Already authenticated (bypass the signup form entirely)

1. Reader opens public link while already logged in (from another tab, from the app, or from a previous session)
2. Letter content loads with session detected — the page creates the delivery row silently on first interaction (or at load time if the letter requires it)
3. Ratings/positions save to the DB in real time via token RPCs (authenticated — passes `auth.uid() IS NOT NULL` check)
4. End-of-letter screen is a plain confirmation: "Your responses have been shared with [SenderName]. You can close this tab."
5. No signup form, no email step, no magic link

#### Flow 5: Return visit after signing up

If session still valid → Flow 4 (direct submit). If session expired → Flow 2 re-runs; pending row UPSERTS on (user_id, letter_id). Confirm is idempotent — if a delivery already exists, returns ok without creating duplicates (see AD1 step 5).

#### Flow 6: Cross-device — works transparently; pending row is keyed by user_id, not device. See Edge Cases table.

### Screen States

#### State 1: Reading (unauthenticated, fully interactive)

The letter renders in `chromeFree` layout (no top nav, no bottom nav, no footer — full reading immersion).

**Content area:**
- Sender intro card at top (sender name, letter context)
- Stories displayed sequentially with their associated rating controls
- Points displayed with positioning controls

**Interaction controls:** Fully enabled, 100% opacity, normal hover states. Ratings and positions work identically to an authenticated read. All responses are captured in **local state only** (React state + optional `localStorage` draft keyed by `letterId`). Zero DB writes, zero delivery row, zero profile reference.

**No banner, no pre-emptive signup prompt, no account prompt during reading.** The reader encounters the gate only at the very end, after the final point has been positioned. This preserves the emotional arc of reading something personal.

#### State 2: Reading (authenticated — e.g., workshop participant)

Visually identical to State 1. The auth context already has `currentUser`, so the reader reaches the end of the letter and is routed straight to submission + completion without ever seeing the signup form. No "signed in as" toast mid-read.

#### State 3: End-of-letter signup form (unauthenticated readers only)

**Trigger:** Reader completes the final point on the final story. The completion area (where authenticated readers see the gap summary / completion copy) is instead replaced by the signup form.

**Placement:** Inline, in the content column, directly below the last point. Not a modal, not a sheet, not a drawer. The reader scrolls into it naturally as part of the reading flow.

**Form content (top to bottom):**
1. **Heading:** "Save your responses" — `text-base font-semibold`
2. **Subtext:** "Your name will be shared with [SenderName] alongside your responses. We'll create an account so you can come back to this letter and any future ones." — `text-sm text-muted-foreground`
3. **Name field:** text input, placeholder "Your name", label "Name"
4. **Email field:** email input, placeholder "you@example.com", label "Email"
5. **TOS checkbox + label:** Unchecked by default. Label: "I accept the [Terms of Service] and [Privacy Policy]." — Terms and Privacy links open in new tab
6. **"Send me the link" button:** Full-width, primary color. Disabled until all three conditions met (name not empty, valid email format, checkbox checked).

**No skip, no "respond anonymously", no dismiss.** This is the only path to persist responses. Reader's only alternatives are: close the tab (responses lost), or submit the form.

**Visual treatment:** Sits within the page flow with a subtle border (`border-border`) and slight background tint (`bg-muted/50`). Not elevated. Generous vertical spacing between fields (`space-y-4`).

#### State 4: Submitting

- Button text replaced by spinner + "Sending..."
- All form fields disabled
- If submission takes more than 10 seconds, show "Still working..." below the button

#### State 5: Check your email

On success, the form is replaced by a confirmation panel in the same content column:

- **Heading:** "Check your email" — `text-lg font-semibold`
- **Body:** "We sent a link to [email]. Click it to save your responses and create your account." — `text-sm text-muted-foreground`
- **Subtext:** "You can close this tab — the link works on any device." — `text-xs text-muted-foreground`
- No resend button in v1. If rate-limited, show a generic error in the form (State 6 copy).

#### State 6: Submission error

- Form re-enables
- Error banner above the button: `bg-red-50 border-red-200 text-red-700 text-sm rounded-md p-3`
- Error messages:
  - Rate limit: "Too many attempts. Please wait a moment and try again."
  - Network: "Something went wrong. Please check your connection and try again."
  - Server: "Something went wrong. Please try again."

Identical copy is shown whether the email belongs to an existing account or not — the edge function's unified response prevents enumeration.

#### State 7: Confirm route (`/letter/{letterId}/confirm`)

Reader clicks the magic link in the email, which lands here. The page:

1. Supabase's standard link handler has already verified the OTP and established an auth session by the time this page mounts.
2. The page calls `confirm-letter-response` with letterId (user_id is read server-side from the JWT).
3. The edge function looks up the `letter_response_pending` row by `(user_id, letter_id)`, atomically creates the delivery row (with `receiver_profile_id = auth.uid()`, `receiver_name` from pending, `receiver_email = auth.email()`, status `completed`), inserts rating + point response rows from `pending.ratings_json` / `pending.positions_json`, writes the `terms_acceptances` audit row, deletes the pending row, returns success.
4. If the pending row is missing or expired → fall through to the expiry state (see Edge Cases).

**Loading UI:** Centered spinner + "Saving your responses…" Brief — this is a single round-trip.

#### State 8: Completion

Shown after the confirm route succeeds (or immediately after submission for authenticated State 2 readers).

- Centered completion message in the content column
- **Primary text:** "Your responses have been shared with [SenderName]." — `text-lg font-semibold text-center`
- **Secondary text:** "You can close this tab." — `text-sm text-muted-foreground text-center`
- No buttons, no CTAs, no `window.close()` call (it doesn't work for user-opened tabs — matches P683)
- `chromeFree` layout remains

#### State 9: Link expired (pending row not found)

Reader clicks a stale magic link (>24h old, pending row swept) or an edge case where the pending row was never written. This is a single-path state — the pending row is keyed by `user_id`, so the reader's device does not matter; "not found" means the server row is genuinely absent or expired:

- **Heading:** "This sign-in link has expired" — `text-lg font-semibold`
- **Body:** "Please read the letter again to re-enter your responses." — `text-sm text-muted-foreground`
- **CTA:** "Open the letter" — links back to `/letter/{letterId}`. The reader is already authenticated, so the end-of-letter form is skipped and they can direct-submit (State 2 path).

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Reader opens link on mobile | Same flow, responsive layout. End-of-letter form is full-width within the content column. Touch targets >= 44px. |
| Reader has JavaScript disabled | Letter content renders (SSR). Rating/positioning controls won't function — acceptable degradation. No signup form. |
| Reader opens link in private/incognito, then clicks email in a different window | Works identically. The pending row is keyed server-side by `user_id`, so the incognito-vs-main-window distinction is irrelevant once the form is submitted. The reader can click the email from any window or device. |
| Email typo — reader types wrong email | Magic link sent to wrong address. Reader never receives it. They open the letter again, re-read, re-submit with correct email. **Orphan `auth.users` rows CAN exist** — the mis-typed email was passed to `auth.admin.createUser` before the link click. Acceptable for v1: a cleanup job (out of scope; see Non-Goals) sweeps orphans older than 30 days. |
| Existing account, different display name than typed | The typed name is stored on `letter_deliveries.receiver_name` (per-letter attribution). The profile's `name` is unchanged. Sender sees the name the reader typed for *this* letter. |
| Reader clicks the email link on a different device | **Works.** The pending row is keyed by `(user_id, letter_id)` and loaded server-side at confirm time. Cross-device is the default path — no localStorage dependency, no data loss. |
| Reader clicks the email link after a very long delay | Magic link validity is governed by Supabase's standard OTP expiry (`otp_expiry = 3600` in config.toml — 1 hour). Expired link shows a generic "link expired" message; reader re-submits the form. |
| Two readers use the same email | Second reader's submission is handled identically (unified response). If the first reader has already confirmed, a second delivery row is created. Both coexist. |
| Very long name input | Truncate display at 50 characters. No hard server limit beyond DB column size. |
| Reader refreshes the reading page mid-letter | Local state is held in React state + optional `localStorage` mirror. If mirrored, refresh restores progress; otherwise reader restarts. No DB writes means no orphaned rows. |
| Reader refreshes after submitting the form (State 5) | State 5 is re-shown from `localStorage` so the "check your email" instructions persist. |
| Rate limiting on magic link sends | Edge function returns a generic rate-limit error (State 6). No distinction between new and existing account — prevents enumeration. |

### Accessibility

End-of-letter form receives focus on mount; native checkbox; aria-live on "check email" and completion. Full checks in `e2e/a11y/p684-accessibility.spec.ts`.

## Technical Architecture

### Technical Analysis

#### Reuse Inventory

**Edge Functions:**
- `supabase/functions/create-and-open-letter/index.ts` (w2) — one-to-one account creation + delivery linking. Pattern: validate token -> check existing user -> `auth.admin.createUser` -> create profile -> link delivery -> `auth.admin.generateLink` -> return `hashedToken`. Reusable pattern for P684, but operates on an *existing* delivery row looked up by token. P684 needs a variant that *creates* the delivery row.

**RPCs (all on w2 branch `feature/letters-ship`):**
- `submit_rating_by_token(UUID, UUID, INTEGER)` — `SECURITY DEFINER`, `GRANTED TO anon, authenticated`. Looks up delivery by `invitation_token`, inserts `story_verifications` row with `listener_id = COALESCE(auth.uid(), sentinel_uuid)`.
- `submit_point_response_by_token(UUID, UUID, TEXT)` — same pattern, inserts `letter_point_responses`.
- `reveal_prediction_by_token(UUID, UUID)` — same pattern, returns prediction JSONB.
- `update_delivery_status_by_token(UUID, TEXT)` — same pattern, updates delivery status with forward-only guard.
- `seal_and_send_letter(UUID, JSONB, JSONB)` — creates delivery rows from `p_deliveries` array at seal time. For one-to-many, `p_deliveries` is empty (no recipients known at seal time).
- `get_letter_for_reading(UUID)` — takes invitation token, returns letter + snapshots + delivery JSONB.
- `get_letter_by_token(UUID)` — lightweight token lookup for the edge function.

**Client-side service:**
- `src/app/data/letters-service.ts` (w2) — all token-based RPC wrappers (`submitRatingByToken`, `submitPointResponseByToken`, `revealPredictionByToken`, `updateDeliveryStatusByToken`), plus authenticated direct-table equivalents. `requireAuth()` at line ~31 uses `supabase.auth.getSession()` (NOT `getUser()`) per P692 — new helpers in this file must match. `submitPointResponse()` intentionally skips `requireAuth` (see inline comment lines ~357–358); do not add a guard there.

**Reading page:**
- `src/app/pages/letter-reading-page.tsx` (w2) — route `/letter/:id`. **Rewritten for P691/P693.** Current structure: `sessionChecked` gate → (a) `currentUser` (with `!!session` anti-flash from P693) → authed RLS read path; (b) `token` param → one-to-one token verify/open via `create-and-open-letter`; (c) else → anon dead-end. P684 replaces branch (c) for `mode = 'one-to-many'` letters with the `get_letter_for_public_reading` local-state path (AD4). Prior P684 draft described a two-path structure — that description is stale. Re-read the file on `feature/letters-ship` before implementing to find the exact branch labels.

**State machine:**
- `src/app/hooks/useLetterReadingState.ts` (w2) — manages story index, phase, ratings, positions. Persists to `sessionStorage` keyed by `delivery-${deliveryId}`. Forward-only transitions. Currently receives `deliveryId` as required param — before signup there is no deliveryId.

**UI components:**
- `src/app/components/letters/letter-cover.tsx` (w2) — cover screen with "Open the Letter" CTA. Has `mode` prop but doesn't differentiate one-to-many behavior.
- `src/app/components/letters/letter-completion-summary.tsx` (w2) — completion flow with gap summary and confetti.
- `src/app/components/legal/consent-notice.tsx` (main) — passive consent text ("By joining, you agree to..."). P684 needs an **active consent variant** with a checkbox.

**Consent infrastructure:**
- `src/app/data/api.ts:recordTermsAcceptance()` — updates `profiles.accepted_terms_version` + inserts `terms_acceptances` row with IP hash and user agent. Client-side only (uses `navigator.userAgent`, `hashIP()`).
- `src/lib/constants.ts:CURRENT_TERMS_VERSION` — currently `'v1.2'`.
- `supabase/migrations/20260107_p37_consent_mechanism.sql` — `terms_acceptances` table schema (user_id, terms_version, ip_hash, user_agent). RLS: authenticated insert only.

**Auth patterns:**
- `create-and-open-letter` uses `auth.admin.generateLink({ type: 'magiclink' })` + client-side `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })` for instant auth without email click. **Already implements the unified new-user + existing-user `generateLink` path** (lines 240–324 self-heal orphan profiles, line 324 `createUser`, line 416 `generateLink`). This is the canonical reference for AD7 — NOT `send-agreement-emails handleInvitation()`, which still has split branches on w2.
- `src/auth/AuthCallbackPage.tsx` — profile creation after email verification (NOT via trigger).
- `get_auth_user_by_email(p_email)` — SECURITY DEFINER RPC on w2 (`supabase/migrations/20260411120000_p683_auth_user_lookup_rpc.sql`). Use this to look up existing users by email from edge functions; supabase-js v2 has no `auth.admin.getUserByEmail`. See P683 KDD on supabase-js v2 admin API gaps.

#### Current One-to-Many Reading Flow (broken)

1. Sender seals letter with mode `one-to-many`, no deliveries in `p_deliveries` array
2. Sender copies public link: `${origin}/letter/${letterId}`
3. Reader opens link -> `letter-reading-page.tsx` receives `id = letterId`, no `token`
4. No `token` -> falls to authenticated path -> `!currentUser` -> shows "Sign in to read this letter"
5. **Dead end.** One-to-many reading currently requires the reader to already have an account and somehow have a delivery row. This doesn't exist in practice.

**Conclusion:** There is no working anonymous one-to-many reading flow today. P684 is building the first one.

### Architecture Decisions

**AD1: Two edge functions — `request-letter-response-signin` and `confirm-letter-response`**

The flow is split across the email round-trip. A single edge function can't span it.

**`request-letter-response-signin`** — called when the reader submits the end-of-letter form.

Input: `{ letterId, name, email, termsAccepted, termsVersion, ratings, positions }`

**Payload shapes:**

```typescript
ratings: Array<{ storyId: string; rating: 1|2|3|4|5|6|7 }>
positions: Array<{ pointId: string; position: number }>
```

The edge function must validate this shape server-side before writing the pending row: each `ratings` entry has a valid UUID `storyId` and an integer `rating` in 1..7; each `positions` entry has a valid UUID `pointId` and a numeric `position`. Reject with a generic input-validation error on any shape mismatch (do not leak which field failed — generic error keeps the endpoint from becoming a shape oracle).

Output (unified, regardless of whether the email is new or existing): `{ ok: true }`

Steps (service role):
1. Validate: letter exists, status `sealed`, mode `one-to-many`. `termsAccepted === true`. `termsVersion` in server allowlist. Email format + lowercase + trim. `name.trim().slice(0, 100)`.
2. **Look up existing user via `get_auth_user_by_email(p_email)` SECURITY DEFINER RPC** (w2 migration `20260411120000_p683_auth_user_lookup_rpc.sql`). **Do NOT** look up via `profiles.email` — per P683 KDD (`docs/decisions.md`, commit 50a1dbd3): supabase-js v2 has no `auth.admin.getUserByEmail`; `admin.listUsers({ email })` is paginated; `profiles.email` misses orphan `auth.users` rows (the exact class P683 commit 3208215e self-heals).
3. **If no user:** `auth.admin.createUser({ email, email_confirm: false })`. Let the existing profile-on-auth trigger / `AuthCallbackPage` handle profile row creation.
   **If user exists but has NO `profiles` row (orphan case):** create the profile row server-side before minting the link, mirroring `create-and-open-letter/index.ts` lines 240–324. This prevents the next submit from looping on the same orphan. Do NOT write `receiver_*` data yet.
4. Mint a magic link: `supabase.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: `${appUrl}/letter/${letterId}/confirm?pending=${letterId}` } })`. **Reference implementation: `supabase/functions/create-and-open-letter/index.ts` (w2) lines 324 (`createUser`) + 416 (`generateLink`)** — that function already unifies the new-user + existing-user branches through `generateLink` for timing parity. `send-agreement-emails/index.ts handleInvitation()` still has the split branches and should NOT be used as the reference.
5. Send a branded Mailgun email (not Supabase default) with the `action_link` embedded as the CTA. Subject + body copy come from founder; template style copies from existing `send-agreement-emails` HTML template.
6. Return `{ ok: true }` regardless of steps 2-5 outcomes (as long as input validation passed and Mailgun didn't hard-fail). Rate-limit or service errors return a generic error; never leak account existence.

**No delivery row is created here. No `receiver_name`, no `receiver_email`, no `terms_acceptances` row.** The only side effect is "an auth user may now exist" — already true in Supabase's signup flow, not a new exposure.

**`confirm-letter-response`** — called by the confirm route after `verifyOtp` has authenticated the user.

**Input:** `{ letterId }` only. No name, no ratings, no termsVersion in the request body — all response data comes from the server-side pending row.

**Output:** `{ ok: true }` on success, or `{ error: 'expired' | 'hijack' | 'unauthenticated' | 'invalid' }` on failure.

**Client pattern — two-client:**
- **User-JWT client** — built from the `Authorization` header. Used only to call `supabase.auth.getUser()` and read `auth.uid()`. No writes go through this client.
- **Service-role client** — used for all writes (`letter_deliveries`, `responses`, `terms_acceptances`, pending-row delete).

**Steps:**

1. Extract `letterId` from the request body. Validate shape. If missing/malformed → return 400 `{ error: 'invalid' }`.
2. Use the user-JWT client to call `auth.getUser()`. If no user (missing or invalid JWT) → return 401 `{ error: 'unauthenticated' }`.
3. Using the service-role client, look up the pending row by `(user_id = auth.uid(), letter_id)`. If not found OR `expires_at < now()` (>24h) → return 410 `{ error: 'expired' }` so the UI can show "This link expired — please read the letter again".
4. **Hijack check:** verify `pending.user_id === auth.uid()`. If mismatched → return 403 `{ error: 'hijack' }` and log to Sentry as a potential hijack attempt.
5. **Idempotency check:** using the service-role client, look for an existing `letter_deliveries` row for `(user_id = auth.uid(), letter_id)`. If one already exists → return `{ ok: true }` (already confirmed; safe for double-clicks and browser back-nav). Otherwise continue.
6. **Atomic write** (transaction or SECURITY DEFINER RPC), using the service-role client:
   - Insert `letter_deliveries` row — `receiver_profile_id = auth.uid()`, `receiver_email` from the authenticated user (from `auth.users`), `receiver_name` from `pending.name`, `status = 'completed'`.
   - Insert `responses` rows (story ratings + point positions) from `pending.ratings_json` and `pending.positions_json`.
   - Insert `terms_acceptances` row with `terms_version = pending.terms_version`, `ip_hash = hashIp(clientIp, Deno.env.get('IP_HASH_SECRET'))`, and `user_agent` from request headers.
7. Delete the pending row (`DELETE FROM letter_response_pending WHERE user_id = auth.uid() AND letter_id = :letterId`).
8. Return `{ ok: true }`.

**No user-controllable response data** is ever read from the request body — the body carries only `letterId`. All ratings, positions, name, and terms_version come from the server-side pending row written by `request-letter-response-signin`, eliminating any risk of tampering between signin-request and confirm.

**AD1.5: `letter_response_pending` schema**

Stores ratings + positions + TOS acceptance between signin-request and magic-link-click. Service-role only — never readable by `anon` or `authenticated` clients.

**Table: `letter_response_pending`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| user_id | uuid | FK → auth.users(id) ON DELETE CASCADE, NOT NULL | Owner, set from `auth.admin.createUser` result |
| letter_id | uuid | FK → letters(id) ON DELETE CASCADE, NOT NULL | Which letter this response is for |
| name | text | NOT NULL, length ≤ 100 | Receiver name from form |
| ratings_json | jsonb | NOT NULL | Array of `{ storyId: uuid, rating: 1..7 }` |
| positions_json | jsonb | NOT NULL | Array of `{ pointId: uuid, position: number }` |
| terms_version | text | NOT NULL | Must be in `ACCEPTED_TERMS_VERSIONS` |
| created_at | timestamptz | NOT NULL DEFAULT now() | For TTL expiry |
| expires_at | timestamptz | NOT NULL DEFAULT now() + interval '24 hours' | Expired rows rejected by `confirm-letter-response` |

**Constraints:**
- `UNIQUE (user_id, letter_id)` — UPSERT target for repeated form submissions
- Index on `expires_at` for cleanup job

**RLS:**
- `REVOKE ALL ON letter_response_pending FROM anon, authenticated;`
- Only `service_role` has any access (writes from edge functions, reads from `confirm-letter-response`)

**Migration file:** `supabase/migrations/YYYYMMDDHHMMSS_p684_letter_response_pending.sql` — separate from the RPC auth guard migration. See Files to Create.

**Cleanup:** A scheduled function (out of scope for this spec — see Non-Goals) deletes rows where `expires_at < now()`. Manual cleanup via SQL is acceptable for v1 if the scheduler isn't wired.

**AD2: Mode-gated auth guard inside all 4 response RPCs (NOT a blanket `auth.uid() IS NOT NULL`)**

> **Reconciliation note (2026-04-11):** Earlier drafts of this AD added a blanket `IF auth.uid() IS NULL THEN RAISE` to all 4 token RPCs. That design is **invalid against w2**. After P683/P690/P691 shipped, the token itself is the authorizer for one-to-one first-open — `submit_rating_by_token` and friends run on the `anon` role via `COALESCE(auth.uid(), sentinel_uuid)` by design (see w2 migration `20260411201933_p683_engagement_rpcs_drop_expiry_check.sql` and P691 authed-first-token-branching KDD in `docs/decisions.md`). A blanket guard would re-break P648 (sealed-bid speaker_id fix), P683 (expiry predicate drop), and P691 (token-as-session-bootstrap). The sentinel UUID path is **live code**, not dead.

Instead, each of `submit_rating_by_token`, `submit_point_response_by_token`, `reveal_prediction_by_token`, `update_delivery_status_by_token` rejects only when the **joined letter's `mode = 'one-to-many'`** and `auth.uid() IS NULL`:

```sql
-- After existing token validation + delivery lookup, before any writes
IF (SELECT mode FROM clarity_letters WHERE id = v_letter_id) = 'one-to-many'
   AND auth.uid() IS NULL THEN
  RAISE EXCEPTION 'Authentication required for one-to-many responses';
END IF;
```

Placed AFTER token validation and the letter join, BEFORE any writes. Keeps `GRANT ... TO anon` intact. One-to-one flows are untouched because their letters carry `mode = 'one-to-one'` and bypass the branch entirely. One-to-many unauthenticated readers never hit these RPCs anyway under AD4 (they write to local state only), so the guard is a defense-in-depth belt against any client that bypasses AD4's local-state contract.

**`update_delivery_status_by_token`:** same mode-gated treatment. One-to-one's anon "mark opened" edge case from P691 still works because `mode = 'one-to-one'`.

**Sentinel UUID cleanup is NOT part of this spec.** `COALESCE(auth.uid(), sentinel)` remains in `submit_rating_by_token` for the anon one-to-one path. Do not remove it.

**AD3: New RPC `get_letter_for_public_reading(p_letter_id UUID)` for anonymous read access**

Currently one-to-many readers can't load the letter at all (no token, no auth). Need a new SECURITY DEFINER RPC:
- Input: letter UUID
- Validates: letter exists, status = `sealed`, mode = `one-to-many`
- Returns: letter metadata (id, sender_id, sender_display_name, mode) + story snapshots. NO delivery data (doesn't exist yet).
- `GRANTED TO anon, authenticated`
- **Does NOT return predictions** (sealed-bid: predictions only revealed after rating)

This replaces the current dead path for one-to-many and enables browsing without auth.

**Precedent and invariant (P690 KDD, commit 54f7c6f0):** This RPC must fetch stories + points directly inside the SECURITY DEFINER body. Do **not** let the client follow up with a PostgREST join from `clarity_letters` to `clarity_docs` — one-to-many letters routinely reference source docs with `visibility = 'private'`, which anon readers cannot select through RLS. P690's "RLS inner-join phantom count" KDD established that any anon-reachable letter surface must resolve doc/story data server-side in a SECURITY DEFINER body. **Test invariant:** a sealed one-to-many letter whose source `clarity_docs` row has `visibility = 'private'` must still load fully for an anon caller via this RPC.

**AD4: Reading page — add anon branch to the existing P691/P693 3-branch structure**

> **Reconciliation note (2026-04-11):** An earlier draft described injecting P684 into a reading page that "currently conflates loading data with having a delivery." That description is stale. On w2, `letter-reading-page.tsx` has been rewritten for P691 (authed-first token branching) and P693 (session-vs-currentUser anti-flash). The current structure is roughly: `sessionChecked` gate → (a) `currentUser` → authed RLS path; (b) `token` param → one-to-one token verify/open via `create-and-open-letter`; (c) else → anon dead-end. P684 replaces branch (c) for `mode = 'one-to-many'` letters.

The one-to-many anonymous branch supports a single local-state path:

1. **Load letter via `get_letter_for_public_reading`** (no auth, no token, no delivery).
2. **Render stories and points with fully interactive controls.** Ratings and positions are stored in React state only — no RPC calls, no `submit_rating_by_token`, no `submit_point_response_by_token`.
3. **When the reader completes the final point**, render the end-of-letter signup form (State 3) in place of the authenticated completion summary.
4. **On form submit**, POST the full ratings/positions payload to `request-letter-response-signin` (which writes the authoritative server-side pending row), then transition to State 5 ("check your email").
5. **Authenticated readers** (State 2) skip the form — route through branch (a). For authenticated one-to-many readers, call a new client-side helper `submitLetterResponseAuthenticated(letterId, ratings, positions, termsVersion)` in `letters-service.ts` that performs **inline sequential inserts under the user's JWT** — no new RPC. The helper reads its session via **`supabase.auth.getSession()`** (NOT `getUser()`) — per P692 KDD (commit 43911b8a, `docs/decisions.md`): `getUser()` caused 27+ pending auth race conditions on the letters flow. The existing `requireAuth()` pattern in `letters-service.ts:31` already follows this rule — match it and add a one-line comment citing P692 so future tightening doesn't re-break it. The helper then:
   1. Inserts `letter_deliveries` row (RLS-guarded by existing policies).
   2. Inserts `responses` rows from the ratings + positions arrays.
   3. Inserts `terms_acceptances` row (idempotent on `(user_id, terms_version)` — no-op if the user already accepted the current version).
   4. Returns success.

   **Rationale for inline over a new RPC:** smaller blast radius (no new RPC to maintain, review, or version), the inserts are already RLS-guarded by existing policies, and the authenticated-reader path is low-volume enough that the three round-trips are not a bottleneck. If any step fails, the helper surfaces the error; **no partial rollback is attempted in v1** (documented limitation — a follow-up spec can wrap this in a SECURITY DEFINER RPC if needed). The `create-and-complete-one-to-many` RPC name mentioned in earlier drafts is explicitly dropped.

**AD4.1: Confirm route anti-flash invariants (P692 + P693)**

`LetterResponseConfirmPage` (State 7) renders immediately after `verifyOtp` completes — the exact surface P693 fixed for the one-to-one flow. Apply the same anti-flash invariants:

- **Auth gating uses `!!session`, NOT `!!currentUser`.** Per P693 KDD (commit bba31e13, `docs/decisions.md`): AuthContext's `currentUser` lags `session` by ~200ms while the profile fetch resolves. Gating on `currentUser` produces a "Sign in to continue" flash between verifyOtp success and confirm-letter-response being callable. Gating on `session` eliminates it.
- **No `ClarityPageLoader` inside the already-mounted layout.** Per P692 KDD (page-gate rule): `ClarityPageLoader` is for route-level gates, not inline state transitions. Use `ClarityLoader` inline for State 7's "Saving your responses…" spinner.
- **Client error body parsing:** `confirmLetterResponse` in `letters-service.ts` must parse Supabase FunctionsHttpError via `fnError.context` directly (it IS the `Response`), NOT `fnError.context.response`. Same P683 gotcha as AD7 step 3.

**AD5: localStorage draft contract (reading-phase only)**

`localStorage` is used **only during reading**, as a draft store for ratings and positions before the reader submits the end-of-letter form. It is never read at confirm time.

Key: `p684_letter_draft:{letterId}`

Value (JSON):
```json
{
  "letterId": "uuid",
  "ratings": [{ "storyId": "uuid", "rating": 5 }, ...],
  "positions": [{ "pointId": "uuid", "position": "agree" }, ...],
  "updatedAt": "2026-04-10T12:34:56Z"
}
```

**Lifecycle:**
- **Write:** `useLetterReadingState` mirrors React state to `localStorage` on every rating/position change so a page refresh mid-read does not lose progress.
- **Read:** on mount, the hook hydrates from the key if present.
- **Submit:** when the reader submits the end-of-letter form, the frontend POSTs the full `{ name, email, termsAccepted, termsVersion, ratings, positions }` payload to `request-letter-response-signin`. That function writes the authoritative `letter_response_pending` row **server-side**.
- **Clear:** after the POST returns `{ ok: true }`, the frontend may delete the localStorage key (optional — stale drafts are harmless and overwritten on the next read).
- **Confirm time:** the confirm route depends on **zero localStorage state**. All ratings/positions are read from the server pending row keyed by `(user_id, letter_id)`.

**Multiple tabs:** latest write wins — acceptable for v1. Readers rating in two tabs simultaneously is an implausible path and not worth coordination overhead.

**Cross-device is the default path**, not a trade-off. A reader can submit the form on phone, click the email on desktop, and see the completion screen — no localStorage dependency bridges the devices.

**AD6: IP hash via shared `hashIp` helper**

The existing `recordTermsAcceptance` in `api.ts` uses a client-side `hashIP()` function. The `confirm-letter-response` edge function runs server-side and has access to the actual client IP from the request header. Hash it server-side — more reliable than client-side IP detection and consistent with GDPR expectations.

P684 reuses the **same shared helper** P683 introduced (verified present in the w2 worktree at `supabase/functions/_shared/hash-ip.ts`) rather than inlining a salt-less SHA-256. The helper takes a secret so the hash is keyed, not a raw digest:

```typescript
import { hashIp } from '../_shared/hash-ip.ts';

const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
const ipHash = await hashIp(clientIp, Deno.env.get('IP_HASH_SECRET'));
```

`IP_HASH_SECRET` must be set as an edge-function secret in both prod and test. **Both P683 and P684 use the same helper and the same secret** so consent audit trails can be cross-referenced across letter flows (one-to-one and one-to-many) — the same IP produces the same hash regardless of which flow recorded the acceptance.

**AD7: Branded Mailgun email — mirrors the `create-and-open-letter` unified `generateLink` pattern**

P684 mirrors the unified `createUser` + `generateLink` pattern already implemented in `supabase/functions/create-and-open-letter/index.ts` (w2). Both new-user and existing-user branches flow through `generateLink` so timing and email shape are identical — this is what closes the enumeration oracle.

> **Reconciliation note (2026-04-11):** An earlier draft pointed at `send-agreement-emails/index.ts handleInvitation()` as the reference. That function still has split branches on w2 (`ctaUrl = acceptUrl` for new users, `generateLink` only when user exists — see lines 153–183) — it does NOT implement the unification P684 needs. Reference `create-and-open-letter` instead.

For a new email:

1. `supabase.auth.admin.createUser({ email, email_confirm: false })` — mirrors `create-and-open-letter` line 324.
2. `supabase.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo } })` — mirrors `create-and-open-letter` line 416. Identical call site for new and existing user branches.
3. **Client-side error handling:** per P683 KDD (commit 50a1dbd3, `docs/decisions.md`), the client-side `requestLetterResponseSignin` helper in `letters-service.ts` must parse Supabase FunctionsHttpError bodies via `fnError.context` directly (it IS the `Response` object) — NOT `fnError.context.response`. This is the same gotcha that bit P683's click-wrap fix. Apply symmetrically to `confirmLetterResponse`.
4. Embed the returned `linkData.properties.action_link` as the CTA URL in the custom HTML template.
5. Send via Mailgun with branded subject and body.

This guarantees **uniform response timing** and **identical email shape** regardless of whether the email is new or existing.

**New dedicated Mailgun sender** (`send-letter-response-signin`) using a **new dedicated Mailgun template** — keeps the agreement and letter flows decoupled and matches the existing naming pattern (`send-letter-emails` already exists for letter delivery).

**No changes to `supabase/config.toml` auth email templates.** The Supabase default auth email template stays as-is — P684 never triggers it because we use `admin.generateLink` + custom Mailgun send, not `signInWithOtp`.

### Security Review

**RLS Policies:**
- ✅ `letter_deliveries` RLS: SELECT restricted to sender/receiver, INSERT blocked (SECURITY DEFINER only), UPDATE restricted to receiver, DELETE blocked.
- ✅ `terms_acceptances` RLS: INSERT requires `auth.uid() IS NOT NULL`, SELECT restricted to own rows.
- ⚠️ **Both edge functions must validate `letter_id` refers to a real sealed letter with `mode = 'one-to-many'`.** Without this, an attacker could trigger sign-in emails for arbitrary emails against one-to-one letters or drafts.

**Email Enumeration Oracle — PRIMARY MITIGATION:**
- ✅ `request-letter-response-signin` returns `{ ok: true }` identically for new and existing emails. Timing is equalized by performing the same `generateLink` call either way.
- ✅ No "this email already has an account" copy anywhere in the UI or email body.
- ✅ Rate limit errors (State 6) use generic copy that does not distinguish causes.

**Privilege Escalation — MITIGATED:**
- ✅ `request-letter-response-signin` **does not** return a `hashedToken` or any session material. Authentication happens only when the reader clicks the Mailgun email on a device with access to the same inbox — proving possession of the email. This closes the P683 privilege escalation risk for P684.
- ✅ `confirm-letter-response` uses a **two-client pattern**: (a) a user-JWT client created from the `Authorization` header, used only to call `supabase.auth.getUser()` and read `auth.uid()`; (b) a service-role client used for all writes (`letter_deliveries`, `responses`, `terms_acceptances`), with an explicit `user_id = auth.uid()` guard derived from the user-JWT lookup. Unauthenticated callers are rejected before any write.
- ✅ **Hijack check:** if `auth.uid()` does not match `pending.user_id` for the letter, return 403 and log to Sentry as a potential hijack attempt. This blocks a scenario where an attacker authenticates as user A and attempts to consume user B's pending row.

**Authorization:**
- ✅ **Mode-gated** auth guard inside SECURITY DEFINER RPCs — rejects only when the joined letter's `mode = 'one-to-many'` AND `auth.uid() IS NULL`. Preserves `GRANT TO anon` for invocation AND preserves the P691 token-as-session-bootstrap path for one-to-one. See AD2.
- ✅ One-to-one flow untouched — letters with `mode = 'one-to-one'` never enter the guard branch.
- ⚠️ **Use `RAISE EXCEPTION 'Authentication required for one-to-many responses'`** (not `RETURN false/NULL`). Client needs to distinguish "not authenticated one-to-many" from "invalid token".
- ✅ **Sentinel UUID pattern preserved.** `submit_rating_by_token`'s `COALESCE(auth.uid(), sentinel)` is live code for the anon one-to-one path — do NOT clean up.

**Input Validation:**
- ⚠️ **Email validation required** in `request-letter-response-signin` — format, length, normalize (lowercase, trim).
- ⚠️ **Name input:** server trims and limits length (`.trim().slice(0, 100)`) in `request-letter-response-signin` when writing the pending row; copied to `letter_deliveries.receiver_name` at confirm. React JSX escaping handles XSS on render.
- ⚠️ **`termsVersion` validated against server-side allowlist** in both request AND confirm functions — do not accept arbitrary strings. The confirm function must re-validate even though request validated, because the `localStorage` value is attacker-controllable.
- ⚠️ **Validate letter mode = `one-to-many`** in both functions.
- ⚠️ **`confirm-letter-response` must re-validate that `auth.email()` matches the email used to generate the magic link.** Supabase's `verifyOtp` enforces this, but defense-in-depth.

**Data Protection:**
- ✅ `get_letter_for_reading` / `get_letter_for_public_reading` correctly redact `receiver_email`.
- ✅ Letter IDs are UUIDs (v4, 128-bit random) — enumeration computationally infeasible.
- ✅ Neither edge function returns `receiverEmail` in any response body.

**Anonymous RPC Lockdown (mode-gated):**
- ✅ Approach is sound — `RAISE EXCEPTION` inside each SECURITY DEFINER RPC, gated on the joined letter's `mode`. See AD2.
- ✅ All four RPCs: `submit_rating_by_token`, `submit_point_response_by_token`, `reveal_prediction_by_token`, `update_delivery_status_by_token`.
- ⚠️ **Defense-in-depth only** — under AD4, one-to-many unauthenticated readers never hit these RPCs during reading (they write to local state and `request-letter-response-signin` only). The RPC guard catches any client that bypasses the local-state contract.

**Rate Limiting:**
- ℹ️ DB-backed rate limiting for `request-letter-response-signin` is **deferred** — see Non-Goals. Supabase's built-in auth rate limits protect `admin.generateLink` globally, which is acceptable for v1. If abuse is observed in prod, file a follow-up spec to add per-IP / per-letter scoping.
- ✅ `confirm-letter-response` is auth-gated and idempotent; no rate limit needed for v1.

**Delivery Row Uniqueness:**
- ⚠️ Existing partial unique index on `(letter_id, receiver_email) WHERE receiver_email IS NOT NULL` prevents duplicate deliveries. `confirm-letter-response` handles the conflict: if a completed delivery exists, return its id idempotently; if an opened one exists, complete it.

### Implementation Approach

#### Build Sequence

1. **Migration: RPC auth guards (mode-gated)** — Add the AD2 mode-gated `IF mode = 'one-to-many' AND auth.uid() IS NULL THEN RAISE EXCEPTION ...` block to all 4 response RPCs. **Clone the RPC bodies from `supabase/migrations/20260411201933_p683_engagement_rpcs_drop_expiry_check.sql`**, NOT from the P642 original — per the P683 "CREATE OR REPLACE migration source rule" KDD (commit 9b8d780a, `docs/decisions.md`). Cloning from the original would silently revert P648's speaker_id sealed-bid fix and P683's expiry-predicate drop. **Do NOT remove the sentinel UUID `COALESCE` pattern** — it is live code for the anon one-to-one path. Lands first regardless of UI changes — this is the server-side safety net.

2. **Migration: `get_letter_for_public_reading` RPC** — New SECURITY DEFINER function for anonymous one-to-many letter loading. Validates letter exists, sealed, one-to-many mode. Returns letter + snapshots (no delivery, no predictions).

3. **Edge function: `request-letter-response-signin`** — New Deno edge function. Validates letter + form input + ratings payload. Looks up existing user; creates one via `auth.admin.createUser({ email_confirm: false })` if absent. Mints magic link via `auth.admin.generateLink` (same call for both new and existing — extending the `handleInvitation` pattern to close the timing oracle) with `redirectTo: ${appUrl}/letter/${letterId}/confirm`. **Writes the authoritative `letter_response_pending` row** `{ user_id, letter_id, name, ratings_json, positions_json, terms_version, created_at, expires_at }` — UPSERT on `(user_id, letter_id)`. Sends branded Mailgun email via the new dedicated template. Returns unified `{ ok: true }`. Rate-limited by IP + letter.

4. **Edge function: `send-letter-response-signin` (or shared Mailgun helper)** — Dedicated Mailgun sender using the branded template. Subject, preheader, and body copy pending founder decision. Copies HTML template helpers from `send-agreement-emails`.

5. **Edge function: `confirm-letter-response`** — Invoked by the confirm route with body `{ letterId }`. Uses the **two-client pattern**: user-JWT client from the `Authorization` header to call `supabase.auth.getUser()` and obtain `auth.uid()`; service-role client for all writes. Looks up `letter_response_pending` by `(user_id, letter_id)` — returns a distinct error when missing or expired (State 9). Reads `name`, `termsVersion`, `ratings`, `positions` from the pending row (never from the request body). Creates `letter_deliveries` row (`receiver_profile_id = auth.uid()`, `receiver_name` from pending, `status = 'completed'`), inserts `story_verifications` + `letter_point_responses` rows, inserts `terms_acceptances` with server-side IP hash + User-Agent, updates `profiles.accepted_terms_version`, **deletes the pending row**. If `auth.uid()` does not match `pending.user_id`, return 403 and log to Sentry. Idempotent on duplicate delivery. Returns `{ ok: true, deliveryId }`.

6. **Client: `letters-service.ts` additions** — `getLetterForPublicReading(letterId)`, `requestLetterResponseSignin(payload)`, `confirmLetterResponse(payload)`.

7. **Client: Reading page (`letter-reading-page.tsx`)** — Add one-to-many public path. Detect: no token + no auth + letter mode is one-to-many → use `get_letter_for_public_reading` and render in local-state mode (with `localStorage[p684_letter_draft:{letterId}]` mirror). End-of-letter → render `LetterResponseSignupForm`. On submit → POST the full ratings/positions payload to `request-letter-response-signin`, transition to "check your email" state. Authenticated one-to-many readers skip the form and write responses directly under their JWT on completion (no email round-trip).

8. **Client: New confirm route `/letter/:letterId/confirm`** — New page component `LetterResponseConfirmPage`. After Supabase auth handles the magic link, call `confirm-letter-response` with body `{ letterId }`. The server reads the pending row by `(user_id, letter_id)`: if found → State 8 (completion); if not found or expired → State 9 (link expired). No localStorage dependency.

9. **Component: `LetterResponseSignupForm`** — End-of-letter form (name, email, TOS checkbox, "Send me the link" button). Form state, validation, submit handler. Single instance, appears after final point.

10. **Hook: `useLetterReadingState` adaptation** — Support local-only mode where no DB writes occur during reading. Emits a `completed` signal when the final point is positioned, which the reading page uses to render the signup form.

11. **Deploy** — Both edge functions to test and prod. Migration via `./scripts/migrate.sh`. Mailgun template verified in test before prod.

#### Files to Create

| File | Purpose |
|------|---------|
| `supabase/functions/request-letter-response-signin/index.ts` | Validate + createUser + generateLink + write `letter_response_pending` + trigger branded email |
| `supabase/functions/send-letter-response-signin/index.ts` | Branded Mailgun sender (or shared helper if collapsed) |
| `supabase/functions/_shared/templates/letter-response-signin.html` | New dedicated Mailgun template for the letter-response sign-in email (founder-approved copy) |
| `supabase/functions/confirm-letter-response/index.ts` | Two-client confirm — reads pending row server-side, creates delivery + responses + terms |
| `src/app/pages/letter-response-confirm-page.tsx` | Confirm route — calls `confirm-letter-response` with `{ letterId }`; routes to State 8 or State 9 |
| `src/app/components/letters/letter-response-signup-form.tsx` | End-of-letter signup form component |
| `src/app/components/letters/letter-response-link-expired.tsx` | State 9 panel — "This sign-in link has expired" + "Open the letter" CTA |
| `supabase/migrations/YYYYMMDDHHMMSS_p684_anon_rpc_auth_guard.sql` | Auth guard on 4 response RPCs + `get_letter_for_public_reading` RPC |
| `supabase/migrations/YYYYMMDDHHMMSS_p684_letter_response_pending.sql` | `letter_response_pending` table, unique `(user_id, letter_id)`, index on `expires_at`, `REVOKE ALL` from `anon`/`authenticated` (service-role only) |

#### Files to Modify

| File | Change |
|------|--------|
| `src/app/pages/letter-reading-page.tsx` | Add one-to-many public path (local-state reading, end-of-letter form) |
| `src/app/hooks/useLetterReadingState.ts` | Support local-only mode (no RPC calls during reading) |
| `src/app/data/letters-service.ts` | Add `getLetterForPublicReading()`, `requestLetterResponseSignin()`, `confirmLetterResponse()`, and `submitLetterResponseAuthenticated(letterId, ratings, positions, termsVersion)` (Flow 4 inline sequential-insert helper — see AD4) |
| `src/app/components/letters/letter-cover.tsx` | One-to-many cover variant (no auth gate on "Open the Letter") |
| `src/app/components/letters/letter-completion-summary.tsx` | P684 completion variant for State 8. Remove dead `one-to-many && !isAuthenticated` branch (lines 236-262); replace with State 8 completion message. |
| `src/app/router.tsx` (or equivalent) | Register `/letter/:letterId/confirm` route |

## Pre-deploy Checklist

### Secrets to provision
- [ ] `IP_HASH_SECRET` — shared with P683. If already provisioned from the P683 deploy, skip. Otherwise: `supabase secrets set IP_HASH_SECRET=<value> --project-ref besjtuodziykmjidubzw` (and the same against `gfjctyxqlwexxwsmkakq` for test). Required by `confirm-letter-response` to key `hashIp()`.
- [ ] `MAILGUN_API_KEY` and `MAILGUN_DOMAIN` — verify already present (existing `send-agreement-emails` function uses them). Check with `supabase secrets list --project-ref besjtuodziykmjidubzw`. No new provisioning expected; flag if missing.
- [ ] Mailgun template for `letter-response-signin` — **stored in-repo** as `supabase/functions/_shared/templates/letter-response-signin.html` (listed in Files to Create). The `send-letter-response-signin` edge function reads the file at send time, substitutes variables, and posts the rendered HTML body to the Mailgun API. No template is configured in the Mailgun dashboard.

### Deploy commands
- [ ] `SUPABASE_ACCESS_TOKEN=<token> supabase functions deploy request-letter-response-signin --project-ref besjtuodziykmjidubzw --no-verify-jwt` (prod)
- [ ] `SUPABASE_ACCESS_TOKEN=<token> supabase functions deploy send-letter-response-signin --project-ref besjtuodziykmjidubzw --no-verify-jwt` (prod)
- [ ] `SUPABASE_ACCESS_TOKEN=<token> supabase functions deploy confirm-letter-response --project-ref besjtuodziykmjidubzw` (prod — NOTE: confirm is auth-gated, JWT verification ON)
- [ ] Same three deploys against `gfjctyxqlwexxwsmkakq` (test)
- [ ] Migration applied via `./scripts/migrate.sh` (RPC auth guards + `get_letter_for_public_reading`)
- [ ] Mailgun `MAILGUN_API_KEY` + `MAILGUN_DOMAIN` env vars confirmed present in prod edge function secrets (reuse from `send-agreement-emails`)

### Post-deploy verification
- [ ] Smoke test: open one-to-many public link anonymously, verify letter loads
- [ ] Smoke test: tap a rating control, verify signup prompt appears
- [ ] Smoke test: complete signup, verify auth session + delivery created
- [ ] Smoke test: submit a rating after signup, verify it persists with identity
- [ ] Verify one-to-one flow still works (no regression from RPC auth guards)
- [ ] Check Sentry for new errors in first 10 minutes

## Component Strategy

### 1. Component Inventory

**Available shadcn/ui primitives:**
- `Button` — cva-based with variants: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`. Sizes: `default` (h-9), `sm` (h-8), `lg` (h-10), `icon`. Built-in `disabled:pointer-events-none disabled:opacity-50`.
- `Input` — h-9, full-width, `border-input`, `placeholder:text-muted-foreground`. Supports `disabled:cursor-not-allowed disabled:opacity-50`.
- `Label` — Radix-based, `text-sm font-medium`. Handles `peer-disabled` styling.
- `Checkbox` — Radix-based, h-4 w-4, `border-primary`, `data-[state=checked]:bg-primary`. Supports `disabled` prop.
- `Toaster` (Sonner) — position `top-center`, duration 3000ms, `closeButton` enabled, `visibleToasts={1}`. Already in the app shell.

**Existing feature components (relevant):**
- `ConsentNotice` — passive consent text ("By joining, you agree to..."). Links to `/terms-of-service` and `/privacy-policy` with `target="_blank"`. Text-only, no checkbox. Used in pledge and live meeting flows.
- `LoginForm` — email input + magic link form. Validation pattern: inline `text-sm text-destructive` error with `AlertCircleIcon`. Button: `bg-[#0044CC] hover:bg-[#0033AA]`.
- `SignPledgeForm` — name + email + fields form. Error banner: `p-3 bg-red-50 border border-red-200 rounded-md` with `text-sm text-red-600`. Field spacing: `space-y-4 md:space-y-6`.
- `LetterCover` (w2) — parchment cover with `mode` prop. Has `isAuthenticating` and `authDelayed` loading states. Uses `Loader2` spinner from lucide-react.
- `LetterCompletionSummary` (w2) — completion flow with celebration phase + gap summary. Already has a `letterData.mode === 'one-to-many'` branch (currently shows a post-hoc registration CTA that P684 replaces).
- `ComprehensionRatingCard` (w2) — 0-10 rating card with `disabled` prop. Uses `RatingButtons` from `partners/shared.tsx`.

**Toast pattern (established):** `import { toast } from "sonner"` — used across the app (`toast.success()`, `toast.error()`). Sonner `Toaster` is already mounted in the app shell with `duration={3000}` and `closeButton`.

### 2. Component Map

| UI Element | Classification | Component | Notes |
|-----------|---------------|-----------|-------|
| Rating controls (fully interactive during reading) | **Reuse as-is** | `ComprehensionRatingCard` | No muted state. Controls operate in local-state mode; parent captures values into React state. |
| Position controls (fully interactive during reading) | **Reuse as-is** | `PositionButton` | Same — no muted prop. Parent captures positions locally. |
| End-of-letter signup form | **New** | `LetterResponseSignupForm` | Inline form at the end of the letter. `border-border bg-muted/50 rounded-md p-4 space-y-4`. Replaces the authenticated completion summary for unauthenticated one-to-many readers. |
| Name field | **Reuse** | `Input` + `Label` | Pattern from `LoginForm`. `id="response-name"`, `type="text"`, `placeholder="Your name"`. |
| Email field | **Reuse** | `Input` + `Label` | Pattern from `LoginForm`. `id="response-email"`, `type="email"`, `placeholder="you@example.com"`. |
| TOS checkbox + label | **Extract** | `ConsentCheckbox` | New component extracted from `ConsentNotice` pattern — checkbox + label with Terms/Privacy links. Reusable for any future active-consent flow (incl. P683). |
| "Send me the link" button | **Reuse** | `Button` | Full-width, `size="lg"` for `min-h-[44px]` touch target. |
| Inline field errors | **Reuse** | Inline `<p>` | `text-sm text-red-500` below field. Field gets `border-red-500`. |
| Error banner (above button) | **Reuse** | Inline `<div>` | `bg-red-50 border border-red-200 text-red-700 text-sm rounded-md p-3` (pattern from `SignPledgeForm`). |
| Submitting spinner | **Reuse** | `Loader2` + `Button` | `<Loader2 className="w-4 h-4 animate-spin" />` inside disabled button. Text: "Sending...". |
| "Still working..." text | **New** | Inline `<p>` | `text-sm text-muted-foreground animate-pulse`. Shown after 10s timeout. |
| "Check your email" panel | **New** | `LetterResponseCheckEmail` | Replaces the form after successful submit. Simple panel: heading + body + subtext. No buttons. |
| Confirm route loading | **Reuse** | `Loader2` + centered text | Pattern from `LetterCover`'s loading state. Text: "Saving your responses…". |
| Completion message (State 8) | **Extend** | `LetterCompletionSummary` | Replace the existing `one-to-many && !isAuthenticated` branch (lines 236-262). New content: centered "Your responses have been shared with [SenderName]." + "You can close this tab." No confetti. No `window.close()`. |
| Link expired (State 9) | **New** | `LetterResponseLinkExpired` | Heading ("This sign-in link has expired") + body + CTA link "Open the letter" → `/letter/{letterId}`. Rendered by the confirm page when the server returns "pending row missing or expired". |

### 3. Composition Tree

```
LetterReadingPage (w2, modified — one-to-many public path)
+-- LetterCover (w2, extended — one-to-many variant: no auth gate on "Open the Letter")
+-- [Story/Point content area — fully interactive, local-state only]
|   +-- ComprehensionRatingCard (w2, reused as-is)
|   |   +-- RatingButtons (existing)
|   +-- PositionButton (w2, reused as-is)
+-- [At end of letter — one of:]
|   +-- LetterResponseSignupForm (NEW — unauthenticated readers)
|   |   +-- <h3> "Save your responses"
|   |   +-- <p> subtext with sender name
|   |   +-- Label + Input (name)
|   |   +-- Label + Input (email)
|   |   +-- ConsentCheckbox (NEW — extracted)
|   |   |   +-- Checkbox (shadcn/ui)
|   |   |   +-- <label> with Terms/Privacy links
|   |   +-- [Error banner — conditional]
|   |   +-- Button "Send me the link" (with Loader2 spinner in submitting state)
|   |   +-- [Still working... — conditional, after 10s]
|   +-- LetterResponseCheckEmail (NEW — shown after form submit)
|   +-- LetterCompletionSummary (authenticated-reader direct-submit path)

LetterResponseConfirmPage (NEW — /letter/:letterId/confirm)
+-- [Loading state — Loader2 + "Saving your responses…"]
+-- LetterCompletionSummary (on success — P684 variant)
|   +-- "Your responses have been shared with [SenderName]."
|   +-- "You can close this tab."
+-- LetterResponseLinkExpired (on server "pending row missing or expired")
    +-- <h2> "This sign-in link has expired"
    +-- <p> "Please read the letter again to re-enter your responses."
    +-- <a> "Open the letter" → /letter/{letterId}
```

**Signup form lifecycle:**
1. Parent (`LetterReadingPage`) holds local state for ratings + positions.
2. When the reading state machine signals "completed" (final point positioned), the parent conditionally renders `LetterResponseSignupForm` in place of the authenticated completion summary.
3. On submit: POST the full `{ name, email, termsAccepted, termsVersion, ratings, positions }` payload to `requestLetterResponseSignin` (which writes the server-side pending row), then swap to `LetterResponseCheckEmail`. No prompt relocation — single instance, fixed position at end of letter.

### 4. Visual Specification

**Spacing:** `space-y-4` between form fields. Form container: `p-4 md:p-5`. Outer margin from last point: `mt-8 mb-4` (natural pause after reading).

**Typography:**
- Heading: `text-base font-semibold text-foreground`
- Subtext: `text-sm text-muted-foreground`
- Field labels: `text-sm font-medium` (Label component default)
- Field errors: `text-sm text-red-500`
- TOS label text: `text-sm text-muted-foreground`
- TOS links: `underline hover:text-foreground`

**Color:**
- Form background: `bg-muted/50` (subtle tint, not elevated)
- Form border: `border border-border rounded-md`
- "Send me the link" button: `variant="default"` (primary CTA)
- Error banner: `bg-red-50 border-red-200 text-red-700`
- Field error border: `border-red-500`

**Motion:**
- Form → Check-your-email transition: simple swap (no animation).
- Confirm-route loading → completion: `Loader2` spin during the round-trip.

**Touch targets:**
- Button: `size="lg"` (h-10) + explicit `min-h-[44px]` for mobile
- Checkbox: Radix h-4 w-4; clickable label area wraps it for 44px touch
- Inputs: `min-h-[44px]` on mobile

### 5. Extraction Plan

**Extract `ConsentCheckbox` from `ConsentNotice` pattern:**

`ConsentNotice` is a passive consent text. P684 needs an active-consent variant with a checkbox. Rather than modifying `ConsentNotice` (which is used in pledge and live flows and must remain passive), extract a new `ConsentCheckbox` component:

| Source | Target | What changes |
|--------|--------|-------------|
| `src/app/components/legal/consent-notice.tsx` (pattern reference) | `src/app/components/legal/consent-checkbox.tsx` (new) | Adds `Checkbox` (Radix) + label with Terms/Privacy links + account disclosure text. Accepts `checked`, `onCheckedChange`, `disabled` props. Same link styling as `ConsentNotice`. |

**Props:**
```typescript
interface ConsentCheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string; // for aria-describedby linkage
}
```

**Label text:** "I accept the [Terms of Service] and [Privacy Policy]. We'll create an account to save your responses."

This is the only extraction. All other components are either direct reuse of shadcn primitives or new single-use components (`LetterResponseSignupForm`, `LetterResponseCheckEmail`, `LetterResponseLinkExpired`, `LetterResponseConfirmPage`).

## Test Coverage Strategy

### Files Generated

| File | Type | Tests | What it covers |
|------|------|-------|---------------|
| `e2e/integration/p684-rpc-auth-guards.spec.ts` | Integration | 12 | **CRITICAL:** All 4 response RPCs reject anon callers (`RAISE EXCEPTION`), accept authenticated callers; `get_letter_for_public_reading` accepts anon; mode guard; schema existence |
| `e2e/integration/p684-signin-enumeration.spec.ts` | Integration | 6 | **CRITICAL:** `request-letter-response-signin` returns identical `{ ok: true }` shape + timing for new vs existing emails; error copy does not distinguish; rate-limit error is generic |
| `e2e/p684-smoke.spec.ts` | Smoke | 4 | Public link loads without auth, cover renders, story content visible, chrome-free layout |
| `e2e/p684-local-state-reading.spec.ts` | E2E | 8 | Ratings + positions captured locally during reading, zero delivery rows and zero response rows created while reading, end-of-letter form appears after final point |
| `e2e/p684-signup-form-flow.spec.ts` | E2E | 10 | Form validation (name required, email format, TOS checkbox), submit button disabled states, submit → "check your email" state, server-side pending row written on POST, error banner on rate limit |
| `e2e/p684-confirm-route.spec.ts` | E2E | 9 | Magic link → `verifyOtp` → confirm route calls `confirm-letter-response` → server reads pending row → delivery row + response rows + terms_acceptances created atomically; completion message; link-expired state when pending row missing or >24h old; idempotent on double-click. **Includes MutationObserver canary** (mirrors `e2e/integration/p693-letter-reading-no-flash-signin.spec.ts`) verifying no "Sign in to continue" or "Check your email" text ever appears in the DOM between `verifyOtp` resolution and confirm-letter-response completion — guards the P693 `!!session` anti-flash invariant from AD4.1. |
| `e2e/p684-authenticated-reader.spec.ts` | E2E | 4 | Authenticated reader skips the signup form entirely, direct-submit path creates delivery + responses under the reader's JWT |
| `e2e/a11y/p684-accessibility.spec.ts` | A11y | 6 | End-of-letter form focus management, native checkbox, aria-disabled, tab order, aria-describedby on errors, touch target size |
| `features/uat/p684.md` | UAT | ~15 | Manual checklist: all 9 screen states, cross-device happy path (phone→desktop), existing-account indistinguishability, one-to-one regression, branded Mailgun email visual QA |

**Total automated tests: ~58 | Manual UAT scenarios: ~15**

### Security Test Priority

Two test files are the highest-priority tests in this feature:

1. **`p684-rpc-auth-guards.spec.ts`** — verifies the AD2 mode-gated invariant: RPCs with a one-to-many letter reject anon callers; RPCs with a one-to-one letter still accept anon callers (P648/P683/P691 regression guard). **Must include a positive test for each one-to-one token path** to catch any accidental blanket guard that would re-break shipped P683 flows.
2. **`p684-signin-enumeration.spec.ts`** — verifies the unified response mitigation against the email enumeration oracle. Measures response shape AND response time for new vs existing emails (timing equalization check).

Both must pass before `/dev` considers the feature shippable.

### Coverage Map

| Requirement | Test file | Test name(s) |
|-------------|-----------|-------------|
| Anonymous browse works | `p684-smoke.spec.ts` | "one-to-many letter page loads without authentication" |
| Zero DB footprint during reading | `p684-local-state-reading.spec.ts` | "reader taps ratings + positions; no delivery or response rows created" |
| `submit_rating_by_token` rejects anon on ONE-TO-MANY letter | `p684-rpc-auth-guards.spec.ts` | "anonymous caller on one-to-many raises exception" |
| `submit_rating_by_token` STILL accepts anon on ONE-TO-ONE letter (P648/P683/P691 regression guard) | `p684-rpc-auth-guards.spec.ts` | "anonymous caller on one-to-one succeeds via token" |
| `submit_point_response_by_token` rejects anon on one-to-many | `p684-rpc-auth-guards.spec.ts` | "anonymous caller on one-to-many raises exception" |
| `submit_point_response_by_token` accepts anon on one-to-one | `p684-rpc-auth-guards.spec.ts` | "anonymous caller on one-to-one succeeds via token" |
| `reveal_prediction_by_token` rejects anon on one-to-many | `p684-rpc-auth-guards.spec.ts` | "anonymous caller on one-to-many raises exception" |
| `reveal_prediction_by_token` accepts anon on one-to-one | `p684-rpc-auth-guards.spec.ts` | "anonymous caller on one-to-one succeeds via token" |
| `update_delivery_status_by_token` rejects anon on one-to-many | `p684-rpc-auth-guards.spec.ts` | "anonymous caller on one-to-many raises exception" |
| `update_delivery_status_by_token` accepts anon on one-to-one | `p684-rpc-auth-guards.spec.ts` | "anonymous caller on one-to-one succeeds via token" |
| All 4 RPCs accept authenticated callers on either mode | `p684-rpc-auth-guards.spec.ts` | "authenticated caller succeeds" (×4) |
| Confirm route no-flash canary (P693) | `p684-confirm-route.spec.ts` | "no 'Sign in to continue' text between verifyOtp and confirm" |
| `get_letter_for_public_reading` works anon | `p684-rpc-auth-guards.spec.ts` | "anonymous caller can read sealed one-to-many letter" |
| Public reading does NOT return predictions | `p684-rpc-auth-guards.spec.ts` | "does NOT return predictions (sealed-bid)" |
| Mode guard (one-to-one not publicly readable) | `p684-rpc-auth-guards.spec.ts` | "rejects one-to-one letter" |
| Enumeration — new email response | `p684-signin-enumeration.spec.ts` | "returns `{ ok: true }` for brand new email" |
| Enumeration — existing email response | `p684-signin-enumeration.spec.ts` | "returns `{ ok: true }` for existing email (identical shape)" |
| Enumeration — timing equalized | `p684-signin-enumeration.spec.ts` | "response times for new vs existing within noise window" |
| End-of-letter form validation | `p684-signup-form-flow.spec.ts` | "Send me the link disabled until..." (×3) |
| Server-side pending row written on POST | `p684-signup-form-flow.spec.ts` | "on submit, letter_response_pending row is written with `(user_id, letter_id)` and ratings/positions payload" |
| Confirm route reads pending row server-side | `p684-confirm-route.spec.ts` | "confirm route posts `{letterId}` and server loads pending row by `(user_id, letter_id)`" |
| Delivery + responses + terms_acceptances atomic | `p684-confirm-route.spec.ts` | "confirm creates delivery row, story_verifications, letter_point_responses, and terms_acceptances in one round-trip" |
| Link expired when pending row missing or >24h old | `p684-confirm-route.spec.ts` | "confirm route shows link-expired state when pending row missing or expired" |
| Idempotency on double-click | `p684-confirm-route.spec.ts` | "second call returns same deliveryId without duplicate rows" |
| Authenticated reader skips form | `p684-authenticated-reader.spec.ts` | "logged-in reader sees no signup form" |
| Authenticated direct submit | `p684-authenticated-reader.spec.ts` | "logged-in reader submission creates delivery + responses" |
| Completion copy | `p684-confirm-route.spec.ts` | "completion message says 'Your responses have been shared'" |
| "You can close this tab" (no window.close) | `p684-confirm-route.spec.ts` | "completion page shows 'You can close this tab'" and no window.close call |
| Schema: migration applied | `p684-rpc-auth-guards.spec.ts` | "get_letter_for_public_reading function exists in DB" |

### Not Covered by Automation (Manual UAT Only)

| Gap | Why | UAT scenario |
|-----|-----|-------------|
| Real Mailgun email delivery | Requires live Mailgun send + inbox check | UAT-M1 |
| Branded email visual QA | Template rendering across clients (Gmail, iOS Mail, Outlook) | UAT-M2 |
| Link click on a different device/browser | Requires multi-device coordination | UAT-M3 |
| Link expiry (1-hour OTP window) | Requires time-manipulation not in E2E harness | UAT-M4 |
| Sender sees reader name in results | Results view not in scope of P684 tests | UAT-M5 |
| One-to-one regression (visual) | Visual verification needed | UAT-M6 |

## Implementation Tasks

> Generated by /decompose. Each task is scoped to 1–3 files and independently verifiable.
> Run /dev to execute — it will dispatch one subagent per task in dependency order.

---

### Consistency Check Notes (pre-manifest)

**Check 1 (AC Coverage):** ⚠️ One possible gap — AC "Sender can see individual reader responses with names" has no dedicated build step. `receiver_name` is written server-side at confirm time (Task 5), but if the sender results view doesn't already render `letter_deliveries.receiver_name`, a missing step exists. Verify before `/dev` — if the existing results view already renders this column, the AC is satisfied automatically.

**Check 2 (UX–Architecture Drift):** ✅ No conflicts found.

**Check 3 (Security Blockers):** ✅ All security blockers addressed in Tasks 1, 3, and 5.

---

### Task 1: Migration — RPC auth guards (mode-gated)
- **Files:** `supabase/migrations/YYYYMMDDHHMMSS_p684_anon_rpc_auth_guard.sql` (create)
- **Spec refs:** "Technical Architecture > Implementation Approach > Build Sequence (step 1)", "Architecture Decisions > AD2 (lines ~455–473)", "Security Review > Anonymous RPC Lockdown (lines ~611–614)"
- **Depends on:** None
- **Tests:** `e2e/integration/p684-rpc-auth-guards.spec.ts`
- **Verify:** All 4 response RPCs reject anon callers on one-to-many letters; same RPCs still accept anon callers on one-to-one letters (regression guard). Migration clones bodies from `20260411201933_p683_engagement_rpcs_drop_expiry_check.sql`, does NOT remove sentinel UUID COALESCE pattern.
- [ ] Complete

---

### Task 2: Migration — `get_letter_for_public_reading` RPC + `letter_response_pending` table
- **Files:** `supabase/migrations/YYYYMMDDHHMMSS_p684_letter_response_pending.sql` (create)
- **Spec refs:** "Technical Architecture > Implementation Approach > Build Sequence (step 2)", "Architecture Decisions > AD3 (lines ~475–486)", "Architecture Decisions > AD1.5 (lines ~426–453)"
- **Depends on:** None
- **Tests:** `e2e/integration/p684-rpc-auth-guards.spec.ts` (anon read RPC tests + schema existence tests)
- **Verify:** `get_letter_for_public_reading(p_letter_id)` exists, grants `anon, authenticated`, returns letter + snapshots without delivery or predictions for a sealed one-to-many letter. `letter_response_pending` table exists with `UNIQUE(user_id, letter_id)`, `REVOKE ALL` from `anon, authenticated`, index on `expires_at`.
- [ ] Complete

---

### Task 3: Edge function — `request-letter-response-signin`
- **Files:** `supabase/functions/request-letter-response-signin/index.ts` (create)
- **Spec refs:** "Technical Architecture > Implementation Approach > Build Sequence (step 3)", "Architecture Decisions > AD1 (lines ~370–398)", "Architecture Decisions > AD7 (lines ~556–574)"
- **Depends on:** Task 2 (`letter_response_pending` table must exist)
- **Tests:** `e2e/integration/p684-signin-enumeration.spec.ts`, `e2e/p684-signup-form-flow.spec.ts` (server-side pending row test)
- **Verify:** POSTing `{ letterId, name, email, termsAccepted, termsVersion, ratings, positions }` writes a `letter_response_pending` row (UPSERT on `(user_id, letter_id)`). Returns `{ ok: true }` for both new and existing emails. Calls `get_auth_user_by_email()` RPC (not `profiles.email`). Creates auth user via `auth.admin.createUser` for new emails. Calls `auth.admin.generateLink` for both branches (timing equalization).
- [ ] Complete

---

### Task 4: Edge function — `send-letter-response-signin` (branded Mailgun sender)
- **Files:** `supabase/functions/send-letter-response-signin/index.ts` (create), `supabase/functions/_shared/templates/letter-response-signin.html` (create)
- **Spec refs:** "Technical Architecture > Implementation Approach > Build Sequence (step 4)", "Architecture Decisions > AD7 (lines ~556–574)", "Pre-deploy Checklist > Secrets to provision"
- **Depends on:** Task 3 (called by `request-letter-response-signin`)
- **Verify:** Branded Mailgun email sent using `MAILGUN_API_KEY` + `MAILGUN_DOMAIN`. Email contains the `action_link` as CTA. Template HTML file in `_shared/templates/`. Subject copy pending founder approval — use placeholder `[FOUNDER DECISION: email subject line]`.
- [ ] Complete

---

### Task 5: Edge function — `confirm-letter-response`
- **Files:** `supabase/functions/confirm-letter-response/index.ts` (create)
- **Spec refs:** "Technical Architecture > Implementation Approach > Build Sequence (step 5)", "Architecture Decisions > AD1 (lines ~400–424)", "Architecture Decisions > AD6 (lines ~541–554)"
- **Depends on:** Task 2 (`letter_response_pending` table), Task 3 (pending rows written by `request-letter-response-signin`)
- **Tests:** `e2e/p684-confirm-route.spec.ts`
- **Verify:** Two-client pattern (user-JWT for `auth.getUser()`, service-role for writes). Reads pending row by `(user_id, letter_id)`. Atomically creates `letter_deliveries` + response rows + `terms_acceptances` (with server-side `hashIp()`). Deletes pending row. Returns `{ error: 'expired' }` when pending row missing or >24h. Returns 403 when `auth.uid() !== pending.user_id`. Idempotent on duplicate delivery.
- [ ] Complete

---

### Task 6: Client service layer additions — `letters-service.ts`
- **Files:** `src/app/data/letters-service.ts` (modify)
- **Spec refs:** "Technical Architecture > Implementation Approach > Build Sequence (step 6)", "Architecture Decisions > AD4 (lines ~488–512)", "Architecture Decisions > AD4.1 (lines ~506–512)"
- **Depends on:** Tasks 2, 3, 5 (RPCs and edge functions must exist before client wrappers are meaningful)
- **Verify:** `getLetterForPublicReading(letterId)` calls `get_letter_for_public_reading` RPC. `requestLetterResponseSignin(payload)` POSTs to `request-letter-response-signin` edge function. `confirmLetterResponse(payload)` POSTs to `confirm-letter-response` edge function and parses `FunctionsHttpError` via `fnError.context` (not `fnError.context.response`). `submitLetterResponseAuthenticated(letterId, ratings, positions, termsVersion)` performs inline sequential inserts under user JWT using `supabase.auth.getSession()` (not `getUser()`).
- [ ] Complete

---

### Task 7: Hook adaptation — `useLetterReadingState.ts` (local-only mode)
- **Files:** `src/app/hooks/useLetterReadingState.ts` (modify)
- **Spec refs:** "Technical Architecture > Implementation Approach > Build Sequence (step 10)", "Architecture Decisions > AD5 (lines ~514–539)", "Technical Analysis > State machine (lines ~341–342)"
- **Depends on:** None (hook change is independent)
- **Verify:** Hook accepts a `mode: 'local' | 'remote'` (or equivalent) param. In local mode: no RPC calls during rating/positioning, mirrors state to `localStorage[p684_letter_draft:{letterId}]` on every change, hydrates from localStorage on mount, emits `completed` signal when final point is positioned. Existing remote-mode behavior unchanged.
- [ ] Complete

---

### Task 8: New UI components — `LetterResponseSignupForm` + `ConsentCheckbox`
- **Files:** `src/app/components/letters/letter-response-signup-form.tsx` (create), `src/app/components/legal/consent-checkbox.tsx` (create)
- **Spec refs:** "Component Strategy > Section 2 Component Map (lines ~718–736)", "Component Strategy > Section 4 Visual Specification (lines ~778–800)", "Component Strategy > Section 5 Extraction Plan (lines ~806–828)"
- **Depends on:** None (pure UI components)
- **Tests:** `e2e/p684-signup-form-flow.spec.ts`, `e2e/a11y/p684-accessibility.spec.ts`
- **Verify:** Form has name input, email input, `ConsentCheckbox`, and "Send me the link" button. Button disabled until name not empty + valid email + checkbox checked. Submitting state shows `Loader2` + "Sending..." text; fields disabled. On success callback: parent transitions to check-email state. `ConsentCheckbox` accepts `checked`, `onCheckedChange`, `disabled`, `id` props; renders Radix Checkbox with Terms/Privacy links opening in new tab.
- [ ] Complete

---

### Task 9: New UI components — `LetterResponseConfirmPage` + `LetterResponseLinkExpired`
- **Files:** `src/app/pages/letter-response-confirm-page.tsx` (create), `src/app/components/letters/letter-response-link-expired.tsx` (create)
- **Spec refs:** "Technical Architecture > Implementation Approach > Build Sequence (step 8)", "UX Design > Screen States > State 7 and State 9 (lines ~266–293)", "Architecture Decisions > AD4.1 (lines ~506–512)"
- **Depends on:** Task 5 (`confirm-letter-response` edge function), Task 6 (`confirmLetterResponse` service helper)
- **Tests:** `e2e/p684-confirm-route.spec.ts` (includes MutationObserver no-flash canary)
- **Verify:** Confirm page gates on `!!session` (NOT `!!currentUser`) per P693 KDD. Shows `ClarityLoader` (not `ClarityPageLoader`) while calling `confirm-letter-response`. On success: shows completion message "Your responses have been shared with [SenderName]. You can close this tab." On `{ error: 'expired' }` or missing pending row: renders `LetterResponseLinkExpired` with "Open the letter" link back to `/letter/{letterId}`.
- [ ] Complete

---

### Task 10: Reading page — one-to-many public path
- **Files:** `src/app/pages/letter-reading-page.tsx` (modify), `src/app/components/letters/letter-cover.tsx` (modify), `src/app/components/letters/letter-completion-summary.tsx` (modify)
- **Spec refs:** "Technical Architecture > Implementation Approach > Build Sequence (step 7)", "Architecture Decisions > AD4 (lines ~488–504)", "UX Design > Screen States > States 1–5 (lines ~205–264)"
- **Depends on:** Tasks 2, 6, 7, 8 (public reading RPC, service wrappers, hook local-mode, signup form component)
- **Tests:** `e2e/p684-smoke.spec.ts`, `e2e/p684-local-state-reading.spec.ts`, `e2e/p684-authenticated-reader.spec.ts`
- **Verify:** Reading page branch (c) for `mode = 'one-to-many'` (no token, no auth) loads letter via `get_letter_for_public_reading`, renders in local-state mode. End-of-letter renders `LetterResponseSignupForm` for unauthenticated readers. Authenticated one-to-many readers reach completion directly via `submitLetterResponseAuthenticated()`. `LetterCover` shows "Open the Letter" without auth gate for one-to-many. `LetterCompletionSummary` removes dead `one-to-many && !isAuthenticated` branch (lines 236-262), replaces with State 8 completion text.
- [ ] Complete

---

### Task 11: Router — register `/letter/:letterId/confirm` route
- **Files:** `src/app/router.tsx` (or equivalent) (modify)
- **Spec refs:** "Technical Architecture > Implementation Approach > Build Sequence (step 8, last line)", "Files to Modify (lines ~672)"
- **Depends on:** Task 9 (`LetterResponseConfirmPage` must exist)
- **Verify:** Route `/letter/:letterId/confirm` is registered and renders `LetterResponseConfirmPage`. No other routes are affected.
- [ ] Complete

---

**Total tasks:** 11 | **Can parallelize:** Task 1, 2, 7, 8 (no inter-dependencies) | **Must be sequential:** Task 2 → Task 3 → Task 5 → Task 9; Task 3 → Task 4; Task 6 depends on Tasks 2, 3, 5; Task 10 depends on Tasks 2, 6, 7, 8; Task 11 depends on Task 9

