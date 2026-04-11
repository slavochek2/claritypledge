-- P690: SECURITY DEFINER RPC for inbox items.
-- Fixes phantom count: getInboxItems used PostgREST inner-join on clarity_docs,
-- which is blocked by clarity_docs SELECT RLS for receivers (not owner/public).
-- The inner join silently dropped every row, while getUnreadLetterCount (which
-- queries letter_deliveries directly) still saw the row → phantom badge count.
--
-- This RPC runs as SECURITY DEFINER, bypasses RLS for the narrow fields the
-- inbox UI needs, and returns a shape matching InboxItem[].
-- Authorization: caller can only query their own inbox (p_user_id = auth.uid()).

CREATE OR REPLACE FUNCTION get_inbox_items(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Authorization gate: prevent cross-user inbox reads
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: cannot query another user''s inbox';
  END IF;

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'timestamp' DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    -- Received letters: letters delivered to this user
    SELECT jsonb_build_object(
      'type',        'received',
      'delivery_id', ld.id,
      'letter_id',   ld.letter_id,
      'title',       COALESCE(cd.title, 'Untitled'),
      'actor_name',  COALESCE(p.name, 'Someone'),
      'timestamp',   ld.created_at,
      'read_at',     ld.read_at
    ) AS item
    FROM letter_deliveries ld
    JOIN clarity_letters cl  ON cl.id = ld.letter_id
    JOIN clarity_docs cd     ON cd.id = cl.source_doc_id
    JOIN profiles p          ON p.id  = cl.sender_id
    WHERE ld.receiver_profile_id = p_user_id

    UNION ALL

    -- Responses: other users who completed letters I sent
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
  ) sub
  LIMIT 20;

  RETURN v_result;
END;
$$;

-- Inbox is authenticated-only — no anon grant
GRANT EXECUTE ON FUNCTION get_inbox_items(UUID) TO authenticated;
