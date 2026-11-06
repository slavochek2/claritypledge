-- client-safe: only the body of a trigger function changes; no deployed client calls it, and no table, policy, grant or
-- client-callable function changes.
-- diffed against: 20261106173500_p1646_choices_thread_follow.sql
-- P1646 round 4 follow-up. canvas_draft_undo rewrites the undone run's AGENT reply body to 'Undone.', which the thread-follow trigger
-- read as an edit and answered by deleting every choice of the draft ("pick A, Undo, then B" then found no open choice). An agent
-- row (chat_messages.kind = 'agent'; the engine posts them with author_id NULL) holds no quotable owner words, so the trigger now
-- ignores a change to one. Owner and other people's messages (every other kind) behave as before: the request_message_id rule and the
-- thread rule are unchanged. Erasure is NOT affected: erase_chat_data_for nulls derived_refs on agent replies and the separate
-- derived_refs trigger (20261106125500) still deletes the draft's choices.
-- Idempotent: CREATE OR REPLACE only (the trigger itself is unchanged).

CREATE OR REPLACE FUNCTION public._canvas_draft_choices_on_message_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.kind = 'agent' THEN
    RETURN NULL;
  END IF;
  DELETE FROM public.canvas_draft_choices c
   WHERE c.request_message_id = OLD.id
      OR EXISTS (SELECT 1 FROM public.canvas_drafts d
                  WHERE d.id = c.draft_id AND d.conversation_id = OLD.conversation_id
                    AND (d.thread_root_id = OLD.thread_root_id OR d.thread_root_id = OLD.id));
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_choices_on_message_change() FROM PUBLIC, anon, authenticated;
