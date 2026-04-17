-- P725: Extend get_inbox_items() to include actor_slug for profile linking.
--
-- Both UNION ALL branches JOIN profiles on the "other-party" profile
-- (Branch 1: cl.sender_id, Branch 2: ld.receiver_profile_id via LEFT JOIN).
-- Adding p.slug to each jsonb_build_object is purely additive — no signature change.
--
-- actor_slug will be NULL for link_respondent / link_respondent_in_progress
-- (receiver_profile_id IS NULL → LEFT JOIN yields NULL). The UI falls back to
-- "Someone" plain text for those.
--
-- Idempotent: CREATE OR REPLACE.

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
        'type',          'received',
        'delivery_id',   ld.id,
        'letter_id',     ld.letter_id,
        'title',         COALESCE(cd.title, 'Untitled'),
        'actor_name',    COALESCE(p.name, 'Someone'),
        'actor_slug',    p.slug,
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
        'actor_slug',  p.slug,
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
