-- Migration: P1604 (10/10) — Clarify of a session thread carries the whole thread
-- Created: 2026-11-04
-- Spec: features/p1604_transcription_belongs_to_a_chat.md (founder report: Clarify on a transcript thread sent one message)
-- Guaranteed by: e2e/integration/p1604-clarify-session-thread.spec.ts
--
-- diffed against: 20261029180000_p1592_event_transcripts_round_threads.sql (clarify_chat_message: same signature, return type, grants
--   and body; ONE change: v_outside, which made a copy of any 'outside_rounds' thread carry a single message, no longer applies to a
--   thread whose root is registered in transcribe_session_threads. The 100-row newest-first limit and thread_total are unchanged:
--   the mirror's own item cap (20% of its token budget) is the limit that binds, and it says "showing the last N of M replies".)
--
-- client-safe: function body only.

CREATE OR REPLACE FUNCTION public.clarify_chat_message(p_source uuid, p_note text DEFAULT NULL)
RETURNS public.chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_src       public.chat_messages;
  v_since     timestamptz;
  v_src_kind  text;
  v_author    text;
  v_root      uuid;
  v_thread    jsonb;
  v_base      jsonb;
  v_orig_id   uuid;
  v_mirror    uuid;
  v_title     text;
  v_title_ref text;
  v_src_conv  public.chat_conversations;
  v_row       public.chat_messages;
  v_note      text;
  v_total     integer;
  v_outside   boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  -- The clarifier's own words on top of the copy: ONE message (quote + note), like a forward's note.
  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');
  IF v_note IS NOT NULL AND char_length(v_note) > 4000 THEN
    RAISE EXCEPTION 'chat: message too long' USING ERRCODE = '22023';
  END IF;
  -- FOR SHARE: see forward_chat_message (serialises with an in-flight erase).
  SELECT m.* INTO v_src FROM public.chat_messages m
   WHERE m.id = p_source
     AND m.created_at >= COALESCE(public._chat_access_since(m.conversation_id, v_uid), 'infinity'::timestamptz)
     FOR SHARE;
  IF NOT FOUND OR v_src.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501';
  END IF;
  v_since := public._chat_access_since(v_src.conversation_id, v_uid);
  v_mirror := public._chat_ensure_mirror(v_uid);

  v_root := COALESCE(v_src.thread_root_id, v_src.id);
  -- P1592: the before / conversation / after-round threads hold an event's worth of many speakers' lines. A copy of a line in
  -- one (or of its root) carries that message alone, never the thread: the same as a top-level unseated line before this change.
  -- P1604: a SESSION thread (a root registered in transcribe_session_threads, system_kind 'outside_rounds' as well) is one
  -- transcription session, and Clarify carries its whole thread from the root or from any line, like any other thread.
  SELECT (r.system_kind = 'outside_rounds'
          AND NOT EXISTS (SELECT 1 FROM public.transcribe_session_threads st WHERE st.root_message_id = r.id))
    INTO v_outside FROM public.chat_messages r WHERE r.id = v_root;
  v_outside := COALESCE(v_outside, false);
  -- P1546: a mirror thread can now hold mirror agent answers and private asks. Neither is ever copied (as
  -- _mirror_refuse_agent_copy refuses a direct copy): a copied answer would keep text derived from other
  -- people's words where erasure's derived_refs cannot find it.
  -- Lock the thread rows first (a separate statement, so the aggregate below reads a snapshot taken
  -- AFTER any erase that was holding them has committed).
  PERFORM 1 FROM public.chat_messages x
   WHERE NOT v_outside AND (x.id = v_root OR x.thread_root_id = v_root)
     AND x.id <> v_src.id
     AND x.conversation_id = v_src.conversation_id
     AND x.kind <> 'agent' AND x.context_conversation_id IS NULL
     AND x.created_at >= v_since
   ORDER BY x.created_at, x.id
   FOR SHARE;
  -- P1547: the NEWEST 100 entries (stored oldest first), and how many there were, so the mirror can say
  -- "showing the last N of M replies" truthfully.
  SELECT count(*) INTO v_total FROM public.chat_messages x
   WHERE NOT v_outside AND (x.id = v_root OR x.thread_root_id = v_root)
     AND x.id <> v_src.id
     AND x.conversation_id = v_src.conversation_id
     AND x.kind <> 'agent' AND x.context_conversation_id IS NULL
     AND x.deleted_at IS NULL
     AND x.created_at >= v_since;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'author_ref', public._chat_author_ref(t.author_id),
           'author_name', COALESCE(tp.name, 'Deleted user'),
           -- P1592: a copied round-thread root carries "Round {n}" without the names
           'body', CASE WHEN t.system_kind = 'round_thread' THEN public._transcribe_bare_root_title(t.id) ELSE t.body END,
           'created_at', t.created_at,
           'is_transcription', t.is_transcription,
           'system_kind', t.system_kind) ORDER BY t.created_at, t.id), '[]'::jsonb)
    INTO v_thread
    FROM (SELECT x.* FROM public.chat_messages x
           WHERE NOT v_outside AND (x.id = v_root OR x.thread_root_id = v_root)
             AND x.id <> v_src.id
             AND x.conversation_id = v_src.conversation_id
             AND x.kind <> 'agent' AND x.context_conversation_id IS NULL
             AND x.deleted_at IS NULL
             AND x.created_at >= v_since
           ORDER BY x.created_at DESC, x.id DESC
           LIMIT 100) t
    LEFT JOIN public.profiles tp ON tp.id = t.author_id;

  IF v_src.kind = 'message' THEN
    SELECT * INTO v_src_conv FROM public.chat_conversations c WHERE c.id = v_src.conversation_id;
    SELECT COALESCE(p.name, 'Deleted user') INTO v_author
      FROM (SELECT 1) one LEFT JOIN public.profiles p ON p.id = v_src.author_id;
    -- "Clarified from <author> in <title>": the title as the CLARIFIER sees the chat.
    IF v_src_conv.kind = 'dm' THEN
      SELECT COALESCE(p.name, 'Deleted user'),
             public._chat_author_ref(CASE WHEN v_src_conv.dm_user_a = v_uid THEN v_src_conv.dm_user_b ELSE v_src_conv.dm_user_a END)
        INTO v_title, v_title_ref
        FROM (SELECT 1) one
        LEFT JOIN public.profiles p
               ON p.id = CASE WHEN v_src_conv.dm_user_a = v_uid THEN v_src_conv.dm_user_b ELSE v_src_conv.dm_user_a END;
    ELSIF v_src_conv.kind = 'group' THEN
      SELECT o.name || ' · General' INTO v_title FROM public.organization o WHERE o.id = v_src_conv.org_id;
    ELSIF v_src_conv.kind = 'event' THEN
      SELECT e.title INTO v_title FROM public.events e WHERE e.id = v_src_conv.event_id;
    ELSE
      v_title := COALESCE(v_src_conv.title, 'Mirror');
    END IF;
    v_base := jsonb_build_object(
      'author_name', v_author,
      'body', CASE WHEN v_src.system_kind = 'round_thread' THEN public._transcribe_bare_root_title(v_src.id) ELSE v_src.body END,
      'created_at', v_src.created_at,
      'is_transcription', v_src.is_transcription,
      'system_kind', v_src.system_kind,
      'conversation_kind', v_src_conv.kind,
      'conversation_title', v_title);
    -- the other person's opaque ref, so erasing THEM can blank their name out of this title
    IF v_title_ref IS NOT NULL THEN
      v_base := v_base || jsonb_build_object('conversation_title_ref', v_title_ref);
    END IF;
    v_orig_id := v_src.author_id;
  ELSE
    v_base := v_src.forward_snapshot - 'thread';
    v_orig_id := v_src.forward_author_id;
  END IF;

  INSERT INTO public.chat_messages
    (conversation_id, author_id, body, kind, forward_snapshot, forward_author_id,
     forwarded_from_message_id, attachment_kind, attachment_id, created_at)
  VALUES
    (v_mirror, v_uid, v_note, 'clarify', v_base || jsonb_build_object('thread', v_thread, 'thread_total', v_total), v_orig_id,
     v_src.id, v_src.attachment_kind, v_src.attachment_id, clock_timestamp())
  RETURNING * INTO v_row;

  UPDATE public.chat_conversations c SET last_message_at = v_row.created_at WHERE c.id = v_mirror;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_chat_message(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_chat_message(uuid, text) TO authenticated;
