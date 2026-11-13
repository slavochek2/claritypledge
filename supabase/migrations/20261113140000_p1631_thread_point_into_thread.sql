-- client-safe: clarify_publish keeps its signature, return shape, SECURITY DEFINER, search_path and grants. Behaviour: a point made about a whole thread (Clarify scope 'thread') now publishes into that thread, as a card under its first message, instead of into the main chat
-- Migration: P1631 a point about a thread publishes into that thread (spec Open Question 8)
-- Created: 2026-11-13
-- Spec: features/p1631_mirror_drafts_reviewable_point_set.md
-- Guaranteed by: src/tests/p1631-thread-into-thread-migration.test.ts (source contract), src/tests/integration/p1631-thread-into-thread.test.ts
--
-- Earlier P1631 migrations are applied and are not edited. clarify_publish is the newest body (20261112170000_p1631_publish_fixes.sql) copied byte for byte, then marked lines (`-- P1631 into thread`).
--
-- diffed against:
--   clarify_publish(uuid, uuid)   20261112170000_p1631_publish_fixes.sql (its newest definition)
--
-- Until now the publish target was the thread root only when the pressed message was a REPLY. A press on a thread's first message with Clarify scope 'thread' (clarify_threads.scope) is a point about the
-- whole thread, so it goes into that thread: when the scope is 'thread' and no thread was found by the reply path, the thread root is the pressed message itself, under the conditions the reply path checks
-- for a root: in the source conversation, not deleted, top-level, and not older than the caller's access to the chat. Any other scope ('message', 'chat') is unchanged; a root deleted before publishing
-- sends the card to the main chat, as a deleted reply does.

BEGIN;

CREATE OR REPLACE FUNCTION public.clarify_publish(p_draft uuid, p_client_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_d      public.clarify_drafts;
  v_p      public.points;
  v_kind   text;
  v_thread uuid;
  v_live   public.chat_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1631:clarify:' || v_uid::text, 0));
  SELECT d.* INTO v_d FROM public.clarify_drafts d WHERE d.id = p_draft AND d.owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'clarify: draft not available' USING ERRCODE = '42501';
  END IF;
  IF v_d.state <> 'done' OR v_d.point_id IS NULL THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'no_point');
  END IF;
  SELECT p.* INTO v_p FROM public.points p
   WHERE p.id = v_d.point_id AND p.first_validator_id = v_uid AND p.visibility = 'private'::public.content_visibility FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'no_point');
  END IF;
  IF EXISTS (SELECT 1 FROM public.clarify_drafts r
              WHERE r.owner_id = v_uid AND r.refine_target_id = v_d.id AND r.state = 'done' AND r.point_id IS NOT NULL) THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'earlier_version');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.point_positions pp WHERE pp.point_id = v_p.id AND pp.user_id = v_uid) THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'no_position');
  END IF;
  SELECT c.kind INTO v_kind FROM public.chat_conversations c WHERE c.id = v_d.source_conversation_id;
  IF NOT FOUND OR v_kind = 'mirror' THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'needs_target');
  END IF;
  -- a reply in a thread publishes into that thread, while the thread root is still there and readable; anything else goes to the main chat
  SELECT r.id INTO v_thread
    FROM public.chat_messages s
    JOIN public.chat_messages r ON r.id = s.thread_root_id
   WHERE s.id = v_d.source_message_id AND r.conversation_id = v_d.source_conversation_id AND r.deleted_at IS NULL
     AND s.deleted_at IS NULL -- P1631 publish fixes: a deleted reply goes to the main chat
     AND r.thread_root_id IS NULL
     AND r.created_at >= COALESCE(public._chat_access_since(r.conversation_id, v_uid), 'infinity'::timestamptz);
  IF v_thread IS NULL AND COALESCE((SELECT t.scope FROM public.clarify_threads t WHERE t.root_id = v_d.thread_root_id), 'message') = 'thread' THEN -- P1631 into thread: a point about the whole thread
    SELECT s.id INTO v_thread FROM public.chat_messages s -- P1631 into thread: the pressed first message is the thread root
     WHERE s.id = v_d.source_message_id AND s.conversation_id = v_d.source_conversation_id AND s.deleted_at IS NULL -- P1631 into thread
       AND s.thread_root_id IS NULL -- P1631 into thread
       AND s.created_at >= COALESCE(public._chat_access_since(s.conversation_id, v_uid), 'infinity'::timestamptz); -- P1631 into thread
  END IF; -- P1631 into thread
  SELECT m.* INTO v_live
    FROM public.point_chat_shares s JOIN public.chat_messages m ON m.id = s.message_id
   WHERE s.point_id = v_p.id AND s.conversation_id = v_d.source_conversation_id
     AND m.deleted_at IS NULL AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id
   ORDER BY s.created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'already', 'message_id', v_live.id, 'conversation_id', v_live.conversation_id, 'thread_root_id', v_live.thread_root_id);
  END IF;
  RETURN public._point_chat_publish(v_p.id, v_d.source_conversation_id, v_thread, p_client_id, v_d.id);
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_publish(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_publish(uuid, uuid) TO authenticated;

COMMIT;
