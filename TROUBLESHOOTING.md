# Troubleshooting Guide

## Quick Reference

- **Debug Page:** `http://localhost:5173/debug`
- **Test DB Page:** `http://localhost:5173/test-db`
- **Supabase Dashboard:** https://supabase.com/dashboard/project/gfjctyxqlwexxwsmkakq
- **SQL Editor:** https://supabase.com/dashboard/project/gfjctyxqlwexxwsmkakq/sql
- **API Settings:** https://supabase.com/dashboard/project/gfjctyxqlwexxwsmkakq/settings/api

---

## Common Issues

### Issue 1: Profile Not Found After Email Verification

**Symptoms:**
- User signs the pledge successfully
- Clicks the magic link in email
- Gets redirected but sees "Profile not found" error

**Root Causes:**
1. Database trigger not installed
2. Invalid Supabase API key
3. Profile creation failed silently

**Solution:**

#### Step 1: Fix Supabase API Key (CRITICAL)

The Supabase anon key in `src/lib/supabase.ts` must be a valid JWT token.

**Get the correct key:**
1. Go to: https://supabase.com/dashboard/project/gfjctyxqlwexxwsmkakq/settings/api
2. Find "Project API keys" section
3. Copy the **"anon" "public"** key (NOT the service_role key)
4. Should be ~200+ characters starting with `eyJ...`

**Update the code:**
```typescript
// src/lib/supabase.ts line 4
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Your actual key
```

**Restart dev server:**
```bash
npm run dev
```

#### Step 2: Verify Database Trigger

**Check if trigger exists:**

Run in Supabase SQL Editor:
```sql
SELECT COUNT(*) as trigger_exists 
FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created';
```

**If it returns 0 (no trigger):**
- Copy and paste the entire contents of `supabase/migration_with_trigger.sql`
- Click "Run"
- This creates the trigger that auto-creates profiles

#### Step 3: Run Diagnostics

Run `supabase/diagnose.sql` in SQL Editor:
```sql
-- Check system status
SELECT 'Auth Users' as type, COUNT(*) as count FROM auth.users
UNION ALL
SELECT 'Profiles', COUNT(*) FROM public.profiles
UNION ALL
SELECT 'Trigger Exists', COUNT(*) FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created';

-- Show recent auth users
SELECT id, email, created_at, email_confirmed_at 
FROM auth.users 
ORDER BY created_at DESC 
LIMIT 5;
```

#### Step 4: Manual Profile Creation (If Needed)

If you have auth users but no profiles, run `supabase/manual_create_profiles.sql` to create profiles for existing auth users.

---

### Issue 2: Magic Link Not Working

**Symptoms:**
- User doesn't receive magic link email
- Magic link doesn't redirect properly
- Authentication fails after clicking link

**Solutions:**

**Check email delivery:**
1. Look in spam folder
2. Verify Auth is enabled: Dashboard → Authentication → Settings
3. Check email rate limits in Supabase

**Check redirect URL:**
```typescript
// api.ts should have:
emailRedirectTo: `${window.location.origin}/auth/callback`
```

**Test with Debug Page:**
1. Go to `/debug`
2. Enter your email in "Test Authentication"
3. Click "Send Magic Link"
4. Check console for errors

---

### Issue 3: Invalid API Key Errors

**Symptoms:**
- Browser console shows API key errors
- Failed to fetch errors
- CORS errors

**Solution:**

The key must be a JWT token, not `sb_publishable_...` format.

**Validate your key:**
- Should start with `eyJ`
- Should be 200+ characters
- Should be the **anon public** key from Supabase settings

**After fixing:**
- Clear browser cache
- Restart dev server
- Test on `/debug` page

---

## Testing Workflow

### Option A: Using Debug Page (Recommended)

1. Go to `http://localhost:5173/debug`
2. Check authentication status
3. Enter email in "Test Authentication"
4. Send magic link
5. Click link in email
6. Should redirect to `/auth/callback` → `/verify/:id` → `/p/:id`
7. Refresh debug page to confirm authentication

### Option B: Using Main App Flow

1. Go to homepage
2. Click "Sign the Pledge"
3. Fill in the form
4. Submit
5. Check email for magic link
6. Click link
7. Should see verification success → profile page

---

## Database Setup

### Initial Setup

1. **Run main migration:**
   - Open Supabase SQL Editor
   - Copy contents of `supabase/migration_with_trigger.sql`
   - Execute

