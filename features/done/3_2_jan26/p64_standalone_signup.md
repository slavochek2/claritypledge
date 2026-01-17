# P64: Standalone Signup (Account Without Pledge)

**Status:** In Progress
**Dependencies:** P63 (Google OAuth) - completed
**Priority:** High (blocks proper login flow fix)

## Problem

Currently, account creation is coupled with signing the pledge:
- `/sign-pledge` = Sign pledge + create account
- `/login` = For existing users, but **auto-creates accounts if none exists** (bug!)

This creates issues:
1. User clicks "Welcome Back" with Google → gets auto-signed up (unexpected)
2. User can't create account without pledging
3. No way to try /live before committing to pledge

## Solution

Create standalone signup flow + fix login to only allow existing users.

## Current Routes

| Route | Current Behavior |
|-------|------------------|
| `/sign-pledge` | Sign pledge + create account (has_pledged=true) |
| `/login` | Login OR auto-create account (bug!) |

## New Routes

| Route | New Behavior |
|-------|--------------|
| `/signup` | Create account only (has_pledged=false) |
| `/login` | Login existing users ONLY, reject new users |
| `/sign-pledge` | Unchanged - sign pledge + create account |

## Edge Cases & Flows

### 1. Google OAuth on `/login` - No Account Exists
**Current:** Auto-creates account with has_pledged=true (wrong!)
**New behavior:**
1. User clicks "Continue with Google" on /login
2. Google OAuth completes → redirects to /auth/callback
3. AuthCallbackPage detects: login source + no existing profile
4. Redirect to `/signup?message=no-account` with message: "No account found. Create one below."

### 2. Magic Link on `/login` - No Account Exists
**Current:** Sends magic link, auto-creates account on callback
**New behavior:**
1. User enters email on /login
2. **Check if email exists in profiles table BEFORE sending**
3. If no account → Show error: "No account found with this email. [Sign up instead](/signup)"
4. If account exists → Send magic link as normal

### 3. Google OAuth on `/signup` (new page)
1. User clicks "Continue with Google" on /signup
2. Google OAuth with `source=signup` in redirect URL
3. AuthCallbackPage creates profile with `has_pledged=false`
4. Redirect to `/live`

### 4. Magic Link on `/signup`
1. User enters email on /signup
2. Send magic link with `source=signup` in redirect URL
3. AuthCallbackPage creates profile with `has_pledged=false`
4. Redirect to `/live`

### 5. Google OAuth on `/sign-pledge`
1. User clicks "Continue with Google" on sign-pledge form
2. Google OAuth with `source=pledge` in redirect URL
3. AuthCallbackPage creates profile with `has_pledged=true`
4. Redirect to `/p/{slug}` (their profile)

### 6. Existing User Goes to `/signup`
**KISS approach:** Let them through. AuthCallbackPage does upsert, they end up at their existing profile. No special handling needed.

### 7. Non-Pledged User Experience
Users with `has_pledged=false`:
- Can access `/live` meetings
- Can view pledger profiles
- See prompts to take the pledge
- **No public profile page** - `/p/{slug}` shows "Complete your pledge to make profile public"
- Can witness/endorse others (they're authenticated)

## Implementation Plan

### Phase 1: Update AuthCallbackPage to Handle Sources

Modify `/auth/callback` to check source and existing profile:

```typescript
// Detect source from URL
const source = urlParams.get('source'); // 'signup', 'pledge', 'live', or null (login)

// Check if profile exists
const existingProfile = await getProfile(authUser.id);

// Handle login with no account
if (!source && !existingProfile) {
  // Login flow but no account - redirect to signup
  navigate('/signup?message=no-account', { replace: true });
  return;
}

// Determine has_pledged based on source
const hasPledged = existingProfile?.hasPledged ?? (source === 'pledge' || !source);
// source=signup → false
// source=pledge → true
// source=live → false (existing behavior)
// no source (login) → true (existing users)
```

### Phase 2: Create `/signup` Page

New file: `src/app/pages/signup-page.tsx`

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
│  [Create Account]                   │
│                                     │
│  Already have an account? Log in    │
│                                     │
│  ─────────────────────────────────  │
│  Want to take the pledge?           │
│  [Sign the Clarity Pledge →]        │
└─────────────────────────────────────┘
```

- Show message if redirected from login: "No account found. Create one below."
- Google OAuth passes `source=signup`
- Magic link passes `source=signup`
- After success → redirect to `/live`

### Phase 3: Update `/login` Page

1. Add `checkEmailExists()` API function
2. Before sending magic link, check if email exists
3. If not found: "No account found with this email. [Sign up instead](/signup)"
4. Update Google OAuth to pass `source=login` (or no source)
5. Update text: "Don't have a pledge? Sign now" → "Don't have an account? Sign up"

### Phase 4: Add Google OAuth to `/sign-pledge`

1. Add GoogleAuthButton to SignPledgeForm
2. Pass `source=pledge` in redirect URL
3. Follows existing pledge flow (has_pledged=true)

### Phase 5: Update Text/Links

| Location | Old Text | New Text |
|----------|----------|----------|
| login-form.tsx | "Don't have a pledge? Sign now" | "Don't have an account? Sign up" |
| login-form.tsx | Links to /sign-pledge | Links to /signup |

## Files to Modify

| File | Changes |
|------|---------|
| `src/auth/AuthCallbackPage.tsx` | Handle login-with-no-account redirect |
| `src/app/pages/signup-page.tsx` | NEW - standalone signup page |
| `src/app/pages/login-page.tsx` | Add email existence check |
| `src/app/data/api.ts` | Add `checkEmailExists()` function |
| `src/app/components/pledge/login-form.tsx` | Update text, email check before magic link |
| `src/app/components/pledge/sign-pledge-form.tsx` | Add Google OAuth button |
| `src/App.tsx` | Add /signup route |

## API Changes

### New Function: `checkEmailExists(email: string)`

```typescript
export async function checkEmailExists(email: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single();
  return !!data;
}
```

## Database Changes

None required - already have `has_pledged` field from P50.

## Acceptance Criteria

- [ ] `/signup` page exists with Google + email options
- [ ] Google OAuth on /signup creates account with has_pledged=false
- [ ] Magic link on /signup creates account with has_pledged=false
- [ ] After signup → redirects to /live
- [ ] `/login` with Google (no account) → redirects to /signup with message
- [ ] `/login` with magic link (no account) → shows error before sending
- [ ] Text updated: "Sign up" instead of "Sign pledge" in login form
- [ ] `/sign-pledge` has Google OAuth option
- [ ] Google OAuth on /sign-pledge creates account with has_pledged=true

## Test Scenarios

1. **New user, wants to try platform:**
   - Goes to /signup → Google/email → account created (has_pledged=false) → /live

2. **New user, wants to pledge:**
   - Goes to /sign-pledge → fills form → pledges (has_pledged=true) → /p/slug

3. **Existing pledged user, logs in:**
   - Goes to /login → Google/email → /p/slug

4. **New user, accidentally goes to login:**
   - Goes to /login → tries Google → "No account found" → /signup
   - Goes to /login → enters email → "No account found" error shown

5. **Non-pledged user, later wants to pledge:**
   - Has account (has_pledged=false) → goes to /sign-pledge → signs → has_pledged=true
