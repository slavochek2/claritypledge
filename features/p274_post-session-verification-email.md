---
status: week
type: story
rank: 3.0
workstream: C1
tags:
  - unverified
  - email
  - verification
  - live
created_date: 2026-02-18
---

# P274: Send verification email when unverified guest joins /live

## Problem

Unverified guests (`is_verified: false`) who join a `/live` session via invite never receive any email. Their profile sits in the database indefinitely with no path to verification unless they independently find the pledge or signup pages.

## Solution

When a new unverified guest joins `/live`, fire the standard Supabase magic link email immediately — the same email that regular signups receive. No new template, no new copy, no post-session trigger. It goes out the moment they click Join.

When they click the link later (during or after the session), `AuthCallbackPage` handles it exactly as it handles any other magic link: profile becomes `is_verified: true`, slug is generated, user lands on `/me`.

## Why on join, not session end

- User just typed their email — they are at their device, inbox is fresh
- No need to track session completion events or edge cases (session abandoned, network drop, etc.)
- Simpler: one callsite (`getOrCreateGuestUser()`), one side-effect

## Why reuse the existing email

- Template already exists and works
- "Verify your email for Clarity Pledge" is contextually appropriate — they just gave their email to join a Clarity session
- Zero new copy, zero new template, zero Brevo dependency
- P41 (coaching teaser email) can still be built later on top of this — P274 is just the mechanism

## Implementation

In `getOrCreateGuestUser()` (`src/app/data/api.ts`), after creating a new profile (`isNew: true`):

```typescript
// Fire verification email — same as signup, no await (non-blocking)
supabase.auth.signInWithOtp({
  email,
  options: { shouldCreateUser: false } // profile already created
});
```

Fire and forget. Does not block the join flow. Does not affect the anonymous auth session used for the live session itself.

## Acceptance criteria

- [ ] New unverified guest joins `/live` → receives the standard Supabase magic link email within ~1 minute
- [ ] Clicking the link → `AuthCallbackPage` → profile becomes `is_verified: true`, slug generated, lands on `/me`
- [ ] Returning unverified user (same email, second session join) does NOT receive another email — only send on `isNew: true`
- [ ] Email send failure does not block the join flow or throw an error
- [ ] Verified users joining `/live` are unaffected

## Out of scope

- Custom email copy or template (use Supabase default)
- Post-session trigger (not needed)
- Coaching insights or AI summaries (P41, future)
- Unsubscribe mechanism
