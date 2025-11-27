-- Add slug column to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS slug text;

-- Create unique index on slug
CREATE UNIQUE INDEX IF NOT EXISTS profiles_slug_key ON public.profiles(slug);

-- Generate slugs for existing profiles
-- This creates URL-friendly slugs from names
UPDATE public.profiles
SET slug = lower(
  regexp_replace(
    regexp_replace(
      trim(name),
      '[^\w\s-]', '', 'g'  -- Remove special characters
    ),
    '\s+', '-', 'g'  -- Replace spaces with hyphens
  )
)
WHERE slug IS NULL;

-- Verify the results
SELECT id, name, slug, is_verified FROM public.profiles ORDER BY created_at DESC;

