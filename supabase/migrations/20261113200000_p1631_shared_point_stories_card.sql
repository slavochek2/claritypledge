-- client-safe: point_chat_add_story gains a p_message argument (the old three-argument form is dropped; the client is updated in the same release), a story becomes readable only while the CARD it was written on is live and readable, and doc_stories refuses a bound story; no other table, policy or grant changes
-- Migration: P1631 shared-point stories follow the card, not the point (review F1, F2, F6)
-- Created: 2026-11-13
-- Spec: features/p1631_mirror_drafts_reviewable_point_set.md (Open Question 10)
-- Guaranteed by: src/tests/p1631-shared-point-stories-migration.test.ts, src/tests/integration/p1631-shared-point-stories.test.ts
--
-- Earlier P1631 migrations are applied and not edited here (20261113110000 gained idempotency guards only). Idempotent: re-running this file changes nothing.
-- diffed against: point_chat_add_story(uuid, text, text[]) 20261113170000_p1631_shared_point_stories_fixes.sql (its newest definition; the new body keeps its structure, the changed parts are described below),
--                 _my_chat_story_points() and _chat_story_link_ok(uuid, uuid) 20261113110000_p1631_shared_point_stories.sql (their newest definitions).
--
-- F1. A story is bound to the CARD it was written on (point_chat_stories.message_id), not to the point. Before this, deleting a card and publishing the point again (a new card) let a later joiner,
--     who cannot read the old card, read stories written on it, because the point was shared again. Now:
--       - the read helper admits a (story, point) pair only when its bound card is live (not deleted, still a point card for that point) AND the caller can read that card under the chat's own history rule
--         (_chat_access_since(conversation, caller) <= card.created_at, the rule _my_chat_shared_point_ids applies per card). Card deleted -> the story is author-only again; a person who joined after the
--         card never reads the story, whatever other card shows the same point.
--       - point_chat_add_story takes the card's message id, and refuses unless that message is a live point card for p_point, the point is private, a share record exists for it, and the caller reads it
--         under the same rule. One answer (42501) for every refusal. The old three-argument function is dropped (the one client call is updated with it).
--     message_id is backfilled for rows written before this file with the newest live card of the point; a row with no live card cannot be backfilled and loses its BINDING row only (the story itself is
--     kept, private to its author, exactly as before it was bound). Count reported with a NOTICE.
-- F2. A bound story must not be copied into a letter: doc_stories INSERT only checks authorship and seal_and_send_letter snapshots the story's text for the recipient. A trigger on doc_stories refuses
--     a story that has a point_chat_stories row. Other paths that carry a story id or text were read (not assumed): letter_story_snapshots are made only from doc_stories (covered); chat 'story'
--     attachments and clarity_sessions.source_story_id hold the id only and the text is read through the stories policies, which a non-reader of the card fails; letter_predictions holds the id
--     and the prediction text, never the story text; canvas_added_stories is written by canvas_add_story, which makes its own story; story_verifications keep their participants as readers.
-- F6. _chat_story_link_ok was callable by anyone and revealed whether an arbitrary story is bound and to which point. It now answers true unless the caller IS the story's author (only an author can insert
--     a link), so it reveals nothing about anyone else's story.

BEGIN;

ALTER TABLE public.point_chat_stories ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE;

UPDATE public.point_chat_stories pcs
   SET message_id = (SELECT m.id FROM public.chat_messages m
                      WHERE m.attachment_kind = 'point' AND m.attachment_id = pcs.point_id AND m.deleted_at IS NULL
                      ORDER BY m.created_at DESC LIMIT 1)
 WHERE pcs.message_id IS NULL;

DO $$
DECLARE v_n integer;
BEGIN
  DELETE FROM public.point_chat_stories WHERE message_id IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'P1631 shared-point stories: % binding row(s) without a live card removed (their stories are kept, author-only)', v_n;
END $$;

ALTER TABLE public.point_chat_stories ALTER COLUMN message_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS point_chat_stories_message_idx ON public.point_chat_stories (message_id);

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
    JOIN public.chat_messages m ON m.id = pcs.message_id
   WHERE m.deleted_at IS NULL AND m.attachment_kind = 'point' AND m.attachment_id = pcs.point_id -- P1631 card
     AND m.created_at >= COALESCE(public._chat_access_since(m.conversation_id, (SELECT auth.uid())), 'infinity'::timestamptz); -- P1631 card
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
      JOIN public.stories s ON s.id = pcs.story_id -- P1631 oracle
     WHERE pcs.story_id = p_story AND pcs.point_id IS DISTINCT FROM p_point
       AND s.author_id = (SELECT auth.uid()) -- P1631 oracle
  );
$$;
REVOKE ALL ON FUNCTION public._chat_story_link_ok(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._chat_story_link_ok(uuid, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.point_chat_add_story(uuid, text, text[]);
CREATE OR REPLACE FUNCTION public.point_chat_add_story(p_point uuid, p_message uuid, p_content text, p_tags text[] DEFAULT '{}')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  -- one answer for "no such card", "not a card of this point", "deleted", "point not private", "not shared with you" and "no longer shared with you" -- P1631 card
  IF NOT EXISTS ( -- P1631 card
    SELECT 1 FROM public.chat_messages m -- P1631 card
      JOIN public.point_chat_shares s ON s.message_id = m.id AND s.point_id = p_point -- P1631 card
      JOIN public.points p ON p.id = p_point AND p.visibility = 'private' -- P1631 card
     WHERE m.id = p_message AND m.deleted_at IS NULL AND m.attachment_kind = 'point' AND m.attachment_id = p_point -- P1631 card
       AND m.created_at >= COALESCE(public._chat_access_since(m.conversation_id, v_uid), 'infinity'::timestamptz) -- P1631 card
  ) THEN -- P1631 card
    RAISE EXCEPTION 'story: not allowed' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.stories (author_id, content, tags, system_tags, visibility)
  VALUES (v_uid, p_content, COALESCE(p_tags, '{}'), '{}', 'private')
  RETURNING id INTO v_story;

  INSERT INTO public.point_chat_stories (story_id, point_id, message_id) VALUES (v_story, p_point, p_message); -- P1631 card
  INSERT INTO public.story_points (story_id, point_id, author_id) VALUES (v_story, p_point, v_uid);

  RETURN jsonb_build_object('story_id', v_story);
END;
$$;
REVOKE ALL ON FUNCTION public.point_chat_add_story(uuid, uuid, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.point_chat_add_story(uuid, uuid, text, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public._refuse_chat_bound_doc_story()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.point_chat_stories pcs WHERE pcs.story_id = NEW.story_id) THEN
    RAISE EXCEPTION 'a story written on a shared point card cannot be put in a letter' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._refuse_chat_bound_doc_story() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_refuse_chat_bound_doc_story ON public.doc_stories;
CREATE TRIGGER trg_refuse_chat_bound_doc_story
  BEFORE INSERT OR UPDATE ON public.doc_stories
  FOR EACH ROW EXECUTE FUNCTION public._refuse_chat_bound_doc_story();

COMMIT;
