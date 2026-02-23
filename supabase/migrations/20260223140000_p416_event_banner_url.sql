-- P416: Add banner_url to events table for Unsplash auto-banners
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS banner_url TEXT;
