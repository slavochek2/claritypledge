-- P716 patch: restore P705 guards dropped by 20260416120000_p716_token_rpc_dual_write.sql
--
-- The initial P716 migration rebuilt submit_point_response_by_token from the P683
-- baseline, losing three guards P705 had added:
--
--   1. NULL guard on p_point_id (prevents cast error on DB constraint)
--   2. Enum validation — rejects unknown position strings before write
--   3. P684 one-to-many anon guard — requires auth for public letters
--   4. Authorization guard — p_point_id must belong to this letter
--      (critical under SECURITY DEFINER: without it, any token holder could
--       write a position for any point_id in the database)
--
-- This patch replaces the initial P716 function with the complete body: P705 guards
-- + P716 dual-write change (auth.uid() instead of v_receiver_id + is_verified check,
-- to catch the case where receiver_profile_id is still NULL).
--
-- Dual-write rationale: P705 only wrote to point_positions when the delivery had a
-- linked receiver (receiver_profile_id IS NOT NULL AND is_verified = true). P716
-- intentionally relaxes this: any authenticated caller (auth.uid() IS NOT NULL) gets
-- the live-display write, regardless of verification status. This is correct for the
-- email-delivery path where create-and-open-letter may not have run yet (receiver_profile_id
-- still NULL). Position is scoped to the current caller (auth.uid()), not the intended
-- recipient (v_receiver_id), which is more correct when token is forwarded or shared.

CREATE OR REPLACE FUNCTION submit_point_response_by_token(
  p_token UUID,
  p_point_id UUID,
  p_position TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery_id UUID;
  v_letter_id   UUID;
BEGIN
  -- NULL guard on p_point_id before any writes
  IF p_point_id IS NULL THEN
    RETURN false;
  END IF;

  -- Enum validation — reject unknown position values cleanly before cast
  IF p_position NOT IN (
    'strongly_disagree', 'disagree', 'slightly_disagree', 'neutral',
    'slightly_agree', 'agree', 'strongly_agree'
  ) THEN
    RETURN false;
  END IF;

  -- Validate token (expiry check removed in P683; invitation_expires_at gates session
  -- minting only, not engagement writes).
  SELECT ld.id, ld.letter_id INTO v_delivery_id, v_letter_id
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.invitation_token = p_token
    AND cl.status = 'sealed'
  LIMIT 1;

  IF v_delivery_id IS NULL THEN
    RETURN false;
  END IF;

  -- P684: reject anonymous callers on one-to-many letters (public letters require auth)
  IF (SELECT mode FROM clarity_letters WHERE id = v_letter_id) = 'one-to-many'
     AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required for one-to-many responses';
  END IF;

  -- Authorization guard: p_point_id must belong to this letter.
  -- Critical under SECURITY DEFINER — without this, any valid token holder could
  -- submit a position for an arbitrary point_id in the database.
  IF NOT EXISTS (
    SELECT 1
    FROM letter_story_snapshots lss
    JOIN story_points sp ON sp.story_id = lss.story_id
    WHERE lss.letter_id = v_letter_id
      AND sp.point_id = p_point_id
  ) THEN
    RETURN false;
  END IF;

  -- Primary write: letter engagement record (idempotent).
  INSERT INTO letter_point_responses (delivery_id, point_id, position)
  VALUES (v_delivery_id, p_point_id, p_position)
  ON CONFLICT DO NOTHING;

  -- P705/P716 dual-write: live display store.
  -- Use auth.uid() (current caller) rather than receiver_profile_id (intended recipient)
  -- so the write succeeds even when the delivery has not yet been claimed
  -- (receiver_profile_id still NULL). auth.uid() IS NULL for anon callers — they are
  -- skipped; their positions replay via persist_anonymous_completion at signup.
  -- SECURITY DEFINER bypasses RLS so both verified and unverified authenticated users
  -- get immediate live display. Position is cast to the enum type for type safety.
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO point_positions (point_id, user_id, position)
    VALUES (p_point_id, auth.uid(), p_position::position_type)
    ON CONFLICT (point_id, user_id) DO UPDATE
      SET position = EXCLUDED.position, updated_at = now();
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_point_response_by_token(UUID, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION submit_point_response_by_token(UUID, UUID, TEXT) TO authenticated;
