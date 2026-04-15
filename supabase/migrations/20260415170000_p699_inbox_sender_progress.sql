-- P699 Phase 2b: Extend get_inbox_items Branch 2 to include in-progress recipients.
--
-- Bugs fixed:
--   Bug 1: Branch 2 had `AND ld.status = 'completed'` — in-progress deliveries were excluded.
--   Bug 2: Frontend used stories_rated/total_stories with "stories complete" label.
--          (Fixed in frontend; migration adds step fields to Branch 2 to support it.)
--   Bug 3: Sent tab summary copy — frontend-only fix.
--
-- Changes:
--   1. Branch 2 now includes status IN ('in_progress', 'completed') — excludes 'sent'/'opened'
--      (those have no recipient activity yet).
--   2. Branch 2 emits four type variants:
--        'recipient_in_progress'       — named recipient, started but not finished
--        'link_respondent_in_progress' — anonymous link respondent, started but not finished
--        'recipient_responded'         — named recipient, completed
--        'link_respondent'             — anonymous link respondent, completed
--   3. Branch 2 gains steps_completed + total_steps using same subqueries as Branch 1.
--   4. In-progress timestamp: ld.created_at (letter_deliveries has no updated_at column).
--
-- Note: letter_deliveries.updated_at does not exist; ld.created_at used as timestamp fallback
--       for in-progress rows. This means in-progress rows appear at letter creation time,
--       not at the time the recipient last engaged. Acceptable for this release.
--
-- Idempotency: DROP FUNCTION IF EXISTS + CREATE OR REPLACE — safe to run twice.

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

      -- Branch 2: Responses — other users who started or completed letters I sent.
      --   Includes in_progress (recipient engaged) and completed.
      --   Excludes 'sent' and 'opened' (no recipient activity yet).
      SELECT jsonb_build_object(
        'type',            CASE
                             WHEN ld.completed_at IS NULL AND ld.receiver_profile_id IS NOT NULL THEN 'recipient_in_progress'
                             WHEN ld.completed_at IS NULL AND ld.receiver_profile_id IS NULL     THEN 'link_respondent_in_progress'
                             WHEN ld.receiver_profile_id IS NOT NULL                              THEN 'recipient_responded'
                             ELSE                                                                      'link_respondent'
                           END,
        'delivery_id',     ld.id,
        'letter_id',       ld.letter_id,
        'title',           COALESCE(cd.title, 'Untitled'),
        'actor_name',      COALESCE(p.name, 'Someone'),
        'timestamp',       COALESCE(ld.completed_at, ld.created_at),
        'read_at',         ld.read_at,
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
      LEFT JOIN profiles p     ON p.id  = ld.receiver_profile_id
      WHERE cl.sender_id = v_user_id
        AND ld.status IN ('in_progress', 'completed')
        AND (ld.receiver_profile_id IS NULL OR ld.receiver_profile_id != v_user_id)
    ) all_items
    ORDER BY item->>'timestamp' DESC
    LIMIT 20
  ) trimmed;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_inbox_items() TO authenticated;
