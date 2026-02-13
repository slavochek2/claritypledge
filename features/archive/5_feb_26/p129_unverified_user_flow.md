---
status: backlog
priority: p2
milestone: C2
depends_on:
  - stories_points_backend
---

# P129: Unverified User Flow

## Problem

Users who join /live without verifying their email:
1. Can participate in /live sessions
2. Cannot create stories or points (RLS blocks unverified)
3. See no explanation why "Create" is disabled
4. Never receive verification email

## Current State

- Guest joins /live → profile created with `is_verified: false`
- No verification email sent
- No UI indication of unverified state
- "Create" buttons exist but would fail silently on RLS

## Proposed Solution

### 1. Verification Prompt (instead of disabled buttons)

When unverified user clicks "Create Story" or "Create Point":
- Show modal: "Verify your email to create content"
- "We'll send a verification link to [email]"
- Button: "Send Verification Email"
- After sending: "Check your inbox! Link expires in 24h"

### 2. Send Verification Email

Trigger Supabase magic link flow for existing unverified profile:
- `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })`
- On callback: mark profile `is_verified: true`

### 3. Profile Indicator

Show verification status on profile:
- Unverified: subtle badge or prompt
- Verified: checkmark or no indicator (verified is default state)

### 4. /Live Join Flow

Keep current behavior (no verification required), but:
- After session ends, prompt: "Verify your email to save your calibration history"
- Optional, not blocking

## Technical Notes

- RLS already enforces verified-only creation (in migration)
- Need to update join flow to optionally trigger verification
- Consider: send verification email automatically after first /live session?

## Open Questions

- Should we auto-send verification email after /live session ends?
- How long until unverified profiles are cleaned up?
- Should unverified users see their calibration stats? (Currently yes, stored on profile)

## Acceptance Criteria

- [ ] Clicking "Create" as unverified shows verification prompt
- [ ] Verification email can be sent from prompt
- [ ] Email verification marks profile as verified
- [ ] Verified users can create stories and points
- [ ] No regression in /live join flow for unverified users
