---
status: all-done
type: change-request
rank: 0.25
changes: p581
delivery_stage: uat
flow: dev
uat_file: features/uat/p651.md
test_files:
  - e2e/integration/p651-letter-onboarding-migration.spec.ts
  - e2e/p651-letter-onboarding.spec.ts
  - e2e/p651-letter-composition.spec.ts
  - e2e/p651-smoke.spec.ts
tags:
  - redesign
  - p581
  - letters
  - onboarding
created_date: 2026-04-04T00:00:00.000Z
locked_at: '2026-04-07T11:19:29.885Z'
---

# P651: Letter 1-to-1 Recipient Onboarding — Reuse Agreement Auth Flow

> **Redesign of:** [P581: Letters with Comprehension Assessment](p581_letters_with_comprehension_assessment.md)
> **What was wrong:** P581's spec prescribed using the P527 `create-and-sign` pattern for 1-to-1 new users
> and P488 magic link for existing users — but the implementation skipped both. Instead, recipients read
> the entire letter anonymously, hit a "Sign in to continue" wall at rating, and face a generic signup
> redirect at completion. The sender name displays as a raw UUID. The email promises "account will be
> created automatically" but the UX doesn't deliver.

## Operating Mode

> This spec is an **incremental correction** to P581, not a greenfield design.
> The predecessor spec is **read-only shipped history** — do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P581 are not up for re-examination.

## Problem Statement

P581's acceptance criteria explicitly require:
- "1-to-1 letter sent via email to new user: 'Open the Letter' on cover = account creation + terms acceptance in one click (D48, Agreement P527 pattern). Receiver is registered before reading starts."
- "1-to-1 letter sent via email to existing user: reuse Agreement magic link pattern (P488)"

None of this was implemented. The current 1-to-1 flow treats new and existing users identically — anonymous token-based access with a wall at rating. This breaks three acceptance criteria and contradicts the sealed-bid ritual design (recipient identity matters for data linking).

The agreement invite flow (P527) solved this same problem: `create-and-sign` edge function creates user + profile + accepts terms atomically. The letter flow should reuse it.

## Jobs To Be Done

- **Preserved from P581:** All 6 jobs (workshop reflection, partner pre-work, focused reading, metacognitive calibration, false premise filing, completion triage)
- **Corrected:** Job 3 (focused reading) — the ritual is broken when the recipient hits an auth wall mid-flow. Registration should happen at the door, not mid-reading.
- **New:** None — this correction restores the spec's original intent.

## Current State

1-to-1 letter recipient flow today:

1. Recipient gets email → clicks link → lands on `/letter/:deliveryId?token=...`
2. Cover page shows: "A CLARITY LETTER / For [email] / From [UUID]" — sender name is raw UUID
3. "Open the Letter" button → enters reading flow (anonymous, token-based)
4. Reads stories, can position on points anonymously via token-based RPCs
5. At "rate" phase → hits "Sign in to continue" wall (cannot rate without auth)
6. After reading all stories → completion summary with "Save & Sign Up" gate
7. User enters email → generic redirect to `/signup?email=...&redirect=...`
8. Full signup flow → email verification → AuthCallbackPage persists letter data

**Before (current):**
```
┌─────────────────────────────────┐
│        A CLARITY LETTER         │
│                                 │
│    For recipient@example.com    │
│    From 0e5ae4a4-ca7e-...       │  ← UUID, not name
│                                 │
│    5 stories · ~10 minutes      │
│                                 │
│    [  Open the Letter  ]        │  ← No auth, anonymous entry
│                                 │
│    By opening, you accept ToS   │
└─────────────────────────────────┘
         ↓ (anonymous reading)
┌─────────────────────────────────┐
│  Story 1 of 5                   │
│  ── read ── position ──         │
│                                 │
│  "Sign in to continue"          │  ← Wall at rating
└─────────────────────────────────┘
         ↓ (after completion)
┌─────────────────────────────────┐
│  Save your results?             │
│  [email input] [Save & Sign Up] │  ← Manual, generic signup
└─────────────────────────────────┘
```

## Root Cause

P581 implementation prioritized the anonymous 1-to-many flow and applied the same architecture to 1-to-1, despite the spec explicitly differentiating them. The agreement invite's multi-pathway auth (P488 magic link for existing users, P527 `create-and-sign` for new users) was not ported to the letter flow.

Code paths:
- `letter-reading-page.tsx:71-86` — token path always anonymous, no auth gate for 1-to-1
- `letter-reading-page.tsx:96` — `setSenderName(readData.letter.sender_id)` — sets UUID as name
- `letter-completion-summary.tsx` — generic signup redirect, not `create-and-sign`
- `send-letter-emails/index.ts` — email copy says "automatically" but flow doesn't match

## Redesign

For **1-to-1 letters only** (1-to-many anonymous flow is unchanged):

**Cover page:** Resolve sender profile name from `sender_id` UUID. Show human name, not UUID.

**Auth at the door (before reading starts):**
- Sender provides recipient's full name at letter composition time (stored in `letter_deliveries.receiver_name`)
- One "Open the Letter" button for all 1-to-1 recipients — calls `create-and-open-letter` edge function which reads name from DB and routes internally (new user → create account + profile, existing user → link delivery + generate session)
- After auth → reading flow begins with full identity (all responses linked to profile)
- Same pattern as agreement invite: `create-and-sign` creates user atomically, recipient never sees a form

**After (redesign) — both flows side by side:**

**1-to-1 flow** (sender provided recipient name + email):
```
┌─────────────────────────────────┐
│        A CLARITY LETTER         │
│                                 │
│    For Slava                    │  ← First name from receiver_name
│    From Jan Kovač               │  ← Resolved from profiles
│                                 │
│    5 stories · ~10 minutes      │
│                                 │
│    [  Open the Letter  ]        │  ← Calls create-and-open-letter
│                                 │     (creates account or links existing)
│    By opening, you accept ToS   │
└─────────────────────────────────┘
         ↓ instant auth (verifyOtp with hashedToken)
         ↓ recipient never sees a form
┌─────────────────────────────────┐
│  Story 1 of 5                   │
│  ── read ── position ── rate ── │  ← Authenticated, no walls
│  ── gap reveal ── next ──       │
└─────────────────────────────────┘
         ↓ (already authenticated)
┌─────────────────────────────────┐
│  Completion Summary             │
│  Gaps · Positions · CTA         │  ← No signup gate
└─────────────────────────────────┘
```