2. **Verify setup:**
   - Run `supabase/diagnose.sql`
   - Should show trigger exists
   - Tables should be created

### RLS Policies

The migration includes Row Level Security (RLS) policies:
- **Profiles:** Public read, authenticated write
- **Witnesses:** Public read, authenticated write
- Auto-creation via trigger bypasses RLS

### Available SQL Utilities

- `check_profile.sql` - Check if specific profile exists
- `check_trigger.sql` - Verify trigger is installed
- `diagnose.sql` - Full system diagnostics
- `manual_create_profiles.sql` - Create profiles for orphaned auth users
- `mark_verified.sql` - Manually verify a profile
- `migration_with_trigger.sql` - Main database setup
- `schema.sql` - Table definitions
- `simple_fix.sql` - Quick fix for common issues

---

## Expected Authentication Flow

### Sign Up Flow
1. **User fills pledge form** → Submit
2. **Backend calls** `supabase.auth.signInWithOtp()`
3. **Email sent** with magic link
4. **User clicks link** → redirects to `/auth/callback`
5. **Callback page** processes auth hash
6. **Trigger fires** → creates profile in DB
7. **Redirect to** `/verify/:id` → shows success
8. **Final redirect to** `/p/:id` → shows profile

### Login Flow (Existing Users)
1. **User clicks** "Already Pledged? Log In"
2. **Enters email** → magic link sent
3. **Clicks link** → redirects to `/auth/callback`
4. **Auth verified** → redirects to profile
5. **Profile loaded** from existing DB record

---

## Debugging Tools

### Debug Page Features (`/debug`)

- **Authentication Status:** Shows if user is logged in
- **Profile Data:** Displays current profile info
- **Session Details:** Shows auth session data
- **Quick Actions:**
  - Send magic link
  - Sign out
  - Refresh status
  - View logs

### Test DB Page Features (`/test-db`)

- **Connection Test:** Verifies Supabase connection
- **Profile List:** Shows all profiles in DB
- **Create Test Profile:** Add sample data
- **Error Display:** Shows connection/query errors

### Browser Console Debugging

**Check for these errors:**
```
❌ INVALID SUPABASE KEY → Fix anon key in supabase.ts
❌ Failed to fetch → Network/CORS issue
❌ Invalid API key → Wrong anon key
❌ Profile not found → Trigger not installed or failed
```

---

## Quick Fixes

### Nuclear Option (Fresh Start)

If nothing works:

1. **Run migration:**
   ```sql
   -- Copy entire supabase/migration_with_trigger.sql
   -- This resets tables and recreates trigger
   ```

2. **Fix anon key** in `src/lib/supabase.ts`

3. **Restart dev server:**
   ```bash
   npm run dev
   ```

4. **Sign pledge again** with a different email

5. **Should work perfectly now**

### Quick Diagnostic Commands

**Check auth users:**
```sql
SELECT id, email, created_at, email_confirmed_at 
FROM auth.users 
ORDER BY created_at DESC 
LIMIT 10;
```

**Check profiles:**
```sql
SELECT id, name, email, is_verified, created_at 
FROM public.profiles 
ORDER BY created_at DESC 
LIMIT 10;
```

**Check for orphaned auth users:**
```sql
SELECT u.id, u.email, u.created_at
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE p.id IS NULL;
```

---

## Checklist for Setup

- [ ] Supabase anon key correctly set in `src/lib/supabase.ts`
- [ ] Dev server restarted after key update
- [ ] Database migration run (`migration_with_trigger.sql`)
- [ ] Trigger verified to exist (run `check_trigger.sql`)
- [ ] Test authentication on `/debug` page
- [ ] Send magic link and verify email works
- [ ] Click magic link and verify redirect works
- [ ] Profile auto-created successfully
- [ ] Can view profile at `/p/:id`

---

## Getting Help

If you're still experiencing issues:

1. **Run diagnostics:** Execute `supabase/diagnose.sql`
2. **Check browser console** for errors (F12)
3. **Check Supabase logs:** Dashboard → Logs → Postgres Logs
4. **Verify email settings:** Dashboard → Authentication → Settings
5. **Check debug page:** `/debug` for real-time status

**Share this info when asking for help:**
- Auth Users Count (from diagnose.sql)
- Profiles Count (from diagnose.sql)
- Trigger Status (from diagnose.sql)
- Any error messages from browser console
- Steps taken so far
