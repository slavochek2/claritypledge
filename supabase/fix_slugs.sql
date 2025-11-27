-- DIAGNOSTIC: Check current slug status
SELECT 
  id,
  name,
  slug,
  CASE 
    WHEN slug IS NULL THEN '❌ NULL'
    WHEN slug = '' THEN '❌ EMPTY'
    ELSE '✅ OK'
  END as slug_status
FROM public.profiles
ORDER BY created_at DESC;

-- FIX 1: Drop the unique constraint if it exists (might be causing issues)
DROP INDEX IF EXISTS profiles_slug_key;

-- FIX 2: Update any NULL or empty slugs with proper values
-- For Karl Popper
UPDATE public.profiles
SET slug = 'karl-popper'
WHERE name = 'Karl Popper' AND (slug IS NULL OR slug = '');

-- For Vyacheslav Ladischenski
UPDATE public.profiles
SET slug = 'vyacheslav-ladischenski'
WHERE name = 'Vyacheslav Ladischenski' AND (slug IS NULL OR slug = '');

-- FIX 3: Generic fix for any other profiles
-- Generate slug from name for any remaining NULL or empty slugs
UPDATE public.profiles
SET slug = 
  CASE 
    WHEN name IS NOT NULL AND name != '' THEN
      lower(
        regexp_replace(
          regexp_replace(
            trim(name),
            '[^a-zA-Z0-9\s-]', '', 'g'
          ),
          '\s+', '-', 'g'
        )
      )
    ELSE
      'user-' || substr(id::text, 1, 8)
  END
WHERE slug IS NULL OR slug = '';

-- FIX 4: Handle any potential duplicates by appending ID
UPDATE public.profiles p1
SET slug = slug || '-' || substr(id::text, 1, 8)
WHERE EXISTS (
  SELECT 1 FROM public.profiles p2 
  WHERE p1.slug = p2.slug AND p1.id != p2.id
);

-- FIX 5: Now recreate the unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS profiles_slug_key ON public.profiles(slug);

-- VERIFY: Show results
SELECT 
  id,
  name,
  slug,
  is_verified,
  created_at
FROM public.profiles
ORDER BY created_at DESC;


