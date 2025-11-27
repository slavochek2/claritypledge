-- Verify all existing profiles
-- Run this in Supabase SQL Editor to mark all profiles as verified

UPDATE public.profiles
SET is_verified = true
WHERE is_verified = false;

-- Check the results
SELECT 
  id,
  name,
  email,
  is_verified,
  created_at
FROM public.profiles
ORDER BY created_at DESC;


