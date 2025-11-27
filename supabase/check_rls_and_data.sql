-- Check 1: Verify the profiles are actually marked as verified
SELECT 
  id,
  name,
  email,
  is_verified,
  slug,
  created_at
FROM public.profiles
ORDER BY created_at DESC;

-- Check 2: Check if witnesses table exists and has proper structure
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'witnesses'
ORDER BY ordinal_position;

-- Check 3: Test the exact query that getVerifiedProfiles() uses
-- This should match what the API is running
SELECT 
  p.*,
  json_agg(
    json_build_object(
      'id', w.id,
      'witness_name', w.witness_name,
      'witness_linkedin_url', w.witness_linkedin_url,
      'created_at', w.created_at,
      'is_verified', w.is_verified
    )
  ) FILTER (WHERE w.id IS NOT NULL) as witnesses
FROM public.profiles p
LEFT JOIN public.witnesses w ON w.profile_id = p.id
WHERE p.is_verified = true
GROUP BY p.id
ORDER BY p.created_at DESC;

-- Check 4: Simpler query without witnesses join
SELECT *
FROM public.profiles
WHERE is_verified = true
ORDER BY created_at DESC;

-- Check 5: Check RLS policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('profiles', 'witnesses')
ORDER BY tablename, policyname;


