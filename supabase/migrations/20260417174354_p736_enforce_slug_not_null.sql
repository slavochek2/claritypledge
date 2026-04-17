-- P736: Enforce profiles.slug NOT NULL
--
-- Step 1: Delete orphan profiles (unverified, no activity, no pledge, slug IS NULL).
--         Audit 2026-04-17: 23 NULL-slug rows — 22 orphans + 1 test account.
--         Orphans are P50-era /live signups that never verified or engaged.
--         No user notifications needed (all unverified, zero activity).
--
-- Step 2: Assign a timestamp-based placeholder slug to any remaining NULL-slug rows
--         (covers the test-agent account and any stragglers).
--         Format: user-YYYYMMDDHH24MISS-{8-char id prefix} — uniqueness guaranteed,
--         identifiable as backfilled by the 'user-' prefix.
--
-- Step 3: Add NOT NULL constraint.
--
-- Rollback: DROP the NOT NULL constraint; rows are gone (backup taken 2026-04-17).

BEGIN;

-- Step 1: Delete orphan NULL-slug profiles.
-- Guard: unverified, not pledged, no stories, no sessions.
-- Note: p736-fixture@example.com has 0 activity on prod (deleted by guard)
-- and 7 seed stories on test (kept by guard, gets timestamp slug in step 2).
DELETE FROM profiles
WHERE slug IS NULL
  AND is_verified = false
  AND has_pledged = false
  AND NOT EXISTS (SELECT 1 FROM stories WHERE author_id = profiles.id)
  AND NOT EXISTS (SELECT 1 FROM clarity_sessions WHERE creator_profile_id = profiles.id
                                                    OR joiner_profile_id  = profiles.id);

-- Step 2: Backfill any remaining NULL-slug rows with a unique placeholder
UPDATE profiles
SET slug = 'user-' || to_char(created_at, 'YYYYMMDDHH24MISS') || '-' || left(id::text, 8)
WHERE slug IS NULL;

-- Step 3: Enforce NOT NULL
ALTER TABLE profiles
  ALTER COLUMN slug SET NOT NULL;

COMMIT;
