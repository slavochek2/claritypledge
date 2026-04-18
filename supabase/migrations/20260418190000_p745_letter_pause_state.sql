-- P745: Letter-hosted /live injection — pause-state column + security hardening
-- ============================================================================

-- 1. Add pause-state column to letter_deliveries
--    Stores the story index when the reader pauses to join a /live session.
--    NULL = not paused. Range [0, 999] enforced by check constraint.
-- ============================================================================

ALTER TABLE letter_deliveries
  ADD COLUMN IF NOT EXISTS saved_story_index INTEGER;

ALTER TABLE letter_deliveries
  DROP CONSTRAINT IF EXISTS letter_deliveries_saved_story_index_range;

ALTER TABLE letter_deliveries
  ADD CONSTRAINT letter_deliveries_saved_story_index_range
    CHECK (saved_story_index IS NULL OR (saved_story_index >= 0 AND saved_story_index <= 999));

-- 2. RLS hardening for clarity_live_invites participant update
--    Previous: WITH CHECK (true) — allowed reopening closed invites
--    New: WITH CHECK (closed_at IS NOT NULL) — only closures permitted
-- ============================================================================

DROP POLICY IF EXISTS "live_invites_participant_update" ON clarity_live_invites;

CREATE POLICY "live_invites_participant_update"
  ON clarity_live_invites FOR UPDATE
  USING (
    auth.uid() = target_user_id
    OR auth.uid() IN (
      SELECT creator_profile_id FROM clarity_sessions WHERE id = session_id
    )
  )
  WITH CHECK (closed_at IS NOT NULL);
