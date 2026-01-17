# P63_2: Google OAuth Production Deployment Guide

**Created by:** P63 implementation
**Purpose:** Step-by-step guide to enable Google OAuth in production

## Prerequisites Checklist

Before starting, ensure you have:
- [ ] Access to production Supabase dashboard
- [ ] Access to Google Cloud Console
- [ ] Access to Vercel dashboard (for environment variables)
- [ ] The production domain `claritypledge.com` verified

## Step 1: Database Migration

Run this SQL in your **production** Supabase SQL Editor:

```sql
-- P63: Google OAuth Authentication with Profile Pictures
-- Migration to add avatar_url and avatar_provider columns to profiles table

-- Add avatar_url column (stores Google profile picture URL)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Add avatar_provider column (tracks where avatar came from)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS avatar_provider TEXT
CHECK (avatar_provider IN ('google', 'generated', 'gravatar'));

-- Update existing profiles to have provider = 'generated' (they use initials + color)
UPDATE profiles
SET avatar_provider = 'generated'
WHERE avatar_provider IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN profiles.avatar_url IS 'URL to user avatar image (e.g., from Google OAuth)';
COMMENT ON COLUMN profiles.avatar_provider IS 'Source of avatar: google (OAuth), generated (initials+color), gravatar';
```

**Verification:**
1. Go to Table Editor → profiles
2. Confirm `avatar_url` and `avatar_provider` columns exist
3. Run: `SELECT avatar_provider, COUNT(*) FROM profiles GROUP BY avatar_provider;`
4. Should show all existing users as 'generated'

## Step 2: Google Cloud Console Setup

### 2.1 Create OAuth Consent Screen

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select or create a project for Clarity Pledge
3. Navigate to **APIs & Services** → **OAuth consent screen**
4. Select **External** user type
5. Fill in the required fields:
   - **App name:** Clarity Pledge
   - **User support email:** Your email
   - **App logo:** Optional (use Clarity Pledge logo)
   - **App domain:** `claritypledge.com`
   - **Developer contact:** Your email

### 2.2 Configure Scopes

Add these scopes:
- `email`
- `profile`
- `openid`

### 2.3 Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
3. Select **Web application**
4. Name: `Clarity Pledge Production`
5. **Authorized JavaScript origins:**
   ```
   https://claritypledge.com
   ```
6. **Authorized redirect URIs:**
   ```
   https://<your-supabase-project>.supabase.co/auth/v1/callback
   ```
   (Get your exact Supabase project URL from Supabase dashboard → Settings → API)

7. Click **CREATE**
8. **Save the Client ID and Client Secret** - you'll need these next

## Step 3: Supabase Google Provider Setup

1. Go to your **production** Supabase dashboard
2. Navigate to **Authentication** → **Providers**
3. Find **Google** and enable it
4. Enter:
   - **Client ID:** (from Google Cloud Console)
   - **Client Secret:** (from Google Cloud Console)
5. Click **Save**

### Configure Redirect URLs

1. Go to **Authentication** → **URL Configuration**
2. Ensure these URLs are set:
   - **Site URL:** `https://claritypledge.com`
   - **Redirect URLs:** Add `https://claritypledge.com/auth/callback`

## Step 4: Deploy Code Changes

The code changes from P63 should already be deployed if you merged the PR. Verify by checking:

1. Visit `https://claritypledge.com/login`
2. You should see a "Continue with Google" button
3. Visit `https://claritypledge.com/live`
4. You should see a "Continue with Google" button

If buttons are missing, ensure the P63 branch is merged and deployed.

## Step 5: Verification Testing

### Test 1: New User Google Sign-up

1. Open incognito/private browser
2. Go to `https://claritypledge.com/login`
3. Click "Continue with Google"
4. Sign in with a Google account that has NO existing Clarity Pledge account
5. **Expected:** Redirected to profile page with Google avatar displayed
6. **Verify:** Check Supabase profiles table - new user should have:
   - `avatar_url` = Google profile picture URL
   - `avatar_provider` = 'google'

### Test 2: Existing User Google Login

1. Use an email that already has a Clarity Pledge profile (magic link user)
2. Go to `https://claritypledge.com/login`
3. Click "Continue with Google" with that same email
4. **Expected:** Supabase links accounts, profile updated with Google avatar
5. **Verify:** Profile now shows Google photo instead of colored initials

### Test 3: /live Page Google Auth

1. Go to `https://claritypledge.com/live`
2. Click "Continue with Google"
3. **Expected:** Redirected to meeting creation with user authenticated

### Test 4: Fallback Behavior

1. Find a user with Google auth in database
2. Manually set their `avatar_url` to an invalid URL
3. View their profile
4. **Expected:** Falls back to colored initials (generated avatar)

## Rollback Plan

If something goes wrong:

### Disable Google OAuth (Quick)

1. Go to Supabase → Authentication → Providers
2. Toggle Google provider OFF
3. Users can still use magic link

### Revert Database Migration (If Needed)

```sql
-- Only run if you need to completely revert P63
-- This removes the columns - existing data will be lost

ALTER TABLE profiles DROP COLUMN IF EXISTS avatar_url;
ALTER TABLE profiles DROP COLUMN IF EXISTS avatar_provider;
```

### Code Rollback

If code issues occur, revert the P63 merge commit:
```bash
git revert <p63-merge-commit-sha>
git push
```

## Troubleshooting

### "redirect_uri_mismatch" Error

- Check Google Cloud Console authorized redirect URIs
- Must match exactly: `https://<project>.supabase.co/auth/v1/callback`

### "access_denied" Error

- Check OAuth consent screen is configured
- Ensure required scopes are added

### Avatar Not Showing

1. Check browser console for image load errors
2. Verify `avatar_url` in database is a valid URL
3. Google avatar URLs require the user to have a public Google profile photo

### User Can't Link Accounts

- Supabase links by email automatically
- Ensure user's Google email matches their existing Clarity Pledge email

## Monitoring

After deployment, monitor:

1. **Supabase Auth logs** - Check for OAuth errors
2. **Mixpanel events:**
   - `google_auth_initiated` - Track usage
   - `google_auth_error` - Track failures
3. **Sentry errors** - Check for auth callback issues

## Success Metrics

Track these in the first week:

- % of new signups using Google vs magic link
- Auth completion rate (started OAuth → profile created)
- Any increase in signup conversion rate

---

**Time estimate:** 10-15 minutes for full setup
**Risk level:** Low (existing magic link auth unaffected)
