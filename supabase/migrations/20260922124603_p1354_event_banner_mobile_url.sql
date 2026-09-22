-- P1354: Add banner_mobile_url to events for a phone-optimised banner variant
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS banner_mobile_url TEXT;
