-- P414: Add bio field to profiles
-- Plain text, max 160 chars, nullable
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS bio TEXT
  CHECK (bio IS NULL OR length(bio) <= 160);
