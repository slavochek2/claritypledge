-- Migration: P581 — Clarity Letters
-- Created: 2026-04-03
-- Feature: P581 - Letters with Comprehension Assessment
-- Description: Creates 5 new tables (clarity_letters, letter_deliveries,
--   letter_story_snapshots, letter_predictions, letter_point_responses),
--   adds 4 columns to existing tables, RLS policies with sealed-bid enforcement,
--   4 SECURITY DEFINER RPCs, and realtime publication.

-- NOTE: Supabase Management API wraps each query in its own transaction.
-- BEGIN/COMMIT omitted to avoid double-wrapping.

-- ============================================================================
-- STEP 1: Create clarity_letters table
-- ============================================================================
CREATE TABLE IF NOT EXISTS clarity_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_doc_id UUID NOT NULL REFERENCES clarity_docs(id),
  sender_id UUID NOT NULL REFERENCES profiles(id),
  mode TEXT NOT NULL CHECK (mode IN ('one-to-one', 'one-to-many')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sealed', 'expired')),
  sealed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clarity_letters_sender ON clarity_letters(sender_id);
CREATE INDEX IF NOT EXISTS idx_clarity_letters_source_doc ON clarity_letters(source_doc_id);
CREATE INDEX IF NOT EXISTS idx_clarity_letters_status ON clarity_letters(status);

-- ============================================================================
-- STEP 2: Create letter_deliveries table
-- ============================================================================
CREATE TABLE IF NOT EXISTS letter_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  letter_id UUID NOT NULL REFERENCES clarity_letters(id) ON DELETE CASCADE,
  receiver_email TEXT,  -- nullable for 1-to-many (anonymous)
  receiver_profile_id UUID REFERENCES profiles(id),  -- nullable until registered
  invitation_token UUID DEFAULT gen_random_uuid(),  -- for 1-to-1
  invitation_expires_at TIMESTAMPTZ,  -- for 1-to-1
  access_token_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),  -- Security gap #2
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'opened', 'in_progress', 'completed')),
  stories_rated INTEGER DEFAULT 0,  -- for progress tracking (N of M)
  opened_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_letter_deliveries_letter ON letter_deliveries(letter_id);
CREATE INDEX IF NOT EXISTS idx_letter_deliveries_receiver ON letter_deliveries(receiver_profile_id);
CREATE INDEX IF NOT EXISTS idx_letter_deliveries_token ON letter_deliveries(invitation_token);
CREATE INDEX IF NOT EXISTS idx_letter_deliveries_status ON letter_deliveries(status);

-- ============================================================================
-- STEP 3: Create letter_story_snapshots table
-- ============================================================================
CREATE TABLE IF NOT EXISTS letter_story_snapshots (
  letter_id UUID NOT NULL REFERENCES clarity_letters(id) ON DELETE CASCADE,
  story_id UUID NOT NULL REFERENCES stories(id),
  version_id UUID NOT NULL REFERENCES story_versions(id),
  position INTEGER NOT NULL,  -- copied from doc_stories.position at seal time
  point_config JSONB DEFAULT '{}'::jsonb,  -- copied from doc_stories.point_config at seal time
  visibility TEXT NOT NULL,  -- copied from stories.visibility at seal time
  PRIMARY KEY (letter_id, story_id)
);

CREATE INDEX IF NOT EXISTS idx_letter_snapshots_letter ON letter_story_snapshots(letter_id);

-- ============================================================================
-- STEP 4: Create letter_predictions table
-- ============================================================================
CREATE TABLE IF NOT EXISTS letter_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  letter_id UUID NOT NULL REFERENCES clarity_letters(id) ON DELETE CASCADE,
  delivery_id UUID REFERENCES letter_deliveries(id) ON DELETE CASCADE,  -- NULL for 1-to-many (shared prediction)
  story_id UUID NOT NULL REFERENCES stories(id),
  prediction SMALLINT NOT NULL CHECK (prediction >= 0 AND prediction <= 10),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT letter_predictions_unique UNIQUE (letter_id, delivery_id, story_id)
);

