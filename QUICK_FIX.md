# Quick Fix: Add Missing Slug Column

## Problem
✗ The `slug` column doesn't exist in your database
✗ "View My Pledge" shows "Profile Not Found"
✗ "Fix My Slug" button doesn't work

## Solution (5 minutes)

### Step 1: Open Supabase
Go to https://supabase.com and open your project

### Step 2: Open SQL Editor
Click **"SQL Editor"** in the left sidebar → **"New query"**

### Step 3: Run Migration Script
1. Open this file on your computer: `supabase/add_slug_column_migration.sql`
2. Copy **ALL** the contents (Cmd/Ctrl + A, then Cmd/Ctrl + C)
3. Paste into the Supabase SQL Editor (Cmd/Ctrl + V)
4. Click **"Run"** button (or press Cmd/Ctrl + Enter)

### Step 4: Verify Success
You should see output like:
```
total_profiles: 1
profiles_with_slug: 1
```

### Step 5: Test
1. Go back to your app
2. Refresh the page (Cmd/Ctrl + R)
3. Click menu → "View My Pledge"
4. ✓ Should work now!

## Visual Guide

```
Supabase Dashboard
├── SQL Editor (click here)
│   └── New query (click here)
│       └── Paste migration script here
│       └── Click "Run" button
│
└── After running, check Table Editor
    └── profiles table
        └── Should now have "slug" column ✓
```

## What Gets Fixed

✓ Adds `slug` column to profiles table
✓ Generates "karl-popper" slug from "Karl Popper" name
✓ All existing users get slugs
✓ Future users automatically get slugs
✓ "View My Pledge" will work
✓ Profile accessible at `/p/karl-popper`

## Need Help?

See `FIX_MISSING_SLUG_COLUMN.md` for detailed instructions with troubleshooting.


