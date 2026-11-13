-- client-safe: point_chat_add_story keeps its signature, return type, SECURITY DEFINER and grants; only its search_path changes so the existing story triggers resolve their tables
-- Migration: P1631 shared-point stories fix (integration run on TEST: 42P01 relation "story_points" does not exist)
-- Created: 2026-11-13
-- Spec: features/p1631_mirror_drafts_reviewable_point_set.md (Open Question 10)
-- Guaranteed by: src/tests/p1631-shared-point-stories-migration.test.ts, src/tests/integration/p1631-shared-point-stories.test.ts
--
-- 20261113110000 is applied and is not edited. diffed against: point_chat_add_story(uuid, text, text[]) 20261113110000_p1631_shared_point_stories.sql (its newest definition), body byte for byte.
-- Cause: a SECURITY DEFINER function's `SET search_path = ''` also governs the trigger functions its INSERTs fire. The existing story and story_points triggers (e.g.
-- enforce_story_point_visibility_constraint, 20260325120000_p586_visibility_privacy_foundation.sql:165-183, which reads `FROM stories` and `FROM points` unqualified, and the story-version trigger)
-- carry no search_path of their own, so under '' they cannot find their tables. The only changed line is the SET line (`public, pg_temp`, marked). Every name in the body stays schema-qualified, and
-- pg_temp is last so a temporary object cannot shadow a public one. Nothing else changes: no policy, no grant, no other function.

BEGIN;

CREATE OR REPLACE FUNCTION public.point_chat_add_story(p_point uuid, p_content text, p_tags text[] DEFAULT '{}')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp -- P1631 trigger search_path
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

COMMIT;
