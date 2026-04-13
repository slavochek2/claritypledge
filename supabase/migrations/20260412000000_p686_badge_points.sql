-- P686: Badge Step 1 — Auto-Certification
--
-- Creates:
--   1. badge_points table — records per-point certification earned in /live sessions
--   2. is_certifier column on profiles — gates who can trigger badge point inserts
--
-- RLS:
--   SELECT — public (certificate page reads without auth)
--   INSERT — certifier only (verified_by = auth.uid() AND is_certifier = true)
--   UPDATE / DELETE — none (badge points are immutable once earned)
--
-- Idempotent: uses IF NOT EXISTS / IF EXISTS / DROP POLICY IF EXISTS guards.

-- ============================================================================
-- 1. badge_points table
-- ============================================================================
CREATE TABLE IF NOT EXISTS badge_points (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  point_id    UUID        NOT NULL REFERENCES points(id) ON DELETE CASCADE,
  story_id    UUID        REFERENCES stories(id) ON DELETE CASCADE,
  verified_by UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id  UUID        NOT NULL REFERENCES clarity_sessions(id) ON DELETE CASCADE,
  position    TEXT        NOT NULL CHECK (position IN ('agree', 'strongly_agree')),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, point_id)
);

-- ============================================================================
-- 2. is_certifier column on profiles
-- ============================================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_certifier BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- 3. Enable RLS on badge_points
-- ============================================================================
ALTER TABLE badge_points ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. RLS policies
-- ============================================================================

-- SELECT: public read — certificate page does not require login
DROP POLICY IF EXISTS "badge_points_select" ON badge_points;
CREATE POLICY "badge_points_select"
  ON badge_points FOR SELECT
  USING (true);

-- INSERT: certifier only — verified_by must be the calling user AND is_certifier = true
DROP POLICY IF EXISTS "badge_points_insert" ON badge_points;
CREATE POLICY "badge_points_insert"
  ON badge_points FOR INSERT
  WITH CHECK (
    auth.uid() = verified_by
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND is_certifier = true
    )
  );

-- No UPDATE or DELETE policies — badge_points are immutable once earned.

-- ============================================================================
-- 5. Seed: grant is_certifier to Slava's profile
-- ============================================================================
UPDATE profiles SET is_certifier = true WHERE slug = 'slava';
