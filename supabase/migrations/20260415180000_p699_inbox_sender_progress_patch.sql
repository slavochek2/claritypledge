-- P699 Phase 2b patch: Fix two issues found in code review of 20260415170000.
--
-- Fix 1: Branch 2 was missing `completed_at` — required by InboxItem TypeScript type.
--         For in-progress rows completed_at is NULL; for completed rows it's set.
-- Fix 2: Both branches: COALESCE(stories_rated, 0) to guard against NULL stories_rated
--         on legacy rows where the DEFAULT 0 was not backfilled.
--
-- Idempotent: DROP FUNCTION IF EXISTS + CREATE OR REPLACE.

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
          COALESCE(ld.stories_rated, 0) + (
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
        'completed_at',    ld.completed_at,
        'steps_completed', (
          COALESCE(ld.stories_rated, 0) + (
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
