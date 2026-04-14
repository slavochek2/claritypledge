-- P699 Phase 2: Step-granular progress for inbox and sent-tab.
--
-- Steps are defined as:
--   total_steps     = total_stories + total_points
--   steps_completed = stories_rated + points_positioned
--
-- Changes:
--   1. get_inbox_items() — Branch 1 (received) gains steps_completed + total_steps.
--      total_stories / stories_rated kept for backward compat.
--   2. get_deliveries_with_progress(letter_ids) — new function used by sent-tab to
--      get per-delivery step counts without N+1 queries from the client.

-- ============================================================================
-- 1. Refresh get_inbox_items with step counts (Branch 1 only)
-- ============================================================================

DROP FUNCTION IF EXISTS get_inbox_items();

CREATE OR REPLACE FUNCTION get_inbox_items()
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

  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT item
    FROM (
      -- Branch 1: Received letters (letters delivered to this user, not self-sent)
      SELECT jsonb_build_object(
        'type',            'received',
        'delivery_id',     ld.id,
        'letter_id',       ld.letter_id,
        'title',           COALESCE(cd.title, 'Untitled'),
        'actor_name',      COALESCE(p.name, 'Someone'),
        'timestamp',       ld.created_at,
        'read_at',         ld.read_at,
        'completed_at',    ld.completed_at,
        'stories_rated',   ld.stories_rated,
        'total_stories',   (
          SELECT COUNT(*)
          FROM letter_story_snapshots
          WHERE letter_id = ld.letter_id
        ),
        'steps_completed', (
          ld.stories_rated + (
            SELECT COUNT(*)
            FROM letter_point_responses
            WHERE delivery_id = ld.id
          )
        ),
        'total_steps',     (
          (SELECT COUNT(*) FROM letter_story_snapshots WHERE letter_id = ld.letter_id) +
          COALESCE(
            (SELECT SUM(jsonb_array_length(point_config->'points'))
             FROM letter_story_snapshots
             WHERE letter_id = ld.letter_id),
            0
          )
        )
      ) AS item
      FROM letter_deliveries ld
      JOIN clarity_letters cl  ON cl.id = ld.letter_id
      JOIN clarity_docs cd     ON cd.id = cl.source_doc_id
      JOIN profiles p          ON p.id  = cl.sender_id
      WHERE ld.receiver_profile_id = v_user_id
        AND cl.sender_id != v_user_id              -- exclude self-sent

      UNION ALL

      -- Branch 2: Responses — other users who completed letters I sent
      SELECT jsonb_build_object(
        'type',        CASE WHEN ld.receiver_profile_id IS NOT NULL
                            THEN 'recipient_responded'
                            ELSE 'link_respondent' END,
        'delivery_id', ld.id,
        'letter_id',   ld.letter_id,
        'title',       COALESCE(cd.title, 'Untitled'),
        'actor_name',  COALESCE(p.name, 'Someone'),
        'timestamp',   COALESCE(ld.completed_at, ld.created_at),
        'read_at',     ld.read_at
      ) AS item
      FROM letter_deliveries ld
      JOIN clarity_letters cl  ON cl.id = ld.letter_id
      JOIN clarity_docs cd     ON cd.id = cl.source_doc_id
      LEFT JOIN profiles p     ON p.id  = ld.receiver_profile_id
      WHERE cl.sender_id = v_user_id
        AND ld.status = 'completed'
        AND (ld.receiver_profile_id IS NULL OR ld.receiver_profile_id != v_user_id)
    ) all_items
    ORDER BY item->>'timestamp' DESC
    LIMIT 20
  ) trimmed;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_inbox_items() TO authenticated;

-- ============================================================================
-- 2. New: get_deliveries_with_progress — returns delivery rows augmented with
--    step counts for the sent-tab. Caller must own the letters.
-- ============================================================================

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
      'steps_completed',      (
        ld.stories_rated + (
          SELECT COUNT(*)
          FROM letter_point_responses lpr
          WHERE lpr.delivery_id = ld.id
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
