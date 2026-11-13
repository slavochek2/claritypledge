-- client-safe: point_chat_stories keeps every row (its two foreign keys become SET NULL), the read helper additionally needs the card's share row, clarity_sessions refuses a bound story, one new client RPC (my_chat_bound_story_ids, own stories only); no policy, grant or signature of an existing function changes
-- Migration: P1631 shared-point stories round 2 (Codex 2, Opus N1 and N2)
-- Created: 2026-11-13
-- Spec: features/p1631_mirror_drafts_reviewable_point_set.md (Open Question 10)
-- Guaranteed by: src/tests/p1631-shared-point-stories-migration.test.ts, src/tests/integration/p1631-shared-point-stories.test.ts
--
-- 20261113110000 and 20261113200000 are applied and not edited here. Idempotent: re-running changes nothing.
-- diffed against: _my_chat_story_points() 20261113200000_p1631_shared_point_stories_card.sql (its newest definition; the new body adds one marked join and one marked condition).
--
-- CORRECTION to 20261113200000 (header, F2): it said clarity_sessions.source_story_id "holds the id only and the text is read through the stories policies". That was wrong. A live calibration
-- session COPIES the story's full text into clarity_sessions.live_state for the partner (clarity-live-page.tsx bootstrapLetterSourcedSession and handleSelectStory write selectedStoryData
-- through toLiveStoryData), and the partner reads it from there, not through the stories policies. The trigger below closes that path.
--
-- 1. Durable marker (Codex 2). point_chat_stories.message_id and .point_id were ON DELETE CASCADE: physically deleting the card or the point removed the binding, and with it the doc_stories trigger's
--    and _chat_story_link_ok's refusal, so the author could then mail the story. Both foreign keys are now ON DELETE SET NULL and the columns nullable. The row lives as long as the story
--    (story_id still cascades from stories). _my_chat_story_points admits nothing for a NULL message_id or point_id (a NULL never joins), so a deleted card or point makes the story
--    author-only. The doc_stories trigger and _chat_story_link_ok test the row's existence by story_id and are unchanged, so they keep refusing whatever the NULLs.
-- 2. N1. The read helper also joins point_chat_shares on the bound message and point, as _my_chat_shared_point_ids does: a card that carries the point without being a published share (the
--    author attaching their own point in another chat) admits no reader.
-- 3. N2. BEFORE INSERT OR UPDATE OF source_story_id, live_state on clarity_sessions refuses a bound story named by source_story_id, by live_state.selectedStoryId or by
--    live_state.selectedStoryData.id. Compared as uuid only after a shape check (live_state is client-written JSON). Cost: up to three primary-key lookups on a session write that names
--    one of those keys; nothing when the keys are absent.
--    my_chat_bound_story_ids(): the caller's OWN bound story ids, for the live story picker to leave them out (the client cannot read point_chat_stories).
--    Other places that take a story id and copy its text, read in source for this migration: letter_story_snapshots (made from doc_stories only; guarded by 20261113200000); live_state
--    (this trigger); the live round history entries (carry the id of a story only selected through live_state, which is refused); chat 'story' attachments (id only; the card reads the story
--    through the stories policies, which a non-reader fails); letter_predictions (id and prediction text); canvas_added_stories (its function makes its own story); story_explain_backs
--    (a recording, not the text); story_verifications (the two participants). Edge functions: generate-story-image-url and generate-banner read stories to make an image for the author; the result is stored on the story's own row (image_url, banner_url), so it is read under the stories policies. Whether the stored image file's URL is public to anyone holding it was NOT traced. No export path was found.

BEGIN;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.conname FROM pg_constraint c
            WHERE c.conrelid = 'public.point_chat_stories'::regclass AND c.contype = 'f'
              AND c.confrelid IN ('public.points'::regclass, 'public.chat_messages'::regclass) LOOP
    EXECUTE format('ALTER TABLE public.point_chat_stories DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE public.point_chat_stories ALTER COLUMN message_id DROP NOT NULL;
ALTER TABLE public.point_chat_stories ALTER COLUMN point_id DROP NOT NULL;
ALTER TABLE public.point_chat_stories ADD CONSTRAINT point_chat_stories_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE SET NULL;
ALTER TABLE public.point_chat_stories ADD CONSTRAINT point_chat_stories_point_id_fkey FOREIGN KEY (point_id) REFERENCES public.points(id) ON DELETE SET NULL;

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
    JOIN public.point_chat_shares sh ON sh.message_id = pcs.message_id AND sh.point_id = pcs.point_id -- P1631 durable
   WHERE m.deleted_at IS NULL AND m.attachment_kind = 'point' AND m.attachment_id = pcs.point_id -- P1631 card
     AND m.created_at >= COALESCE(public._chat_access_since(m.conversation_id, (SELECT auth.uid())), 'infinity'::timestamptz); -- P1631 card
$$;
REVOKE ALL ON FUNCTION public._my_chat_story_points() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._my_chat_story_points() TO authenticated;

CREATE OR REPLACE FUNCTION public._refuse_chat_bound_session_story()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_sel text := NEW.live_state ->> 'selectedStoryId';
  v_dat text := NEW.live_state #>> '{selectedStoryData,id}';
BEGIN
  IF (NEW.source_story_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.point_chat_stories pcs WHERE pcs.story_id = NEW.source_story_id))
     OR (v_sel ~* c_uuid AND EXISTS (SELECT 1 FROM public.point_chat_stories pcs WHERE pcs.story_id = v_sel::uuid))
     OR (v_dat ~* c_uuid AND EXISTS (SELECT 1 FROM public.point_chat_stories pcs WHERE pcs.story_id = v_dat::uuid)) THEN
    RAISE EXCEPTION 'a story written on a shared point card cannot be shared in a live session' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._refuse_chat_bound_session_story() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_refuse_chat_bound_session_story ON public.clarity_sessions;
CREATE TRIGGER trg_refuse_chat_bound_session_story
  BEFORE INSERT OR UPDATE OF source_story_id, live_state ON public.clarity_sessions
  FOR EACH ROW EXECUTE FUNCTION public._refuse_chat_bound_session_story();

CREATE OR REPLACE FUNCTION public.my_chat_bound_story_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pcs.story_id
    FROM public.point_chat_stories pcs
    JOIN public.stories s ON s.id = pcs.story_id
   WHERE s.author_id = (SELECT auth.uid());
$$;
REVOKE ALL ON FUNCTION public.my_chat_bound_story_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_chat_bound_story_ids() TO authenticated;

COMMIT;