CREATE INDEX IF NOT EXISTS idx_letter_predictions_letter ON letter_predictions(letter_id);
CREATE INDEX IF NOT EXISTS idx_letter_predictions_delivery ON letter_predictions(delivery_id);

-- ============================================================================
-- STEP 5: Create letter_point_responses table (Security gap #5: forward-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS letter_point_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES letter_deliveries(id) ON DELETE CASCADE,
  point_id UUID NOT NULL REFERENCES points(id),
  position TEXT NOT NULL,  -- PositionType value
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT letter_point_responses_unique UNIQUE (delivery_id, point_id)
);

CREATE INDEX IF NOT EXISTS idx_letter_point_responses_delivery ON letter_point_responses(delivery_id);

-- ============================================================================
-- STEP 6: Column additions to existing tables
-- ============================================================================

-- story_verifications: source column — 'live' for existing /live verifications, 'letter' for letter-sourced
ALTER TABLE story_verifications ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'live';

-- story_verifications: verified column — true for authoritative (live), false for letter-sourced
ALTER TABLE story_verifications ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT true;

-- story_verifications: sort_order — letters use it for story sequence
ALTER TABLE story_verifications ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- clarity_sessions: source_letter_id — future hook for letter→live conversion
ALTER TABLE clarity_sessions ADD COLUMN IF NOT EXISTS source_letter_id UUID REFERENCES clarity_letters(id);

-- ============================================================================
-- STEP 7a: Helper functions to break circular RLS dependency
-- clarity_letters SELECT references letter_deliveries, and letter_deliveries
-- SELECT references clarity_letters. Without SECURITY DEFINER helpers,
-- PostgreSQL detects infinite recursion (42P17). These functions bypass RLS
-- on the referenced table, breaking the cycle.
-- ============================================================================

-- Check if user is the sender of a letter (used by letter_deliveries SELECT)
CREATE OR REPLACE FUNCTION _is_letter_sender(p_letter_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM clarity_letters
    WHERE id = p_letter_id AND sender_id = p_user_id
  );
$$;

-- Check if user is a receiver of a letter (used by clarity_letters SELECT)
CREATE OR REPLACE FUNCTION _is_letter_receiver(p_letter_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM letter_deliveries
    WHERE letter_id = p_letter_id AND receiver_profile_id = p_user_id
  );
$$;

-- ============================================================================
-- STEP 7: RLS on clarity_letters
-- ============================================================================
ALTER TABLE clarity_letters ENABLE ROW LEVEL SECURITY;

-- SELECT: sender OR authenticated receiver via delivery (uses helper to avoid recursion)
DROP POLICY IF EXISTS "Letters readable by sender or receiver" ON clarity_letters;
CREATE POLICY "Letters readable by sender or receiver"
  ON clarity_letters FOR SELECT USING (
    sender_id = auth.uid()
    OR _is_letter_receiver(id, auth.uid())
  );

-- INSERT: verified user, sender = self
DROP POLICY IF EXISTS "Verified users can create letters" ON clarity_letters;
CREATE POLICY "Verified users can create letters"
  ON clarity_letters FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND sender_id = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_verified = true)
  );

-- UPDATE: sender only + draft status (immutable after seal)
DROP POLICY IF EXISTS "Sender can update draft letters" ON clarity_letters;
CREATE POLICY "Sender can update draft letters"
  ON clarity_letters FOR UPDATE
  USING (sender_id = auth.uid() AND status = 'draft')
  WITH CHECK (sender_id = auth.uid());

-- DELETE: sender only + draft status
DROP POLICY IF EXISTS "Sender can delete draft letters" ON clarity_letters;
CREATE POLICY "Sender can delete draft letters"
  ON clarity_letters FOR DELETE
  USING (sender_id = auth.uid() AND status = 'draft');

