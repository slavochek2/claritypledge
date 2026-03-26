-- P591: Add image_url column to stories table for supporting images
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS image_url TEXT;
