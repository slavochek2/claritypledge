---
status: all-done
type: change-request
rank: 0.25
changes: p581
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
- **Existing user:** Show magic link button (P488 pattern, same as agreement accept)
- **New user:** Show name input + "Open the Letter" = `create-and-sign` edge function adapted for letters (creates user + profile + claims delivery + accepts terms atomically)
- After auth → reading flow begins with full identity (all responses linked to profile)

**After (redesign):**
```
┌─────────────────────────────────┐
│        A CLARITY LETTER         │
│                                 │
│    For recipient@example.com    │
│    From Slava Ladischenski      │  ← Resolved name
│                                 │
│    5 stories · ~10 minutes      │
│                                 │
│  ┌──── Existing user? ──────┐  │
│  │ [Sign in with magic link] │  │  ← P488 pattern
│  └───────────────────────────┘  │
│  ┌──── New here? ────────────┐  │
│  │ Your name: [_________]    │  │
│  │ [  Open the Letter  ]     │  │  ← create-and-sign
│  └───────────────────────────┘  │
│                                 │
│    By opening, you accept ToS   │
└─────────────────────────────────┘
         ↓ (authenticated reading)
┌─────────────────────────────────┐
│  Story 1 of 5                   │
│  ── read ── position ── rate ── │  ← No auth wall
│  ── gap reveal ── next ──       │
└─────────────────────────────────┘
         ↓ (completion, already authenticated)
┌─────────────────────────────────┐
│  Completion Summary             │
│  Gaps · Positions · CTA         │  ← No signup gate needed
└─────────────────────────────────┘
```

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
2. **Auth detection on cover:** When token is present AND letter mode is `one-to-one`, check if `receiver_email` matches an existing auth user
3. **Existing user path:** Show magic link button on cover (reuse `signInWithOtp({ shouldCreateUser: false })` from agreement flow)
4. **New user path:** Show name input + "Open the Letter" button that calls `create-and-sign` edge function adapted for letters
5. **Post-auth redirect:** After magic link or create-and-sign, return to letter page with authenticated session — reading flow starts immediately
6. **Email copy fix:** Update `send-letter-emails` to say "you'll be able to create an account when you open the letter" (matches UX)
7. **Remove completion signup gate for 1-to-1:** When authenticated (which 1-to-1 always is after this change), skip the "Save your results?" gate entirely

## What Stays the Same

- 1-to-many anonymous flow (unchanged)
- Letter reading state machine (phases, sealed-bid, gap reveal)
- Rating mechanics and `RatingButtons` component
- Position mechanics and token-based RPCs
- Completion summary layout
- Database schema (no new tables or columns needed)
- Letter composition wizard
- All integrity constraints (sealed-bid, committed ratings)

## Surfaces in Scope

**In scope:**
- `src/app/pages/letter-reading-page.tsx` — auth gate on cover for 1-to-1
- `src/app/components/letters/letter-cover.tsx` — multi-pathway auth UI
- `src/app/data/letters-service.ts` — sender name resolution
- `supabase/migrations/20260404091744_p642_letter_reading_rpc.sql` — add sender name join
- `supabase/functions/send-letter-emails/index.ts` — email copy fix
- `src/app/components/letters/letter-completion-summary.tsx` — skip signup gate when authenticated

**Out of scope:**
- 1-to-many letter flow (anonymous access preserved)
- Letter composition wizard
- `/live` session integration
- Completion summary visual layout
- Point ordering logic (D36)
- `create-and-sign` edge function itself (reuse as-is, possibly with minor letter-specific params)

## Acceptance Criteria

- [ ] 1-to-1 new user: cover shows name input + "Open the Letter" → creates account via `create-and-sign` pattern → reading begins authenticated
- [ ] 1-to-1 new user: profile created before reading starts (D48)
- [ ] 1-to-1 new user: terms accepted as part of "Open the Letter" action
- [ ] 1-to-1 existing user: cover shows "Sign in with magic link" → OTP sent → return authenticated → reading begins
- [ ] Sender name shows display name on cover and throughout reading flow (not UUID)
- [ ] Email copy says "you'll be able to create an account when you open the letter" (not "automatically")
- [ ] 1-to-1 authenticated reader can rate without hitting "Sign in to continue" wall
- [ ] 1-to-1 completion summary skips "Save your results?" gate (already authenticated)
- [ ] 1-to-many flow is unchanged (anonymous access, signup at end)
- [ ] All existing P642 E2E tests still pass
- [ ] Regression: sealed-bid integrity preserved (rating before prediction reveal)

## Next Steps

- Run `/architect features/p650_letter_recipient_onboarding_redesign.md` — needs technical analysis of `create-and-sign` adaptation for letters and sender name join in RPC
