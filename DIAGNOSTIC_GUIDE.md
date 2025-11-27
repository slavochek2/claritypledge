# Profile Not Found - Diagnostic Guide

## Issue
User "Karl Popper" is getting "Profile Not Found" when clicking "View My Pledge" from the menu.

## Quick Fix Steps

### Step 1: Open the Diagnostic Page
1. Make sure you're logged in as Karl Popper
2. Navigate to: `http://localhost:5173/diagnostic` (or your dev server URL + `/diagnostic`)
3. The page will automatically run diagnostics

### Step 2: Check What It Shows
The diagnostic page will show:
- **Current User (via API)**: How your profile appears to the frontend
- **Raw Profile (from Database)**: What's actually stored in the database
- **All Profiles Summary**: Overview of all users and slug issues

### Step 3: Look for the Problem
Check if the "Slug" field shows:
- ✅ A value like `karl-popper` → Slug exists (issue is elsewhere)
- ❌ MISSING or empty → **This is the problem!**

### Step 4: Fix the Slug

#### Option A: Fix Just Karl Popper's Profile
If only Karl Popper's slug is missing:
1. Click the **"Fix My Slug"** button in the "Raw Profile" section
2. Wait for confirmation
3. Try clicking "View My Pledge" again - it should work now!

#### Option B: Fix All Profiles
If multiple users have missing slugs:
1. Click the **"Fix All Missing Slugs"** button in the "All Profiles Summary" section
2. Wait for all updates to complete
3. All users should now be able to view their pledges

## What the Fix Does

The fix will:
1. Take the user's name (e.g., "Karl Popper")
2. Convert it to a URL-friendly slug (e.g., "karl-popper")
3. Update the database with this slug
4. The profile will now be accessible at `/p/karl-popper`

## Debugging Console Logs

I've added extensive logging throughout the app. Open your browser's Developer Console (F12) and look for:

### When Loading Navigation
```
🔍 Navigation: Current user loaded: {
  id: "...",
  name: "Karl Popper",
  slug: "karl-popper",  // or undefined if missing
  email: "...",
  hasSlug: true/false,
  hasId: true/false,
  fallbackValue: "..."
}
```

### When Clicking "View My Pledge"
```
🔗 Navigating to profile: {
  slug: "karl-popper",  // or undefined
  id: "...",
  generatedPath: "/p/karl-popper"  // the URL being navigated to
}
```

### When Loading Profile Page
```
🔍 ProfilePage: Loading profile with ID/slug: karl-popper
📊 ProfilePage: getProfileBySlug result: Found/Not found
🔄 ProfilePage: Trying getProfile with ID...
📊 ProfilePage: getProfile result: Found/Not found
✅ ProfilePage: Profile loaded successfully: {...}
```

OR

```
❌ ProfilePage: No profile found for: karl-popper
```

## Common Scenarios & Solutions

### Scenario 1: Slug is Missing in Database
**Symptom:** Diagnostic page shows "❌ MISSING" for slug
**Solution:** Click "Fix My Slug" button
**Why:** Profile was created before slug column existed or trigger failed

### Scenario 2: Slug Exists But Wrong Value
**Symptom:** Slug shows something unexpected (e.g., `undefined`, `null`, empty string)
**Solution:** Click "Fix My Slug" to regenerate it
**Why:** Data corruption or bug in original slug generation

### Scenario 3: Profile Doesn't Exist at All
**Symptom:** Diagnostic page shows "Not loaded" for raw profile
**Solution:** User needs to sign up / profile wasn't created properly
**Why:** Authentication exists but profile creation failed

### Scenario 4: Everything Looks Correct
**Symptom:** Slug exists, looks correct, but still getting "Profile Not Found"
**Possible causes:**
1. Browser cache - Try hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
2. Database query issue - Check Supabase RLS policies
3. Network issue - Check browser Network tab for failed requests

## Technical Details

### How Profile Loading Works
1. User clicks "View My Pledge"
2. Navigation reads `currentUser.slug` (or falls back to `currentUser.id`)
3. Generates URL: `/p/{slug-or-id}`
4. ProfilePage receives the slug/id parameter
5. Tries `getProfileBySlug(slug)` first
6. If not found, tries `getProfile(id)` as fallback
7. If still not found, shows "Profile Not Found"

### Why the Fallback System
The code now has multiple fallback layers:
- **Layer 1:** Use `profile.slug` if it exists
- **Layer 2:** Use `profile.id` if slug is missing
- **Layer 3:** API generates slug from name if missing during data mapping
- **Layer 4:** ProfilePage tries both slug and ID lookups

## After Fixing

Once the slug is fixed:
1. The "View My Pledge" link will work correctly
2. Profile will be accessible at readable URL: `/p/karl-popper`
3. Sharing tools will generate proper URLs
4. No more "Profile Not Found" errors

## Still Having Issues?

If the problem persists after following these steps:

1. **Check Console Logs**: Look for error messages in browser console
2. **Check Network Tab**: See if API requests are failing
3. **Check Supabase Dashboard**: Manually verify the slug in the database
4. **Check RLS Policies**: Ensure Row Level Security allows reading profiles
5. **Clear Everything**: Log out, clear cookies/cache, log back in
6. **Contact Support**: Share the console logs and diagnostic page output

## Prevention for Future Users

To prevent this issue for new signups:
1. Ensure the database trigger generates slugs on profile creation
2. Verify `slug` column has proper default or is populated by trigger
3. The enhanced code now handles missing slugs gracefully as fallback

See `supabase/backfill_missing_slugs.sql` for database-level fix.


