# Fix for Signatories Not Displaying Issue

## Problem

The "Who Signed the Pledge" page was showing 0 signatories even though multiple people had signed the pledge.

## Root Cause

Profiles are created with `is_verified = false` by default. The signatories page only displays profiles where `is_verified = true`. 

When users sign the pledge:
1. A profile is created in the database with `is_verified = false`
2. They receive a magic link via email
3. When they click the link, the `auth-callback-page` should mark their profile as `is_verified = true`
4. However, if users don't click the link or if there's any error in the flow, their profiles remain unverified

## Solution

### Option 1: Verify All Existing Profiles (Quickest)

Run this SQL command in your Supabase SQL Editor:

```sql
UPDATE public.profiles
SET is_verified = true
WHERE is_verified = false;
```

Or use the provided script:
```bash
# In Supabase SQL Editor, run:
supabase/verify_all_profiles.sql
```

### Option 2: Use the Enhanced Test DB Page (UI Method)

1. Navigate to `/test-db` in your app
2. You'll see all profiles with their verification status
3. Click "Verify All" button to verify all unverified profiles at once
4. Or click "Verify This Profile" on individual profiles

### Option 3: Users Can Re-sign

If you want users to verify their emails properly:
- They should use the magic link sent to their email
- The auth callback will automatically verify their profile

## Changes Made

### 1. Enhanced Test DB Page (`src/polymet/pages/test-db-page.tsx`)
- Shows verification status clearly (green checkmark for verified, red X for unverified)
- Displays count of verified vs unverified profiles
- Added "Verify All" button to verify all unverified profiles at once
- Added "Verify This Profile" button for individual profiles
- Highlights unverified profiles with orange border
- Shows all profiles (not limited to 10 anymore)

### 2. Enhanced Signatories Page (`src/polymet/pages/signatories-page.tsx`)
- Added admin notice when unverified profiles exist
- Shows total profile count vs verified count
- Provides link to Test DB page for easy verification

### 3. SQL Script (`supabase/verify_all_profiles.sql`)
- One-click script to verify all profiles
- Shows results after execution

## How to Verify the Fix

1. Go to `/test-db` to see all profiles and their status
2. Verify any unverified profiles using the UI buttons
3. Go to `/signatories` to see all verified profiles displayed
4. The admin notice will disappear once all profiles are verified

## Prevention

To prevent this in the future:
- Make sure users click the magic link in their email
- Monitor the auth callback flow for any errors
- Check the browser console for any failed API calls
- Consider adding email reminders for users who haven't verified

## Technical Details

**Database Schema:**
- Table: `profiles`
- Column: `is_verified` (boolean, defaults to `false`)

**API Function:**
- `getVerifiedProfiles()` in `src/polymet/data/api.ts`
- Filters by `is_verified = true`

**Verification Flow:**
1. User signs pledge → profile created with `is_verified = false`
2. Magic link sent to email
3. User clicks link → redirected to `/auth/callback`
4. Auth callback page calls `verifyProfile(userId)` 
5. Profile updated to `is_verified = true`
6. Profile now appears on signatories page


