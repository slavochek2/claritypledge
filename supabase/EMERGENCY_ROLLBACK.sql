-- EMERGENCY ROLLBACK: Remove slug column and restore original state
-- Run this if you need to completely undo the slug changes

-- Drop the unique constraint
DROP INDEX IF EXISTS profiles_slug_key;

-- Drop the slug column
ALTER TABLE public.profiles DROP COLUMN IF EXISTS slug;

-- Restore original trigger (without slug)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  insert into public.profiles (id, email, name, role, linkedin_url, reason, avatar_color)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'role',
    new.raw_user_meta_data->>'linkedin_url',
    new.raw_user_meta_data->>'reason',
    new.raw_user_meta_data->>'avatar_color'
  );
  return new;
END;
$$;

-- Verify
SELECT id, name, email, is_verified FROM public.profiles ORDER BY created_at DESC;


