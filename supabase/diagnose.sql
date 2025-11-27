-- DIAGNOSTIC QUERIES
-- Run these to understand what's happening

-- 1. Check if trigger exists
SELECT 
    'Trigger Status' as check_type,
    CASE 
        WHEN COUNT(*) > 0 THEN '✅ Trigger EXISTS'
        ELSE '❌ Trigger MISSING - Run migration_with_trigger.sql'
    END as status
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- 2. Check if function exists
SELECT 
    'Function Status' as check_type,
    CASE 
        WHEN COUNT(*) > 0 THEN '✅ Function EXISTS'
        ELSE '❌ Function MISSING - Run migration_with_trigger.sql'
    END as status
FROM information_schema.routines
WHERE routine_name = 'handle_new_user'
AND routine_schema = 'public';

-- 3. Check auth.users table (see if users are being created)
SELECT 
    'Auth Users Count' as check_type,
    COUNT(*)::text || ' users found' as status
FROM auth.users;

-- 4. Check profiles table (see if profiles are being created)
SELECT 
    'Profiles Count' as check_type,
    COUNT(*)::text || ' profiles found' as status
FROM public.profiles;

-- 5. Show recent auth users (last 5)
SELECT 
    'Recent Auth Users' as info,
    id,
    email,
    created_at,
    raw_user_meta_data->>'name' as metadata_name
FROM auth.users
ORDER BY created_at DESC
LIMIT 5;

-- 6. Show all profiles
SELECT 
    'All Profiles' as info,
    id,
    email,
    name,
    is_verified,
    created_at
FROM public.profiles
ORDER BY created_at DESC;

-- 7. Check if there are auth users WITHOUT corresponding profiles
SELECT 
    'Orphaned Auth Users (no profile)' as issue,
    u.id,
    u.email,
    u.created_at,
    u.raw_user_meta_data->>'name' as name_in_metadata
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE p.id IS NULL
ORDER BY u.created_at DESC;

