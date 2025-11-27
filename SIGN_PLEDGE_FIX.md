# Fix: "Failed to sign pledge. Please try again." Error

## Problem
When users fill out the pledge form and click "Sign the Pledge", they sometimes get an error message: "Failed to sign pledge. Please try again."

## Root Causes
The error can occur from several issues:

1. **Invalid Supabase API Key** - The anon key in `src/lib/supabase.ts` must be a valid JWT token
2. **Supabase Auth Not Configured** - Email authentication or magic link settings not enabled
3. **Email Validation Issues** - Invalid email format or email service problems
4. **Network Issues** - Connection problems with Supabase

## Solution Implemented

### 1. Enhanced Error Logging
**File: `src/polymet/data/api.ts`**

Added comprehensive logging to the `createProfile` function:
- Validates name and email format before submission
- Logs all Supabase error details to console
- Includes debug information for troubleshooting

```typescript
// New validation and logging:
- Email format validation with regex
- Slug generation logging
- Redirect URL logging
- Detailed Supabase error reporting
```

### 2. Improved Error Messages
**File: `src/polymet/components/sign-pledge-form.tsx`**

Enhanced error handling with specific messages:
- Configuration errors
- Rate limit errors
- Invalid email errors
- Generic fallback error message

### 3. Fixed Modal State Reset
**File: `src/polymet/components/pledge-modal.tsx`**

Added state reset on modal close:
- Ensures `showCheckEmail` state resets when modal closes
- Allows users to open the form fresh on reopening
- Prevents getting stuck on success screen

## Debugging Steps

### Step 1: Check Browser Console
1. Open DevTools (F12)
2. Go to Console tab
3. Submit the form
4. Look for logs starting with:
   - `📧 Creating profile with email:`
   - `🔤 Generated slug:`
   - `🔗 Redirect URL:`
   - `✅ Magic link sent successfully` (success)
   - `❌ Supabase auth error:` (failure)

### Step 2: Verify Supabase Configuration
1. Go to https://supabase.com/dashboard/project/gfjctyxqlwexxwsmkakq/settings/api
2. Check that "API Keys" section exists
3. Copy the "anon" "public" key (should start with `eyJ...` and be 200+ characters)
4. Compare with value in `src/lib/supabase.ts` line 4
5. If different, update and restart dev server

### Step 3: Check Email Settings
1. Go to https://supabase.com/dashboard/project/gfjctyxqlwexxwsmkakq/auth/providers
2. Verify "Email" provider is enabled
3. Check "Enable email confirmations" is turned ON

### Step 4: Test Magic Link
1. Go to `/debug` page
2. Enter test email
3. Click "Send Magic Link"
4. Check spam folder for verification email
5. If no email received, email service has an issue

## Quick Checklist

- [ ] Supabase anon key is correct (check console logs)
- [ ] Email provider enabled in Supabase
- [ ] Email received verification link
- [ ] Dev server restarted after API key update
- [ ] No network connectivity issues
- [ ] Form validation passed (name + email filled)

## If Problem Persists

1. **Check Console Logs** - Look for `❌ Error signing pledge:` message
2. **Run Diagnostics** - Execute `supabase/diagnose.sql` in Supabase SQL Editor
3. **Check Supabase Logs** - Dashboard → Logs → Postgres Logs for database errors
4. **Verify Network** - Check browser Network tab for failed requests
5. **Try Different Email** - Email may already be registered

## Technical Details

### Validation Flow
```
User submits → Form validates name + email → 
createProfile() validates format → 
generateSlug() creates URL-friendly name → 
signInWithOtp() sends magic link → 
Email sent confirmation (success) OR 
Error details logged (failure)
```

### Error Handling
```
If error detected:
1. Log full error object to console
2. Check error message for known patterns
3. Display user-friendly error message
4. Reset form state for retry
```

## Related Files Modified
- `src/polymet/components/sign-pledge-form.tsx` - Enhanced error handling
- `src/polymet/data/api.ts` - Added validation and logging  
- `src/polymet/components/pledge-modal.tsx` - Fixed state reset

## Testing the Fix

1. Open the app and click "Take the Pledge"
2. Fill in name and email
3. Click "Sign the Pledge"
4. Check browser console for detailed logs
5. If error occurs, share the error logs
6. Magic link should arrive in email within 5 seconds

## Support

If you still encounter the "Failed to sign pledge" error after trying these steps:

1. Share the console error messages (press F12, go to Console)
2. Check if the email was received
3. Confirm Supabase API key is correct
4. Run `/debug` page to test authentication


