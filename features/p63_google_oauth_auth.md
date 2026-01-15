# P63: Google OAuth Authentication with Profile Pictures

**Status:** Blocked (waiting on P63_UX)
**Priority:** Medium
**Complexity:** Low
**Estimated Effort:** 2-4 hours (implementation only, after UX spec complete)

**Prerequisites:**
- ⏳ [P63_UX: Google OAuth UX Flows](p63_ux_google_oauth_flows.md) - Must complete first

## Overview

Enable users to sign up and log in using Google OAuth, automatically importing their Google profile picture as their avatar instead of using the generated color avatars.

## User Value

- **Faster signup:** One-click authentication vs typing email + waiting for magic link
- **Familiar experience:** Most users already have Google accounts
- **Real avatars:** Show actual profile pictures instead of colored initials
- **Trust signal:** Real photos increase authenticity of pledges and endorsements

## Current State

- Magic link authentication only (email-based)
- Generated avatars using `avatar_color` (colored backgrounds with initials)
- Profile creation in `AuthCallbackPage.tsx` after email verification
- No social login options

## Implementation Approach

**Three-phase execution:**
1. **P63_UX** (prerequisite): UX agent designs flows, creates wireframes → outputs UX spec
2. **P63** (implementation): Dev agent builds feature on test Supabase following UX spec → outputs working code + P63_2.md deployment guide
3. **P63_2** (production): Follow P63_2.md guide to deploy to production (manual, 10 min)

**Key constraint:** Agent cannot configure production Supabase (requires your credentials)

**Solution:**
- P63 does ALL code work on test, documents exact manual steps
- P63 creates `features/p63_2_production_deployment.md` with step-by-step guide
- You follow P63_2.md to replicate on production

## Proposed Solution

### User Experience

**Sign-up/Login Flow:**
1. Landing page shows two auth options:
   - "Continue with Google" (new)
   - "Continue with Email" (existing magic link)
2. Google button triggers Supabase OAuth flow
3. User authorizes via Google consent screen
4. Redirected back to app with session + Google metadata
5. Profile created with Google avatar URL
6. Redirected to their profile page

**Profile Display:**
- If `avatar_url` exists: Show Google profile picture
- If no `avatar_url`: Fallback to generated avatar (colored circle with initials)
- Existing users keep their generated avatars unless they re-authenticate with Google

### Technical Changes

#### 1. Database Schema

Add to `profiles` table:
```sql
ALTER TABLE profiles
ADD COLUMN avatar_url TEXT,
ADD COLUMN avatar_provider TEXT CHECK (avatar_provider IN ('google', 'generated'));
```

**Migration considerations:**
- Existing profiles: `avatar_provider = 'generated'`, `avatar_url = NULL`
- New Google users: `avatar_provider = 'google'`, `avatar_url = <google_url>`
- Magic link users: Still use `avatar_provider = 'generated'`

#### 2. Auth Flow Changes

**File:** `src/auth/AuthCallbackPage.tsx`

Capture Google metadata during profile creation:
```typescript
const { data: { user } } = await supabase.auth.getUser();

// Check if user came from Google OAuth
const avatarUrl = user.user_metadata?.avatar_url;
const provider = user.app_metadata?.provider; // 'google' or 'email'

await supabase.from('profiles').upsert({
  id: user.id,
  email: user.email,
  slug: generatedSlug,
  name: user.user_metadata?.full_name || extractNameFromEmail(user.email),
  avatar_url: avatarUrl || null,
  avatar_provider: provider === 'google' ? 'google' : 'generated',
  avatar_color: provider === 'google' ? null : generateAvatarColor(),
  // ... rest of fields
});
```

#### 3. Supabase Dashboard Config

1. Navigate to Authentication → Providers
2. Enable Google provider
3. Add OAuth credentials:
   - Client ID (from Google Cloud Console)
   - Client Secret (from Google Cloud Console)
4. Set authorized redirect URIs:
   - `https://claritypledge.com/auth/callback`
   - `http://localhost:5173/auth/callback` (dev)

#### 4. UI Components

**File:** `src/auth/AuthForm.tsx` (or wherever sign-up UI lives)

Add Google button:
```tsx
import { FcGoogle } from 'react-icons/fc'; // or use SVG

<Button
  onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })}
  className="w-full flex items-center gap-2"
>
  <FcGoogle className="w-5 h-5" />
  Continue with Google
</Button>

<div className="text-sm text-muted-foreground my-4">or</div>

{/* Existing magic link form */}
```

**File:** `src/app/components/profile/ProfileAvatar.tsx` (new component)

