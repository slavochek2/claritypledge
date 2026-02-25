-- Migration: Change story visibility default from 'private' to 'public'
-- P424 changed it to private; reverting to public per product decision.
ALTER TABLE stories ALTER COLUMN visibility SET DEFAULT 'public';
