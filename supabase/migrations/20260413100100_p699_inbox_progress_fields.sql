-- P699: Add stories_rated and total_stories to Branch 1 (received letters) inbox items.
--
-- Branch 1 now returns two additional fields:
--   stories_rated  — letter_deliveries.stories_rated (how many stories the receiver has rated)
--   total_stories  — COUNT(*) from letter_story_snapshots for the letter (how many stories exist)
--
-- Branch 2 (responses / link_respondent) is unchanged.
-- All other function behaviour (auth check, LIMIT 20, ORDER BY, GRANT) is preserved.
--
-- Base: 20260412210000_fix_inbox_restore_responses_branch.sql

CREATE OR REPLACE FUNCTION get_inbox_items(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: cannot query another user''s inbox';
  END IF;

  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT item
    FROM (
      -- Branch 1: Received letters (letters delivered to this user, not self-sent)
      SELECT jsonb_build_object(
        'type',          'received',
        'delivery_id',   ld.id,
        'letter_id',     ld.letter_id,
        'title',         COALESCE(cd.title, 'Untitled'),
        'actor_name',    COALESCE(p.name, 'Someone'),
        'timestamp',     ld.created_at,
        'read_at',       ld.read_at,
        'completed_at',  ld.completed_at,
        'stories_rated', ld.stories_rated,
        'total_stories', (
          SELECT COUNT(*)
          FROM letter_story_snapshots
          WHERE letter_id = ld.letter_id
        )
      ) AS item
      FROM letter_deliveries ld
      JOIN clarity_letters cl  ON cl.id = ld.letter_id
      JOIN clarity_docs cd     ON cd.id = cl.source_doc_id
      JOIN profiles p          ON p.id  = cl.sender_id
      WHERE ld.receiver_profile_id = p_user_id
        AND cl.sender_id != p_user_id              -- exclude self-sent

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
      WHERE cl.sender_id = p_user_id
        AND ld.status = 'completed'
        AND (ld.receiver_profile_id IS NULL OR ld.receiver_profile_id != p_user_id)
    ) all_items
    ORDER BY item->>'timestamp' DESC
    LIMIT 20
  ) trimmed;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_inbox_items(UUID) TO authenticated;