```tsx
interface ProfileAvatarProps {
  profile: Profile;
  size?: 'sm' | 'md' | 'lg';
}

export function ProfileAvatar({ profile, size = 'md' }: ProfileAvatarProps) {
  if (profile.avatarUrl) {
    return (
      <img
        src={profile.avatarUrl}
        alt={`${profile.name}'s avatar`}
        className={cn(
          'rounded-full object-cover',
          size === 'sm' && 'w-10 h-10',
          size === 'md' && 'w-16 h-16',
          size === 'lg' && 'w-24 h-24'
        )}
      />
    );
  }

  // Fallback to generated avatar
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-semibold text-white',
        size === 'sm' && 'w-10 h-10 text-sm',
        size === 'md' && 'w-16 h-16 text-xl',
        size === 'lg' && 'w-24 h-24 text-3xl'
      )}
      style={{ backgroundColor: profile.avatarColor }}
    >
      {profile.name.split(' ').map(n => n[0]).join('').toUpperCase()}
    </div>
  );
}
```

#### 5. Type Updates

**File:** `src/app/types/index.ts`

```typescript
interface Profile {
  id: string;
  slug: string;
  name: string;
  email: string;
  role?: string;
  linkedinUrl?: string;
  reason?: string;
  signedAt: string;
  isVerified: boolean;
  witnesses: Witness[];
  reciprocations: number;
  avatarColor?: string;      // Optional now (null for Google users)
  avatarUrl?: string;         // NEW
  avatarProvider?: 'google' | 'generated'; // NEW
}
```

## Architecture Considerations

### Benefits of Current Auth Pattern

The **Reader-Writer separation** makes this change clean:
- Profile creation still happens in ONE place (`AuthCallbackPage.tsx`)
- No need to modify `useAuth` hook (read-only)
- No race conditions between Google OAuth and profile creation

### Google Avatar Handling

**External dependency:** Google hosts the images
- **Risk:** Google could change URLs or remove images
- **Mitigation:** Always have fallback to generated avatar
- **Future enhancement:** Download and store avatars in Supabase Storage (not in scope for P63)

**Privacy consideration:** Google avatars are already public (linked to Google account)

### Account Linking

Supabase automatically links accounts by email:
- User signs up with magic link → creates profile with generated avatar
- Same user later logs in with Google → Supabase links accounts
- **Decision needed:** Should we update their profile with Google avatar on re-login?
  - Option A: Yes, overwrite `avatar_url` if Google login detected
  - Option B: No, keep original generated avatar (preserve user's first choice)
  - **Recommendation:** Option A (users expect their Google photo to show)

## Testing Strategy

### Unit Tests
- `mapProfileFromDb()` handles new `avatar_url` and `avatar_provider` fields
- `ProfileAvatar` component renders both image and fallback states

### E2E Tests
- Google OAuth flow (requires test Google account)
- Profile creation with Google avatar
- Fallback to generated avatar when Google URL fails
- Magic link flow still works (unchanged)

### Manual Testing
1. Fresh Google sign-up → verify avatar shows
2. Existing magic link user logs in with Google → verify avatar updates
3. Google avatar URL becomes invalid → verify fallback works
4. Magic link sign-up still works → verify generated avatar

## Rollout Plan

### P63 (Part 1): Test Environment Implementation

**Goal:** Build and verify on test Supabase project, document manual steps for production

**Agent work (autonomous):**
1. **Follow UX spec** - Read P63_UX decisions on where/how to show Google OAuth
2. **Database migration** - Create SQL file for schema changes
3. **Backend changes** - Update auth flow, types, API layer
4. **Frontend components** - Build ProfileAvatar, add Google button per UX spec
5. **Automated tests** - Unit tests + E2E test structure
6. **Visual verification** - Use Playwright MCP to screenshot UI, verify matches wireframes
7. **Create P63_2 deployment guide** - Write `features/p63_2_production_deployment.md` with:
   - Exact SQL to run on production
   - Supabase dashboard config steps (with screenshots if possible)
   - Google Cloud Console setup instructions
   - Environment variables to update
   - Verification checklist
   - Rollback plan if something breaks

**Manual steps (you):**
1. Create test Google OAuth app in Google Cloud Console
2. Configure test Supabase project with Google provider
3. Test actual OAuth flow with real Google account
4. Verify avatar display works end-to-end

**Output:**
- ✅ Complete working implementation on test
- ✅ `features/p63_2_production_deployment.md` guide for production

### P63_2: Production Deployment Guide (Created by P63)

**NOTE:** This is NOT a separate feature task. P63 will create this file as `features/p63_2_production_deployment.md`.

**What the guide will contain:**

1. **Prerequisites checklist**
   - Production Supabase credentials ready
   - Google Cloud Console access
   - Production domain verified

2. **Step-by-step instructions**
   - SQL migration to run on production database (copy-paste ready)
   - Supabase dashboard configuration (with screenshots from test setup)
   - Google Cloud Console OAuth setup (production redirect URLs)
   - Environment variables to add to Vercel

3. **Verification steps**
   - How to test Google login works
   - How to verify avatars display correctly
   - How to check existing users unaffected

4. **Rollback plan**
   - SQL to revert migration if needed
   - How to disable Google OAuth in Supabase
   - What to do if something breaks

**Your role in P63_2:**
- Follow the guide P63 creates
- Should take ~10 minutes if guide is good
- No code changes needed (code already deployed from P63)

**Why this approach works:**
- P63 figures out all the steps on test environment
- P63 documents exactly what worked
- You repeat the same steps on production
- No guessing, no research needed

## Success Metrics

- % of new signups using Google vs email
- Profile completion rate (should increase with pre-filled data)
- Time to first pledge (should decrease)
- User feedback on avatar quality

## Future Enhancements (Not in Scope)

- Store avatars in Supabase Storage (remove Google dependency)
- Support other OAuth providers (LinkedIn, Microsoft)
- Allow users to upload custom avatars
- Avatar editing/cropping

## Dependencies

- Supabase Auth (already in use)
- Google Cloud Console account (free)
- React Icons or custom SVG for Google logo

## Migration Path

**For existing users:**
- No breaking changes
- Existing profiles keep generated avatars
- Can optionally re-authenticate with Google to get real avatar

**Rollback plan:**
- Google button can be feature-flagged
- Database columns are nullable (safe to add)
- Fallback to generated avatars always works

## Questions to Resolve

1. Should we auto-update avatars when users re-login with Google?
2. Do we want to show a badge/indicator for "Verified via Google"?
3. Should LinkedIn URL be pre-filled from Google profile? (if available)

---

**Next Steps:**
1. Get approval on Option A vs B for account linking behavior
2. Create Google Cloud Console OAuth credentials
3. Begin Phase 1 implementation
