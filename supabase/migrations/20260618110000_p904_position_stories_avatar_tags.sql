-- P904 R7: enrich get_letter_position_stories with author avatar + pledge + tags
--
-- The position-story view dialog (letter-position-story-dialog.tsx) renders a
-- proper story card (avatar + name + hashtag-stripped body) instead of raw text.
-- A direct getStoryWithPoints re-fetch can't supply this for the cross-party
-- case — the position story is visibility:'private', so RLS returns NULL to the
-- *sender* viewing the *receiver's* story. The card must therefore render from
-- data this SECURITY DEFINER RPC already hands the participant.
--
-- This adds author_avatar_url, author_avatar_color, author_has_pledged, and the
-- user-hashtag `tags` array to the returned rows. Security model unchanged
-- (SECURITY DEFINER, SET search_path = '', participant gate, two-participant
-- author restriction, REVOKE public/anon + GRANT authenticated).
--
-- DROP first: CREATE OR REPLACE cannot change a function's RETURNS TABLE column
-- list (part of the return type). Safe — no deployed client calls the old shape
-- (the RPC shipped on this same unmerged P904 branch).
--
-- client-safe: get_letter_position_stories exists only on the unmerged P904
-- branch (added in 20260618100000_p904_letter_position_stories_rpc.sql). No
-- deployed prod client calls it, so the DROP+CREATE shape change cannot break a
-- live frontend; the R6/R7 consumer deploys together with this migration via
-- /ship, and the client maps the new columns with `?? undefined` / `?? []`.
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
    pr.name        AS author_name,
    pr.avatar_url  AS author_avatar_url,
    pr.avatar_color AS author_avatar_color,
    pr.has_pledged AS author_has_pledged,
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
  -- Only return stories authored by the letter's two participants.
  -- Prevents leaking private stories from unrelated users who happen
  -- to have filed a story on the same point outside this letter.
  AND sp.author_id IN (v_sender_id, v_receiver_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_letter_position_stories(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_letter_position_stories(UUID) TO authenticated;