**1-to-many flow** (unchanged — anonymous entry, signup at end):
```
┌─────────────────────────────────┐
│        A CLARITY LETTER         │
│                                 │
│    For you                      │  ← No receiver_name (1-to-many)
│    From Jan Kovač               │  ← Resolved from profiles
│                                 │
│    5 stories · ~10 minutes      │
│                                 │
│    [  Open the Letter  ]        │  ← No auth, no edge function
│                                 │     enters reading anonymously
│                                 │  ← No ToS line (anonymous)
└─────────────────────────────────┘
         ↓ anonymous reading (no auth)
┌─────────────────────────────────┐
│  Story 1 of 5                   │
│  ── read ── position ── rate ── │  ← Anonymous, may hit
│  ── gap reveal ── next ──       │     "Sign in" wall at rating
└─────────────────────────────────┘
         ↓ (anonymous)
┌─────────────────────────────────┐
│  Completion Summary             │
│  "Save your results?"           │  ← Signup gate appears
│  [ Create Account ] or dismiss  │     (only for anonymous readers)
└─────────────────────────────────┘
```

**Key difference:** Same button label, fundamentally different auth behavior. 1-to-1 authenticates at the door (recipient never fills a form). 1-to-many enters anonymously with optional signup at completion.

## Predecessor Sections Superseded

| Section | P581 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| 1-to-1 new user AC | "Open the Letter on cover = account creation + terms acceptance in one click (D48, P527 pattern)" | Was NOT implemented; this CR implements it | AC #1-3 below |
| 1-to-1 existing user AC | "Reuse Agreement magic link pattern (P488)" | Was NOT implemented | AC #4 below |
| Cover sender name | Spec used human names in mockups ("Jan Kovač") | Implementation shows UUID | AC #5 below |
| Email copy | "account will be created automatically" | Copy doesn't match UX | AC #6 below |

Note: Most P581 ACs were NOT superseded — they were never implemented for 1-to-1. This CR implements the spec's original intent.

## Requirements

1. **Sender name resolution:** `get_letter_for_reading` RPC must return sender's display name (join to profiles table), not raw UUID
2. **Receiver name at composition:** Letter composition wizard collects recipient's full name alongside email. Stored in `letter_deliveries.receiver_name`. First name used in email greeting and cover page personalization.
3. **One-button auth at the door:** Cover page shows single "Open the Letter" button for 1-to-1. Calls `create-and-open-letter` edge function which reads `receiver_name` from DB, detects new vs existing user internally, returns `hashedToken` for instant `verifyOtp`. No client-side user detection needed.
4. **Post-auth redirect:** After `verifyOtp`, letter page reloads with authenticated session — reading flow starts immediately. Fallback: if `verifyOtp` fails, fall back to `signInWithOtp` with email redirect.
5. **Email copy fix:** Update `send-letter-emails` to say "you'll be able to create an account when you open the letter" (matches UX). Use `receiver_name` first name for email greeting.
6. **Remove completion signup gate for 1-to-1:** When authenticated (which 1-to-1 always is after this change), skip the "Save your results?" gate entirely

## What Stays the Same

- 1-to-many anonymous flow (unchanged)
- Letter reading state machine (phases, sealed-bid, gap reveal)
- Rating mechanics and `RatingButtons` component
- Position mechanics and token-based RPCs
- Completion summary layout
- Letter composition wizard (except: adding `receiver_name` text input to recipient entry)
- All integrity constraints (sealed-bid, committed ratings)

## Surfaces in Scope

**In scope:**
- `src/app/pages/letter-reading-page.tsx` — auth gate on cover for 1-to-1
- `src/app/components/letters/letter-cover.tsx` — single-button auth + loading state for 1-to-1, display `receiver_name`
- `src/app/data/letters-service.ts` — sender name resolution, bug fixes
- `supabase/migrations/YYYYMMDDHHMMSS_p651_letter_onboarding_fixes.sql` — all RPC fixes + sender name join + receiver_name column + constraints
- `supabase/functions/send-letter-emails/index.ts` — email copy fix + `receiver_name` greeting
- `supabase/functions/create-and-open-letter/index.ts` — read `receiver_name` from DB, CORS fix, self-healing
- `src/app/components/letters/letter-completion-summary.tsx` — skip signup gate when authenticated
- `src/app/pages/letter-compose-page.tsx` — add `receiver_name` input in `ModeStep`, update `handleSeal`, update `SealStep` display

**Out of scope:**
- 1-to-many letter flow (anonymous access preserved)
- `/live` session integration
- Completion summary visual layout
- Point ordering logic (D36)
- `create-and-sign` edge function itself (reuse as-is, letter uses `create-and-open-letter`)

## Acceptance Criteria

- [ ] Letter composition: sender enters recipient's full name alongside email (stored in `letter_deliveries.receiver_name`)
- [ ] 1-to-1 cover: single "Open the Letter" button → calls `create-and-open-letter` → account created (new) or linked (existing) → reading begins authenticated
- [ ] 1-to-1: profile created before reading starts (D48), terms accepted as part of "Open the Letter" action
- [ ] Cover shows sender display name (from profiles) and receiver first name (from `receiver_name`), not UUID or email
- [ ] Email greeting uses receiver's first name (from `receiver_name`)
- [ ] Email copy says "you'll be able to create an account when you open the letter" (not "automatically")
- [ ] 1-to-1 authenticated reader can rate without hitting "Sign in to continue" wall
- [ ] 1-to-1 completion summary skips "Save your results?" gate (already authenticated)
- [ ] 1-to-many flow is unchanged (anonymous access, signup at end)
- [ ] All existing P642 E2E tests still pass
- [ ] Regression: sealed-bid integrity preserved (rating before prediction reveal)

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [WARN] Bugs #1-2 are latent (authenticated path dead code for 1-to-1) — but P651 activates authenticated path | Bundle fixes in P651 migration | Bugs become live the moment 1-to-1 uses authenticated RPCs. Fix now, not later. |
| 2 | /challenge-prd | [WARN] Edge case: `auth.users` exists without profile (e.g., abandoned signup) — `create-and-open-letter` calls `createUser`, fails | Add self-healing: catch `createUser` failure → fall back to `signInWithOtp` (same as agreement flow in `accept-agreement-page.tsx`) | Proven pattern from P527 agreement flow. Edge case is rare but real. |
| 3 | /challenge-prd | [WARN] AC contradiction: "No new tables or columns needed" vs `receiver_name` requirement | Added `receiver_name TEXT` column to `letter_deliveries` in migration scope, removed "no schema changes" from What Stays the Same | Sender provides name at composition — must be stored. Column is nullable, no backfill needed. |

