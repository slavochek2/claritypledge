---
status: qa
type: story
rank: 1000683.0
created_date: '2026-04-10'
tags: [letters, compliance, gdpr, tos]
flow: dev
delivery_stage: fix
pipeline_plan: [create-spec, challenge-prd, ux, architect, ui, generate-tests, dev, verify]
pipeline_skipped: [decompose -- under 5 files]
pipeline_ran: [create-spec, challenge-prd, ux, architect, ui, generate-tests, spec-review]
---

# P683: One-to-One Letter TOS Consent

## Problem

**Situation:** ClarityPledge sends Clarity Letters via email to specific recipients. When a recipient clicks "Open the Letter", the `create-and-open-letter` edge function silently creates an auth account and profile with `accepted_terms_version: 'v1.1'` hardcoded -- without the user ever seeing or agreeing to Terms of Service or Privacy Policy.

**Complication:** Under GDPR Article 13, processing purposes must be disclosed at the point of collection. Account creation is a distinct processing purpose that must be visible in the UI, not buried in linked documents. The EDPB's 2026 coordinated enforcement action specifically targets transparency and information obligations under Articles 12-14. Current flow: (1) no explicit consent checkbox, (2) no Privacy Policy link, (3) no `terms_acceptances` audit trail row, (4) passive TOS text with no consent action. Additionally, the sender preview skips the cover page entirely, so senders don't see what recipients will experience.

**Question:** How do we add proper TOS consent to the letter opening flow while maintaining the warm, personal feel of receiving a letter?

## Appetite

- **Blast radius:** Medium -- touches LetterCover component, letter-reading-page, letter-preview-page, and create-and-open-letter edge function. Does not change reading flow or rating mechanics.
- **Reversibility:** Fully reversible -- all changes are additive. git revert restores previous behavior.
- **Decision density:** Low -- key decisions already made: checkbox always shown for unauthenticated users, "We'll create an account to save your responses" disclosure text, "Done" button on results, preview starts from cover page.

## Solution

### LetterCover changes

- Add TOS checkbox for unauthenticated users: "I accept the [Terms] and [Privacy Policy]."
- Add disclosure line below checkbox: "We'll create an account to save your responses." [FOUNDER DECISION: exact wording]
- "Open the Letter" button disabled until checkbox is checked
- Tooltip on disabled button explaining why
- Add Privacy Policy link alongside existing Terms link
- For authenticated users (existing accounts): no checkbox shown, button works immediately

### Edge function changes (create-and-open-letter)

- Accept `termsAccepted: boolean` parameter in request body
- Accept `termsVersion: string` parameter (synced from frontend CURRENT_TERMS_VERSION)
- Refuse to create account if `termsAccepted` is not `true` -- return error
- Write proper `terms_acceptances` row (user_id, terms_version, ip_hash from request headers, user_agent from request headers) instead of just hardcoding on profile
- Keep profile `accepted_terms_version` update for quick-lookup (but audit trail is primary)

### Fix: create-and-sign version drift

- `create-and-sign` edge function (agreement signing flow) hardcodes `accepted_terms_version: 'v1.1'` while `CURRENT_TERMS_VERSION` is `'v1.2'`. Same compliance gap as the letter flow — TOS version recorded doesn't match current version.
- Fix: accept `termsVersion` from frontend (same pattern as create-and-open-letter fix above), or update hardcoded value to match `CURRENT_TERMS_VERSION`.

### Preview flow changes

