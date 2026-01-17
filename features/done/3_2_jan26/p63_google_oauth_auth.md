# P63: Google OAuth Authentication - Branch Summary

**Branch:** `p63_google_oauth_auth`
**Date:** 2026-01-16
**Status:** Implementation complete, revealed P64 dependency

---

## What We Did

### P63 Implementation: Google OAuth with Profile Pictures

Added Google OAuth as an authentication option with automatic profile picture capture.

### Files Created
| File | Purpose |
|------|---------|
| `src/app/components/auth/google-auth-button.tsx` | Reusable Google OAuth button with branded styling, dark mode support, error feedback |
| `supabase/migrations/p63_google_oauth_avatar.sql` | Database migration for `avatar_url` and `avatar_provider` columns |
| `features/p63_2_production_deployment.md` | Step-by-step production deployment guide |
| `features/p64_standalone_signup.md` | Documented follow-up feature (discovered during implementation) |

### Files Modified
| File | Changes |
|------|---------|
| `src/app/types/index.ts` | Added `avatarUrl` and `avatarProvider` to Profile, ProfileSummary, DbProfile, DbProfileSummary |
| `src/app/data/api.ts` | Added `signInWithGoogle()`, updated mappers to include avatar fields |
| `src/auth/AuthCallbackPage.tsx` | Capture Google avatar, detect Google login via metadata (not provider) |
| `src/components/ui/gravatar-avatar.tsx` | Simplified: removed Gravatar lookup, now just photo URL or initials |
| `src/app/components/pledge/login-form.tsx` | Added GoogleAuthButton + "or use magic link" divider |
| `src/app/components/social/pledger-card.tsx` | Pass `avatarUrl` to GravatarAvatar |
| `src/app/components/social/signature-wall.tsx` | Pass `avatarUrl` to PledgerCard |
| `src/app/components/profile/profile-visitor-view.tsx` | Pass `photoUrl` to certificate |

---

## How & Why

### Google OAuth Flow
```
User clicks "Continue with Google"
    ↓
signInWithGoogle() → Supabase OAuth → Google consent screen
    ↓
Google redirects back to /auth/callback
    ↓
AuthCallbackPage:
  1. Detects Google login via user_metadata.picture (NOT app_metadata.provider)
  2. Extracts avatar URL from user_metadata.picture
  3. Upserts profile with avatar_url + avatar_provider='google'
    ↓
Redirect to /p/{slug}
```

### Why detect via metadata, not provider?
**Critical bug discovered:** `app_metadata.provider` shows the ORIGINAL signup method, not current login method.

Example: User signs up via email (provider='email'), later logs in with Google. `app_metadata.provider` still shows 'email', but `user_metadata` contains Google data (picture, iss).

**Solution:** Check for Google-specific metadata fields:
```typescript
const hasGoogleMetadata = !!(user_metadata?.picture || user_metadata?.iss?.includes('google'));
```

### Why remove Gravatar?
- Gravatar requires email hash lookup (async, adds latency)
- Google provides direct avatar URL (instant)
- Simplifies component: just check `photoUrl` prop, fallback to initials
- Less code, fewer edge cases

### Avatar hierarchy
1. **Google avatar** (if user logged in with Google) → `avatar_provider='google'`
2. **Generated initials** (default) → `avatar_provider='generated'`
3. Gravatar removed (was `avatar_provider='gravatar'`)

---

## What Works

| Feature | Status | Notes |
|---------|--------|-------|
| Google OAuth button on /login | ✅ Works | Branded styling, dark mode |
| Google avatar capture for new users | ✅ Works | Stored in avatar_url |
| Google avatar capture for existing users | ✅ Works | Updates on re-login (Option A from spec) |
| Avatar display on pledger cards | ✅ Works | Falls back to initials on error |
| Avatar display on signature wall | ✅ Works | |
| Avatar display on profile page | ✅ Works | |
| Dark mode for Google button | ✅ Works | Added in code review fix |
| Error feedback for Google auth | ✅ Works | Shows message on failure |
| referrerPolicy for Google images | ✅ Works | Prevents cross-origin issues |

---

## What Doesn't Work / Issues Discovered

### 1. Login Auto-Creates Accounts (BUG)
**Issue:** When user clicks "Continue with Google" on `/login` page but has NO account, the system auto-creates one.

**Expected:** Login should only work for existing users. New users should be redirected to signup.

**Root cause:** AuthCallbackPage always upserts, regardless of source.

**Fix:** Requires P64 implementation.

### 2. No Standalone Signup Flow
**Issue:** Users cannot create an account without signing the pledge.

**Impact:**
- Users who want to try /live first must pledge
- Login "no account" case has nowhere to redirect

**Fix:** P64 - Create `/signup` page.

### 3. Google OAuth Not on /sign-pledge
**Issue:** Currently Google OAuth only on /login, not on /sign-pledge form.

**Impact:** Users who want to pledge with Google must use magic link.

**Fix:** Add GoogleAuthButton to SignPledgeForm (part of P64).

