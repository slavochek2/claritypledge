-- Backfill missing slugs for existing profiles
-- This script generates slugs from names for any profiles that don't have a slug

-- Update profiles with missing or empty slugs
UPDATE profiles
SET slug = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        TRIM(name),
        '[^\w\s-]', '', 'g'  -- Remove special characters
      ),
      '\s+', '-', 'g'  -- Replace spaces with hyphens
    ),
    '--+', '-', 'g'  -- Replace multiple hyphens with single hyphen
  )
)
WHERE slug IS NULL 
   OR slug = '' 
   OR TRIM(slug) = '';

-- Handle potential duplicate slugs by appending numbers
-- This is a more complex operation and may need to be run multiple times
-- or handled in a more sophisticated way depending on your needs

DO $$
DECLARE
  profile_record RECORD;
  new_slug TEXT;
  counter INTEGER;
  slug_exists BOOLEAN;
BEGIN
  FOR profile_record IN 
    SELECT id, slug 
    FROM profiles 
    WHERE slug IS NOT NULL AND slug != ''
    ORDER BY created_at
  LOOP
    counter := 2;
    new_slug := profile_record.slug;
    
    -- Check if this slug is used by another profile (with earlier created_at)
    SELECT EXISTS(
      SELECT 1 
      FROM profiles 
      WHERE slug = new_slug 
        AND id != profile_record.id 
        AND created_at < (SELECT created_at FROM profiles WHERE id = profile_record.id)
    ) INTO slug_exists;
    
    -- If slug exists for an older profile, append number to this one
    WHILE slug_exists LOOP
      new_slug := profile_record.slug || '-' || counter;
      counter := counter + 1;
      
      SELECT EXISTS(
        SELECT 1 
        FROM profiles 
        WHERE slug = new_slug 
          AND id != profile_record.id
      ) INTO slug_exists;
    END LOOP;
    
    -- Update if we needed to change the slug
    IF new_slug != profile_record.slug THEN
      UPDATE profiles 
      SET slug = new_slug 
      WHERE id = profile_record.id;
    END IF;
  END LOOP;
END $$;

-- Verify results
SELECT 
  COUNT(*) as total_profiles,
  COUNT(CASE WHEN slug IS NULL OR slug = '' THEN 1 END) as profiles_without_slug,
  COUNT(DISTINCT slug) as unique_slugs
FROM profiles;

-- Show any profiles that still don't have slugs (should be 0)
SELECT id, name, email, slug, created_at
FROM profiles
WHERE slug IS NULL OR slug = '' OR TRIM(slug) = ''
ORDER BY created_at;


