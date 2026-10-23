-- client-safe: same signature and return shape; it only narrows when the quiet-share rule applies, so more calls return a job than under 20261023160000, never fewer.
-- diffed against: 20261023160000_p1554_mirror_quiet_shares.sql
-- P1554 review fixes, two changes to mirror_request_reply:
--   1. The quiet-share rule applies to kind = 'message' only. A Clarify copies its source's attachment and
--      stores an empty note as NULL, so a Clarify of a shared point with no note looked like a share and got
--      no answer; Clarify is the main way to ask the mirror, so it always gets one.
--   2. An existing job is returned before the rule is applied, so a share that already had a job (before
--      20261023160000) can still be retried instead of looping on Try again.
CREATE OR REPLACE FUNCTION public.mirror_request_reply(p_message uuid)
RETURNS TABLE (job_id uuid, state text, reply_message_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_msg public.chat_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT m.* INTO v_msg
    FROM public.chat_messages m
    JOIN public.chat_conversations c ON c.id = m.conversation_id
   WHERE m.id = p_message AND c.kind = 'mirror' AND c.owner_id = v_uid AND m.author_id = v_uid;
  IF NOT FOUND OR v_msg.deleted_at IS NOT NULL OR v_msg.kind NOT IN ('message', 'clarify') THEN
    RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501';
  END IF;

  -- A share (a plain message with an attachment and no text) is filed quietly: no new job, no reply.
  IF v_msg.kind = 'message' AND v_msg.attachment_id IS NOT NULL AND btrim(coalesce(v_msg.body, '')) = ''
     AND NOT EXISTS (SELECT 1 FROM public.mirror_jobs j WHERE j.trigger_message_id = v_msg.id) THEN
    RETURN;
  END IF;

  INSERT INTO public.mirror_jobs (owner_id, kind, trigger_message_id, context_conversation_id)
  VALUES (v_uid, CASE WHEN v_msg.context_conversation_id IS NULL THEN 'reply' ELSE 'ask' END,
          v_msg.id, v_msg.context_conversation_id)
  ON CONFLICT (trigger_message_id) WHERE trigger_message_id IS NOT NULL DO NOTHING;

  RETURN QUERY
    SELECT j.id, j.state, j.reply_message_id FROM public.mirror_jobs j WHERE j.trigger_message_id = v_msg.id;
END;
$$;
REVOKE ALL ON FUNCTION public.mirror_request_reply(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mirror_request_reply(uuid) TO authenticated;
