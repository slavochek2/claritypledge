-- P695: Expose completed_at on received-letters branch of get_inbox_items.
-- This lets the client distinguish completed vs pending received letters
-- so the inbox button can show "Results" (outline) instead of "Read" (blue filled).
--
-- Change: add 'completed_at', ld.completed_at to the first jsonb_build_object
-- (received letters branch only). The responses branch already filters status='completed'
-- and doesn't need this field.
--
-- Base: 20260411204120_p690_inbox_items_rpc_fix_limit_order.sql

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
    SELECT item
    FROM (
      -- Received letters: letters delivered to this user
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
    ) all_items
    ORDER BY item->>'timestamp' DESC
    LIMIT 20
  ) trimmed;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_inbox_items(UUID) TO authenticated;
