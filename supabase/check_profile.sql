-- Check if your profile exists
SELECT * FROM public.profiles 
WHERE email = 'slavochek@googlemail.com';

-- Check the witnesses table structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'witnesses' 
AND table_schema = 'public';

-- Try to select profile with witnesses (this is what the app does)
SELECT 
    p.*,
    json_agg(w.*) FILTER (WHERE w.id IS NOT NULL) as witnesses
FROM public.profiles p
LEFT JOIN public.witnesses w ON w.profile_id = p.id
WHERE p.email = 'slavochek@googlemail.com'
GROUP BY p.id;

