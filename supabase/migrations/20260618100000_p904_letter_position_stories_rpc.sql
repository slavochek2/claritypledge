-- P904 plan addendum: get_letter_position_stories
--
-- Returns position-stories (story_points rows) filed by EITHER participant
-- of a letter delivery, gated by _is_letter_participant. Enables the pair-
-- visible "Add a story / View story" in-place dialog on the results page.
--
-- Security model:
--   - SECURITY DEFINER with SET search_path = '' (no search_path injection)
--   - REVOKE ALL from public/anon; GRANT EXECUTE to authenticated
--   - Uses existing _is_letter_participant helper (never inlines the join)
--   - Restricts rows to stories authored by the delivery's sender/receiver
--     (prevents leaking private stories from unrelated users on shared points)
--
-- new function
-- client-safe: new function; existing deployed clients don't call it yet
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_letter_position_stories(p_delivery_id UUID)
RETURNS TABLE(
  point_id    UUID,
  story_id    UUID,
  author_id   UUID,
  author_name TEXT,
  content     TEXT,
  created_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_letter_id  UUID;
  v_sender_id  UUID;
  v_receiver_id UUID;
BEGIN
  -- Gate: caller must be a participant of this delivery
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
    pr.name AS author_name,
    s.content,
    s.created_at
  FROM public.story_points sp
  JOIN public.stories s  ON s.id  = sp.story_id
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
  -- Only return stories authored by the letter's two participants.
  -- Prevents leaking private stories from unrelated users who happen
  -- to have filed a story on the same point outside this letter.
  AND sp.author_id IN (v_sender_id, v_receiver_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_letter_position_stories(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_letter_position_stories(UUID) TO authenticated;