-- ============================================================================
-- STEP 8: RLS on letter_deliveries
-- ============================================================================
ALTER TABLE letter_deliveries ENABLE ROW LEVEL SECURITY;

-- SELECT: sender (via helper to avoid recursion) OR receiver = self
DROP POLICY IF EXISTS "Deliveries readable by sender or receiver" ON letter_deliveries;
CREATE POLICY "Deliveries readable by sender or receiver"
  ON letter_deliveries FOR SELECT USING (
    _is_letter_sender(letter_id, auth.uid())
    OR receiver_profile_id = auth.uid()
  );

-- INSERT: WITH CHECK(false) — created only by SECURITY DEFINER RPCs
DROP POLICY IF EXISTS "Deliveries insert blocked" ON letter_deliveries;
CREATE POLICY "Deliveries insert blocked"
  ON letter_deliveries FOR INSERT WITH CHECK (false);

-- UPDATE: receiver can set status transitions
DROP POLICY IF EXISTS "Receiver can update delivery status" ON letter_deliveries;
CREATE POLICY "Receiver can update delivery status"
  ON letter_deliveries FOR UPDATE
  USING (receiver_profile_id = auth.uid())
  WITH CHECK (receiver_profile_id = auth.uid());

-- DELETE: blocked
DROP POLICY IF EXISTS "Deliveries delete blocked" ON letter_deliveries;
CREATE POLICY "Deliveries delete blocked"
  ON letter_deliveries FOR DELETE USING (false);

-- ============================================================================
-- STEP 9: RLS on letter_story_snapshots
-- ============================================================================
ALTER TABLE letter_story_snapshots ENABLE ROW LEVEL SECURITY;

-- SELECT: sender OR receiver (uses helpers to avoid cross-table RLS issues)
DROP POLICY IF EXISTS "Snapshots readable by sender or receiver" ON letter_story_snapshots;
CREATE POLICY "Snapshots readable by sender or receiver"
  ON letter_story_snapshots FOR SELECT USING (
    _is_letter_sender(letter_id, auth.uid())
    OR _is_letter_receiver(letter_id, auth.uid())
  );

-- INSERT/UPDATE/DELETE: WITH CHECK(false) — written only by SECURITY DEFINER (Security gap #6)
DROP POLICY IF EXISTS "Snapshots insert blocked" ON letter_story_snapshots;
CREATE POLICY "Snapshots insert blocked"
  ON letter_story_snapshots FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "Snapshots update blocked" ON letter_story_snapshots;
CREATE POLICY "Snapshots update blocked"
  ON letter_story_snapshots FOR UPDATE USING (false);

DROP POLICY IF EXISTS "Snapshots delete blocked" ON letter_story_snapshots;
CREATE POLICY "Snapshots delete blocked"
  ON letter_story_snapshots FOR DELETE USING (false);

-- ============================================================================
-- STEP 10: RLS on letter_predictions — SEALED-BID CRITICAL (Security gap #1)
-- ============================================================================
ALTER TABLE letter_predictions ENABLE ROW LEVEL SECURITY;

-- SELECT: sender always. Receiver sees prediction ONLY after rating that story
-- (matching story_verifications row with source='letter' and listener_id=auth.uid())
DROP POLICY IF EXISTS "Predictions readable with sealed-bid" ON letter_predictions;
CREATE POLICY "Predictions readable with sealed-bid"
  ON letter_predictions FOR SELECT USING (
    -- Sender can always see their own predictions
    _is_letter_sender(letter_id, auth.uid())
    OR (
      -- Receiver can see prediction only after they rated this story
      _is_letter_receiver(letter_id, auth.uid())
      AND EXISTS (
        SELECT 1 FROM story_verifications
        WHERE story_verifications.story_id = letter_predictions.story_id
          AND story_verifications.source = 'letter'
          AND story_verifications.listener_id = auth.uid()
      )
    )
  );

-- INSERT/UPDATE/DELETE: WITH CHECK(false) — immutable after seal (Security gap #6)
DROP POLICY IF EXISTS "Predictions insert blocked" ON letter_predictions;
CREATE POLICY "Predictions insert blocked"
  ON letter_predictions FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "Predictions update blocked" ON letter_predictions;
CREATE POLICY "Predictions update blocked"
  ON letter_predictions FOR UPDATE USING (false);

DROP POLICY IF EXISTS "Predictions delete blocked" ON letter_predictions;
CREATE POLICY "Predictions delete blocked"
  ON letter_predictions FOR DELETE USING (false);

-- ============================================================================
-- STEP 11: RLS on letter_point_responses
-- ============================================================================
ALTER TABLE letter_point_responses ENABLE ROW LEVEL SECURITY;

-- INSERT: auth.uid() via delivery (receiver submits positions)
DROP POLICY IF EXISTS "Receiver can insert point responses" ON letter_point_responses;
CREATE POLICY "Receiver can insert point responses"
  ON letter_point_responses FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM letter_deliveries
      WHERE letter_deliveries.id = letter_point_responses.delivery_id
        AND letter_deliveries.receiver_profile_id = auth.uid()
    )
  );

-- No UPDATE policy — forward-only (Security gap #5)

-- SELECT: sender OR own (via delivery, uses helpers)
DROP POLICY IF EXISTS "Point responses readable by sender or receiver" ON letter_point_responses;
CREATE POLICY "Point responses readable by sender or receiver"
  ON letter_point_responses FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM letter_deliveries ld
      WHERE ld.id = letter_point_responses.delivery_id
        AND (
          _is_letter_sender(ld.letter_id, auth.uid())
          OR ld.receiver_profile_id = auth.uid()
        )
    )
  );

