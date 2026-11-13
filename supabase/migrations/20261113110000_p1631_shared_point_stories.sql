-- client-safe: adds a table no client can touch, one client RPC (point_chat_add_story), two read helpers granted to authenticated, four permissive SELECT policies and one restrictive INSERT policy; no existing policy, function, column or grant changes; no story becomes readable except one written through point_chat_add_story
-- Migration: P1631 "Add a story" on a shared point card writes a new story readable by exactly the card's readers
-- Created: 2026-11-13
-- Spec: features/p1631_mirror_drafts_reviewable_point_set.md (Open Question 10)
-- Guaranteed by: src/tests/p1631-shared-point-stories-migration.test.ts (source contract), src/tests/integration/p1631-shared-point-stories.test.ts
-- new function: point_chat_add_story, _my_chat_story_points, _chat_story_link_ok (no earlier body; later restated in 20261113170000, 20261113200000, 20261113240000)
--
-- Rule (founder, 2026-11-13, as clarified): a story written on a shared card inherits the card's audience. It is a NEW story, bound at birth to that one point; nothing is linked, nothing is transitive.
-- A story is readable through this path ONLY when it has a row in point_chat_stories, and only by someone who can read the bound point through _my_chat_shared_point_ids() (computed per statement, never
-- cached, so a reader loses the story exactly when the point stops being shared with them: card deleted, left the chat, history rule). An existing private story linked (by its author) to a public
-- point, or to a chat point, is NOT in point_chat_stories and stays author-only.
--
-- Pieces:
--   point_chat_stories      (story_id PK -> stories, point_id -> points). RLS on, no policy, every client privilege revoked: written only by point_chat_add_story, read only through the helper below.
--   point_chat_add_story    client RPC. Refuses unless the caller is signed in, verified (as the stories INSERT policy requires), and can read the point as a live card in a chat (the point is private and
--                           is in _my_chat_shared_point_ids(), which is a stricter test than _point_position_write_ok: it is true for the author only while the author still reads the card). Then, in one
--                           transaction: the stories row (visibility 'private', author auth.uid(), no system tags; the existing story triggers write the first story_versions row), the story_points link,
--                           and the point_chat_stories row. Returns {story_id}.
--   _my_chat_story_points   read helper, SECURITY DEFINER, no argument, reads auth.uid() only: the (story_id, point_id) pairs of bound stories whose point is in the caller's set. Granted to
--                           authenticated because a policy runs a function as the caller (same as _my_chat_shared_point_ids). A helper is needed because the caller has no privilege on point_chat_stories.
--   _chat_story_link_ok     closes the bridge: a story bound to a point may be linked only to that point.
--
-- Read policies added (permissive, FOR SELECT, TO authenticated; each ORs with the table's existing owner/public policy). Each sibling of the "story is visible" rule:
--   stories              "Stories readable by visibility"                   20260325120000_p586_visibility_privacy_foundation.sql:198-202
--   story_points         "Story points visible when story visible"          same file 231-238      -> only the bound (story_id, point_id) pair
--   story_point_history  "Story point history visible when story visible"  same file 259-266      -> only the bound pair
--   story_versions       story_versions_select_visible                      same file 349-358
-- NOT added: story_verifications ("Verifications visible when story visible", 20260911173000_p1278_d_a_guest_round_is_recorded.sql:159). A calibration round keeps its two participants as its
-- readers; the card shows no rounds. doc_stories, story_explain_backs, letter_story_snapshots, canvas_added_stories do not follow story visibility and are untouched.
--
-- No bridging, enforced three ways:
--   1. story_points_insert_bound_story (RESTRICTIVE, FOR INSERT): a link for a story in point_chat_stories must be to its bound point. Only a definer function can write point_chat_stories, and
--      point_chat_add_story writes it before the link, so the legitimate link passes (the function bypasses row security as the owner of the other definer paths do).
--   2. story_points has no UPDATE policy, so a link cannot be re-pointed; the author may still DELETE the link (a story stays readable to the card's readers, bound to its point, with no link row).
--   3. Visibility cannot leave 'private': trg_story_visibility_immutable (20260325120000_p586_visibility_privacy_foundation.sql:123-139) raises on any change of stories.visibility, and the point's
--      is immutable the same way (enforce_point_visibility_immutable, same file 142-158). The read policy also repeats visibility = 'private' on stories.
--
-- Measured 2026-11-13 on self-hosted TEST, EXPLAIN ANALYZE as a signed-in user (role authenticated, auth.uid() set; the user with
-- the most published cards): the 50 newest public stories 1.3 ms, 200 story links of public stories 3.3 ms, 50 newest public points
-- 20.9 ms. The stories policy runs `_my_chat_story_points` once per statement (hashed SubPlan, loops=1), not once per row.

BEGIN;

CREATE TABLE IF NOT EXISTS public.point_chat_stories (
  story_id   uuid PRIMARY KEY REFERENCES public.stories(id) ON DELETE CASCADE,
  point_id   uuid NOT NULL REFERENCES public.points(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS point_chat_stories_point_idx ON public.point_chat_stories (point_id);
ALTER TABLE public.point_chat_stories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.point_chat_stories FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._my_chat_story_points()
RETURNS TABLE (story_id uuid, point_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
ROWS 20
AS $$
  SELECT pcs.story_id, pcs.point_id
    FROM public.point_chat_stories pcs
   WHERE pcs.point_id IN (SELECT public._my_chat_shared_point_ids());
$$;
REVOKE ALL ON FUNCTION public._my_chat_story_points() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._my_chat_story_points() TO authenticated;

CREATE OR REPLACE FUNCTION public._chat_story_link_ok(p_story uuid, p_point uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.point_chat_stories pcs
     WHERE pcs.story_id = p_story AND pcs.point_id IS DISTINCT FROM p_point
  );
$$;
REVOKE ALL ON FUNCTION public._chat_story_link_ok(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._chat_story_link_ok(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.point_chat_add_story(p_point uuid, p_content text, p_tags text[] DEFAULT '{}')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_story uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'story: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = v_uid AND pr.is_verified = true) THEN
    RAISE EXCEPTION 'story: not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_content IS NULL OR btrim(p_content) = '' THEN
    RAISE EXCEPTION 'story: empty' USING ERRCODE = '22023';
  END IF;
  -- one answer for "no such point", "not private", "not shared with you" and "no longer shared with you"
  IF NOT EXISTS (
    SELECT 1 FROM public.points p
     WHERE p.id = p_point AND p.visibility = 'private'
       AND p.id IN (SELECT public._my_chat_shared_point_ids())
  ) THEN
    RAISE EXCEPTION 'story: not allowed' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.stories (author_id, content, tags, system_tags, visibility)
  VALUES (v_uid, p_content, COALESCE(p_tags, '{}'), '{}', 'private')
  RETURNING id INTO v_story;

  INSERT INTO public.point_chat_stories (story_id, point_id) VALUES (v_story, p_point);
  INSERT INTO public.story_points (story_id, point_id, author_id) VALUES (v_story, p_point, v_uid);

  RETURN jsonb_build_object('story_id', v_story);
END;
$$;
REVOKE ALL ON FUNCTION public.point_chat_add_story(uuid, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.point_chat_add_story(uuid, text, text[]) TO authenticated;

DROP POLICY IF EXISTS stories_select_chat_point_story ON public.stories;
CREATE POLICY stories_select_chat_point_story ON public.stories FOR SELECT TO authenticated
  USING (visibility = 'private' AND id IN (SELECT m.story_id FROM public._my_chat_story_points() m));

DROP POLICY IF EXISTS story_points_select_chat_point_story ON public.story_points;
CREATE POLICY story_points_select_chat_point_story ON public.story_points FOR SELECT TO authenticated
  USING ((story_id, point_id) IN (SELECT m.story_id, m.point_id FROM public._my_chat_story_points() m));

DROP POLICY IF EXISTS story_point_history_select_chat_point_story ON public.story_point_history;
CREATE POLICY story_point_history_select_chat_point_story ON public.story_point_history FOR SELECT TO authenticated
  USING ((story_id, point_id) IN (SELECT m.story_id, m.point_id FROM public._my_chat_story_points() m));

DROP POLICY IF EXISTS story_versions_select_chat_point_story ON public.story_versions;
CREATE POLICY story_versions_select_chat_point_story ON public.story_versions FOR SELECT TO authenticated
  USING (story_id IN (SELECT m.story_id FROM public._my_chat_story_points() m));

DROP POLICY IF EXISTS story_points_insert_bound_story ON public.story_points;
CREATE POLICY story_points_insert_bound_story ON public.story_points AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public._chat_story_link_ok(story_id, point_id));

COMMIT;
