-- P703 follow-up fixes (2026-04-15)
--
-- Fix 1 (RLS-1): Ensure clarity_sessions UPDATE WITH CHECK enforces target_listener_id.
--   Canary: "stranger joined a letter-sourced session — target_listener_id predicate
--   missing from UPDATE WITH CHECK."
--   Root cause: policy may not have been applied in the correct form; re-create
--   idempotently to guarantee the predicate is in place.
--
-- Fix 2 (Authz-3): Resend rate-limit trigger fires on first update after INSERT.
--   Root cause: check compares OLD.updated_at (= created_at on insert) to now() - 30s.
--   First resend immediately after creation is within 30s → rejected.
--   Fix: only enforce the window when a previous resend already occurred
--   (i.e. OLD.updated_at IS DISTINCT FROM OLD.created_at).

-- ============================================================================
-- Fix 1: Rebuild clarity_sessions UPDATE policy with correct target_listener_id
--        predicate in both USING and WITH CHECK.
-- ============================================================================

-- Drop whatever form of the policy currently exists (name is stable across P396 → P703)
DROP POLICY IF EXISTS "clarity_sessions_creator_update" ON clarity_sessions;

-- Recreate with fully correct USING + WITH CHECK:
--   USING  — gates which rows can be touched (OLD row):
--     • Practice room (target_listener_id IS NULL): any caller allowed through
--     • Letter-sourced (target_listener_id IS NOT NULL): must be creator or target
--   WITH CHECK — validates the new row state after the write:
--     • Must have a creator (creator_profile_id IS NOT NULL)
--     • Same target_listener_id gate as USING
CREATE POLICY "clarity_sessions_creator_update"
  ON clarity_sessions
  FOR UPDATE
  USING (
    target_listener_id IS NULL
    OR auth.uid() IN (target_listener_id, creator_profile_id)
  )
  WITH CHECK (
    creator_profile_id IS NOT NULL
    AND (
      target_listener_id IS NULL
      OR auth.uid() IN (target_listener_id, creator_profile_id)
    )
  );

-- ============================================================================
-- Fix 2: Replace resend rate-limit trigger function so it does NOT reject the
--        first resend (when the row has never been resent before).
--
--   Before fix: fires whenever OLD.updated_at > now() - 30s
--     → rejects the first resend if it happens within 30s of INSERT
--       because updated_at = created_at at insert time.
--
--   After fix: fires only when OLD.updated_at IS DISTINCT FROM OLD.created_at
--     (i.e. a previous resend already happened), so the first resend is always
--     allowed, and subsequent resends are rate-limited to once per 30 seconds.
-- ============================================================================

CREATE OR REPLACE FUNCTION check_live_invite_resend_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only enforce when updated_at is being changed (resend path)
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    -- Only apply the 30-second window after the first resend has already occurred.
    -- On initial insert, updated_at = created_at; the first resend is always allowed.
    IF OLD.updated_at IS DISTINCT FROM OLD.created_at THEN
      IF OLD.updated_at > now() - interval '30 seconds' THEN
        RAISE EXCEPTION 'resend rate limit: wait 30 seconds between resends'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger already exists (created in P703 main migration); DROP + CREATE is
-- idempotent and re-binds to the updated function body above.
DROP TRIGGER IF EXISTS trg_live_invite_resend_rate_limit ON clarity_live_invites;
CREATE TRIGGER trg_live_invite_resend_rate_limit
  BEFORE UPDATE ON clarity_live_invites
  FOR EACH ROW
  EXECUTE FUNCTION check_live_invite_resend_rate_limit();
