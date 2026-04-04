---
status: today
type: bug
rank: 1000054.0
severity: high
date_reported: 2026-04-04
created_date: 2026-04-04
tags:
  - letters
  - onboarding
  - p581
flow: fix
---

# BUG: Letter 1-to-1 Recipient Onboarding — No Account Creation Reuse

**Related:** P581 (clarity letters), P527 (create-and-sign edge function)

## Problem

When a recipient receives a 1-to-1 letter email invite and clicks the link, the onboarding is broken:

1. **Email promises "account will be created automatically"** — but UX requires manual signup at completion gate
2. **Sender name shows UUID** instead of display name on the cover page
3. **Letter flow does NOT reuse the agreement invite's `create-and-sign` pattern** — agreement invites have 3 smooth auth pathways (magic link for existing users, OTP for new, direct-sign edge function for instant). Letter flow has 1 (generic signup redirect at the end).

For 1-to-1 letters specifically, the recipient is known by email. The flow should be as smooth as the agreement invite flow.

## Symptoms

- Cover page shows sender UUID (`0e5ae4a4-ca7e-...`) instead of name
- Anonymous user can read entire letter but hits a wall at rating ("Sign in to continue")
- Completion gate requires manual email entry + full signup redirect
- No magic link path for existing users
- No `create-and-sign` atomic path for new users

## Root Cause

Letter flow (P581) was built with anonymous-first architecture. Account creation was treated as an afterthought (optional gate at completion), not integrated into the core flow. The agreement invite flow (P527) solved this same problem months earlier with `create-and-sign` edge function but the letter flow doesn't reuse it.

Specific code gaps:
- `letter-reading-page.tsx` — no auth gate for 1-to-1 mode at start
- `letter-cover.tsx` — shows `sender_id` (UUID) instead of resolving profile name
- `letter-completion-summary.tsx` — generic signup redirect instead of `create-and-sign`
- `send-letter-emails` edge function — email copy says "automatically" but code doesn't deliver

## Resolution

_To be filled in after fix._

## Verification

- 1-to-1 letter recipient (new user) can open letter and create account smoothly
- 1-to-1 letter recipient (existing user) gets magic link flow
- Sender name shows display name, not UUID
- Email copy matches actual UX
- E2E test covers the auth onboarding path
