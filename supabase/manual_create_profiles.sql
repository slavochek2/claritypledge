-- MANUAL PROFILE CREATION FOR ORPHANED AUTH USERS
-- Use this if the trigger didn't work and you have auth users without profiles

-- This will create profiles for any auth users that don't have them yet
INSERT INTO public.profiles (id, email, name, role, linkedin_url, reason, avatar_color, is_verified)
SELECT 
    u.id,
    u.email,
    COALESCE(u.raw_user_meta_data->>'name', 'Anonymous User'),
    u.raw_user_meta_data->>'role',
    u.raw_user_meta_data->>'linkedin_url',
    u.raw_user_meta_data->>'reason',
    COALESCE(u.raw_user_meta_data->>'avatar_color', '#0044CC'),
    true  -- Mark as verified since they clicked the magic link
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE p.id IS NULL
AND u.email IS NOT NULL;

-- Show what was created
SELECT 
    'Profiles Created' as result,
    COUNT(*) as count
FROM public.profiles
WHERE created_at > NOW() - INTERVAL '1 minute';

-- Show all profiles now
SELECT * FROM public.profiles ORDER BY created_at DESC;

