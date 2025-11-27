# Testing the Slug Fix

## Quick Test Steps

### 1. Check Debug Page
1. Start the development server: `npm run dev`
2. Log in to your account
3. Navigate to `/debug`
4. Look at the "Profile Status" section
5. **Expected Results:**
   - If slug exists: You'll see your slug and a clickable profile URL
   - If slug is missing: You'll see "⚠️ MISSING" and a button to generate it

### 2. Test "View My Pledge" Navigation
1. While logged in, click the menu button (top-right corner)
2. Click "View My Pledge"
3. **Expected Result:** You should see your pledge page, NOT "Profile Not Found"

### 3. Test Dashboard Link
1. Navigate to `/dashboard`
2. Click the "View My Pledge" button
3. **Expected Result:** You should see your pledge page, NOT "Profile Not Found"

### 4. Fix Missing Slug (If Needed)
If you see the slug is missing in the debug page:
1. Click the "Generate Missing Slug" button
2. Refresh the page
3. Your slug should now be generated from your name
4. Try steps 2 and 3 again - they should work now

## Technical Verification

### Check Database Directly
If you have Supabase Studio access:
```sql
-- Check if your profile has a slug
SELECT id, name, email, slug, is_verified
FROM profiles
WHERE email = 'your-email@example.com';

-- Check for any profiles without slugs
SELECT id, name, email, slug
FROM profiles
WHERE slug IS NULL OR slug = '';
```

### Run Migration Script (If Many Users Affected)
If you find multiple users without slugs:
```bash
# Connect to Supabase and run the backfill script
psql YOUR_DATABASE_CONNECTION_STRING -f supabase/backfill_missing_slugs.sql
```

## What the Fix Does

### Before the Fix:
- If profile.slug was missing or null
- Navigation created link: `/p/undefined`
- Result: "Profile Not Found" error

### After the Fix:
- Multiple fallback layers:
  1. Try to use existing slug
  2. Generate slug from name
  3. Use profile ID as last resort
- Navigation creates link: `/p/john-doe` or `/p/abc-123-id`
- Result: Profile loads successfully

## Verification Checklist

- [ ] Debug page shows slug (or allows you to generate it)
- [ ] "View My Pledge" from menu works
- [ ] "View My Pledge" from dashboard works
- [ ] Profile URL in browser bar looks correct (e.g., `/p/your-name`)
- [ ] Share tools show correct URL
- [ ] No "Profile Not Found" errors when navigating to own profile

## If Issues Persist

1. Check browser console for errors (F12 → Console tab)
2. Check that you're logged in (auth token valid)
3. Verify your profile exists in the database
4. Try generating slug manually from debug page
5. Clear browser cache and cookies, then log in again

## Common Scenarios

### Scenario 1: Old User Without Slug
- **Symptom:** Menu shows "View My Pledge" but clicking shows "Profile Not Found"
- **Fix:** Use debug page to generate slug, or system will use ID automatically

### Scenario 2: New User Signing Up
- **Expected:** Slug is automatically generated during signup
- **Verify:** Check debug page to confirm slug was created

### Scenario 3: User With Spaces/Special Characters in Name
- **Example Name:** "John Doe Jr."
- **Generated Slug:** "john-doe-jr"
- **Verify:** URL should be `/p/john-doe-jr`


