-- client-safe: restates mirror_request_reply with the P1722 transcribed-line rule placed after the P1631 Clarify-thread rule (same behaviour: both are quiet returns); no signature, grant or result change.
-- diffed against: mirror_request_reply: 20261125104835_p1722_solo_clarify_in_the_mirror.sql (its own prior text, rule order only) and 20261110170000_p1631_review_fixes.sql
--
-- P1722 follow-up: the P1536 migration test pins the canvas rule directly between the not-available refusal and the voice-note wait, so the new rule sits after the P1631 one.

CREATE OR REPLACE FUNCTION public.mirror_request_reply(p_message uuid)
 RETURNS TABLE(job_id uuid, state text, reply_message_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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

  -- P1536 (founder 2026-10-27: the mirror stays quiet in canvas threads): no job for any message in a thread rooted
  -- at a canvas draft, or for the root itself, whatever the draft's state (open, published or discarded). The canvas
  -- engine posts its own replies; in a published thread the client asks "Start a new version?". A job that already
  -- exists is still returned, as for a quiet share. Ordinary mirror threads are unchanged.
  -- Placed BEFORE P1576's transcript wait: a voice note in a canvas thread is quiet at once, never 'transcribing'
  -- (that state promises a Mirror reply once the transcript lands, and none will come here).
  IF EXISTS (SELECT 1 FROM public.canvas_drafts d
              WHERE d.thread_root_id = COALESCE(v_msg.thread_root_id, v_msg.id))
     AND NOT EXISTS (SELECT 1 FROM public.mirror_jobs j WHERE j.trigger_message_id = v_msg.id) THEN
    RETURN;
  END IF;

  -- P1576: a voice note is answered only once its transcript exists. No job until then; the client asks again.
  -- A transcript that is done but blank (a silent note) is treated as failed: nothing to answer.
  IF v_msg.audio_duration_ms IS NOT NULL
     AND (v_msg.transcript_status IS DISTINCT FROM 'done' OR btrim(COALESCE(v_msg.transcript, '')) = '') THEN
    RETURN QUERY SELECT NULL::uuid, CASE WHEN v_msg.transcript_status = 'pending'
                                         THEN 'transcribing' ELSE 'transcript_failed' END, NULL::uuid;
    RETURN;
  END IF;

  -- P1631: the same quiet rule for a Clarify-draft thread (its root, or any reply in it), keyed on the thread MARKER clarify_start writes, never on draft rows: deleting the last draft must not turn the generic reply on.
  -- Placed AFTER the transcript wait so the P1536 edit above (the canvas rule directly before that wait) stays one contiguous text, which
  -- p1536-draft-versions-migration.test.ts pins in the newest definition; a voice note here is answered 'transcribing' until its transcript lands,
  -- and the server-side voice path below is quiet at once.
  IF EXISTS (SELECT 1 FROM public.clarify_threads ct -- P1631
              WHERE ct.root_id = COALESCE(v_msg.thread_root_id, v_msg.id)) -- P1631
     AND NOT EXISTS (SELECT 1 FROM public.mirror_jobs j WHERE j.trigger_message_id = v_msg.id) THEN -- P1631
    RETURN; -- P1631
  END IF; -- P1631

  -- P1722: a transcribed line (a recording made in the Mirror posts its lines here) starts no Mirror reply: no job, as for a quiet share. A job that already exists is still returned.
  IF v_msg.is_transcription AND NOT EXISTS (SELECT 1 FROM public.mirror_jobs j WHERE j.trigger_message_id = v_msg.id) THEN
    RETURN;
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
