-- P504: Add banner_url columns for auto-generated banners on stories, points, profiles
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE public.points ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banner_generation_attempted BOOLEAN DEFAULT FALSE;