- letter-preview-page.tsx: add cover state before reading (currently skips to reading)
- Sender sees LetterCover with "Open the Letter" but no TOS checkbox (they're authenticated)
- After clicking, amber "PREVIEW" banner appears, then reading flow

### Results page

- After letter completion: show "Your responses have been shared with [SenderName]. They'll see how your perspective compared to theirs." and "You can close this tab."
- No `window.close()` — browsers block it for user-opened tabs. Static message only.
- No navigation chrome, no additional CTAs

## Risks / Non-Goals

### Risks

- TOS version hardcoded in edge function (`v1.1`) diverges from frontend `CURRENT_TERMS_VERSION`. Mitigation: pass version from frontend in request body; validate against server-side allowlist (`ACCEPTED_TERMS_VERSIONS = ['v1.2']`).
- Checkbox state lost on page refresh before clicking "Open the Letter". Mitigation: acceptable -- checkbox is a single click, not a form.
- **GDPR Art. 6 legal basis (from challenge-prd WARN-4):** The legal basis for account creation on letter open is **consent** (Art. 6(1)(a)), obtained via the explicit checkbox. The checkbox gates the letter because account creation is necessary to deliver the service — saving the recipient's responses, surfacing them to the sender, and providing future access — so refusing consent genuinely means the service cannot be provided, which is compatible with "freely given" under Art. 7 (the alternative is simply not to use the service). The disclosure line "We'll create an account to save your responses." combined with links to the Terms and Privacy Policy satisfies Art. 13's information obligations at point of collection. The `terms_acceptances` row (user_id, terms_version, accepted_at, ip_hash, user_agent) is the audit trail the Art. 7(1) "demonstrate consent" burden-of-proof requirement demands.

### Non-Goals

- Do NOT add TOS to one-to-many letter flow (separate spec P684)
- Do NOT add navigation/menu to the letter reading flow (stays chromeFree)
- Do NOT add name correction UI on results page
- Do NOT add email forwarding warnings to email templates
- Do NOT modify the letter reading or rating mechanics
- Do NOT add onboarding or app exploration after letter completion

## Done-When

- [ ] Unauthenticated users see TOS checkbox + account disclosure on LetterCover
- [ ] "Open the Letter" button is disabled until checkbox is checked
- [ ] Privacy Policy link visible alongside Terms of Service link
- [ ] Edge function refuses account creation without `termsAccepted: true`
- [ ] `terms_acceptances` row created with IP hash and user agent on account creation
- [ ] Terms version passed from frontend, not hardcoded in edge function
- [ ] `create-and-sign` edge function uses current terms version (not hardcoded `v1.1`)
- [ ] Authenticated users see "Open the Letter" without checkbox
- [ ] Sender preview starts from cover page (no TOS, since authenticated)
- [ ] Results page shows completion message with "You can close this tab" (no `window.close()`)
- [ ] No navigation chrome during or after letter flow
- [ ] Edge function does not return `receiverEmail` in success response (data leak fix)
- [ ] Authenticated user with stale `accepted_terms_version` sees blocking re-accept modal on letter open; cannot bypass; accept writes new `terms_acceptances` row and updates profile
- [ ] Authenticated user with current `accepted_terms_version` opens letter straight through (no modal, no checkbox)
- [ ] Frontend sends `CURRENT_TERMS_VERSION` from `src/lib/constants.ts`; edge functions validate against local `ACCEPTED_TERMS_VERSIONS = ['v1.2']` allowlist and reject any other value
- [ ] Edge function IP hash computed server-side via shared `supabase/functions/_shared/hash-ip.ts` (SHA-256 of `x-forwarded-for` header + `IP_HASH_SECRET`); no client-side ipify dependency remains on the letter/agreement path

## Acceptance Criteria

- [ ] GDPR Article 13 compliant: processing purpose (account creation) disclosed at point of collection
- [ ] Audit trail: `terms_acceptances` row exists for every new account created via letter flow
- [ ] Existing users can open letters without re-accepting TOS
- [ ] Preview flow gives senders accurate preview of recipient experience (minus TOS)
- [ ] Letter reading and rating mechanics unchanged

## UX Notes

States for LetterCover:

- **New user (unauthenticated, no checkbox checked):** envelope + info + checkbox unchecked + button disabled + tooltip
- **New user (checkbox checked):** button enabled
- **New user (opening):** button shows spinner + "Opening..." + checkbox dimmed
- **Existing user (unauthenticated but has profile):** SAME as new user -- always show checkbox for unauthenticated. Idempotent insert in terms_acceptances.
- **Authenticated user (current terms):** no checkbox, button enabled immediately. Straight-through flow — they already accepted the current version via another app path, so no re-acceptance friction. Idempotent: opening multiple letters does not create duplicate `terms_acceptances` rows (UNIQUE `(user_id, terms_version)` constraint handles the DB side; the frontend does not even attempt a write for current-terms users).
- **Authenticated user (stale terms):** blocking `LetterStaleTermsModal` renders over the cover. "Our terms have been updated. Please review and accept to continue." with Terms + Privacy links, checkbox, and "Accept & continue" button. On accept, writes a new `terms_acceptances` row and updates `profiles.accepted_terms_version`, then the letter opens normally. This is the X3 resolution for stale-terms users — it replaces any "redundant re-acceptance" friction the original spec left underspecified.
- **Preview (sender):** no checkbox (authenticated), button enabled, after click shows amber preview banner

## Pre-deploy Checklist

### Secrets to provision
- [ ] `IP_HASH_SECRET` — env var for server-side hash-ip helper (if not already set): `vercel env add IP_HASH_SECRET production --token "$VERCEL_TOKEN"` AND `supabase secrets set IP_HASH_SECRET=<value> --project-ref besjtuodziykmjidubzw`

### Deploy commands
- [ ] `supabase functions deploy create-and-open-letter --project-ref besjtuodziykmjidubzw --no-verify-jwt`
- [ ] `supabase functions deploy create-and-sign --project-ref besjtuodziykmjidubzw --no-verify-jwt` (version drift fix)
- [ ] Trigger Vercel redeploy (frontend `CURRENT_TERMS_VERSION` + `ACCEPTED_TERMS_VERSIONS` baked at build)

### Post-deploy verification
- [ ] Open a test letter as unauthenticated user — checkbox appears, button gated
- [ ] Inspect `terms_acceptances` row after opening: correct `terms_version='v1.2'`, `ip_hash` not null, `user_agent` not null
- [ ] Open a test letter as authenticated user with stale `accepted_terms_version='v1.1'` — re-accept modal appears, blocks until accepted
- [ ] Check Sentry for new errors in first 10 minutes

## UX Design

### User Flows

#### Flow 1: New Recipient Opens Letter (primary path)

1. **Email arrival** -- Recipient receives email with "Open the Letter" link from ClarityPledge
2. **LetterCover** -- Lands on cover page: envelope icon, letter metadata, TOS consent area, disabled "Open the Letter" button
3. **Consent action** -- Checks TOS checkbox; "Open the Letter" button becomes enabled
4. **Opening** -- Clicks "Open the Letter"; button shows loading state; account created silently in background
5. **Letter reading** -- Reads through letter stories one by one (existing reading flow, unchanged)
6. **Rating** -- Rates each story (existing rating flow, unchanged)
7. **Results** -- Sees completion message confirming responses were shared; told to close tab

#### Flow 2: Returning Recipient (has account but unauthenticated)

Same as Flow 1. The recipient is unauthenticated at the cover page regardless of whether they have an existing account. TOS checkbox always shown for unauthenticated users. The edge function handles idempotent account/consent operations.

#### Flow 3: Authenticated User Opens Letter

1. **LetterCover** -- Lands on cover page: envelope icon, letter metadata, enabled "Open the Letter" button (no TOS checkbox)
2. **Opening** -- Clicks "Open the Letter"; button shows loading state
3. **Letter reading and rating** -- Same as Flow 1, steps 5-6
4. **Results** -- Same as Flow 1, step 7

#### Flow 4: Sender Previews Letter

1. **LetterCover** -- Sender lands on cover page: envelope icon, letter metadata, enabled "Open the Letter" button (no TOS checkbox -- sender is authenticated)
2. **Opening** -- Clicks "Open the Letter"
3. **Preview banner** -- Amber "PREVIEW" banner appears at top of reading flow
4. **Preview reading** -- Reads through letter in preview mode

### Screen: LetterCover

#### Layout

The LetterCover is a single centered card on a minimal page (chromeFree layout -- no nav, no footer).

Content stack, top to bottom:
- Envelope icon (existing)
- "A Clarity Letter" heading (existing)
- "For {receiverName}" (existing)
- "From {senderName}" (existing)
- Story count + estimated reading time (existing)
- **[NEW]** TOS consent area (unauthenticated users only)
- "Open the Letter" button (existing, behavior changes)

#### TOS Consent Area (unauthenticated users only)

The consent area sits between the letter metadata and the action button. It contains two elements stacked vertically:

1. **Checkbox row** -- A standard checkbox with label text: "I accept the [Terms of Service] and [Privacy Policy]." where bracketed text are links opening in new tabs. The checkbox and label are left-aligned within the centered card.

2. **Disclosure line** -- Below the checkbox, smaller muted text: "We'll create an account to save your responses." [FOUNDER DECISION: exact wording of this disclosure line]

**Density intent:** The consent area should feel lightweight -- a brief pause in the emotional arc of receiving a personal letter, not a legal wall. Spacing should be tighter than surrounding metadata to keep it visually subordinate to the letter information above and the CTA below.

#### States

| State | Checkbox | Button | Button label | Additional |
|-------|----------|--------|-------------|------------|
| Unauthenticated, unchecked | Visible, unchecked | Disabled (reduced opacity) | "Open the Letter" | Tooltip on hover/focus: "Please accept the Terms of Service and Privacy Policy to continue" |
| Unauthenticated, checked | Visible, checked | Enabled (blue, full opacity) | "Open the Letter" | -- |
| Opening (loading) | Visible, dimmed (disabled) | Disabled, shows spinner | "Opening..." | Prevents double-click |
| Authenticated (current terms) | Hidden | Enabled (blue, full opacity) | "Open the Letter" | No consent area shown at all |
| Authenticated (stale terms) | N/A (blocking modal) | Blocked behind modal | "Open the Letter" (behind modal) | Blocking `LetterStaleTermsModal` renders over cover: "Our terms have been updated. Please review and accept to continue." + Terms/Privacy links + checkbox + "Accept & continue" button. On accept: writes new `terms_acceptances` row, updates `profiles.accepted_terms_version`, dismisses modal. User cannot bypass. |
| Preview (sender) | Hidden | Enabled (blue, full opacity) | "Open the Letter" | Same as authenticated (current terms) |

#### Error States

| Error | Trigger | User sees |
|-------|---------|-----------|
| Edge function rejects (no consent) | Race condition: checkbox unchecked but request sent | Inline error below button: "Please accept the Terms of Service to continue." Checkbox state is NOT reset (user's last action wins — a retry of a failed API call should not re-force consent). Button re-enables as soon as the checkbox is checked. |
| Network error | Request fails | Inline error below button: "Something went wrong. Please try again." Button re-enables. Checkbox stays checked. |
| Letter not found / expired | Invalid or expired letter token | Replace entire LetterCover content with: "This letter is no longer available." No checkbox, no button. |

### Screen: Results Page

After the recipient completes all ratings, the reading flow transitions to a results screen.

#### Layout

Same chromeFree layout. Single centered content area:

- Check/completion icon
- "Your responses have been shared with {senderName}."
- "They'll see how your perspective compared to theirs."
- "You can close this tab."

No buttons. No navigation. No CTAs. The recipient's journey ends here.

**Density intent:** Spacious, restful -- the recipient just completed a reflective exercise. Generous vertical spacing between lines to signal "you're done, breathe."

### Screen: Sender Preview

The sender preview adds a cover page step before the existing preview reading flow.

1. LetterCover displays in authenticated state (no TOS checkbox, button enabled)
2. After clicking "Open the Letter", the amber "PREVIEW" banner appears
3. Reading flow proceeds as existing preview behavior

### Interaction Details

**Checkbox behavior:**
- Standard browser checkbox semantics (click or spacebar to toggle)
- Checking the box immediately enables the button (no debounce, no delay)
- Unchecking the box immediately disables the button
- Checkbox state is ephemeral -- lost on page refresh (acceptable per spec: single click to re-check)

**Button tooltip (disabled state):**
- Shows on hover (pointer devices) and on focus (keyboard navigation)
- Disappears when checkbox is checked
- Text: "Please accept the Terms of Service and Privacy Policy to continue"

**Link behavior:**
- "Terms of Service" links to `/terms-of-service`, opens in new tab
- "Privacy Policy" links to `/privacy-policy`, opens in new tab
- Links are styled as underlined text within the label (standard link treatment)

**Loading state:**
- Button text changes to "Opening..." with a spinner icon
- Checkbox becomes visually dimmed and non-interactive (prevents state change during loading)
- If loading fails, both checkbox and button return to their pre-loading state

### Accessibility

- Checkbox has a proper `<label>` association (click label text to toggle)
- Links within the label are individually focusable and have distinct focus rings
- Disabled button has `aria-disabled="true"` and the tooltip text as `aria-describedby` content
- Tab order: checkbox -> Terms link -> Privacy link -> button
- Error messages use `role="alert"` for screen reader announcement
- Color contrast: all text meets WCAG AA (muted-foreground on background passes at the sizes used)
- Touch target: checkbox area (including label) meets 40px minimum height

### Responsive Behavior

- The LetterCover card is already centered and responsive (existing behavior)
- TOS consent area inherits the card's horizontal constraints
- On narrow viewports (mobile), the checkbox label text wraps naturally -- no truncation
- Disclosure line below checkbox wraps independently of checkbox label
- Touch targets remain adequate on mobile (checkbox row is full-width tappable)

## Technical Architecture

### Technical Analysis

#### Reuse Inventory

All letter code lives on the `feature/letters-ship` branch in worktree w2. None of these files exist on `main` yet.

**Letter components (w2: `src/app/components/letters/`):**
- `letter-cover.tsx` — `LetterCover` component. Already renders envelope icon, sender/receiver info, stats, "Open the Letter" button with loading state. Has a passive TOS line ("By opening, you accept the Terms of Service") gated on `mode === 'one-to-one'`. No checkbox, no Privacy Policy link, no account disclosure.
- `letter-completion-summary.tsx` — `LetterCompletionSummary`. Shows celebration confetti, gap-sorted summary, `/live` CTA, and registration gate (one-to-many only). This is the sender-facing results component for 1-to-1 reading completion.
- `letter-progress-bar.tsx` — progress indicator during reading flow.

**Letter pages (w2: `src/app/pages/`):**
- `letter-reading-page.tsx` — Main reading page. Manages `ViewState: 'cover' | 'reading' | 'complete'`. Cover state renders `LetterCover`. The `handleOneToOneOpen` callback invokes `create-and-open-letter` edge function with `{ token }` only — no `termsAccepted` or `termsVersion` in the payload. On completion, renders `LetterCompletionSummary`.
- `letter-preview-page.tsx` — Sender preview. Route: `/letter/:docId/preview`. Currently skips cover page — jumps straight to `LetterPreviewFlow` with amber "PREVIEW" banner. No `LetterCover` rendered.
- `letter-results-page.tsx` — Sender results page (route `/letter/:id/results`). Shows per-delivery stats. This is NOT the receiver completion screen.

**Edge functions (w2: `supabase/functions/`):**
- `create-and-open-letter/index.ts` — Creates auth account + profile for letter recipients. Hardcodes `accepted_terms_version: 'v1.1'` in two places (search for `accepted_terms_version: 'v1.1'` — main profile insert and the self-healing fallback). Accepts only `{ token }` in request body. No `termsAccepted` or `termsVersion` parameters. No `terms_acceptances` audit row written.

**Existing consent infrastructure (main):**
- `src/app/components/legal/consent-notice.tsx` — `ConsentNotice`. Passive text: "By joining, you agree to our Terms & Privacy." No checkbox. Used in signup/live flows. Not suitable for letter flow (wrong pattern — needs active consent).
- `src/app/data/api.ts` — `recordTermsAcceptance(userId)` writes to `terms_acceptances` table with IP hash + user agent. Uses `CURRENT_TERMS_VERSION` from constants. Client-side only (browser `fetch` for IP, `navigator.userAgent`). Cannot be reused in edge function (Deno runtime, no browser APIs).
- `src/app/data/api.ts` — `needsTermsAcceptance(userId)` checks `profiles.accepted_terms_version` against `CURRENT_TERMS_VERSION`.
- `src/app/data/api.ts` — `hashIP()` fetches IP from `api.ipify.org`, SHA-256 hashes it. Browser-only.
- `src/lib/constants.ts` — `CURRENT_TERMS_VERSION = 'v1.2'`.

**Existing consent DB schema (main: `supabase/migrations/20260107_p37_consent_mechanism.sql`):**
- `terms_acceptances` table: `id`, `user_id`, `terms_version`, `accepted_at`, `ip_hash`, `user_agent`. Unique constraint on `(user_id, terms_version)`. RLS: insert requires `auth.uid() IS NOT NULL`; select requires `auth.uid() = user_id`.
- `profiles.accepted_terms_version` column for quick lookup.

**Agreement flow (main: `supabase/functions/create-and-sign/index.ts`):**
- Hardcodes `accepted_terms_version: 'v1.1'` (search for `accepted_terms_version: 'v1.1'` in the profile insert path). Same compliance gap as letters. Same fix pattern applies.

#### Dependencies

- P683 depends on the `feature/letters-ship` branch (w2) being merged or P683 being implemented on that branch.
- No new database migrations needed — `terms_acceptances` table already exists with the required schema.
- No new npm dependencies.

### Architecture Decisions

**AD-1: Modify LetterCover to accept consent props — not a new component**

- **Chosen:** Add `isAuthenticated`, `termsAccepted`, `onTermsChange` props to `LetterCover`. Render checkbox + disclosure inline when `!isAuthenticated`. Disable button when `!isAuthenticated && !termsAccepted`.
- **Rationale:** LetterCover already handles the cover state, button states, and loading. The consent area is a visual insert between metadata and CTA — not a separate concern. A new component would fragment the button-disabled logic.
- **Trade-off:** LetterCover grows from 98 to ~140 lines. Acceptable for a single-responsibility component.
- **Alternative rejected:** New `LetterConsentGate` wrapper component — adds prop-drilling and splits the disabled-button logic across two components.

**AD-2: Pass `termsAccepted` and `termsVersion` from client to edge function**

- **Chosen:** Add `termsAccepted: boolean` and `termsVersion: string` to the `create-and-open-letter` request body. Edge function validates `termsAccepted === true` before account creation. Uses `termsVersion` for profile write + audit row.
- **Rationale:** Frontend owns the current version constant (`CURRENT_TERMS_VERSION`). Passing it in the request body avoids maintaining a second version constant in the Deno edge function. The edge function becomes version-agnostic.
- **Trade-off:** Client could send a stale version. Mitigation: this is acceptable because the client is always rebuilt with the latest constants at deploy time. A determined attacker could send any version — but the audit trail captures what was sent, which is the compliance goal.
- **Alternative rejected:** Hardcode current version in edge function — creates the exact version-drift problem this spec fixes.

**AD-3: Write `terms_acceptances` row in edge function using service role client with server-side IP hash**

- **Chosen:** After profile creation, insert into `terms_acceptances` with the service role Supabase client (already initialized in the edge function). Extract IP from `req.headers.get('x-forwarded-for')` (falling back to `cf-connecting-ip`), hash server-side with SHA-256 of `ip + IP_HASH_SECRET` using Deno `crypto.subtle.digest('SHA-256', ...)`. Extract user agent from `req.headers.get('user-agent')`. The hashing helper lives in a shared module `supabase/functions/_shared/hash-ip.ts` so both `create-and-open-letter` and `create-and-sign` use the same implementation. P684 references the same shared helper.
- **Rationale:** Client-side IP discovery via `api.ipify.org` is unreliable (third-party dependency, can be blocked, reveals nothing the server doesn't already see in headers). Server-side hashing from the request header is authoritative, latency-free, and privacy-preserving. A shared helper prevents the two edge functions (and P684's edge function) from drifting.
- **Trade-off:** Introduces a new shared module and a new secret (`IP_HASH_SECRET`) that must be provisioned in Supabase edge function env. The client-side `hashIP()` in `src/app/data/api.ts` is no longer the consent audit source for the letter/agreement flows — it stays only for the main app signup path (or can be migrated separately).
- **Alternative rejected:** Call `recordTermsAcceptance()` from client after auth — creates a race condition (account exists but no audit trail if client crashes between auth and the API call). Server-side is atomic with account creation.
- **Alternative rejected:** Client-side `hashIP()` via ipify.org — third-party dependency, slower, and the IP it returns is still just the same header value the edge function already sees.

**AD-4: Fix `create-and-sign` v1.1 hardcode inline**

- **Chosen:** Accept `termsVersion` parameter in `create-and-sign` request body (same pattern as AD-2). Frontend already passes context through this edge function. Update the two profile insert calls to use the passed version.
- **Rationale:** Identical pattern to the letter fix. Keeps both edge functions consistent.
- **Trade-off:** Requires updating the agreement creation frontend to pass `termsVersion`. Minimal — one line in the edge function invocation.
- **Alternative rejected:** Just change `'v1.1'` to `'v1.2'` — defers the problem to the next version bump.

**AD-5: Add cover page to sender preview flow**

- **Chosen:** Wrap `LetterPreviewFlow` in a local `viewState: 'cover' | 'reading'` state in `LetterPreviewPage`. Render `LetterCover` with `isAuthenticated={true}` (no checkbox). On click, transition to reading with existing preview banner.
- **Rationale:** Sender should see what recipients see (minus TOS). Currently the preview skips the cover entirely, which means the sender never sees the envelope/metadata presentation.
- **Trade-off:** Adds one click to the preview flow. Acceptable — the cover page IS the thing being previewed.
- **Alternative rejected:** Inline a mini-cover summary at the top of the preview — doesn't show the actual cover page experience.

**AD-7: Shared `ACCEPTED_TERMS_VERSIONS` constant as single source of truth**

- **Chosen:** Add `export const ACCEPTED_TERMS_VERSIONS = ['v1.2'] as const` to `src/lib/constants.ts` alongside the existing `CURRENT_TERMS_VERSION`. The frontend sends `CURRENT_TERMS_VERSION` in the edge function payload. Each edge function duplicates the same literal list (`['v1.2']`) as its allowlist — Deno edge functions cannot import from `src/lib/` at build time without bundler glue, so the list is duplicated and kept in sync by atomic deploys (frontend + both edge functions ship together in the same release).
- **Rationale:** Single source of truth on the frontend, explicit allowlist on each server. An atomic deploy (Vercel + `supabase functions deploy`) guarantees the two stay in sync across a version bump. This avoids an over-engineered shared-package abstraction for a 1-line constant.
- **Trade-off:** Two places to update on a version bump (frontend constant + each edge function allowlist). Accepted because the Pre-deploy Checklist enforces both deployments together, and the server-side validation catches any drift immediately (a client sending a version absent from the server allowlist fails fast with a clear error).
- **Alternative rejected:** Import from a shared file — would require a bundler/esbuild step in the Supabase function build, which we do not currently have. Over-engineered for a single constant.
- **Alternative rejected:** Query a DB table for allowed versions — adds a round-trip on every letter open, and the list of accepted versions is a deploy-time decision, not runtime data.

**AD-8: Blocking re-accept modal for authenticated users on stale terms**

- **Chosen:** When an authenticated user whose `profiles.accepted_terms_version` is not in `ACCEPTED_TERMS_VERSIONS` opens a letter, the LetterCover renders a blocking modal: "Our terms have been updated. Please review and accept to continue." with links to Terms + Privacy Policy, a checkbox, and an "Accept & continue" button. The user cannot dismiss the modal or interact with the letter until they accept. On accept, the client writes a new `terms_acceptances` row and updates `profiles.accepted_terms_version` to the current version, then the letter opens normally.
- **Rationale:** GDPR requires renewed consent after material terms changes. Silently letting stale-terms users through would break the same compliance goal P683 exists to solve. A blocking modal is the correct pattern — same precedent as the existing `TermsUpdateDialog` used in the `/live` flow.
- **Trade-off:** Adds one modal UX surface for authenticated users on the first letter after a version bump. Acceptable — this only fires on the rare transition and is a clear, one-time action.
- **Alternative rejected:** Allow through silently, update profile lazily — defeats the compliance purpose and produces audit rows with the wrong version number.
- **Alternative rejected:** Treat stale-terms authenticated users exactly like unauthenticated (show the inline checkbox) — conflates two different UX flows and hides the "terms changed" context from users who already had an account.

**AD-6: Receiver completion message replaces current `LetterCompletionSummary`** [FOUNDER DECISION: confirmed removing completion gap-card per P683 scope]

- **Chosen:** For 1-to-1 letters, replace the existing completion summary (which shows celebration + gap cards + `/live` CTA) with a simple "Your responses have been shared" message + "You can close this tab." No buttons, no navigation, no CTAs. The existing `LetterCompletionSummary` with gap cards remains available for the sender on the results page.
- **Rationale:** The spec explicitly states: "No buttons. No navigation. No CTAs. The recipient's journey ends here." The current completion flow (confetti, summary, /live CTA) is appropriate for the sender side but not for a first-time recipient who doesn't have context for `/live`.
- **Trade-off:** Receiver loses access to their gap summary. This is by design — the goal is a clean exit, not onboarding.
- **Alternative rejected:** Keep full completion summary — contradicts the spec's non-goal "Do NOT add onboarding or app exploration after letter completion."

### Security Review

**RLS Policies:**
- ✅ `terms_acceptances` has RLS enabled. INSERT restricted to authenticated users (`auth.uid() IS NOT NULL`). SELECT restricted to own rows. No UPDATE or DELETE policies (immutable audit trail — correct).
- ✅ `letter_deliveries` RLS: INSERT blocked (`WITH CHECK (false)`) — only SECURITY DEFINER RPCs can create deliveries. SELECT scoped to sender or receiver.
- ✅ Helper functions `_is_letter_sender`/`_is_letter_receiver` are SECURITY DEFINER with restricted search_path, REVOKED from anon/public (P651).

**Authentication:**
- ✅ Edge function uses service role key — correct pattern for server-side user creation (same as `create-and-sign`).
- ✅ `hashedToken` returned for instant auth via `verifyOtp` — Supabase's documented server-side auth flow, transmitted over HTTPS.
- ⚠️ `receiverEmail` leaked in edge function response (search for `receiverEmail` in `create-and-open-letter/index.ts` — appears in both the success payload and the self-healing fallback path). The `get_letter_by_token` RPC was patched (P651) to redact `receiver_email`, but the edge function re-exposes it. **Recommendation:** Remove `receiverEmail` from success response; if OTP fallback needed, trigger email server-side.

**Input Validation:**
- ⚠️ **`termsAccepted` must be validated as strictly `true`** (not truthy — reject `1`, `"true"`, etc.).
- ⚠️ **`termsVersion` must be validated against a server-side allowlist** — `ACCEPTED_TERMS_VERSIONS = ['v1.2']` only. The whole point of P683 is to stop accepting the stale `v1.1` value, so it must not be in the allowlist. Do not trust arbitrary strings.
- ⚠️ **`accepted_terms_version: 'v1.1'` hardcoded in both edge functions** — two locations in `create-and-open-letter` (main insert + self-healing fallback), one in `create-and-sign` (profile insert path). Search for `accepted_terms_version: 'v1.1'`. Live compliance gap.
- ✅ Token validated as UUID format (regex check). `receiverName` trimmed and capped at 100 chars.

**Data Protection:**
- ⚠️ **No `terms_acceptances` row written by edge functions today** — only profile column updated. P683 correctly fixes this.
- ⚠️ **IP hashing needs server-side implementation.** Client-side `hashIP()` fetches from third-party service. Edge function must hash from request headers (`x-forwarded-for`, `cf-connecting-ip`) using SHA-256. Never store raw IPs.
- ⚠️ **No FK from `terms_acceptances.user_id` to `auth.users`** — intentional: consent records must survive user deletion for legal audit. Correct GDPR practice.
- ✅ `terms_acceptances` table design is GDPR-appropriate: user_id, terms_version, accepted_at, ip_hash, user_agent. UNIQUE constraint prevents duplicates.

### Implementation Approach

#### Build Sequence

1. **Edge function: `create-and-open-letter`** — Add `termsAccepted`/`termsVersion` params. Validate `termsAccepted === true` (strict boolean, not truthy). Validate `termsVersion` against server-side allowlist (`ACCEPTED_TERMS_VERSIONS = ['v1.2']`, duplicated from `src/lib/constants.ts` per AD-7). Add `terms_acceptances` insert with server-side IP hash via shared `supabase/functions/_shared/hash-ip.ts` (SHA-256 of `x-forwarded-for`/`cf-connecting-ip` header + `IP_HASH_SECRET`) and `User-Agent` header. Update both profile insert paths (main creation + self-healing fallback) to use `termsVersion` instead of hardcoded `'v1.1'`. Remove `receiverEmail` from success response (re-exposes data redacted in P651).

2. **Edge function: `create-and-sign`** — Add `termsVersion` param, update profile insert to use it instead of hardcoded `'v1.1'`. Add `terms_acceptances` insert (same pattern).

3. **Component: `LetterCover`** — Add `isAuthenticated`, `termsAccepted`, `onTermsChange` props. Render checkbox + disclosure + Privacy Policy link when `!isAuthenticated`. Wire disabled state to `!termsAccepted && !isAuthenticated`.

4. **Page: `letter-reading-page`** — Add `termsAccepted` state. Pass to `LetterCover`. Update `handleOneToOneOpen` to include `termsAccepted` and `CURRENT_TERMS_VERSION` in edge function payload. Add error handling for consent-rejection response.

5. **Page: `letter-preview-page`** — Add cover page state before reading flow. Render `LetterCover` with `isAuthenticated={true}`.

6. **Page: `letter-reading-page` (completion)** — Replace `LetterCompletionSummary` for 1-to-1 with a simple completion message component. "Your responses have been shared with {senderName}." + "You can close this tab."

7. **Agreement frontend (`accept-agreement-page.tsx`)** — Update the `create-and-sign` invocation (search for `invoke('create-and-sign'`) to pass `termsVersion: CURRENT_TERMS_VERSION`.

8. **Constants (`src/lib/constants.ts`)** — Export `ACCEPTED_TERMS_VERSIONS = ['v1.2'] as const` alongside `CURRENT_TERMS_VERSION`. Import in `letter-reading-page` for the stale-terms gate.

9. **Shared helper (`supabase/functions/_shared/hash-ip.ts`)** — New helper module: `export async function hashIp(ip: string, salt: string): Promise<string>` — SHA-256 of `ip + salt`. Used by both edge functions.

10. **Stale-terms modal (`letter-stale-terms-modal.tsx`)** — Blocking modal for authenticated users with `accepted_terms_version` not in `ACCEPTED_TERMS_VERSIONS`. Writes new `terms_acceptances` row + updates profile on accept.

#### Files to Create

- `src/app/components/letters/letter-recipient-done.tsx` — Simple completion message for 1-to-1 recipients. Stateless component: check icon + two lines of text. ~30 lines.
- `supabase/functions/_shared/hash-ip.ts` — Shared helper exporting `hashIp(ip: string, salt: string): Promise<string>` using `crypto.subtle.digest('SHA-256', ...)`. Used by both `create-and-open-letter` and `create-and-sign`. ~15 lines.
- `src/app/components/letters/letter-stale-terms-modal.tsx` — Blocking re-accept modal for authenticated users whose `profiles.accepted_terms_version` is not in `ACCEPTED_TERMS_VERSIONS`. Follows `TermsUpdateDialog` pattern. Writes new `terms_acceptances` row + updates profile on accept. ~80 lines.

#### Files to Modify

| File | Change |
|------|--------|
| `src/lib/constants.ts` | Add `export const ACCEPTED_TERMS_VERSIONS = ['v1.2'] as const` alongside existing `CURRENT_TERMS_VERSION`. Single source of truth for accepted terms versions on the frontend. |
| `supabase/functions/create-and-open-letter/index.ts` | Add `termsAccepted`/`termsVersion` params, strict-boolean validation, allowlist check against local `ACCEPTED_TERMS_VERSIONS = ['v1.2']`, `terms_acceptances` insert via shared `_shared/hash-ip.ts` helper (server-side SHA-256 of `x-forwarded-for` + `IP_HASH_SECRET`). Remove the two hardcoded `'v1.1'` profile writes (search for `accepted_terms_version: 'v1.1'`). Remove `receiverEmail` from success response. |
| `supabase/functions/create-and-sign/index.ts` | Add `termsVersion` param, same allowlist check, same shared hash-ip helper. Remove the hardcoded `'v1.1'` (search for `accepted_terms_version: 'v1.1'`). Add `terms_acceptances` insert. |
| `src/app/components/letters/letter-cover.tsx` | Add consent props, checkbox UI, disclosure text, Privacy Policy link, disabled button logic. |
| `src/app/pages/letter-reading-page.tsx` | Add `termsAccepted` state, pass to LetterCover, include in edge function payload, wire error handling, swap completion component for 1-to-1. Gate on stale-terms: render `LetterStaleTermsModal` before `LetterCover` when `isAuthenticated && !ACCEPTED_TERMS_VERSIONS.includes(profile.accepted_terms_version)`. |
| `src/app/pages/letter-preview-page.tsx` | Add cover page state before reading, render LetterCover with `isAuthenticated={true}`. |
| `src/app/pages/accept-agreement-page.tsx` | Pass `termsVersion: CURRENT_TERMS_VERSION` to `create-and-sign` invocation (search for `invoke('create-and-sign'`). |

## Component Strategy

### 1. Component Inventory

**shadcn/ui primitives available:**
- `Button` (`src/components/ui/button.tsx`) -- cva variants: default/destructive/outline/secondary/ghost/link; sizes: default/sm/lg/icon. Has `disabled` styling built in (`disabled:pointer-events-none disabled:opacity-50`).
- `Checkbox` (`src/components/ui/checkbox.tsx`) -- Radix `@radix-ui/react-checkbox` wrapper. 16x16 (`h-4 w-4`), `border-primary`, checked state fills `bg-primary`. Supports `disabled` with `disabled:cursor-not-allowed disabled:opacity-50`.
- `Label` (`src/components/ui/label.tsx`) -- Radix `@radix-ui/react-label`. `text-sm font-medium`. Respects `peer-disabled` for associated inputs.
- `Tooltip` / `TooltipProvider` / `TooltipTrigger` / `TooltipContent` (`src/components/ui/tooltip.tsx`) -- Radix tooltip with portal rendering. Styled `bg-primary text-primary-foreground text-xs`.

**Feature components relevant:**
- `ConsentNotice` (`src/app/components/legal/consent-notice.tsx`) -- passive "By joining, you agree to..." text. Links to `/terms-of-service` and `/privacy-policy`. No checkbox, no interactivity.
- `MobileTooltip` (`src/app/components/shared/mobile-tooltip.tsx`) -- wraps shadcn Tooltip with long-press support for mobile. Auto-dismisses after 2s.
- `TermsUpdateDialog` (`src/app/components/live-meeting/terms-update-dialog.tsx`) -- modal dialog for existing-user TOS re-acceptance. Links styled with `text-blue-600`.
- `LetterCover` (w2: `src/app/components/letters/letter-cover.tsx`) -- current cover component. Renders envelope icon, metadata, button, passive TOS text. 98 lines.
- `LetterCompletionSummary` (w2: `src/app/components/letters/letter-completion-summary.tsx`) -- celebration + gap summary + /live CTA. Complex, 265 lines.

### 2. Component Map

| UI Element | Classification | Source | Notes |
|-----------|---------------|--------|-------|
| TOS checkbox | **Reuse** | `Checkbox` from `src/components/ui/checkbox.tsx` | Standard Radix checkbox, no modifications needed |
| Checkbox label with links | **Reuse** | `Label` from `src/components/ui/label.tsx` | Compose with inline `<a>` elements for Terms/Privacy links |
| Account disclosure text | **New inline** | Rendered inside `LetterCover` | `<p>` with `text-muted-foreground text-xs`. Too simple for a component |
| "Open the Letter" button | **Extend** | `Button` from `src/components/ui/button.tsx` | Already used in `LetterCover`. Disabled state wired to checkbox. No variant changes needed |
| Tooltip on disabled button | **Reuse** | `MobileTooltip` from `src/app/components/shared/mobile-tooltip.tsx` | Already handles hover (desktop) + long-press (mobile). Wraps button with `asChild`-compatible trigger |
| Inline error below button | **New inline** | Rendered inside `LetterCover` | `<p role="alert">` with `text-destructive text-sm`. Ephemeral state, not worth extracting |
| Results/completion screen | **New component** | `letter-recipient-done.tsx` | Replaces `LetterCompletionSummary` for 1-to-1 receivers. ~30 lines. Stateless |
| Sender preview cover | **Reuse** | `LetterCover` with `isAuthenticated={true}` | Checkbox/disclosure hidden. Button enabled immediately |
| Letter not found / expired | **Extend** | Already inline in `letter-reading-page.tsx` | Existing `pageState === 'invalid'` and `'expired'` branches. Replace LetterCover content |

**Not modified:**
- `ConsentNotice` -- stays as-is for signup/live flows. Letter flow uses a different pattern (active checkbox vs passive text). No extraction needed.
- `TermsUpdateDialog` -- modal pattern for existing users. Not applicable to letter cover (inline, not modal).

### 3. Composition Tree

```
LetterReadingPage
  CertificatePageShell
    // viewState === 'cover'
    LetterCover
      div.envelope-icon (existing)
      div.title-block (existing: "A Clarity Letter", "For {name}", "From {name}")
      p.stats (existing: story count + time)
      [!isAuthenticated] div.consent-area (NEW)
        div.checkbox-row
          Checkbox (shadcn)
          Label (shadcn, contains inline <a> links to Terms + Privacy Policy)
        p.disclosure (NEW, muted text): "We'll create an account to save your responses." [FOUNDER DECISION: exact wording]
      MobileTooltip [!isAuthenticated && !termsAccepted] (wraps button)
        Button (existing, disabled state wired)
      [error] p[role="alert"] (NEW, inline)

    // viewState === 'reading'
    LetterReadingFlow (existing, unchanged)

    // viewState === 'complete' && mode === 'one-to-one'
    LetterRecipientDone (NEW)
      CheckCircle icon (lucide-react)
      p "Your responses have been shared with {senderName}."
      p "They'll see how your perspective compared to theirs."
      p "You can close this tab."

    // viewState === 'complete' && mode !== 'one-to-one'
    LetterCompletionSummary (existing, unchanged)

LetterPreviewPage
  div.preview-banner (existing amber banner)
  CertificatePageShell
    // viewState === 'cover' (NEW state)
    LetterCover (isAuthenticated={true}, no consent area)
    // viewState === 'reading' (existing)
    LetterPreviewFlow (existing, unchanged)
```

### 4. Visual Specification

#### Design Tokens (from `src/index.css` + `tailwind.config.js`)

| Token | Value | Usage in P683 |
|-------|-------|--------------|
| `--primary` | `hsl(240 5.9% 10%)` (near-black) | Checkbox border + checked fill, tooltip bg |
| `--primary-foreground` | `hsl(0 0% 98%)` (white) | Checkbox checkmark, tooltip text |
| `--muted-foreground` | `hsl(240 3.8% 46.1%)` (gray) | Disclosure text, "close this tab" text |
| `--destructive` | `hsl(0 84.2% 60.2%)` (red) | Error message text |
| `--foreground` | `hsl(240 10% 3.9%)` (near-black) | Checkbox label text |
| `--border` | `hsl(240 5.9% 90%)` (light gray) | Not used directly -- checkbox uses `border-primary` |
| `--radius` | `0.5rem` | Checkbox uses `rounded-sm` (2px) |
| `#0044CC` | Direct hex (letter-specific blue) | Button bg (existing pattern in LetterCover) |
| `#0033AA` | Direct hex (letter-specific blue hover) | Button hover (existing pattern) |
| `#1A1A1A` | Direct hex (letter-specific dark) | Used throughout LetterCover at various opacities |

**Note on letter-specific colors:** `LetterCover` uses direct hex values (`#0044CC`, `#1A1A1A/XX`) rather than semantic tokens. This is an existing pattern in the w2 letter branch -- all letter components use these hex values consistently. P683 must follow this existing convention for visual consistency. The consent area should use `#1A1A1A/50` for muted text (matching existing stats text) rather than `text-muted-foreground` to stay within the letter's established color system.

#### Visual Hierarchy

1. **Primary focal point:** "Open the Letter" button -- blue CTA, largest interactive element. Eye drawn here first.
2. **Secondary:** Letter metadata (receiver name, sender name) -- serif font, larger text size.
3. **Tertiary:** TOS consent area -- visually subordinate. Smaller text, no visual emphasis. The user should notice it but not feel confronted by it.
4. **Quaternary:** Disclosure line -- smallest text, lowest contrast. Informational, not attention-seeking.

**Hierarchy on Results page:**
1. **Primary:** Completion icon -- visual anchor confirming "done."
2. **Secondary:** "Your responses have been shared" -- the key message.
3. **Tertiary:** "You can close this tab" -- exit instruction, muted.

#### Emotional Register

- **LetterCover consent area:** Calm, transparent, minimal friction. This is a personal letter -- the TOS moment should feel like a brief formality, not a legal gate. No borders, no card wrapping, no visual weight. The checkbox sits quietly between the letter info and the CTA.
- **Results page:** Restful, complete. The "exhale" after a reflective exercise. No urgency, no next-step pressure. The screen says "you're done" and means it.

#### Negative Constraints

- No card/border wrapping around the consent area (would elevate its visual weight above the letter metadata)
- No bold text in checkbox label or disclosure
- No icons in the consent area (checkbox checkmark excepted)
- No animation on consent area appearance (it loads with the page, not after)
- No green on results page (green = success states only; this is completion, not achievement)
- No confetti on results page (differs from sender-side `LetterCompletionSummary` which has confetti)
- No amber/orange/yellow/purple anywhere
- No `window.close()` call on results page

#### Spacing Per Zone

**LetterCover (existing spacing context: `space-y-8` = 32px between siblings):**

| Zone | Spacing | Rationale |
|------|---------|-----------|
| Stats to consent area | `mt-4` (16px, tighter than `space-y-8`) | Consent area subordinate to metadata -- pulled closer to stats, away from button |
| Checkbox row internal | `gap-2` (8px) between checkbox and label | Standard form alignment, matches shadcn patterns |
| Checkbox to disclosure | `mt-1` (4px) | Tight coupling -- disclosure is a footnote to the checkbox |
| Consent area to button | Standard `space-y-8` flow (32px) | Button retains its existing position in the vertical rhythm |
| Error to button | `mt-2` (8px) | Close to button since it explains the button's state |

**Results page:**

| Zone | Spacing | Rationale |
|------|---------|-----------|
| Icon to first text line | `mb-6` (24px) | Spacious, restful |
| Between text lines | `space-y-3` (12px) | Generous line-to-line but not extravagant |
| Container vertical padding | `py-10` (40px) | Matches LetterCover's existing padding |

#### Animation / Transition

| Element | Behavior | Implementation |
|---------|----------|---------------|
| Button enable/disable | Opacity transition | Already handled by `Button` variant (`disabled:opacity-50`) + existing `transition-colors` in `buttonVariants` |
| Checkbox dimming during load | Opacity reduction | `transition-opacity duration-300` (matches existing LetterCover title block pattern) + `opacity-50 pointer-events-none` |
| Tooltip appear/disappear | Zoom + fade | Built into shadcn `TooltipContent` (`animate-in fade-in-0 zoom-in-95`) |
| Error message appear | None | Instant render via conditional. No fade-in -- error messages should be immediately visible |
| Results page | None | Static render. No entrance animation -- the reader has already experienced the full animation budget in the reading flow |

### 5. Extraction Plan

No extraction needed. Analysis:

- **`ConsentNotice` vs new checkbox:** Different patterns (passive text vs active checkbox). No shared abstraction worth extracting -- the two consent UIs serve different legal purposes (transparency notice vs explicit consent action).
- **Link styling:** Both `ConsentNotice` and the new checkbox label use `underline hover:text-foreground` / `hover:text-[#1A1A1A]` for links. This is 2 CSS classes -- extracting to a component would be over-abstraction. If a third consent surface appears (P684), revisit.
- **`LetterRecipientDone` vs `LetterCompletionSummary`:** These are intentionally different. `LetterCompletionSummary` is 265 lines with data fetching, confetti, gap cards, and CTAs. `LetterRecipientDone` is ~30 lines of static text. No shared base.

### 6. Implementation Constraints

- **Hex colors, not semantic tokens:** All letter components in w2 use `#0044CC`, `#1A1A1A`, etc. P683 matches this existing letter convention rather than introducing a mixed approach. A future cleanup pass can normalize all letter components together.
- **Conditional `MobileTooltip` wrap:** Wrap the `Button` in `MobileTooltip` only when disabled (unauthenticated + unchecked). When enabled, render `Button` directly to avoid the `inline-flex` wrapper affecting layout.
- **Checkbox touch target:** The shadcn `Checkbox` is `h-4 w-4` (16px). The flex container holding checkbox + label must use `min-h-[40px] items-center` so the full row meets the 40px touch target requirement.

## Test Coverage Strategy

### Test files to create

| File | Type | Count | Priority |
|------|------|-------|----------|
| `e2e/p683-smoke.spec.ts` | E2E smoke | 4 | P0 — run on every PR |
| `e2e/p683-tos-consent.spec.ts` | E2E flow | 12 | P1 — core acceptance criteria |
| `e2e/integration/p683-edge-function.spec.ts` | Integration | 8 | P1 — edge function contract |
| `e2e/a11y/p683-accessibility.spec.ts` | A11y | 7 | P2 — ARIA contract |
| `features/uat/p683.md` | UAT manual | 10 scenarios | P0 — UAT gate |

Total automated: **31 tests** across 4 files.

### Coverage map

| Done-When criterion | Test file | Test name |
|--------------------|-----------|-----------|
| Unauthenticated user sees TOS checkbox | p683-tos-consent | "unauthenticated user sees TOS checkbox on LetterCover" |
| Button disabled until checkbox checked | p683-tos-consent | "Open Letter button is disabled until checkbox checked" |
| Privacy Policy link visible | p683-tos-consent | "Privacy Policy link visible alongside Terms link" |
| Edge function refuses without termsAccepted | p683-edge-function | "rejects request when termsAccepted is not true" |
| terms_acceptances row created | p683-edge-function | "creates terms_acceptances row with IP hash on account creation" |
| Version passed from frontend | p683-edge-function | "uses termsVersion from request body, not hardcoded" |
| create-and-sign uses current terms version | p683-edge-function | "create-and-sign: rejects stale hardcoded v1.1 version" |
| Authenticated user sees no checkbox | p683-tos-consent | "authenticated user sees no TOS checkbox" |
| Sender preview starts from cover | p683-tos-consent | "sender preview starts from LetterCover (cover state first)" |
| Results page shows completion message | p683-tos-consent | "results page shows completion message after letter" |
| No navigation chrome | p683-smoke | "letter cover page has no nav chrome" |
| ARIA: checkbox label association | p683-accessibility | "TOS checkbox has proper label association" |
| ARIA: disabled button has aria-disabled | p683-accessibility | "disabled Open Letter button has aria-disabled attribute" |
| ARIA: error has role=alert | p683-accessibility | "edge function error shown with role=alert" |

### What is NOT covered by automated tests

| Gap | Why | Mitigation |
|----|-----|-----------|
| IP hash correctness in edge function | Cannot extract server-side IP in test context | Manual verification: check `terms_acceptances.ip_hash` is non-null and 64-char hex |
| Legal adequacy (GDPR Art. 6 basis) | Not a software test | Out of scope — legal review |
| `window.close()` NOT present | Cannot assert absence of a non-fired event | Manual UAT scenario |
| Visual spacing / density intent | Visual regression not in current toolchain | `/verify` skill with screenshot review |
| Production edge function response latency | Prod-only concern | Sentry + Mixpanel post-deploy |
