-- P703: Letter-sourced /live — Schema, RLS, Realtime, complete_clarity_session RPC
--
-- Pre-flight (Build Sequence Step 0):
-- Audited letter_predictions SELECT RLS — P581 migration already implements sealed-bid:
--   sender always readable; receiver sees prediction only after matching story_verifications
--   row with source='letter' exists. No tightening required.
--
-- Changes in this file:
-- 1. New columns on clarity_sessions: source_story_id, target_listener_id, status
-- 2. New table: clarity_live_invites (with RLS, unique partial index, realtime)
-- 3. Tighten clarity_sessions UPDATE policy (AD2 + Security RLS-1)
-- 4. New SELECT policy on clarity_sessions (Security RLS-4)
-- 5. Replace clarity_sessions_verified_host_insert (Security RLS-2)
-- 6. complete_clarity_session SECURITY DEFINER RPC (AD5 + Security Authz-2)
-- 7. Resend rate-limit trigger on clarity_live_invites (Security Authz-3)
-- 8. Update get_letter_results RPC to include profile id fields

-- ============================================================================
-- 1. Extend clarity_sessions
-- ============================================================================

ALTER TABLE clarity_sessions
  ADD COLUMN IF NOT EXISTS source_story_id UUID REFERENCES stories(id),
  ADD COLUMN IF NOT EXISTS target_listener_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('active', 'completed', 'cancelled'));

-- ============================================================================
-- 2. Create clarity_live_invites table
-- ============================================================================

