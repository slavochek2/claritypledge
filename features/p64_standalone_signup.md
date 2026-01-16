# P64: Standalone Signup (Account Without Pledge)

**Status:** Planned
**Dependencies:** P63 (Google OAuth) - completed
**Priority:** Medium

## Problem

Currently, account creation is coupled with signing the pledge:
- `/sign-pledge` = Sign pledge + create account
- Users cannot create an account without committing to the pledge

This creates friction for users who want to:
- Try the /live meeting feature first
- Explore the platform before committing
- Create an account for future use

## Solution

Create a standalone signup flow that decouples account creation from pledge signing.

### New Routes

| Route | Purpose |
|-------|---------|
| `/signup` | Create account (Google or email), no pledge required |
| `/login` | Existing users (already has Google from P63) |
| `/sign-pledge` | Sign the pledge (existing, for pledged users) |

### Signup Page Design

```
┌─────────────────────────────────────┐
│         Create Account              │
│                                     │
│  [🔵 Continue with Google]          │
│                                     │
│  ────── or use email ──────         │
│                                     │
│  Email Address                      │
│  [your@email.com            ]       │
│                                     │
│  ☐ I accept the Terms and           │
│    Privacy Policy                   │
│                                     │
│  [Create Account]                   │
│                                     │
│  Already have an account? Log in    │
└─────────────────────────────────────┘
```

### Post-Signup Flow

After account creation, show:
```
Account created!

[Take the Clarity Pledge] ← Primary CTA
[Skip for now]            ← Goes to /live or dashboard
```

### Database Changes

None required - already have `has_pledged` field (P50):
- `has_pledged = false` for signup-only users
- `has_pledged = true` for users who signed the pledge

### Text Changes Needed

Update across the app:
- "Don't have a pledge? Sign now" → "Don't have an account? Sign up"
- Link to `/signup` instead of `/sign-pledge`

**Affected files:**
- `src/app/components/pledge/login-form.tsx`
- Any other places with similar text

### Implementation Tasks

1. Create `/signup` page with:
   - Google OAuth button (reuse `GoogleAuthButton`)
   - Email input + terms checkbox
   - Magic link flow (similar to current signup)

2. Update `AuthCallbackPage.tsx`:
   - Handle signup-only flow (no pledge data)
   - Set `has_pledged = false` for these users

3. Update text/links across app:
   - Login form
   - Navigation
   - Any "sign the pledge" CTAs that should be "sign up"

4. Add post-signup prompt to take pledge

### Non-Pledged User Experience

Users with `has_pledged = false`:
- Can use /live meetings
- Can view pledger profiles
- See subtle prompts to take the pledge
- No public profile page until they pledge

### Acceptance Criteria

- [ ] User can create account with Google without pledging
- [ ] User can create account with email without pledging
- [ ] Terms acceptance required for both methods
- [ ] Post-signup shows option to take pledge
- [ ] Non-pledged users can access /live
- [ ] Text updated: "Sign up" instead of "Sign pledge" where appropriate
