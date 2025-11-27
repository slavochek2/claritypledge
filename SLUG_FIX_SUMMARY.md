# Fix: "Profile Not Found" When Viewing Pledge Through Menu

## Problem
When users clicked "View My Pledge" from the navigation menu, they were seeing a "Profile Not Found" error. This occurred because some user profiles were missing the `slug` field in the database, causing the navigation to attempt to load `/p/undefined` or `/p/null`.

## Root Cause
1. Some profiles in the database had missing or empty `slug` values
2. The navigation components used `profile.slug` directly without fallback handling
3. The profile URL generation didn't account for missing slugs

## Solution Implemented

### 1. Enhanced Slug Handling in Data Layer (`src/polymet/data/api.ts`)
- Improved `mapProfileFromDb()` function with better fallback logic:
  - Priority 1: Use existing slug if valid
  - Priority 2: Generate slug from name if available
  - Priority 3: Use profile ID as absolute fallback
- Added proper type checking to prevent empty string slugs
- Added fallback for missing names ("Anonymous")

### 2. Added Fallbacks in Navigation (`src/polymet/components/clarity-navigation.tsx`)
- Changed `/p/${currentUser.slug}` to `/p/${currentUser.slug || currentUser.id}`
- Applied to both desktop dropdown menu and mobile menu
- Ensures profile is always accessible even if slug generation fails

### 3. Added Fallbacks in Dashboard (`src/polymet/pages/dashboard-page.tsx`)
- Updated profile URL generation to use fallback
- Updated "View My Pledge" button link to use fallback

### 4. Added Fallbacks in Profile Page (`src/polymet/pages/profile-page.tsx`)
- Updated profileUrl generation to use fallback
- Updated profile refresh logic to handle missing slugs

### 5. Enhanced Debug Page (`src/polymet/pages/debug-page.tsx`)
- Added slug display in profile status
- Shows warning if slug is missing
- Added "Generate Missing Slug" button to fix profiles on the fly
- Added slug generation helper function

### 6. Created Database Migration Script (`supabase/backfill_missing_slugs.sql`)
- Backfills missing slugs for existing profiles
- Generates slugs from names
- Handles duplicate slugs by appending numbers
- Includes verification queries to check results

## How to Fix Existing Data

### Option 1: Run the SQL Script (Recommended for bulk fix)
```bash
# Connect to your Supabase database and run:
psql YOUR_DATABASE_URL -f supabase/backfill_missing_slugs.sql
```

### Option 2: Use the Debug Page (For individual users)
1. Navigate to `/debug` while logged in
2. Check if your profile shows "⚠️ MISSING" next to the Slug field
3. Click the "Generate Missing Slug" button
4. Your slug will be generated from your name

### Option 3: Let the Code Handle It Automatically
The enhanced code now automatically generates slugs when loading profiles, so users can access their profiles using their ID instead of slug, and the system will work correctly.

## Testing
To verify the fix works:
1. Log in to the application
2. Click the menu button (hamburger icon or user menu)
3. Click "View My Pledge"
4. You should now see your pledge page instead of "Profile Not Found"

## Prevention
- All new profiles created through the signup flow already include slug generation
- The profile creation trigger in the database should be updated to always generate a slug
- The enhanced fallback logic prevents this issue from affecting users even if slugs are missing

## Files Modified
- `src/polymet/data/api.ts` - Enhanced slug handling and fallbacks
- `src/polymet/components/clarity-navigation.tsx` - Added fallback to links
- `src/polymet/pages/dashboard-page.tsx` - Added fallback to links
- `src/polymet/pages/profile-page.tsx` - Added fallback to URL and refresh logic
- `src/polymet/pages/debug-page.tsx` - Added slug debugging tools

## Files Created
- `supabase/backfill_missing_slugs.sql` - Migration script to fix existing data
- `SLUG_FIX_SUMMARY.md` - This documentation


