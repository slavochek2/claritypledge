# Signatories Not Showing - Final Fix

## The Real Problem

The test DB page shows:
- ✅ 2 profiles exist
- ✅ Both are verified (green checkmarks)
- ⚠️ **But `getVerifiedProfiles()` returns 0 profiles**

This means the API query is failing, not the verification status.

## Root Cause

The nested Supabase query `witnesses (*)` was likely failing silently or causing the entire query to return no results.

## What I Fixed

### 1. Changed `getVerifiedProfiles()` Query Strategy

**Before:**
```typescript
// Single query with nested witnesses - CAN FAIL
.select('*, witnesses (*)')
```

**After:**
```typescript
// Two separate queries - MORE RELIABLE
1. Fetch all verified profiles
2. Fetch witnesses separately
3. Combine them in JavaScript
```

This approach:
- Works even if witnesses table has issues
- Provides better error handling
- Logs each step for debugging

### 2. Added Detailed Logging

Every step now logs to console with emojis:
- 🔍 Starting fetch
- ✅ Success with counts
- ❌ Errors with full details
- ⚠️ Warnings for non-fatal issues

### 3. Added Direct Query Test Button

New "Test Direct Query" button on `/test-db` page that runs:
- Simple query (without witnesses)
- Nested query (with witnesses)
- Logs results to console

## How to Fix

### Step 1: Refresh the App

Your browser should reload automatically, or refresh the page manually.

### Step 2: Check the Test DB Page

1. Go to `/test-db`
2. Click "Refresh"
3. Check the browser console (F12 → Console)
4. Look for the logs:
   ```
   🔍 Fetching verified profiles...
   ✅ Verified profiles fetched: 2
   ✅ Witnesses fetched: X
   ✅ Mapped profiles: [...]
   ```

### Step 3: Check Signatories Page

1. Click "View Signatories Page" or go to `/signatories`
2. You should now see both profiles!

### Step 4: If Still Not Working - Run SQL Diagnostic

Run this in Supabase SQL Editor:

```sql
-- File: supabase/check_rls_and_data.sql
```

This checks:
- Profile verification status
- Witnesses table structure
- RLS policies
- Actual data that query should return

## Debugging Tools

### Browser Console

Open Console (F12) and you'll see detailed logs:
- What query is running
- How many results returned
- Any errors with full details
- Mapped data structure

### Test Direct Query Button

On `/test-db` page:
1. Click "Test Direct Query"
2. Check console for results
3. Compares simple vs nested query

### API Test Section

The "getVerifiedProfiles() API Test" section shows:
- What the signatories page actually receives
- Raw JSON data
- Number of profiles returned

## Expected Result

After the fix, you should see:

**On /signatories page:**
```
✅ 2 verified signatories

[Karl Popper card]
[Vyacheslav Ladischenski card]
```

**In browser console:**
```
🔍 Fetching verified profiles...
✅ Verified profiles fetched: 2
✅ Witnesses fetched: 0
✅ Mapped profiles: [{ id: '...', name: 'Karl Popper', ... }, { id: '...', name: 'Vyacheslav Ladischenski', ... }]
```

## If Still Not Working

1. **Check console** for error messages
2. **Run check_rls_and_data.sql** in Supabase
3. **Click "Test Direct Query"** to see if simple query works
4. **Check if RLS policies are blocking** the query

The new code is more resilient and will work even if:
- Witnesses table is empty
- Witnesses query fails
- There are RLS issues with witnesses

## Technical Details

The fix separates concerns:
- Profile fetching (must work)
- Witnesses fetching (nice to have)

If witnesses fail, profiles still show (just with 0 endorsements).

## Files Changed

1. `src/polymet/data/api.ts` - Changed `getVerifiedProfiles()` query strategy
2. `src/polymet/pages/test-db-page.tsx` - Added direct query test button
3. `supabase/check_rls_and_data.sql` - New diagnostic script

## Next Steps

1. Refresh the page
2. Check `/test-db` and look at console
3. Go to `/signatories` - profiles should appear!
4. If not, share the console logs so we can debug further


