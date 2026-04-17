-- P721 defence-in-depth: cap steps_completed at total_steps in get_deliveries_with_progress().
--
-- get_deliveries_with_progress feeds the sent-tab. Without the cap, dirty stories_rated
-- data produces "9 of 8 steps" in the sent-tab the same way it did in the inbox-tab.
-- Also adds COALESCE(ld.stories_rated, 0) to guard against NULL.
--
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION get_deliveries_with_progress(p_letter_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_result  JSONB;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',                   ld.id,
      'letter_id',            ld.letter_id,
      'receiver_email',       ld.receiver_email,
      'receiver_profile_id',  ld.receiver_profile_id,
      'receiver_name',        ld.receiver_name,
      'invitation_token',     ld.invitation_token,
      'invitation_expires_at',ld.invitation_expires_at,
      'access_token_expires_at', ld.access_token_expires_at,
      'status',               ld.status,
      'stories_rated',        ld.stories_rated,
      'opened_at',            ld.opened_at,
      'completed_at',         ld.completed_at,
      'read_at',              ld.read_at,
      'created_at',           ld.created_at,
      'steps_completed',      LEAST(
        COALESCE(ld.stories_rated, 0) + (
          SELECT COUNT(*)
          FROM letter_point_responses lpr
          WHERE lpr.delivery_id = ld.id
        ),
        (SELECT COUNT(*) FROM letter_story_snapshots lss WHERE lss.letter_id = ld.letter_id) +
        COALESCE(
          (SELECT SUM(jsonb_array_length(lss2.point_config->'points'))
           FROM letter_story_snapshots lss2
           WHERE lss2.letter_id = ld.letter_id),
          0
        )
      ),
      'total_steps',          (
        (SELECT COUNT(*) FROM letter_story_snapshots lss WHERE lss.letter_id = ld.letter_id) +
        COALESCE(
          (SELECT SUM(jsonb_array_length(lss2.point_config->'points'))
           FROM letter_story_snapshots lss2
           WHERE lss2.letter_id = ld.letter_id),
          0
        )
      )
    )
    ORDER BY ld.created_at
  ), '[]'::jsonb)
  INTO v_result
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.letter_id = ANY(p_letter_ids)
    AND cl.sender_id = v_user_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_deliveries_with_progress(UUID[]) TO authenticated;
