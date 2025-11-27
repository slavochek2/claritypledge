-- SIMPLE FIX: Create your profile manually if signup didn't work

-- Step 1: Find your auth user ID
-- Copy the entire results from this query
SELECT 
    id as user_id,
    email,
    created_at,
    raw_user_meta_data->>'name' as name_from_signup,
    confirmation_sent_at,
    confirmed_at,
    email_confirmed_at
FROM auth.users 
ORDER BY created_at DESC 
LIMIT 5;

-- Step 2: Check if you already have a profile
SELECT * FROM public.profiles ORDER BY created_at DESC;

-- Step 3: If you don't have a profile, uncomment and run this:
-- (Replace the values with YOUR actual data from Step 1)

/*
INSERT INTO public.profiles (
    id, 
    email, 
    name, 
    role,
    linkedin_url,
    reason,
    avatar_color,
    is_verified
)
VALUES (
    'PASTE-YOUR-USER-ID-HERE',  -- From Step 1
    'your@email.com',             -- Your actual email
    'Your Full Name',             -- Your actual name
    'Your Role',                  -- Optional
    'linkedin.com/in/you',        -- Optional
    'Your reason for signing',    -- Optional
    '#0044CC',                    -- Color
    true                          -- Mark as verified
);
*/

-- Step 4: Verify it was created
SELECT 
    'SUCCESS! Profile created:' as message,
    id,
    email,
    name,
    is_verified
FROM public.profiles 
ORDER BY created_at DESC 
LIMIT 1;