## Technical Architecture

### Technical Analysis

#### Reuse Inventory

**Edge Functions:**
- `supabase/functions/create-and-open-letter/index.ts` — **Already exists.** P581 cloned `create-and-sign` for letters. Accepts `{ token }`, validates via `get_letter_by_token`, creates user + profile + links delivery + generates session. Handles both new and existing users. Uses email local part as name — needs update to read `receiver_name` from `letter_deliveries` instead.
- `supabase/functions/create-and-sign/index.ts` — Agreement version. Accepts `{ agreementId, token, partnerName }`. Email-pinning pattern (derives email from DB, never from client). Returns `hashedToken` for instant `verifyOtp`.
- `supabase/functions/send-letter-emails/index.ts` — Sends invitation emails via Mailgun. Email copy line 209: "an account will be created for you automatically" — needs update.

**Auth Patterns (from Agreement flow):**
- `src/app/pages/accept-agreement-page.tsx` — Full multi-pathway auth: `handleDirectSign()` calls `create-and-sign` edge function for new users, `handleExistingUserSignIn()` uses `signInWithOtp({ shouldCreateUser: false })` for existing users. Both exchange `hashedToken` via `supabase.auth.verifyOtp()`. Pattern to reuse directly.
- `src/auth/AuthCallbackPage.tsx` — Handles magic link return, redirect via `?redirect=` param.
- `src/app/pages/agreement-email-confirmation-page.tsx` — "Check your email" interstitial.

