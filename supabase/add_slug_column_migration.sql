-- Add slug column to profiles table
-- This migration adds the missing slug column and populates it for existing users

-- Step 1: Add the slug column (nullable first to allow existing rows)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS slug TEXT;

-- Step 2: Create an index for fast slug lookups
CREATE INDEX IF NOT EXISTS idx_profiles_slug ON profiles(slug);

-- Step 3: Add a unique constraint to prevent duplicate slugs
-- We'll do this after populating existing rows
-- ALTER TABLE profiles ADD CONSTRAINT profiles_slug_unique UNIQUE (slug);

-- Step 4: Populate slugs for existing profiles
-- This generates slugs from names for all profiles that don't have one
UPDATE profiles
SET slug = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        TRIM(COALESCE(name, 'user-' || id)),
        '[^\w\s-]', '', 'g'  -- Remove special characters
      ),
      '\s+', '-', 'g'  -- Replace spaces with hyphens
    ),
    '--+', '-', 'g'  -- Replace multiple hyphens with single hyphen
  )
)
WHERE slug IS NULL OR slug = '';

-- Step 5: Handle duplicate slugs by appending numbers
-- This block ensures all slugs are unique
DO $$
DECLARE
  profile_record RECORD;
  new_slug TEXT;
  counter INTEGER;
  slug_exists BOOLEAN;
BEGIN
  -- Loop through all profiles ordered by creation date
  FOR profile_record IN 
    SELECT id, slug, created_at
    FROM profiles 
    WHERE slug IS NOT NULL AND slug != ''
    ORDER BY created_at
  LOOP
    counter := 2;
    new_slug := profile_record.slug;
    
    -- Check if this slug is already used by another profile created earlier
    SELECT EXISTS(
      SELECT 1 
      FROM profiles 
      WHERE slug = new_slug 
        AND id != profile_record.id 
        AND created_at < profile_record.created_at
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
      
      RAISE NOTICE 'Updated profile % slug from % to %', profile_record.id, profile_record.slug, new_slug;
    END IF;
  END LOOP;
END $$;

-- Step 6: Now add the unique constraint
ALTER TABLE profiles 
ADD CONSTRAINT profiles_slug_unique UNIQUE (slug);

-- Step 7: Update the trigger to include slug generation for new profiles
-- This ensures all future profiles automatically get a slug
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  generated_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 2;
  slug_exists BOOLEAN;
BEGIN
  -- Generate initial slug from name
  generated_slug := LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          TRIM(COALESCE(NEW.name, 'user')),
          '[^\w\s-]', '', 'g'
        ),
        '\s+', '-', 'g'
      ),
      '--+', '-', 'g'
    )
  );
  
  final_slug := generated_slug;
  
  -- Ensure slug is unique by appending numbers if needed
  SELECT EXISTS(
    SELECT 1 FROM profiles WHERE slug = final_slug
  ) INTO slug_exists;
  
  WHILE slug_exists LOOP
    final_slug := generated_slug || '-' || counter;
    counter := counter + 1;
    
    SELECT EXISTS(
      SELECT 1 FROM profiles WHERE slug = final_slug
    ) INTO slug_exists;
  END LOOP;
  
  -- Set the slug if it wasn't provided
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := final_slug;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Make sure the trigger exists and fires before insert
DROP TRIGGER IF EXISTS on_profile_created ON profiles;
CREATE TRIGGER on_profile_created
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Step 8: Verify the results
SELECT 
  COUNT(*) as total_profiles,
  COUNT(slug) as profiles_with_slug,
  COUNT(CASE WHEN slug IS NULL OR slug = '' THEN 1 END) as profiles_without_slug,
  COUNT(DISTINCT slug) as unique_slugs
FROM profiles;

-- Show all profiles with their slugs
SELECT 
  id,
  name,
  email,
  slug,
  created_at
FROM profiles
ORDER BY created_at;


