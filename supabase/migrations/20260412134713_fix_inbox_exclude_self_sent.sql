-- Fix: exclude self-sent letters from inbox.
--
-- Bug: get_inbox_items returned letters where the sender is the same user
-- as the receiver (sender_id = receiver_profile_id). This surfaced test
-- letters like "Vyacheslav Ladischenski sent you Test mestovich" in your
-- own inbox — you can't receive a letter you sent yourself.
--
-- Fix: add AND cl.sender_id != p_user_id to the WHERE clause.
--
-- Bug B note: duplicate deliveries (same letter_id + receiver, different
-- invitation_tokens) are a send-side issue and addressed separately.
-- The self-sent filter clears the test inbox since all test data is self-sent.
--
-- Base: 20260412201830_fix_inbox_remove_responses_branch.sql

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
      AND cl.sender_id != p_user_id          -- exclude self-sent letters
    ORDER BY ld.created_at DESC
    LIMIT 20
  ) trimmed;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_inbox_items(UUID) TO authenticated;
