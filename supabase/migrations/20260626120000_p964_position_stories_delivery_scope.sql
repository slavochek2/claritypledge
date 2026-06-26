-- P964: delivery-scope get_letter_position_stories + harden sender exclusion
--
-- Two bugs patched:
--
-- (1) Cross-letter phantom: story_points has no delivery_id, so a reused point
--     surfaced a position story written on letter A as "existing" on letter B.
--     Fix: for receiver-authored stories, require a matching letter_point_responses
--     row for (delivery_id, point_id) — the response table IS delivery-scoped.
--     letter_point_responses has no profile_id; the delivery_id+point_id pair
--     combined with `sp.author_id = v_receiver_id` gates the story to this delivery.
--
-- (2) Sender story leaks client-side: the prior RPC returned sender-authored
--     rows and relied on a client-side `author_id !== senderId` filter. Fix:
--     exclude the sender's rows server-side (AND sp.author_id != v_sender_id).
--
-- DROP first: return type unchanged but previous versions used CREATE OR REPLACE
-- so schema already exists; DROP is the only safe path to replace the function body.
-- client-safe: no deployed client calls this yet (P952 ships together with P964).
-- --------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_letter_position_stories(UUID);

CREATE FUNCTION public.get_letter_position_stories(p_delivery_id UUID)
RETURNS TABLE(
  point_id            UUID,
  story_id            UUID,
  author_id           UUID,
  author_name         TEXT,
  author_avatar_url   TEXT,
  author_avatar_color TEXT,
  author_has_pledged  BOOLEAN,
  content             TEXT,
  tags                TEXT[],
  created_at          TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_letter_id   UUID;
  v_sender_id   UUID;
  v_receiver_id UUID;
BEGIN
  IF NOT public._is_letter_participant(p_delivery_id) THEN
    RETURN;
  END IF;

  SELECT ld.letter_id, cl.sender_id, ld.receiver_profile_id
  INTO v_letter_id, v_sender_id, v_receiver_id
  FROM public.letter_deliveries ld
  JOIN public.clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.id = p_delivery_id;

  IF v_letter_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    sp.point_id,
    sp.story_id,
    sp.author_id,
    pr.name         AS author_name,
    pr.avatar_url   AS author_avatar_url,
    pr.avatar_color AS author_avatar_color,
    pr.has_pledged  AS author_has_pledged,
    s.content,
    s.tags,
    s.created_at
  FROM public.story_points sp
  JOIN public.stories s   ON s.id  = sp.story_id
  JOIN public.profiles pr ON pr.id = sp.author_id
  WHERE sp.point_id IN (
    SELECT DISTINCT (pt->>'id')::UUID
    FROM public.letter_story_snapshots lss
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(lss.point_config->'points', '[]'::jsonb)
    ) AS pt
    WHERE lss.letter_id = v_letter_id
      AND (pt->>'id') IS NOT NULL
  )
  -- P964 D3 (#2): exclude sender's stories server-side.
  AND sp.author_id != v_sender_id
  -- P964 D3 (#1): delivery-scope receiver stories via letter_point_responses.
  -- A receiver story is valid for THIS delivery only if the receiver has a
  -- point-response row for (delivery_id, point_id). A reused point from a
  -- different delivery won't have a matching lpr row → filtered out.
  AND (
    sp.author_id != v_receiver_id
    OR EXISTS (
      SELECT 1 FROM public.letter_point_responses lpr
      WHERE lpr.delivery_id = p_delivery_id
        AND lpr.point_id = sp.point_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_letter_position_stories(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_letter_position_stories(UUID) TO authenticated;