### 4. No Email Existence Check on Login
**Issue:** Magic link login sends email even if account doesn't exist.

**Impact:** User waits for email, clicks link, account auto-created (unexpected).

**Fix:** Add `checkEmailExists()` and validate before sending (part of P64).

---

## Open Questions for P64

### Critical Decisions Needed

#### 1. Should `/signup` users get a slug?
| Option | Behavior | Pros | Cons |
|--------|----------|------|------|
| **A. Yes** | Slug generated, `/p/slug` shows "pledge to make public" | Consistent, user has profile URL | What do they do with private profile? |
| **B. No** | No slug until pledge | Clean separation | How access settings? No profile URL |

**Recommendation:** Option A - generate slug, but profile page shows CTA to pledge.

#### 2. Can non-pledged users witness others?
| Option | Behavior |
|--------|----------|
| **A. Yes** | Authenticated = can witness |
| **B. No** | Must pledge first to witness |

**Recommendation:** Option A - witnessing might encourage them to pledge.

#### 3. Google OAuth on /sign-pledge - what about form fields?
Current form collects: name, email, role, linkedin, reason

If Google auth, we only get name + email. Options:

| Option | Behavior |
|--------|----------|
| **A. Skip form** | Google provides enough, role/linkedin/reason optional |
| **B. Pre-fill + show form** | After Google, show form with name/email filled |
| **C. Post-signup step** | Redirect to "complete profile" page |

**Recommendation:** Option A - KISS. Welcome dialog already prompts for role/linkedin.

#### 4. Non-pledged user goes to /sign-pledge to finally pledge
**Scenario:** User has account (has_pledged=false), now wants to pledge.

**Current logic would preserve `has_pledged=false`!**
```typescript
const hasPledged = existingProfile?.hasPledged ?? !isLiveRegistration;
// If existingProfile.hasPledged is false, it stays false
```

**Fix needed:**
```typescript
// If source=pledge, always set true regardless of existing value
const hasPledged = source === 'pledge' ? true : (existingProfile?.hasPledged ?? !isLiveRegistration);
```

#### 5. Non-pledged user navigation
After signup → land on `/live`. But then:
- Where's "My Profile" in nav? (they don't have public profile)
- How do they access settings?
- How do they know they can pledge later?

**Options:**
- A. Show "My Account" instead of "My Profile" for non-pledged users
- B. Profile page exists but shows "pledge to make public" banner
- C. Special dashboard page for non-pledged users

**Recommendation:** Option B - simplest, reuses existing profile page.

---

## UX Improvements Identified

### 1. Login error message
**Current:** Would be "No account found"

**Better:**
> "No account found with this email. Did you use a different email, or [create a new account](/signup)?"

### 2. "Want to take the pledge?" on /signup
**Concern:** User just chose NOT to pledge by going to /signup. Prominent CTA might be confusing.

**Recommendation:** Subtle footer link, not prominent CTA.

### 3. Magic link email for signup vs login
Should the email content differ?
- Signup: "Welcome! Click to activate your account"
- Login: "Welcome back! Click to sign in"

Currently both use same template. Low priority but nice-to-have.

---

## Technical Debt

### 1. signInWithGoogle() needs source parameter
Currently hardcoded redirect:
```typescript
redirectTo: `${window.location.origin}/auth/callback`
```

Needs to pass source:
```typescript
redirectTo: `${window.location.origin}/auth/callback?source=${source}`
```

Options:
- A. Add `source` parameter to `signInWithGoogle(source?: string)`
- B. Create `signInWithGoogleForSignup()`, `signInWithGoogleForPledge()`, etc.

**Recommendation:** Option A.

### 2. GoogleAuthButton needs source prop
Currently has `context` for analytics. Need separate `source` for auth flow.

```typescript
interface GoogleAuthButtonProps {
  context: string;      // For analytics ('login', 'signup', 'pledge')
  source?: string;      // For auth callback ('signup', 'pledge', etc.)
}
```

Or simplify: use `context` as `source` too.

---

## Commits on This Branch

1. `b27ec1d` - feat(p63): add Google OAuth authentication with profile pictures
   - 16 files changed, 768 insertions, 113 deletions

2. `5496241` - fix(p63): remove debug logs, add error feedback & dark mode for Google auth
   - 4 files changed, 23 insertions, 31 deletions

---

## Next Steps

1. **Get answers to open questions** (above)
2. **Implement P64** - standalone signup flow
3. **Test full flow:**
   - New user → /signup → Google → /live
   - New user → /sign-pledge → Google → /p/slug
   - Existing user → /login → Google → /p/slug
   - No-account user → /login → redirect to /signup
4. **Merge P63+P64 together** (P63 incomplete without P64)

---

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Avatar auto-update on re-login | Option A (always update) | Simpler, no user choice needed |
| Gravatar support | Removed | Adds complexity, Google avatar is better |
| Google detection method | Metadata fields | Provider field unreliable for linked accounts |
| Error feedback | Inline message | Better UX than silent failure |
| Dark mode | Added | Accessibility, consistent with app |
| Post-signup destination | /live | Let users try the product |
