-- P63: Google OAuth Authentication with Profile Pictures
-- Migration to add avatar_url and avatar_provider columns to profiles table

-- Add avatar_url column (stores Google profile picture URL)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Add avatar_provider column (tracks where avatar came from)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS avatar_provider TEXT
CHECK (avatar_provider IN ('google', 'generated', 'gravatar'));

-- Update existing profiles to have provider = 'generated' (they use initials + color)
UPDATE profiles
SET avatar_provider = 'generated'
WHERE avatar_provider IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN profiles.avatar_url IS 'URL to user avatar image (e.g., from Google OAuth)';
COMMENT ON COLUMN profiles.avatar_provider IS 'Source of avatar: google (OAuth), generated (initials+color), gravatar';
