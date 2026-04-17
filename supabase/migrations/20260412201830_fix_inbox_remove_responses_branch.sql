-- Fix: remove the "Responses" UNION branch from get_inbox_items.
--
-- The responses branch returned 'recipient_responded' / 'link_respondent' items
-- to notify senders when recipients complete their letter. These appeared in
-- the sender's inbox alongside received letters — confusing UX.
-- The Sent tab already shows completion counts per letter, so this info is
-- redundant. Inbox = received letters only.
--
-- Base: 20260412160000_p695_inbox_show_completed_received.sql

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

  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'type',         'received',
      'delivery_id',  ld.id,
      'letter_id',    ld.letter_id,
      'title',        COALESCE(cd.title, 'Untitled'),
      'actor_name',   COALESCE(p.name, 'Someone'),
      'timestamp',    ld.created_at,
      'read_at',      ld.read_at,
      'completed_at', ld.completed_at
    ) AS item
    FROM letter_deliveries ld
    JOIN clarity_letters cl  ON cl.id = ld.letter_id
    JOIN clarity_docs cd     ON cd.id = cl.source_doc_id
    JOIN profiles p          ON p.id  = cl.sender_id
    WHERE ld.receiver_profile_id = p_user_id
    ORDER BY ld.created_at DESC
    LIMIT 20
  ) trimmed;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_inbox_items(UUID) TO authenticated;
