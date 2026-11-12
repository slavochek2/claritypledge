-- Migration: P1631 A9, Publish to chat: fixes from the hostile review
-- client-safe: the revoked functions are new in 20261112150000 and point_share_to_chat has no client caller; no client writes point_position_history (grep in the header below); the story_points policy refuses only links to a chat-published point by someone who cannot read it
--
-- 20261112150000_p1631_publish_to_chat.sql is already applied and is not edited; every change is here. Each replaced function is the newest body copied byte for byte,
-- then the marked lines added (`-- P1631 publish fixes`).
--
-- diffed against:
--   _point_chat_publish      20261112150000_p1631_publish_to_chat.sql
--   clarify_publish          20261112150000_p1631_publish_to_chat.sql
--   point_share_to_chat      20261112150000_p1631_publish_to_chat.sql
--   _point_position_write_ok 20261112150000_p1631_publish_to_chat.sql
--
-- 1. point_share_to_chat is no longer callable by clients (REVOKE ... FROM authenticated; the function stays). RE-SHARE IS OFF until the founder decides how positions behave
--    across chats: positions belong to the point, not to the share, so a re-share would show a DM partner's position (and reasoning) to the new chat's members. The body also
--    gets the point row lock (FOR UPDATE) and the live-share 'already' check that clarify_publish has, so it is safe when it is switched on again.
-- 2. _point_chat_publish: send_chat_message answers a replayed client id with the EARLIER row, whatever it was. The message it returns must be in p_conv, carry this very point,
--    and be the caller's, else the answer is refused 'client_id_reused' and no share row is written.
-- 3. clarify_publish: a reply goes into its thread only while the SOURCE message is also live; a deleted reply goes to the main chat.
-- 4. _point_position_write_ok is a CASE, so chat_shared_point_ids() (a per-statement scan of the caller's chats) runs only for a point that has a share row and a caller who is
--    not its owner.
-- 5. story_points: a RESTRICTIVE INSERT policy. enforce_story_point_visibility_constraint is SECURITY INVOKER (20260325120000 step 8) and reads `points` under the caller's RLS,
--    so for a person who cannot read a chat-shared private point it sees NULL and lets the link through; the point's id then appears on Details as a "positionless story" for every
--    member. The policy runs the same test as the position writes (_point_position_write_ok: never published, or the owner, or a reader of the live card). Points that were never
--    published, and every other insert, are untouched. Not changed here: an owner or reader may still link a PRIVATE story of their own (the details page and the card hide the
--    control for a chat-published point; the database does not refuse the owner).
-- 6. point_position_history: grep of src/, supabase/functions/ and api/ finds one reader (points-service-real.ts getPositionHistory, SELECT) and NO insert, update or delete. The
--    only writer is the trigger function log_position_change (20260911110000), SECURITY DEFINER, and the erase function (erase_my_account, SECURITY DEFINER), which both run as the
--    table owner. So INSERT, UPDATE, DELETE and TRUNCATE are revoked from anon and authenticated (and PUBLIC): a client can no longer forge history on a shared point. SELECT stays.
--    The old INSERT policy "Allow trigger to insert position history" (auth.uid() = user_id) is left in place; with no grant it admits nothing.
-- 8. point_chat_shared(p_point): true only when the caller can read the point (its owner, or a reader of a live card) and a live card exists. The details page asks it to hide
--    Share and Add a story for a chat-published point.

BEGIN;

-- 1, 2. publishing ----------------------------------------------------------------------------------------------------------------------

-- Internal: post the card (as the caller, through send_chat_message, so every posting rule applies) and record the share. Not callable by clients.
CREATE OR REPLACE FUNCTION public._point_chat_publish(p_point uuid, p_conv uuid, p_thread uuid, p_client uuid, p_draft uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_msg public.chat_messages;
BEGIN
  BEGIN
    v_msg := public.send_chat_message(p_conv, NULL, NULL, p_thread, 'point', p_point, p_client);
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'not_available');
  END;
  -- P1631 publish fixes: a replayed client id hands back an earlier message; it must be this card (same chat, this point, the caller's) or nothing is recorded
  IF v_msg.conversation_id IS DISTINCT FROM p_conv OR v_msg.attachment_kind IS DISTINCT FROM 'point' -- P1631 publish fixes
     OR v_msg.attachment_id IS DISTINCT FROM p_point OR v_msg.author_id IS DISTINCT FROM v_uid THEN -- P1631 publish fixes
    RETURN jsonb_build_object('status', 'refused', 'code', 'client_id_reused'); -- P1631 publish fixes
  END IF; -- P1631 publish fixes
  INSERT INTO public.point_chat_shares (message_id, point_id, conversation_id, shared_by, draft_id)
  VALUES (v_msg.id, p_point, p_conv, v_uid, p_draft)
  ON CONFLICT (message_id) DO NOTHING;
  RETURN jsonb_build_object('status', 'published', 'message_id', v_msg.id, 'conversation_id', p_conv, 'thread_root_id', v_msg.thread_root_id);
END;
$$;
REVOKE ALL ON FUNCTION public._point_chat_publish(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 3. Publish a Clarify card's point into the chat it came from (the thread, if the pressed message was a reply in one).
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

-- 1. The author posts (or re-posts) one of their own Clarify points into a chat they choose. OFF for clients (see the header); kept, locked and checked like clarify_publish.
CREATE OR REPLACE FUNCTION public.point_share_to_chat(p_point uuid, p_conversation uuid, p_thread_root uuid DEFAULT NULL, p_client_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_draft uuid;
  v_live  public.chat_messages; -- P1631 publish fixes
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1631:clarify:' || v_uid::text, 0));
  SELECT d.id INTO v_draft FROM public.clarify_drafts d
    JOIN public.points p ON p.id = d.point_id
   WHERE d.owner_id = v_uid AND d.point_id = p_point AND d.state = 'done'
     AND p.first_validator_id = v_uid AND p.visibility = 'private'::public.content_visibility
   ORDER BY d.created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'clarify: point not available' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.points p WHERE p.id = p_point FOR UPDATE; -- P1631 publish fixes: the point row lock, as clarify_publish takes it
  IF NOT EXISTS (SELECT 1 FROM public.point_positions pp WHERE pp.point_id = p_point AND pp.user_id = v_uid) THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'no_position');
  END IF;
  SELECT m.* INTO v_live -- P1631 publish fixes: a live card of this point in that chat answers 'already'
    FROM public.point_chat_shares s JOIN public.chat_messages m ON m.id = s.message_id -- P1631 publish fixes
   WHERE s.point_id = p_point AND s.conversation_id = p_conversation -- P1631 publish fixes
     AND m.deleted_at IS NULL AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id -- P1631 publish fixes
   ORDER BY s.created_at DESC LIMIT 1; -- P1631 publish fixes
  IF FOUND THEN -- P1631 publish fixes
    RETURN jsonb_build_object('status', 'already', 'message_id', v_live.id, 'conversation_id', v_live.conversation_id, 'thread_root_id', v_live.thread_root_id); -- P1631 publish fixes
  END IF; -- P1631 publish fixes
  RETURN public._point_chat_publish(p_point, p_conversation, p_thread_root, p_client_id, v_draft);
END;
$$;
REVOKE ALL ON FUNCTION public.point_share_to_chat(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated; -- P1631 publish fixes: re-share is off until the founder decides how positions behave across chats

-- 4. position writes: the cheap tests first ------------------------------------------------------------------------------------------------

-- True for every point that was never published, for its author, and for the people the point is shared with. The policy expression runs as the caller, so it needs the grant.
CREATE OR REPLACE FUNCTION public._point_position_write_ok(p_point uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE -- P1631 publish fixes: chat_shared_point_ids() runs only for a published point and a caller who is not its owner
    WHEN NOT EXISTS (SELECT 1 FROM public.point_chat_shares s WHERE s.point_id = p_point) THEN true -- P1631 publish fixes
    WHEN EXISTS (SELECT 1 FROM public.points p WHERE p.id = p_point AND p.first_validator_id = auth.uid()) THEN true -- P1631 publish fixes
    ELSE p_point IN (SELECT x.point_id FROM public.chat_shared_point_ids() x) -- P1631 publish fixes
  END; -- P1631 publish fixes
$$;
REVOKE ALL ON FUNCTION public._point_position_write_ok(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._point_position_write_ok(uuid) TO authenticated;

-- 5. story_points: no link to a chat-shared private point from a person who cannot read it ----------------------------------------------------

DROP POLICY IF EXISTS story_points_insert_chat_shared ON public.story_points;
CREATE POLICY story_points_insert_chat_shared ON public.story_points AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public._point_position_write_ok(point_id));

-- 6. point_position_history: only the definer trigger and the erase function write it -----------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.point_position_history FROM PUBLIC, anon, authenticated;

-- 8. is this point a chat-published one, for a caller who can read it? ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.point_chat_shared(p_point uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public._point_has_live_share(p_point)
     AND (EXISTS (SELECT 1 FROM public.points p WHERE p.id = p_point AND p.first_validator_id = auth.uid())
          OR p_point IN (SELECT x.point_id FROM public.chat_shared_point_ids() x));
$$;
REVOKE ALL ON FUNCTION public.point_chat_shared(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.point_chat_shared(uuid) TO authenticated;

COMMIT;