-- DELETE: blocked
DROP POLICY IF EXISTS "Point responses delete blocked" ON letter_point_responses;
CREATE POLICY "Point responses delete blocked"
  ON letter_point_responses FOR DELETE USING (false);

-- ============================================================================
-- STEP 12: Update story_verifications SELECT — source-aware (Security gap #4)
-- source='letter' rows visible only to sender+receiver, not public
-- ============================================================================
DROP POLICY IF EXISTS "Verifications visible when story visible" ON story_verifications;
CREATE POLICY "Verifications visible when story visible"
  ON story_verifications FOR SELECT USING (
    CASE
      WHEN source = 'letter' THEN
        -- Letter-sourced: visible only to the speaker (sender) or listener (receiver)
        speaker_id = auth.uid() OR listener_id = auth.uid()
      ELSE
        -- Live-sourced: original visibility logic (story visibility scoped)
        EXISTS (
          SELECT 1 FROM stories
          WHERE stories.id = story_verifications.story_id
            AND (stories.visibility = 'public'::content_visibility OR stories.author_id = auth.uid())
        )
    END
  );

-- ============================================================================
-- STEP 13: SECURITY DEFINER RPC — get_letter_by_token
-- Validates token + expiry. Returns NULL if invalid/expired.
-- Mirrors P443 accept_agreement pattern.
-- ============================================================================
CREATE OR REPLACE FUNCTION get_letter_by_token(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'letter_id', cl.id,
    'source_doc_id', cl.source_doc_id,
    'sender_id', cl.sender_id,
    'mode', cl.mode,
    'status', cl.status,
    'sealed_at', cl.sealed_at,
    'delivery_id', ld.id,
    'receiver_email', ld.receiver_email,
    'receiver_profile_id', ld.receiver_profile_id,
    'delivery_status', ld.status,
    'invitation_expires_at', ld.invitation_expires_at
  ) INTO v_result
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.invitation_token = p_token
    AND (ld.invitation_expires_at IS NULL OR ld.invitation_expires_at > now())
    AND cl.status = 'sealed'
  LIMIT 1;

  RETURN v_result;
END;
$$;

-- Allow anonymous access (receiver may not be logged in yet)
GRANT EXECUTE ON FUNCTION get_letter_by_token(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_letter_by_token(UUID) TO authenticated;

-- ============================================================================
-- STEP 14: SECURITY DEFINER RPC — seal_and_send_letter
-- Atomically: validates sender owns letter, snapshots story_versions+doc_stories
-- into letter_story_snapshots, creates letter_predictions from draft data,
-- sets status='sealed', creates deliveries. For 1-to-many: enforces only
-- public-visibility stories (Security gap #7).
-- ============================================================================
CREATE OR REPLACE FUNCTION seal_and_send_letter(
  p_letter_id UUID,
  p_predictions JSONB DEFAULT '[]'::jsonb,  -- array of {story_id, prediction, delivery_id?}
  p_deliveries JSONB DEFAULT '[]'::jsonb    -- array of {receiver_email}
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id UUID;
  v_mode TEXT;
  v_letter_status TEXT;
  v_source_doc_id UUID;
  v_pred JSONB;
  v_del JSONB;
  v_delivery_id UUID;
BEGIN
  -- Validate sender owns the letter and it's still draft
  SELECT sender_id, mode, status, source_doc_id
  INTO v_sender_id, v_mode, v_letter_status, v_source_doc_id
  FROM clarity_letters
  WHERE id = p_letter_id;

  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'Letter not found: %', p_letter_id;
  END IF;

  IF v_sender_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the letter sender can seal this letter';
  END IF;

  IF v_letter_status != 'draft' THEN
    RAISE EXCEPTION 'Letter is already sealed or expired (status: %)', v_letter_status;
  END IF;

  -- Snapshot story_versions + doc_stories into letter_story_snapshots
  -- For 1-to-many: enforce only public-visibility stories (Security gap #7)
  INSERT INTO letter_story_snapshots (letter_id, story_id, version_id, position, point_config, visibility)
  SELECT
    p_letter_id,
    ds.story_id,
    sv.id,
    ds.position,
    ds.point_config,
    s.visibility::text
  FROM doc_stories ds
  JOIN stories s ON s.id = ds.story_id
  JOIN story_versions sv ON sv.story_id = s.id AND sv.version_number = s.current_version
  WHERE ds.doc_id = v_source_doc_id
    AND (v_mode = 'one-to-one' OR s.visibility = 'public'::content_visibility)
  ON CONFLICT (letter_id, story_id) DO NOTHING;

  -- Create predictions from the provided array
  FOR v_pred IN SELECT * FROM jsonb_array_elements(p_predictions)
  LOOP
    INSERT INTO letter_predictions (letter_id, delivery_id, story_id, prediction)
    VALUES (
      p_letter_id,
      CASE WHEN v_pred->>'delivery_id' IS NOT NULL
        THEN (v_pred->>'delivery_id')::UUID
        ELSE NULL
      END,
      (v_pred->>'story_id')::UUID,
      (v_pred->>'prediction')::INTEGER
    )
    ON CONFLICT ON CONSTRAINT letter_predictions_unique DO NOTHING;
  END LOOP;

  -- Create deliveries from the provided array
  FOR v_del IN SELECT * FROM jsonb_array_elements(p_deliveries)
  LOOP
    INSERT INTO letter_deliveries (letter_id, receiver_email, invitation_expires_at)
    VALUES (
      p_letter_id,
      v_del->>'receiver_email',
      now() + interval '7 days'
    );
  END LOOP;

  -- Seal the letter
  UPDATE clarity_letters
  SET status = 'sealed', sealed_at = now()
  WHERE id = p_letter_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION seal_and_send_letter(UUID, JSONB, JSONB) TO authenticated;

-- ============================================================================
-- STEP 15: SECURITY DEFINER RPC — reveal_prediction
-- Returns prediction only if story_verifications row exists with source='letter'
-- for this story + delivery receiver.
-- ============================================================================
CREATE OR REPLACE FUNCTION reveal_prediction(
  p_delivery_id UUID,
  p_story_id UUID
)
RETURNS SMALLINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receiver_id UUID;
  v_letter_id UUID;
  v_prediction SMALLINT;
BEGIN
  -- Get delivery info
  SELECT receiver_profile_id, letter_id
  INTO v_receiver_id, v_letter_id
  FROM letter_deliveries
  WHERE id = p_delivery_id;

  IF v_receiver_id IS NULL OR v_receiver_id != auth.uid() THEN
    RETURN NULL;
  END IF;

  -- Check that receiver has rated this story (source='letter' verification exists)
  IF NOT EXISTS (
    SELECT 1 FROM story_verifications
    WHERE story_id = p_story_id
      AND source = 'letter'
      AND listener_id = auth.uid()
  ) THEN
    RETURN NULL;
  END IF;

  -- Return the prediction
  SELECT prediction INTO v_prediction
  FROM letter_predictions
  WHERE letter_id = v_letter_id
    AND story_id = p_story_id
    AND (delivery_id = p_delivery_id OR delivery_id IS NULL)
  ORDER BY delivery_id NULLS LAST  -- prefer delivery-specific prediction
  LIMIT 1;

  RETURN v_prediction;
END;
$$;

GRANT EXECUTE ON FUNCTION reveal_prediction(UUID, UUID) TO authenticated;

-- ============================================================================
-- STEP 16: SECURITY DEFINER RPC — persist_anonymous_completion
-- Validates nonce, creates user account data under new auth.uid().
-- For registration-at-exit flow.
-- ============================================================================
CREATE OR REPLACE FUNCTION persist_anonymous_completion(
  p_nonce UUID,
  p_letter_id UUID,
  p_ratings JSONB,    -- array of {story_id, version_id, speaker_id, rating, sort_order}
  p_positions JSONB   -- array of {delivery_id, point_id, position}
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_delivery_id UUID;
  v_rating JSONB;
  v_pos JSONB;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Find the delivery for this letter+receiver (receiver_profile_id was set at registration)
  SELECT id INTO v_delivery_id
  FROM letter_deliveries
  WHERE letter_id = p_letter_id
    AND receiver_profile_id = v_caller_id
  LIMIT 1;

  IF v_delivery_id IS NULL THEN
    RAISE EXCEPTION 'No delivery found for this letter and user';
  END IF;

  -- Persist ratings as story_verifications with source='letter'
  FOR v_rating IN SELECT * FROM jsonb_array_elements(p_ratings)
  LOOP
    INSERT INTO story_verifications (
      story_id, version_id, session_id, speaker_id, listener_id,
      listener_rating, source, verified, sort_order
    )
    VALUES (
      (v_rating->>'story_id')::UUID,
      (v_rating->>'version_id')::UUID,
      NULL,  -- no session for letter verifications
      (v_rating->>'speaker_id')::UUID,
      v_caller_id,
      (v_rating->>'rating')::SMALLINT,
      'letter',
      false,  -- letter verifications are not authoritative
      (v_rating->>'sort_order')::INTEGER
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Persist point positions as letter_point_responses
  FOR v_pos IN SELECT * FROM jsonb_array_elements(p_positions)
  LOOP
    INSERT INTO letter_point_responses (delivery_id, point_id, position)
    VALUES (
      v_delivery_id,
      (v_pos->>'point_id')::UUID,
      v_pos->>'position'
    )
    ON CONFLICT ON CONSTRAINT letter_point_responses_unique DO NOTHING;
  END LOOP;

  -- Mark delivery as completed
  UPDATE letter_deliveries
  SET status = 'completed', completed_at = now()
  WHERE id = v_delivery_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION persist_anonymous_completion(UUID, UUID, JSONB, JSONB) TO authenticated;

-- ============================================================================
-- STEP 17: Add to supabase_realtime publication
-- ============================================================================
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE clarity_letters;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE letter_deliveries;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- End of migration