CREATE TABLE IF NOT EXISTS clarity_live_invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES clarity_sessions(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_live_invites_session ON clarity_live_invites(session_id);
CREATE INDEX IF NOT EXISTS idx_live_invites_user ON clarity_live_invites(target_user_id);

-- Singleton: one open invite per listener at a time (unique partial index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_live_invites_one_open_per_user
  ON clarity_live_invites(target_user_id)
  WHERE closed_at IS NULL;

-- Enable RLS
ALTER TABLE clarity_live_invites ENABLE ROW LEVEL SECURITY;

-- SELECT: recipient can only see their own invites
CREATE POLICY "live_invites_recipient_select"
  ON clarity_live_invites FOR SELECT
  USING (auth.uid() = target_user_id);

-- INSERT: session creator only; validates that target_user_id is a letter recipient
-- (prevents author inviting someone not in the letter's deliveries)
CREATE POLICY "live_invites_creator_insert"
  ON clarity_live_invites FOR INSERT
  WITH CHECK (
    -- Inserter must be the session creator
    auth.uid() IN (
      SELECT creator_profile_id FROM clarity_sessions WHERE id = session_id
    )
    -- If the session has a source_letter_id, target_user_id must be a letter recipient
    AND (
      NOT EXISTS (
        SELECT 1 FROM clarity_sessions cs
        WHERE cs.id = session_id AND cs.source_letter_id IS NOT NULL
      )
      OR EXISTS (
        SELECT 1 FROM clarity_sessions cs
        JOIN letter_deliveries ld ON ld.letter_id = cs.source_letter_id
        WHERE cs.id = session_id
          AND ld.receiver_profile_id = target_user_id
      )
    )
  );

-- UPDATE: session creator (for resend/cancel) or target user (for self-close)
CREATE POLICY "live_invites_participant_update"
  ON clarity_live_invites FOR UPDATE
  USING (
    auth.uid() = target_user_id
    OR auth.uid() IN (
      SELECT creator_profile_id FROM clarity_sessions WHERE id = session_id
    )
  )
  WITH CHECK (true);

-- Enable realtime for the inbox subscription
ALTER PUBLICATION supabase_realtime ADD TABLE clarity_live_invites;

-- ============================================================================
-- 3. Tighten clarity_sessions UPDATE policy (AD2 + Security RLS-1)
--    Previous: USING(true) WITH CHECK(creator_profile_id IS NOT NULL)
--    New: gates letter-sourced joins to target_listener only
-- ============================================================================

DROP POLICY IF EXISTS "clarity_sessions_creator_update" ON clarity_sessions;

CREATE POLICY "clarity_sessions_creator_update"
  ON clarity_sessions FOR UPDATE
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
-- 4. New SELECT policy on clarity_sessions (Security RLS-4)
--    Letter-sourced sessions only visible to creator and target_listener.
--    Public event sessions (target_listener_id IS NULL) remain visible to all.
-- ============================================================================

DROP POLICY IF EXISTS "Sessions are viewable by everyone" ON clarity_sessions;

CREATE POLICY "clarity_sessions_select"
  ON clarity_sessions FOR SELECT
  USING (
    target_listener_id IS NULL
    OR auth.uid() IN (target_listener_id, creator_profile_id)
  );

-- ============================================================================
-- 5. Replace clarity_sessions_verified_host_insert (Security RLS-2)
--    Extends WITH CHECK to validate letter authorship for letter-sourced rows.
-- ============================================================================

DROP POLICY IF EXISTS "clarity_sessions_verified_host_insert" ON clarity_sessions;

CREATE POLICY "clarity_sessions_verified_host_insert"
  ON clarity_sessions FOR INSERT
  WITH CHECK (
    -- Verified host required for all sessions
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND is_verified = true
    )
    -- If letter-sourced: caller must be the letter sender
    AND (
      source_letter_id IS NULL
      OR EXISTS (
        SELECT 1 FROM clarity_letters
        WHERE id = source_letter_id
          AND sender_id = auth.uid()
      )
    )
    -- If letter-sourced with target_listener: listener must be a delivery recipient
    AND (
      source_letter_id IS NULL
      OR target_listener_id IS NULL
      OR EXISTS (
        SELECT 1 FROM letter_deliveries
        WHERE letter_id = source_letter_id
          AND receiver_profile_id = target_listener_id
      )
    )
  );

-- ============================================================================
-- 6. complete_clarity_session SECURITY DEFINER RPC (AD5 + Security Authz-2)
--    Atomically: marks session completed AND closes linked invite.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.complete_clarity_session(p_session_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorization: only creator, joiner, or target_listener may complete
  IF NOT EXISTS (
    SELECT 1 FROM clarity_sessions
    WHERE id = p_session_id
      AND (
        creator_profile_id = auth.uid()
        OR joiner_profile_id = auth.uid()
        OR target_listener_id = auth.uid()
      )
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Mark session completed
  UPDATE clarity_sessions
    SET status = 'completed'
    WHERE id = p_session_id;

  -- Close linked invite(s) atomically
  UPDATE clarity_live_invites
    SET closed_at = now()
    WHERE session_id = p_session_id
      AND closed_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_clarity_session(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_clarity_session(UUID) TO authenticated;

-- ============================================================================
-- 7. Resend rate-limit trigger (Security Authz-3)
--    Rejects updated_at bump if previous bump was within 30 seconds.
--    Resend increments updated_at — the unique partial index and this trigger
--    together ensure: no duplicate invites and no spam resends.
-- ============================================================================

CREATE OR REPLACE FUNCTION check_live_invite_resend_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only enforce when updated_at is being changed (resend path)
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    IF OLD.updated_at > now() - interval '30 seconds' THEN
      RAISE EXCEPTION 'resend rate limit: wait 30 seconds between resends'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_invite_resend_rate_limit ON clarity_live_invites;
CREATE TRIGGER trg_live_invite_resend_rate_limit
  BEFORE UPDATE ON clarity_live_invites
  FOR EACH ROW
  EXECUTE FUNCTION check_live_invite_resend_rate_limit();

-- ============================================================================
-- 8. Update get_letter_results RPC — add id to sender_profile / receiver_profile
--    Needed by Task 8: StartClaritySessionButton needs senderId + receiverId.
-- ============================================================================

DROP FUNCTION IF EXISTS get_letter_results(UUID, UUID);

CREATE OR REPLACE FUNCTION get_letter_results(
  p_letter_id  UUID,
  p_delivery_id UUID DEFAULT NULL
)
RETURNS TABLE (
  perspective      TEXT,
  sender_profile   JSONB,
  receiver_profile JSONB,
  snapshots        JSONB,
  predictions      JSONB,
  ratings          JSONB,
  point_responses  JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id              UUID;
  v_letter_status          TEXT;
  v_receiver_profile_id    UUID;
  v_actual_delivery_id     UUID;
  v_perspective            TEXT;
  v_sender_profile_json    JSONB;
  v_receiver_profile_json  JSONB;
  v_snapshot_story_ids     UUID[];
  v_snapshots              JSONB;
  v_predictions            JSONB;
  v_ratings                JSONB;
  v_point_responses        JSONB;
BEGIN
  -- ── Step 1: Resolve letter ownership ─────────────────────────────────────
  SELECT cl.sender_id, cl.status
  INTO v_sender_id, v_letter_status
  FROM clarity_letters cl
  WHERE cl.id = p_letter_id;

  IF v_sender_id IS NULL OR v_letter_status != 'sealed' THEN
    RETURN;
  END IF;

  -- ── Step 2: Determine perspective ────────────────────────────────────────
  IF auth.uid() = v_sender_id THEN
    v_perspective := 'sender';

    IF p_delivery_id IS NOT NULL THEN
      SELECT ld.receiver_profile_id, ld.id
      INTO v_receiver_profile_id, v_actual_delivery_id
      FROM letter_deliveries ld
      WHERE ld.id = p_delivery_id
        AND ld.letter_id = p_letter_id;
    END IF;

  ELSE
    IF p_delivery_id IS NULL THEN
      RETURN;
    END IF;

    SELECT ld.receiver_profile_id, ld.id
    INTO v_receiver_profile_id, v_actual_delivery_id
    FROM letter_deliveries ld
    WHERE ld.id = p_delivery_id
      AND ld.letter_id = p_letter_id
      AND ld.receiver_profile_id = auth.uid();

    IF v_actual_delivery_id IS NULL THEN
      RETURN;
    END IF;

    v_perspective := 'receiver';
  END IF;

  -- ── Step 3: Fetch profile objects (now includes id) ──────────────────────
  SELECT jsonb_build_object(
    'id',          p.id,
    'name',        p.name,
    'avatar_url',  p.avatar_url,
    'avatar_color', p.avatar_color,
    'role',        p.role,
    'has_pledged', COALESCE(p.has_pledged, false),
    'ears_count',  COALESCE(p.ears_count, 0)
  )
  INTO v_sender_profile_json
  FROM profiles p
  WHERE p.id = v_sender_id;

  IF v_receiver_profile_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id',          p.id,
      'name',        p.name,
      'avatar_url',  p.avatar_url,
      'avatar_color', p.avatar_color,
      'role',        p.role,
      'has_pledged', COALESCE(p.has_pledged, false),
      'ears_count',  COALESCE(p.ears_count, 0)
    )
    INTO v_receiver_profile_json
    FROM profiles p
    WHERE p.id = v_receiver_profile_id;
  END IF;

  -- ── Step 4: Fetch snapshots ───────────────────────────────────────────────
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'story_id',    lss.story_id,
      'version_id',  lss.version_id,
      'position',    lss.position,
      'point_config', lss.point_config,
      'visibility',  lss.visibility
    ) ORDER BY lss.position
  ), '[]'::jsonb)
  INTO v_snapshots
  FROM letter_story_snapshots lss
  WHERE lss.letter_id = p_letter_id;

  SELECT COALESCE(array_agg(lss.story_id), '{}')
  INTO v_snapshot_story_ids
  FROM letter_story_snapshots lss
  WHERE lss.letter_id = p_letter_id;

  -- ── Step 5: Fetch predictions (sealed-bid enforced) ───────────────────────
  IF v_perspective = 'sender' THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'story_id',   lp.story_id,
        'prediction', lp.prediction
      )
    ), '[]'::jsonb)
    INTO v_predictions
    FROM letter_predictions lp
    WHERE lp.letter_id = p_letter_id
      AND (
        p_delivery_id IS NULL
        OR lp.delivery_id = p_delivery_id
        OR lp.delivery_id IS NULL
      );
  ELSE
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'story_id',   lp.story_id,
        'prediction', lp.prediction
      )
    ), '[]'::jsonb)
    INTO v_predictions
    FROM letter_predictions lp
    WHERE lp.letter_id = p_letter_id
      AND (lp.delivery_id = p_delivery_id OR lp.delivery_id IS NULL)
      AND EXISTS (
        SELECT 1 FROM story_verifications sv
        WHERE sv.story_id = lp.story_id
          AND sv.source = 'letter'
          AND sv.listener_id = auth.uid()
      );
  END IF;

  -- ── Step 6: Fetch ratings ─────────────────────────────────────────────────
  IF v_actual_delivery_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'story_id',       sv.story_id,
        'listener_rating', sv.listener_rating
      )
    ), '[]'::jsonb)
    INTO v_ratings
    FROM story_verifications sv
    WHERE sv.source = 'letter'
      AND sv.speaker_id = v_sender_id
      AND sv.story_id = ANY(v_snapshot_story_ids)
      AND sv.listener_id = (
        CASE WHEN v_perspective = 'receiver' THEN auth.uid()
             ELSE v_receiver_profile_id
        END
      );
  ELSE
    v_ratings := '[]'::jsonb;
  END IF;

  -- ── Step 7: Fetch point responses ─────────────────────────────────────────
  IF v_actual_delivery_id IS NOT NULL AND (
    v_perspective = 'receiver'
    OR (v_perspective = 'sender' AND p_delivery_id IS NOT NULL)
  ) THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'point_id',    lpr.point_id,
        'delivery_id', lpr.delivery_id,
        'position',    lpr.position
      )
    ), '[]'::jsonb)
    INTO v_point_responses
    FROM letter_point_responses lpr
    WHERE lpr.delivery_id = v_actual_delivery_id;
  ELSE
    v_point_responses := '[]'::jsonb;
  END IF;

  -- ── Return single row ─────────────────────────────────────────────────────
  RETURN QUERY SELECT
    v_perspective,
    v_sender_profile_json,
    v_receiver_profile_json,
    v_snapshots,
    v_predictions,
    v_ratings,
    v_point_responses;
END;
$$;

GRANT EXECUTE ON FUNCTION get_letter_results(UUID, UUID) TO authenticated;
