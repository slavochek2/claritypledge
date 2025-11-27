-- Mark your profile as verified
UPDATE public.profiles
SET is_verified = true
WHERE email = 'slavochek@googlemail.com';

-- Verify it worked
SELECT 
    name,
    email,
    is_verified,
    created_at
FROM public.profiles
WHERE email = 'slavochek@googlemail.com';

