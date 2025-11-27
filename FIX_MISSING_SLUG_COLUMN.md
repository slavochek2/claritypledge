# Fix: Missing Slug Column in Database

## The Problem
The `slug` column doesn't exist in your `profiles` table in Supabase. This is why:
1. "Fix My Slug" button doesn't work (can't update a column that doesn't exist)
2. "View My Pledge" shows "Profile Not Found" (trying to query a column that doesn't exist)

## The Solution
Run the migration script to add the `slug` column to your database.

## Step-by-Step Fix

### Option 1: Using Supabase SQL Editor (Recommended)

1. **Open Supabase Dashboard**
   - Go to https://supabase.com
   - Select your project

2. **Open SQL Editor**
   - Click "SQL Editor" in the left sidebar
   - Click "New query"

3. **Copy and Paste the Migration Script**
   - Open the file: `supabase/add_slug_column_migration.sql`
   - Copy ALL the contents
   - Paste into the SQL Editor

4. **Run the Script**
   - Click "Run" (or press Cmd/Ctrl + Enter)
   - Wait for completion (should take a few seconds)
   - You should see output showing how many profiles were updated

5. **Verify It Worked**
   - Go to "Table Editor" in Supabase
   - Select "profiles" table
   - You should now see a "slug" column
   - Karl Popper's row should have slug = "karl-popper"

### Option 2: Using Supabase CLI

If you have Supabase CLI installed:

```bash
cd /Users/slavochek/Documents/polymet-clarity-pledge-app

# Make sure you're linked to your project
supabase link

# Run the migration
supabase db execute -f supabase/add_slug_column_migration.sql
```

### Option 3: Using psql (PostgreSQL CLI)

If you have direct database access:

```bash
psql YOUR_DATABASE_CONNECTION_STRING -f supabase/add_slug_column_migration.sql
```

## What the Migration Does

1. ✅ Adds the `slug` column to the `profiles` table
2. ✅ Creates an index for fast slug lookups
3. ✅ Generates slugs for all existing users from their names
   - "Karl Popper" → "karl-popper"
4. ✅ Handles duplicate slugs by appending numbers
5. ✅ Adds unique constraint to prevent duplicate slugs
6. ✅ Updates the trigger to auto-generate slugs for new users
7. ✅ Shows verification output

## After Running the Migration

1. **Refresh the Diagnostic Page**
   - Go back to `/diagnostic`
   - Click "Refresh Diagnostic"
   - The "Slug" field should now show "karl-popper" ✅

2. **Test "View My Pledge"**
   - Click the menu → "View My Pledge"
   - Should work now! ✅

3. **Verify in Supabase**
   - Open Table Editor → profiles
   - You should see the slug column with values

## Expected Output

After running the migration, you should see something like:

```sql
-- Results
total_profiles: 1
profiles_with_slug: 1
profiles_without_slug: 0
unique_slugs: 1

-- Profile listing
id                                   | name        | email              | slug        | created_at
-------------------------------------|-------------|-----------------------|-------------|-------------------------
eb019fb5-ec8c-4610-a765-2ae2059da6b7 | Karl Popper | slava@inguro.com      | karl-popper | 2025-11-26 10:08:12...
```

## Troubleshooting

### Error: "column already exists"
- The column might already exist (check Table Editor)
- The migration is safe to run - it uses `IF NOT EXISTS`

### Error: "duplicate key value violates unique constraint"
- Two users might have the same name
- The migration handles this automatically by appending numbers
- Example: "john-doe", "john-doe-2", "john-doe-3"

### Error: Permission denied
- Make sure you're logged in to the correct Supabase project
- You need admin/owner permissions to alter tables

### Still Not Working After Migration
1. Clear browser cache (Cmd/Ctrl + Shift + R)
2. Log out and log back in
3. Check browser console for errors (F12)
4. Verify the slug exists in Supabase Table Editor

## Prevention

The migration includes a trigger that will automatically generate slugs for all new users, so this issue won't happen again.

## Summary

**Before Migration:**
- ❌ No slug column in database
- ❌ Profiles can't be found by slug
- ❌ "View My Pledge" doesn't work

**After Migration:**
- ✅ Slug column exists
- ✅ All existing users have slugs
- ✅ New users automatically get slugs
- ✅ "View My Pledge" works
- ✅ Profiles accessible at readable URLs like `/p/karl-popper`

## Next Steps

After running the migration:
1. ✅ Test the "View My Pledge" button
2. ✅ Verify profile loads at `/p/karl-popper`
3. ✅ Test sharing tools (they'll use the slug in URLs)
4. ✅ No more "Profile Not Found" errors!