**Letter Components:**
- `src/app/pages/letter-reading-page.tsx` — Main page. Token path (line 71-97) always anonymous. Sets `senderName` to `readData.letter.sender_id` (raw UUID, bug #5). Claims delivery if authenticated (line 89-91).
- `src/app/components/letters/letter-cover.tsx` — Simple cover, no auth logic. Takes `senderName`, `receiverName`, `onOpen` callback. Must be extended with multi-pathway auth UI for 1-to-1.
- `src/app/components/letters/letter-story-reader.tsx` — Line 161-172: auth wall at `rate` phase when `!isAuthenticated`. After P651, 1-to-1 is always authenticated, so this gate fires only for 1-to-many (correct).
- `src/app/components/letters/letter-completion-summary.tsx` — Registration gate already scoped to `mode === 'one-to-many' && !isAuthenticated`. **Already correct for P651.**

**Hooks:**
- `src/app/hooks/useLetterReadingState.ts` — State machine for reading flow. `nextStory()` (line 296-310) calls `updateDeliveryStatus(deliveryId, 'completed')` directly (not token-based) — bug #4. `submitStoryRating()` dispatches to token vs auth path correctly.

**RPCs (SECURITY DEFINER):**
- `get_letter_for_reading(p_token)` — Returns letter + snapshots + delivery. Does NOT join to `profiles` for sender name — bug #5.
- `get_letter_by_token(p_token)` — Token validation. Returns `receiver_email` in response — bug #9.
- `reveal_prediction_by_token(p_token, p_story_id)` — P648 fix addressed `session_id` check but prediction lookup still uses `lp.letter_id` (shared across deliveries) without delivery scoping — bug #3.
- `submit_rating_by_token(p_token, p_story_id, p_rating)` — Inserts into `story_verifications` with `session_id = NULL`. The authenticated `submitRating()` in `letters-service.ts` passes `deliveryId` as `session_id` — bug #2. Also inserts `accuracy_achieved: false` — bug #1 (GENERATED column).
- `update_delivery_status_by_token(p_token, p_status)` — No status regression guard — bug #10.
- `seal_and_send_letter(p_letter_id, p_predictions, p_deliveries)` — No duplicate delivery guard (same `receiver_email` can be added twice) — bug #7.
- `claim_letter_delivery(p_token)` — Sets `receiver_profile_id` + opens delivery. Already handles idempotency.
- `_is_letter_sender(p_letter_id, p_user_id)` / `_is_letter_receiver(p_letter_id, p_user_id)` — SECURITY DEFINER helpers. No `REVOKE FROM public` — bug #6.

**Schema (from migrations):**
- `story_verifications.session_id` — FK to `clarity_sessions(id)`, nullable. The authenticated `submitRating()` in `letters-service.ts` writes `deliveryId` here — FK violation since delivery IDs don't exist in `clarity_sessions` — bug #2.
- `story_verifications.accuracy_achieved` — GENERATED ALWAYS AS `(speaker_rating >= 8) STORED`. Cannot be set in INSERT — bug #1.
- `letter_deliveries.status` — CHECK constraint: `('sent', 'opened', 'in_progress', 'completed')`. No ordered progression enforced at DB level — bug #10.

### Architecture Decisions

**Decision 1: Extend `create-and-open-letter` to read `receiver_name` from DB**

Chosen: **Edge function reads `receiver_name` from `letter_deliveries` instead of accepting a client param.**

Rationale: The sender provides the recipient's name at composition time (stored in `letter_deliveries.receiver_name`). The edge function already validates the token and fetches the delivery — it reads `receiver_name` from the same row. No client param needed, no user-controllable name injection. This is the email-pinning pattern from `create-and-sign` applied to names too.

Trade-off: Name cannot be corrected by recipient at open time. Acceptable — user can change name later in settings.

Alternative rejected: Accept `recipientName` from client. Rejected: allows name injection, inconsistent with email-pinning pattern.

**Decision 2: No client-side user detection — edge function routes internally**

Chosen: **Single "Open the Letter" button, `create-and-open-letter` edge function handles new vs existing user server-side.**

Rationale: The edge function already checks for existing users (profiles lookup). Moving routing to the server eliminates the need for a `receiver_has_account` field in the RPC response, avoids leaking account existence to the client, and removes the two-pathway cover UI entirely. Same UX for all recipients — one button, instant auth.

Alternative rejected: Client-side detection via RPC response + two-pathway UI. Rejected: unnecessary complexity, info disclosure (account existence), and worse UX (user must choose their own path).

**Decision 3: Sender name resolution**

Chosen: **Add JOIN to `profiles` table inside `get_letter_for_reading` RPC.**

Rationale: Single-query change in the SECURITY DEFINER RPC. Returns `sender_display_name` alongside existing fields. No new RPC needed.

Trade-off: None meaningful — a JOIN on a PK lookup adds negligible cost.

**Decision 4: Fix all 10 bugs in a single migration**

Chosen: **One migration file for all RPC fixes.**

Rationale: All 10 bugs are in SECURITY DEFINER RPCs and one client-side service file. A single migration replaces the affected RPCs atomically. See Build Sequence steps 1-8 for concrete fix implementations per bug.

**Decision 5: Single edge function call for all 1-to-1 recipients**

Chosen: **`create-and-open-letter` for both new and existing users.** Edge function detects new vs existing server-side, returns `hashedToken`. Client calls `verifyOtp` — instant auth, no email round-trip.

Fallback: If `verifyOtp` fails, fall back to `signInWithOtp` with email redirect (same as agreement flow).

**Decision 6: Cover page UI for 1-to-1 vs 1-to-many**

Chosen: **Same "Open the Letter" button for both modes, different `onOpen` handler.**

Rationale: For `one-to-one`: button calls `create-and-open-letter` edge function → `verifyOtp` → authenticated reading. For `one-to-many`: button enters anonymous reading (current behavior). No visual difference on the cover — the button text is the same. The cover component needs only one new prop: `isAuthenticating` (loading state while edge function + verifyOtp complete).

Alternative rejected: Two-pathway UI with "Sign in with magic link" and name input form. Rejected: sender provides name at composition time, so no form needed. Server handles new vs existing user detection — client just sends the token.

### Security Review

**CRITICAL findings (all addressed in Build Sequence):**

- ⚠️ **Bug #6:** `_is_letter_sender`/`_is_letter_receiver` — no REVOKE FROM PUBLIC. Anon can probe sender/receiver status. **Fix:** REVOKE + re-GRANT to authenticated only.
- ⚠️ **Bug #10:** `update_delivery_status_by_token` allows status regression (completed → sent). **Fix:** Forward-only transition check.
- ⚠️ **Bug #7:** `seal_and_send_letter` ��� duplicate emails create duplicate deliveries. **Fix:** UNIQUE constraint + ON CONFLICT DO NOTHING.
- ⚠️ **Bug #9:** `receiver_email` leaked in RPC responses to any token holder. **Fix:** Remove from responses.
- ⚠️ **Bug #1:** `submitRating` writes to GENERATED column `accuracy_achieved`. **Fix:** Remove from INSERT.
- ⚠️ **Bug #2:** `submitRating` passes `deliveryId` as `session_id` (FK violation). **Fix:** Set null.
- ⚠️ **Bug #3:** `reveal_prediction_by_token` sealed-bid not scoped to delivery. **Fix:** Scope via `letter_story_snapshots` JOIN (option b, no schema change).

**Other findings:**

- ⚠️ `letter_deliveries` UPDATE policy overly permissive (receiver can update any column). Low risk — status transitions go through RPCs.
- ⚠️ `submit_rating_by_token` sentinel UUID for anon: P651 makes 1-to-1 always authenticated. 1-to-many sentinel is acceptable.
- ⚠️ `send-letter-emails` + `create-and-open-letter` have `Access-Control-Allow-Origin: '*'` — fix to `ALLOWED_ORIGIN`.
- ⚠️ HTML-escape `senderName`/`receiverName` in email template (defense-in-depth).

### Implementation Approach

#### Build Sequence

1. **Migration: Fix all 10 bugs + add sender name join + add `receiver_name` column + add delivery duplicate constraint**
   - Single migration file: `YYYYMMDDHHMMSS_p651_letter_onboarding_fixes.sql`
   - Add `receiver_name TEXT` column to `letter_deliveries` (nullable — backfill not needed, only new letters use it)
   - Replace `get_letter_for_reading` (add sender name join + `receiver_name` from delivery, remove `receiver_email` from delivery object)
   - Replace `reveal_prediction_by_token` (scope prediction to delivery)
   - Replace `submit_rating_by_token` (already correct — verify no `accuracy_achieved`)
   - Replace `update_delivery_status_by_token` (add status ordering guard)
   - Replace `seal_and_send_letter` (add duplicate delivery guard via UNIQUE constraint, accept `receiver_name` in delivery params)
   - Add `REVOKE ALL ON FUNCTION _is_letter_sender FROM public` + `_is_letter_receiver`
   - Remove `receiver_email` from `get_letter_by_token` response
   - Add `UNIQUE (letter_id, receiver_email) WHERE receiver_email IS NOT NULL` on `letter_deliveries`
   - Add `get_completion_summary_by_delivery(p_delivery_id UUID)` RPC — SECURITY DEFINER, joins `letter_deliveries` → `letter_story_snapshots` → `story_verifications` (by `story_id + listener_id + source = 'letter'`) to return completion data for authenticated user. Replaces broken client-side `.eq('session_id', deliveryId)` query.

2. **Edge function: Update `create-and-open-letter` to read `receiver_name` from DB**
   - Read `receiver_name` from `letter_deliveries` row (already fetched during token validation)
   - Use `receiver_name` (trimmed, max 100 chars) as profile name instead of email local part when available
   - Fix CORS: replace `'Access-Control-Allow-Origin': '*'` with `ALLOWED_ORIGIN` (match `create-and-sign` pattern)
   - Add error catch for `auth.users` exists without profile edge case (same self-healing as agreement flow)
   - No client params needed — name comes from DB (email-pinning pattern applied to names)

3. **Client data layer: Fix `letters-service.ts`**
   - `submitRating()`: remove `accuracy_achieved` from insert, set `session_id: null`
   - `getCompletionSummary()`: create new `get_completion_summary_by_delivery` RPC (in migration) that joins `letter_story_snapshots` → `story_verifications` by `story_id + listener_id + source = 'letter'` for the delivery's stories. Client calls this RPC instead of the broken `.eq('session_id', deliveryId)` query.
   - `sealLetter()`: update delivery type from `{ receiver_email: string }` to `{ receiver_email: string, receiver_name: string }` to pass name through to RPC
   - Add `sender_display_name` and `receiver_name` to `LetterReadingData` type
   - Update `getLetterForReadingByToken` return to use new RPC fields

4. **Client hook: Fix `useLetterReadingState.ts`**
   - `nextStory()`: call `updateDeliveryStatusByToken(token, status)` when token is present

5. **Cover page: Single-button auth for 1-to-1**
   - `letter-cover.tsx`: same "Open the Letter" button, add `isAuthenticating` loading state prop
   - `letter-reading-page.tsx`: 1-to-1 `onOpen` handler calls `create-and-open-letter` edge function → `verifyOtp` → reload authenticated. Fallback: `signInWithOtp` with email redirect.
   - Display `receiver_name` first name on cover (from `get_letter_for_reading` response)

6. **Email copy + CORS: Update `send-letter-emails/index.ts`**
   - Use `receiver_name` first name for email greeting (e.g., "Hi Slava," instead of generic)
   - Change line 209 from "an account will be created for you automatically" to "you'll be able to create an account when you open the letter"
   - Fix CORS: replace `'Access-Control-Allow-Origin': '*'` with `ALLOWED_ORIGIN` (match `create-and-sign` pattern)
   - HTML-escape `senderName` and `receiverName` in email template (defense-in-depth against HTML injection via profile/user names)

7. **Letter composition: Add `receiver_name` input to `letter-compose-page.tsx`**
   - `ModeStep`: add new props `receiverName: string`, `onReceiverNameChange: (name: string) => void`. Render `Label` + `Input` (id="receiver-name", placeholder="e.g. Slava Ladischenski", required) below email input inside `mode === 'one-to-one'` block. Update `canProceed` to require both email and name.
   - Parent page: add `useState<string>('')` for `receiverName`, pass to `ModeStep` and through to `handleSeal`.
   - `handleSeal`: update `deliveries` array from `{ receiver_email: email }` to `{ receiver_email: email, receiver_name: receiverName }`.
   - `SealStep`: display recipients as "Name (email)" instead of email-only.

8. **Reading page: Wire sender name + receiver name from RPC response**
   - `letter-reading-page.tsx` line 96: use `readData.letter.sender_display_name` instead of `readData.letter.sender_id`
   - Pass `receiver_name` to cover component for personalized greeting

#### Files to Create

- `supabase/migrations/YYYYMMDDHHMMSS_p651_letter_onboarding_fixes.sql` — Single migration with all RPC fixes + schema constraint

#### Files to Modify

- `supabase/functions/create-and-open-letter/index.ts` — Read `receiver_name` from DB, fix CORS, add self-healing for auth.users edge case
- `supabase/functions/send-letter-emails/index.ts` — Email copy fix + `receiver_name` greeting personalization
- `src/app/data/letters-service.ts` — Fix `submitRating` (bugs #1, #2), fix `getCompletionSummary` (bug #8), update types for sender name
- `src/app/hooks/useLetterReadingState.ts` — Fix `nextStory` to use token-based status update (bug #4)
- `src/app/pages/letter-reading-page.tsx` — Add auth flow for 1-to-1 cover, wire sender name from RPC
- `src/app/components/letters/letter-cover.tsx` — Add `isAuthenticating` loading state for 1-to-1, display `receiver_name` first name
- `src/app/pages/letter-compose-page.tsx` — Add `receiverName` state, `receiver_name` input in `ModeStep`, update `handleSeal` to pass name, update `SealStep` display
- `src/app/types/index.ts` (or equivalent) — Add `sender_display_name` and `receiver_name` to `LetterReadingData` type

## UX Design

This is an incremental correction. The reading flow, completion summary layout, sealed-bid mechanics, and 1-to-many anonymous flow are all unchanged. This section covers only the delta surfaces.

### User Flow

#### 1. Letter Composition — Adding Recipient with Name

When the sender selects "Specific people" mode, the recipient entry area shows two fields per recipient:

- **Email** (existing): text input, comma-separated for multiple recipients
- **Name** (new): single text input labeled "Recipient's full name" with placeholder "e.g. Slava Ladischenski"

The name field appears directly below the email input, inside the same card, when `one-to-one` mode is selected. For multiple recipients (comma-separated emails), a single name field is shown per email — but in the initial implementation, we support one recipient with one name field. If multiple emails are entered, only one name applies (the first recipient). This matches the current 1-to-1 usage pattern (sender writes to one specific person).

The name field is **required before proceeding** (the "Next" button stays disabled until both email and name are filled). Helper text below the name input: "Used in the email greeting and on the letter cover."

The seal ceremony summary displays the recipient as "Name (email)" instead of just email.

#### 2. Email Invitation — What Recipient Sees

The invitation email greeting changes from generic ("Hello,") to personalized: "Hi Slava," using the first name extracted from `receiver_name`. The rest of the email body is unchanged except for the copy correction: the line about account creation changes from "an account will be created for you automatically" to "you'll be able to create an account when you open the letter."

Subject line, CTA button, and footer are unchanged.

#### 3. Cover Page (1-to-1) — Open, Auth, Reading

**Display changes:**
- "For Slava" — shows first name from `receiver_name` (first word before space), not email or "you"
- "From Jan Kovac" — shows sender's display name resolved from profiles, not UUID

**Interaction — "Open the Letter" button:**

1. Recipient taps "Open the Letter"
2. Button enters loading state: text changes to "Opening..." with a spinner icon replacing the static text. Button becomes disabled. The rest of the cover (name, stats, ToS link) remains visible but dimmed slightly to draw focus to the loading indicator.
3. Edge function runs server-side (1-3 seconds): creates account if new, links delivery if existing, returns auth token
4. Client calls `verifyOtp` with the returned token — instant session established
5. Cover transitions to the reading flow (same as current behavior after "Open the Letter")

**Loading state details:**
- Duration: typically 1-3 seconds
- Visual: the button shows a spinner + "Opening..." text
- The cover page content stays visible (no full-page loader) — the recipient should feel the letter is still "there," just being unlocked
- If the process takes longer than 5 seconds, show a subtle secondary message below the button: "Setting up your access..."

**Fallback — verifyOtp fails:**
- If `verifyOtp` returns an error, the button returns to its default state
- A toast notification appears: "We couldn't sign you in automatically. Check your email for a sign-in link."
- Simultaneously, the system sends a magic link email via `signInWithOtp`
- The recipient opens their email, clicks the magic link, and returns to the letter page — now authenticated, the cover loads directly into the reading flow
- No additional UI is needed on the cover page for this fallback — the toast + email is sufficient

#### 4. Cover Page (1-to-many) — Unchanged

Anonymous entry. Same button, same behavior. No auth, no loading state. The "For" line shows "For you" or the reader's display name if authenticated. No ToS acceptance line (only shown for 1-to-1).

#### 5. Reading Flow — Unchanged

After auth, the reading flow is identical to the current implementation. The only behavioral difference: 1-to-1 recipients are now always authenticated, so the "Sign in to continue" wall at the rating phase never fires. The wall remains in place for 1-to-many anonymous readers (correct behavior).

#### 6. Completion — Unchanged

The completion summary layout is identical. The "Save your results?" signup gate already only shows for `mode === 'one-to-many' && !isAuthenticated`, which is already correct. For 1-to-1 (always authenticated after this change), the gate never appears.

### Edge Cases

**Edge function returns error (non-auth):**
Button returns to default state. Toast: "Something went wrong. Please try again." Recipient can tap the button again (idempotent). If it fails a second time, toast includes: "If this keeps happening, contact the person who sent you this letter."

**verifyOtp fails (auth token expired or invalid):**
Covered in the fallback flow above. Toast + magic link email. The recipient leaves the page, opens email, clicks link, returns authenticated.

**auth.users exists without profile (abandoned signup):**
The edge function handles this server-side with self-healing: it detects the existing auth.users record, creates the missing profile, and proceeds normally. No UX impact — the recipient sees the same loading state and enters reading.

**Recipient already opened letter (idempotent re-entry):**
If the recipient returns to the letter URL after already opening it, the cover page loads with their existing authenticated session. The "Open the Letter" button transitions directly to the reading flow (or completion, if they already finished). The edge function is not called again — the existing session is sufficient.

**Sender didn't enter receiver_name (null):**
Fallback: the cover shows the email local part as the display name (e.g., "For slava" from "slava@example.com"). The email greeting uses the same fallback. This only applies to letters created before this feature ships — the name field is required going forward.

**Very long receiver_name:**
The name is displayed as-is on the cover. The serif font at `text-2xl`/`text-3xl` wraps naturally on narrow screens. No truncation — if someone enters a very long name, it wraps to multiple lines. The edge function trims to 100 characters server-side.

**Network timeout during auth:**
If the edge function call times out (no response within 10 seconds), the button returns to default state. Toast: "The connection timed out. Please check your internet and try again."

### Accessibility

**Button keyboard accessible:** The "Open the Letter" button is a standard `<Button>` element, already keyboard-focusable and activatable with Enter/Space. No change needed.

**Loading state announced to screen reader:** When the button enters the "Opening..." state, it should have `aria-busy="true"` and `aria-label="Opening the letter, please wait"`. The spinner is decorative (`aria-hidden="true"`). When auth completes and the view transitions to reading, the first story heading receives focus automatically.

**Focus management after auth:** After the cover-to-reading transition, focus moves to the first story element (the "Story 1 of N" heading or the story content area). This matches the existing behavior when the button is tapped in the non-auth flow.

**Error toast accessible:** Toast notifications from sonner are already announced via `aria-live` regions. No change needed.

### Responsive Design

**Cover page on mobile:** The existing cover layout is already centered and responsive (`min-h-[60vh]`, centered flex column, `text-center`). The "For [Name]" and "From [Name]" text wraps naturally. The button has `min-h-[48px]` which exceeds the 44px touch target minimum. No layout changes needed.

**Name input in composition wizard on mobile:** The name field stacks below the email field in the same `space-y-2` container. On narrow screens, both fields fill the full width. The name input uses the same `Input` component and sizing as the email field for visual consistency. No horizontal layout — everything stacks vertically.

## Component Strategy

### Step 1 — Component Inventory

**Design system primitives (`src/components/ui/`):**
`Button` (cva variants: default/destructive/outline/secondary/ghost/link; sizes: default/sm/lg/icon) · `Input` (bare forwardRef, no built-in label) · `Label` (Radix LabelPrimitive) · `Dialog` + `DialogContent/Header/Title/Description` · `Drawer` · `Accordion` · `Checkbox` · `Tooltip` · `Popover` · `DropdownMenu` · `Slider` · `Textarea` · `ScrollArea` · `ClarityLoader` / `ClarityPageLoader` (branded spinner, anti-flash) · `GravatarAvatar` · `PersonAvatar` · `ClarityLogo` · `EarBadge` · `UnderstoodBadge` · `Sonner` (toast)

**Letter feature components (`src/app/components/letters/`):**
`LetterCover` · `LetterStoryReader` · `LetterProgressBar` · `LetterCompletionSummary` · `LetterPointEngagement` · `LetterGapReveal` · `LettersSection`

**Layout components (`src/app/components/layout/`):**
`CertificatePageShell` · `FocusHeader` · `BottomNav` · `SimpleNavigation` · `LegalFooter` · `ClarityFooter`

**Composition wizard (inline in `letter-compose-page.tsx`):**
`ModeStep` · `PredictionsStep` · `PreviewStep` · `SealStep` — all local function components, not exported

### Step 2 — Component Map

| UI Element | Location | Classification | Component | Notes |
|---|---|---|---|---|
| "For [Name]" display | Cover | **Reuse** | Existing `<h1>` in `LetterCover` | Already renders `receiverName` prop. Just pass first name from `receiver_name` instead of email. |
| "From [Name]" display | Cover | **Reuse** | Existing `<p>` in `LetterCover` | Already renders `senderName` prop. Pass resolved profile name instead of UUID. |
| "Open the Letter" button | Cover | **Extend** | `LetterCover` Button | Add `isAuthenticating` prop. When true: show `Loader2Icon` spinner + "Opening..." text, `disabled`, `aria-busy="true"`. |
| "Setting up your access..." text | Cover | **New (inline)** | Conditional `<p>` inside `LetterCover` | Appears after 5s timeout. No new component — a `useState` timer + conditional text line below the button. |
| Cover dimming during auth | Cover | **Extend** | `LetterCover` wrapper div | Add `opacity-50 pointer-events-none transition-opacity` to the content `div.space-y-2` and stats `p` when `isAuthenticating`. |
| ToS text | Cover | **Reuse** | Already conditional on `mode === 'one-to-one'` | No change. |
| Stats line | Cover | **Reuse** | Existing `<p>` with story count + minutes | No change. |
| Recipient name input | Compose wizard | **Extend** | `ModeStep` in `letter-compose-page.tsx` | Add `Input` + `Label` below email input, inside the `mode === 'one-to-one'` conditional block. |
| Helper text below name input | Compose wizard | **Reuse** | Same pattern as `<p className="text-xs text-muted-foreground">` already used for email helper | Standard helper text. |
| Seal summary "Name (email)" | Compose wizard | **Extend** | `SealStep` recipients display | Change `{email}` to `{receiverName} ({email})` in the recipients list. |
| Full-page loader | Reading page | **Reuse** | `ClarityPageLoader` | Already used during initial data load. No change. |
| Spinner icon in button | Cover button | **Reuse** | `Loader2Icon` from `lucide-react` | Same pattern as `accept-agreement-page.tsx` lines 551, 570, 609. Already in project. |
| Toast notifications | Cover fallback | **Reuse** | `toast()` from sonner | Already imported in `letter-reading-page.tsx`. |
| Email template greeting | Server-side | N/A | No component | String interpolation in edge function. |

### Step 3 — Composition Tree

#### Cover Page (1-to-1, with auth loading state)

```
LetterReadingPage
  CertificatePageShell
    FocusHeader
    {viewState === 'cover' &&
      LetterCover
        props: senderName, receiverName, storyCount, estimatedMinutes,
               mode, onOpen, isAuthenticating (NEW), authDelayed (NEW)
        div.flex.flex-col.items-center  (root)
          div (envelope icon)                         — unchanged
          div.space-y-2 {dimmed when isAuthenticating} — EXTEND
            p "A Clarity Letter"                      — unchanged
            h1 "For {firstName}"                      — data change only
            p "From {senderDisplayName}"              — data change only
          p (stats line) {dimmed when isAuthenticating}— EXTEND
          Button "Open the Letter"                    — EXTEND
            {isAuthenticating ? <Loader2Icon spin/> + "Opening..." : "Open the Letter"}
            aria-busy={isAuthenticating}
          {authDelayed &&
            p "Setting up your access..."             — NEW (inline <p>)
          }
          p (ToS link)                                — unchanged
    }
    {viewState === 'reading' && LetterStoryReader ... }
    {viewState === 'complete' && LetterCompletionSummary ... }
```

#### Composition Wizard — Recipient Entry (ModeStep)

```
ModeStep
  div.space-y-6
    h2 "Who is this letter for?"
    div.grid (mode cards)                             — unchanged
    {mode === 'one-to-one' &&
      div.space-y-2
        label + Input (email)                         — unchanged
        p (email helper text)                         — unchanged
        label + Input (receiver name)                 — NEW
          id="receiver-name"
          placeholder="e.g. Slava Ladischenski"
          required
        p "Used in the email greeting and on the letter cover." — NEW
    }
    Button "Next" {disabled until email + name filled}— EXTEND canProceed logic
```

### Step 4 — Visual Refinements

**Button loading transition:**
- No animation between states — instant swap of text content (matches `accept-agreement-page.tsx` pattern where `Loader2Icon` replaces text directly).
- `Loader2Icon` uses `animate-spin` (Tailwind built-in, CSS `animation: spin 1s linear infinite`).
- Button keeps its `bg-[#0044CC]` color in loading state; `disabled` prop prevents double-taps while `opacity-50` is suppressed via explicit `disabled:opacity-100` override to keep the button visible during auth.
- `disabled:opacity-100` is added only to the cover button (not globally) to maintain the "letter is being unlocked" visual metaphor.

**Cover dimming during auth:**
- Content above and below the button dims via `transition-opacity duration-300 opacity-50` applied to the name/stats wrapper divs.
- No overlay — opacity change only. The button itself stays at full opacity.
- `pointer-events-none` on dimmed content prevents accidental taps on ToS link during auth.

**Name display typography:**
- "For [Name]" — `text-2xl md:text-3xl font-serif` with inline `fontFamily: '"Playfair Display", Georgia, serif'` — already in `letter-cover.tsx` line 42-44. No change needed.
- "From [Name]" — `text-sm text-[#1A1A1A]/60` — already in `letter-cover.tsx` line 47-49. Sans-serif (default Tailwind). No change needed.
- Both are data-only changes (pass different string values).

**"Setting up your access..." text:**
- `text-xs text-[#1A1A1A]/40 animate-pulse` — subtle, appears below the button after 5s timer.
- Timer: `useEffect` with `setTimeout(5000)` that sets a boolean state. Clears on unmount or auth completion.

### Step 5 — Extraction Plan

**No extraction needed.** The letter component set has clean separation:
- `LetterCover` owns the cover surface — all cover changes stay within it (2 new props, no structural change).
- `ModeStep` is a local function component in `letter-compose-page.tsx` — adding one more `Input` + `Label` is simpler than extracting a `RecipientEntry` component for a single use site.
- The `Loader2Icon` + disabled button loading pattern is already established in `accept-agreement-page.tsx` and does not warrant a shared `LoadingButton` abstraction — the pattern is 3 lines of inline JSX, used in 2 places total.

**Observation (no action):** `ModeStep`, `PredictionsStep`, `PreviewStep`, and `SealStep` could be extracted to separate files for readability (the compose page is ~500 lines), but this is orthogonal to P651 and would be scope creep.

### Step 6 — Challenge Notes

1. **`LetterCover` prop expansion is minimal.** Two new boolean props (`isAuthenticating`, `authDelayed`) keep the component's API surface clean. The auth orchestration logic (edge function call, `verifyOtp`, fallback `signInWithOtp`, 5s timer) lives in `letter-reading-page.tsx`'s `onOpen` handler, not in the cover component. This is the correct separation — the cover is a presentational component.

2. **Single name field for multiple recipients.** The spec says "one name field" even when multiple emails are comma-separated. This is correct for the current usage pattern (1-to-1 means one person) but will need revisiting if multi-recipient 1-to-1 becomes common. No action now — the `receiver_name` column is per-delivery, so the schema already supports per-recipient names when the UI is ready.

3. **`disabled:opacity-100` override.** The shadcn `Button` has `disabled:opacity-50` baked into the cva base. The cover button needs to stay visually prominent during auth loading. Two options: (a) override via className `disabled:opacity-100`, or (b) don't use `disabled` and instead use `onClick` guard + `aria-disabled="true"`. Option (a) is simpler and the override is scoped to the single call site in `LetterCover`. Recommend (a).

4. **No new components needed.** Every UI element maps to an existing primitive (`Button`, `Input`, `Label`, `Loader2Icon`) or an inline extension of an existing component. This is the expected outcome for an incremental correction — the design system already has what P651 needs.

## Test Coverage Strategy

### Integration Tests (P270 mandatory — DB migration)

**File:** `e2e/integration/p651-letter-onboarding-migration.spec.ts`

Two-client pattern (supabaseAdmin + anon/user clients). 8 test groups covering:

| Area | Tests | What's verified |
|------|-------|-----------------|
| Schema | 2 | `receiver_name TEXT` column exists, accepts values |
| UNIQUE constraint | 2 | `(letter_id, receiver_email)` rejects duplicates |
| Sender name RPC | 2 | `get_letter_for_reading` returns `sender_display_name`, not UUID; no `receiver_email` leak |
| Token email redaction | 1 | `get_letter_by_token` does not return `receiver_email` |
| Status regression | 2 | `update_delivery_status_by_token` blocks backward transitions (completed→sent), allows forward (sent→opened) |
| REVOKE from anon | 3 | `_is_letter_sender`/`_is_letter_receiver` denied for anon, allowed for authenticated |
| seal_and_send_letter | 1 | Delivery created with `receiver_name` |
| Sealed-bid scoping | 2 | `reveal_prediction_by_token` scoped to delivery (receiver A's rating doesn't unlock receiver B's prediction) |

### E2E Tests — Onboarding Flow

**File:** `e2e/p651-letter-onboarding.spec.ts`

| Test | Covers |
|------|--------|
| Cover shows sender display name, not UUID | AC #4, Bug #5 |
| Cover shows receiver first name | AC #4, requirement #2 |
| "Open the Letter" button visible | AC #2 |
| No "Sign in to continue" wall for authenticated reader | AC #7 |
| No "Save your results?" gate for 1-to-1 | AC #8 |
| 1-to-many loads without auth | AC #9 |
| 1-to-many "Open the Letter" enters anonymous reading | AC #9 |

### E2E Tests — Composition

**File:** `e2e/p651-letter-composition.spec.ts`

| Test | Covers |
|------|--------|
| "Specific people" shows name input | AC #1 |
| Name required (Next disabled without it) | AC #1 |
| Both name + email enables Continue | AC #1 |
| "Anyone with a link" has no name input | Regression |
| Seal summary shows "Name (email)" format | AC #1 |

### Smoke Tests

**File:** `e2e/p651-smoke.spec.ts`

5 fast checks: cover loads without JS errors, cover shows letter content, composition loads, "Specific people" selectable, no console errors during open transition.

### UAT Manual Scenarios

**File:** `features/uat/p651.md`

11 scenarios: new user flow, existing user flow, verifyOtp fallback, name on cover + email, 1-to-many unchanged, composition name input, status regression, sealed-bid scoping, REVOKE check, duplicate delivery, email redaction.

### TODO markers for /dev

Tests that depend on not-yet-implemented code (new RPC fields, edge function behavior, new UI elements) have `// TODO: /dev must implement...` comments marking exact spots that need wiring once the implementation is done. The test structure and assertions are correct — only the setup/trigger needs updating.

## Pre-deploy Checklist

### Deploy commands
- [ ] `SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN supabase functions deploy create-and-open-letter --project-ref besjtuodziykmjidubzw --no-verify-jwt`
- [ ] `SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN supabase functions deploy send-letter-emails --project-ref besjtuodziykmjidubzw --no-verify-jwt`
- [ ] Run migration via `./scripts/migrate.sh` (applies to prod via Management API)

### Post-deploy verification
- [ ] Smoke test: send a 1-to-1 letter to a new email, verify cover shows names + "Open the Letter" creates account
- [ ] Smoke test: send a 1-to-1 letter to an existing user, verify instant auth
- [ ] Verify 1-to-many flow still works (anonymous entry)
- [ ] Check Sentry for new errors in first 10 minutes
