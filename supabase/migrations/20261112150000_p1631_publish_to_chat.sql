-- Migration: P1631 A9, Publish to chat
-- client-safe: every REVOKE is on a table or function this file creates; the new read policies only add rows for signed-in readers; forward_chat_message now refuses a private point, which no client offers to forward
--
-- A private Clarify point can be published into the chat it came from. The point stays private (visibility 'private', no tags, no link); a published card is an ordinary
-- chat message (attachment_kind 'point') and the point is readable by exactly the people who can read that card.
--
-- Design (a per-point share record, no canvas):
--   * point_chat_shares: a closed table (no grants, no policies, like clarify_threads). One row per published card. A row survives the card's deletion and means "was published once".
--   * chat_shared_point_ids(): the points the caller can read through a live card, by the chat's own history rule (chat_my_access, created_at >= since). _chat_point_readable is
--     the internal twin for any uid (via _chat_access_since).
--   * Reads: three new permissive SELECT policies TO authenticated (points, point_positions, point_position_history). The existing policies are untouched (they serve anon readers too).
--   * Position writes: two RESTRICTIVE policies on point_positions, active ONLY for points that have a share row. Everywhere else (letters upsert on private letter points) nothing changes.
--   * RPCs: clarify_publish (from a Clarify card), point_share_to_chat (the author re-shares, or posts from the Mirror), list_chat_points, and the internal _point_chat_publish.
--   * Existing functions changed (every line marked `-- P1631 publish`): clarify_draft_edit, clarify_draft_delete, _clarify_draft_drop_point, get_clarify_thread, forward_chat_message,
--     erase_chat_data_for.
--
-- The four founder decisions this encodes:
--   1. Access follows the chat's own history rule (_chat_access_since): leaving or removal ends it at once; a later joiner sees nothing (the author may re-share).
--   2. Published wording is frozen: an edit is refused once a share row exists (live or not); a draft delete is refused while the card is live.
--   3. A point published from a thread reply goes into that thread; otherwise into the main chat.
--   4. Only people it is shared with can set a position (restrictive policies, shared points only; letters untouched).
-- No link anywhere. A forward of a private point is refused for everyone; the author re-shares with point_share_to_chat.
--
-- diffed against: the newest body of each replaced function, listed below (copied byte for byte, then the marked lines added):
--   clarify_draft_edit          20261111160000_p1631_refine_as_new_card.sql
--   clarify_draft_delete        20261110153000_p1631_clarify_drafts.sql
--   _clarify_draft_drop_point   20261110153000_p1631_clarify_drafts.sql
--   get_clarify_thread          20261111160000_p1631_refine_as_new_card.sql
--   forward_chat_message        20261030090000_p1536_p1592_merge_erase_forward.sql
--   erase_chat_data_for         20261110160000_p1631_erase_cleanup_in_erase_fn.sql

BEGIN;

-- 1. the closed table -------------------------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.point_chat_shares (
  message_id      uuid PRIMARY KEY REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  point_id        uuid NOT NULL REFERENCES public.points(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  shared_by       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  draft_id        uuid REFERENCES public.clarify_drafts(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS point_chat_shares_conv ON public.point_chat_shares (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS point_chat_shares_point ON public.point_chat_shares (point_id);
ALTER TABLE public.point_chat_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.point_chat_shares FROM PUBLIC, anon, authenticated;

-- 2. who can read what ------------------------------------------------------------------------------------------------------------------

-- The points the caller reads through a live card in a chat they can read, by the chat's own history rule. One set per statement, like chat_my_access().
CREATE OR REPLACE FUNCTION public.chat_shared_point_ids()
RETURNS TABLE (point_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
ROWS 20
AS $$
  SELECT s.point_id FROM public.chat_my_access() a
    JOIN public.point_chat_shares s ON s.conversation_id = a.conversation_id
    JOIN public.chat_messages m ON m.id = s.message_id
   WHERE m.deleted_at IS NULL AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id
     AND m.created_at >= a.since;
$$;
REVOKE ALL ON FUNCTION public.chat_shared_point_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_shared_point_ids() TO authenticated;

-- Internal twin: may p_uid read p_point through a live card? Takes any uid, so no client grant.
CREATE OR REPLACE FUNCTION public._chat_point_readable(p_point uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.point_chat_shares s
      JOIN public.chat_messages m ON m.id = s.message_id
     WHERE s.point_id = p_point
       AND m.deleted_at IS NULL AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id
       AND m.created_at >= COALESCE(public._chat_access_since(s.conversation_id, p_uid), 'infinity'::timestamptz));
$$;
REVOKE ALL ON FUNCTION public._chat_point_readable(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Is any card of this point still live (not deleted)? Internal.
CREATE OR REPLACE FUNCTION public._point_has_live_share(p_point uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.point_chat_shares s
      JOIN public.chat_messages m ON m.id = s.message_id
     WHERE s.point_id = p_point AND m.deleted_at IS NULL AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id);
$$;
REVOKE ALL ON FUNCTION public._point_has_live_share(uuid) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS points_select_chat_shared ON public.points;
CREATE POLICY points_select_chat_shared ON public.points FOR SELECT TO authenticated
  USING (visibility = 'private' AND id IN (SELECT s.point_id FROM public.chat_shared_point_ids() s));
DROP POLICY IF EXISTS point_positions_select_chat_shared ON public.point_positions;
CREATE POLICY point_positions_select_chat_shared ON public.point_positions FOR SELECT TO authenticated
  USING (point_id IN (SELECT s.point_id FROM public.chat_shared_point_ids() s));
DROP POLICY IF EXISTS point_position_history_select_chat_shared ON public.point_position_history;
CREATE POLICY point_position_history_select_chat_shared ON public.point_position_history FOR SELECT TO authenticated
  USING (point_id IN (SELECT s.point_id FROM public.chat_shared_point_ids() s));

-- 3. position writes: only people it is shared with, for shared points only -----------------------------------------------------------------

-- True for every point that was never published, for its author, and for the people the point is shared with. The policy expression runs as the caller, so it needs the grant.
CREATE OR REPLACE FUNCTION public._point_position_write_ok(p_point uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.point_chat_shares s WHERE s.point_id = p_point)
      OR EXISTS (SELECT 1 FROM public.points p WHERE p.id = p_point AND p.first_validator_id = auth.uid())
      OR p_point IN (SELECT x.point_id FROM public.chat_shared_point_ids() x);
$$;
REVOKE ALL ON FUNCTION public._point_position_write_ok(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._point_position_write_ok(uuid) TO authenticated;

DROP POLICY IF EXISTS point_positions_insert_chat_shared ON public.point_positions;
CREATE POLICY point_positions_insert_chat_shared ON public.point_positions AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public._point_position_write_ok(point_id));
DROP POLICY IF EXISTS point_positions_update_chat_shared ON public.point_positions;
CREATE POLICY point_positions_update_chat_shared ON public.point_positions AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public._point_position_write_ok(point_id)) WITH CHECK (public._point_position_write_ok(point_id));

-- 4. publishing -------------------------------------------------------------------------------------------------------------------------

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
  INSERT INTO public.point_chat_shares (message_id, point_id, conversation_id, shared_by, draft_id)
  VALUES (v_msg.id, p_point, p_conv, v_uid, p_draft)
  ON CONFLICT (message_id) DO NOTHING;
  RETURN jsonb_build_object('status', 'published', 'message_id', v_msg.id, 'conversation_id', p_conv, 'thread_root_id', v_msg.thread_root_id);
END;
$$;
REVOKE ALL ON FUNCTION public._point_chat_publish(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Publish a Clarify card's point into the chat it came from (the thread, if the pressed message was a reply in one).
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

-- The author posts (or re-posts) one of their own Clarify points into a chat they choose: the forward of a private point, and the Mirror's "which chat".
CREATE OR REPLACE FUNCTION public.point_share_to_chat(p_point uuid, p_conversation uuid, p_thread_root uuid DEFAULT NULL, p_client_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_draft uuid;
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
  IF NOT EXISTS (SELECT 1 FROM public.point_positions pp WHERE pp.point_id = p_point AND pp.user_id = v_uid) THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'no_position');
  END IF;
  RETURN public._point_chat_publish(p_point, p_conversation, p_thread_root, p_client_id, v_draft);
END;
$$;
REVOKE ALL ON FUNCTION public.point_share_to_chat(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.point_share_to_chat(uuid, uuid, uuid, uuid) TO authenticated;

-- The points published in one chat, as the caller may read them (live cards after the caller's history start). A non-member gets [].
CREATE OR REPLACE FUNCTION public.list_chat_points(p_conversation uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('point_id', s.point_id, 'message_id', s.message_id, 'shared_by', s.shared_by, 'created_at', s.created_at) ORDER BY s.created_at, s.message_id)
      FROM public.chat_my_access() a
      JOIN public.point_chat_shares s ON s.conversation_id = a.conversation_id
      JOIN public.chat_messages m ON m.id = s.message_id
     WHERE a.conversation_id = p_conversation
       AND m.deleted_at IS NULL AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id
       AND m.created_at >= a.since), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.list_chat_points(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_chat_points(uuid) TO authenticated;

-- 5. changes to existing functions ------------------------------------------------------------------------------------------------------

-- A draft's point goes with the draft (delete, the Mirror's deletion, the account's deletion), unless someone other than the owner has a position on it.
CREATE OR REPLACE FUNCTION public._clarify_draft_drop_point()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.point_id IS NOT NULL THEN
    DELETE FROM public.points p
     WHERE p.id = OLD.point_id
       AND p.visibility = 'private'::public.content_visibility
       AND NOT public._point_has_live_share(p.id) -- P1631 publish: a point whose card is live stays
       AND NOT EXISTS (SELECT 1 FROM public.point_positions pp WHERE pp.point_id = p.id AND pp.user_id IS DISTINCT FROM OLD.owner_id);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._clarify_draft_drop_point() FROM PUBLIC, anon, authenticated;

-- Delete a draft (the client confirms first). Refused while it is being made. Its point goes with it unless someone else has a position on it.
CREATE OR REPLACE FUNCTION public.clarify_draft_delete(p_draft uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_d   public.clarify_drafts;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM public._clarify_sweep(v_uid);
  SELECT d.* INTO v_d FROM public.clarify_drafts d WHERE d.id = p_draft AND d.owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'clarify: draft not available' USING ERRCODE = '42501';
  END IF;
  IF v_d.state IN ('queued', 'running') THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'busy');
  END IF;
  IF v_d.point_id IS NOT NULL AND public._point_has_live_share(v_d.point_id) THEN -- P1631 publish
    RETURN jsonb_build_object('status', 'refused', 'code', 'published'); -- P1631 publish
  END IF; -- P1631 publish
  DELETE FROM public.clarify_drafts d WHERE d.id = v_d.id;
  RETURN jsonb_build_object('status', 'ok', 'point_kept', EXISTS (SELECT 1 FROM public.points p WHERE p.id = v_d.point_id));
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_draft_delete(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_draft_delete(uuid) TO authenticated;

-- The owner edits the text of a draft point. A point is fixed once someone else has a position on it. An unchanged text writes nothing.
CREATE OR REPLACE FUNCTION public.clarify_draft_edit(p_draft uuid, p_statement text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_d    public.clarify_drafts;
  v_p    public.points;
  v_stmt text := btrim(COALESCE(p_statement, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT d.* INTO v_d FROM public.clarify_drafts d WHERE d.id = p_draft AND d.owner_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'clarify: draft not available' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_stmt) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'clarify: bad statement' USING ERRCODE = '22023';
  END IF;
  IF v_d.state <> 'done' OR v_d.point_id IS NULL THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'no_point');
  END IF;
  SELECT p.* INTO v_p FROM public.points p WHERE p.id = v_d.point_id AND p.first_validator_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'no_point');
  END IF;
  IF EXISTS (SELECT 1 FROM public.point_chat_shares s WHERE s.point_id = v_p.id) THEN -- P1631 publish: published wording is frozen, even after the card is deleted
    RETURN jsonb_build_object('status', 'refused', 'code', 'published'); -- P1631 publish
  END IF; -- P1631 publish
  IF EXISTS (SELECT 1 FROM public.point_positions pp WHERE pp.point_id = v_p.id AND pp.user_id <> v_uid) THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'fixed');
  END IF;
  IF v_stmt = btrim(v_p.statement) THEN
    RETURN jsonb_build_object('status', 'ok', 'changed', false, 'point_id', v_p.id);
  END IF;
  UPDATE public.points p SET statement = v_stmt WHERE p.id = v_p.id;
  DELETE FROM public.point_positions pp WHERE pp.point_id = v_p.id AND pp.user_id = v_uid; -- P1631 r5: new words, so the owner's earlier position on the old words no longer stands
  RETURN jsonb_build_object('status', 'ok', 'changed', true, 'point_id', v_p.id);
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_draft_edit(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_draft_edit(uuid, text) TO authenticated;

-- One Clarify thread as its owner sees it: the drafts oldest first. Cited lines are read from chat_messages by id, now, with no author names, and only rows the
-- owner can still read; quote text never comes from the model. A run past 5 minutes reads as failed `abandoned` (the sweep writes it at the next press or retry).
CREATE OR REPLACE FUNCTION public.get_clarify_thread(p_thread_root uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'thread_root_id', p_thread_root,
    'drafts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id,
        'state', CASE WHEN (d.state = 'running' AND d.started_at < now() - interval '5 minutes')
                        OR (d.state = 'queued' AND d.updated_at < now() - interval '5 minutes') THEN 'failed' ELSE d.state END,
        'error_code', CASE WHEN (d.state = 'running' AND d.started_at < now() - interval '5 minutes')
                        OR (d.state = 'queued' AND d.updated_at < now() - interval '5 minutes') THEN 'abandoned' ELSE d.error_code END,
        'instruction', d.instruction,
        'created_at', d.created_at,
        'refine_target_id', d.refine_target_id, -- P1631 r5: the card this card replaced, when it did
        'source_kind', (SELECT c.kind FROM public.chat_conversations c WHERE c.id = d.source_conversation_id), -- P1631 publish: a Mirror-sourced card has no chat to publish into
        'published', COALESCE((SELECT jsonb_agg(jsonb_build_object('conversation_id', s.conversation_id, 'message_id', s.message_id) ORDER BY s.created_at) -- P1631 publish
                                 FROM public.point_chat_shares s JOIN public.chat_messages m ON m.id = s.message_id -- P1631 publish
                                WHERE s.point_id = p.id AND m.deleted_at IS NULL AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id), '[]'::jsonb), -- P1631 publish
        'point', CASE WHEN p.id IS NOT NULL THEN jsonb_build_object(
                   'id', p.id, 'statement', p.statement,
                   'owner_position', (SELECT pp.position::text FROM public.point_positions pp WHERE pp.point_id = p.id AND pp.user_id = v_uid)) END,
        'suggestions', d.suggestions,
        'cited', CASE WHEN d.cited IS NULL THEN NULL ELSE jsonb_build_object(
          'a', public._clarify_cited_rows(d.cited -> 'a', v_uid),
          'b', public._clarify_cited_rows(d.cited -> 'b', v_uid)) END
      ) ORDER BY d.created_at, d.id)
      FROM public.clarify_drafts d
      LEFT JOIN public.points p ON p.id = d.point_id AND p.first_validator_id = v_uid
     WHERE d.thread_root_id = p_thread_root AND d.owner_id = v_uid), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.get_clarify_thread(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_clarify_thread(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.forward_chat_message(
  p_source              uuid,
  p_target_conversation uuid,
  p_note                text DEFAULT NULL,
  p_client_id           uuid DEFAULT NULL
)
RETURNS public.chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_src       public.chat_messages;
  v_author    text;
  v_note      text;
  v_snapshot  jsonb;
  v_orig_id   uuid;
  v_since     timestamptz;
  v_row       public.chat_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM public._chat_assert_can_post(p_target_conversation, v_uid);
  v_since := public._chat_access_since(p_target_conversation, v_uid);

  -- Idempotent retry (see send_chat_message): same author + client id returns the earlier forward.
  -- This runs BEFORE the source checks on purpose: a retry whose source was deleted (or erased) in
  -- the meantime must hand back the forward that was already stored, not "message not available".
  -- Permission to post in the target was just checked, and the stored row must still be visible.
  IF p_client_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = v_uid AND m.client_id = p_client_id;
    IF FOUND THEN
      IF v_row.conversation_id <> p_target_conversation THEN
        RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023';
      END IF;
      IF v_row.created_at < v_since THEN
        RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
      END IF;
      RETURN v_row;
    END IF;
  END IF;

  -- The forwarder must be able to READ the source right now. FOR SHARE takes a row lock that
  -- conflicts with erase_chat_data_for's UPDATE of the same row: an in-flight erase finishes first
  -- (and the deleted_at test below then refuses), or this transaction commits first and the erase
  -- that was waiting scrubs the copy we are about to make.
  SELECT m.* INTO v_src FROM public.chat_messages m
   WHERE m.id = p_source
     AND m.created_at >= COALESCE(public._chat_access_since(m.conversation_id, v_uid), 'infinity'::timestamptz)
     FOR SHARE;
  IF NOT FOUND OR v_src.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501';
  END IF;

  -- P1536: a canvas version is attached only in its owner's own mirror; a forward would copy it into a chat other
  -- people read (the card would say "not available", and the id would still travel). Same error as send_chat_message.
  IF v_src.attachment_kind = 'canvas_version' THEN
    RAISE EXCEPTION 'chat: attachment not available' USING ERRCODE = '22023';
  END IF;

  -- P1631 publish: a private point is never forwarded, by anyone; its author re-shares with point_share_to_chat
  IF v_src.attachment_kind = 'point' AND EXISTS (SELECT 1 FROM public.points x WHERE x.id = v_src.attachment_id AND x.visibility = 'private') THEN -- P1631 publish
    RAISE EXCEPTION 'chat: attachment not available' USING ERRCODE = '22023'; -- P1631 publish
  END IF; -- P1631 publish

  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');
  IF char_length(v_note) > 4000 THEN
    RAISE EXCEPTION 'chat: message too long' USING ERRCODE = '22023';
  END IF;

  IF v_src.kind = 'message' THEN
    SELECT COALESCE(p.name, 'Deleted user') INTO v_author
      FROM (SELECT 1) one LEFT JOIN public.profiles p ON p.id = v_src.author_id;
    -- D5: a forward reveals nothing about the source chat. The snapshot is built from an explicit
    -- allowlist (author_name, body, created_at, is_transcription, system_kind), never by copying whatever a source snapshot holds.
    -- P1592: plus the two marks the reader needs to render the copy as it was (a transcription keeps its
    -- label; a system post keeps showing its title alone, never "Deleted user"). A copy of a round-thread
    -- root carries "Round {n}" WITHOUT the names: erasure cannot find a name inside a copied title.
    v_snapshot := jsonb_build_object(
      'author_name', v_author,
      'body', CASE WHEN v_src.system_kind = 'round_thread' THEN public._transcribe_bare_root_title(v_src.id) ELSE v_src.body END,
      'created_at', v_src.created_at,
      'is_transcription', v_src.is_transcription,
      'system_kind', v_src.system_kind);
    v_orig_id := v_src.author_id;
  ELSE
    -- forwarding a forward / clarify keeps pointing at the original author; the source chat's
    -- title, kind, refs and any thread are NOT carried (allowlist again)
    v_snapshot := public._chat_forward_snapshot(v_src.forward_snapshot);
    v_orig_id := v_src.forward_author_id;
  END IF;

  INSERT INTO public.chat_messages
    (conversation_id, author_id, body, kind, forward_snapshot, forward_author_id,
     forwarded_from_message_id, attachment_kind, attachment_id, client_id, created_at)
  VALUES
    (p_target_conversation, v_uid, v_note, 'forward', v_snapshot, v_orig_id,
     v_src.id, v_src.attachment_kind, v_src.attachment_id, p_client_id, clock_timestamp())
  ON CONFLICT (author_id, client_id) WHERE client_id IS NOT NULL DO NOTHING
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = v_uid AND m.client_id = p_client_id;
    IF v_row.conversation_id <> p_target_conversation THEN
      RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023';
    END IF;
    IF v_row.created_at < v_since THEN
      RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
    END IF;
    RETURN v_row;
  END IF;

  UPDATE public.chat_conversations c SET last_message_at = v_row.created_at WHERE c.id = p_target_conversation;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.forward_chat_message(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.forward_chat_message(uuid, uuid, text, uuid) TO authenticated;

-- Erasure of an author: the private points they published are deleted (first_validator_id is already nulled by erase_my_account, so the point cannot be found by owner).
-- The share rows go with the points (cascade). Called only from erase_chat_data_for. search_path is public, pg_temp: the triggers on points read `points` unqualified.
CREATE OR REPLACE FUNCTION public._point_chat_erase_author(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.points p
   WHERE p.visibility = 'private'::public.content_visibility
     AND p.id IN (SELECT s.point_id FROM public.point_chat_shares s WHERE s.shared_by = p_uid);
END;
$$;
REVOKE ALL ON FUNCTION public._point_chat_erase_author(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.erase_chat_data_for(p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_out jsonb := '{}'::jsonb;
  v_ref text := public._chat_author_ref(p_uid);
  n     integer;
  pass  integer;
  v_threads uuid[];
  v_th      public.chat_round_threads;
  v_key     record;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'erase_chat_data_for: no subject' USING ERRCODE = '22023';
  END IF;

  -- (P1536 + P1592 merged) ONE erasure at a time: this global lock is the very first lock, before the erasing marker. Erasures are
  -- rare. See the header of this file for why this makes the growth of the owner set between the two helper calls safe.
  PERFORM pg_advisory_xact_lock(hashtextextended('p1536:erasure', 0));

  -- 0. (P1592) LOCKS FIRST, before any message row is touched. Order: the ERASING MARKER (exclusive, see
  -- _transcribe_thread_roster_locked: posters and the seating trigger only try it shared and never wait, and
  -- a holder of the shared side is waited for HERE, before any thread lock is held), then speaker, thread,
  -- place, message rows. The speaker lock keeps the poster from committing this person's words after step 2
  -- scrubbed them. Then the thread lock of EVERY (round, table) this person is a member of or is seated at, whether or not a
  -- thread exists yet, taken in (round, table) order (host_set_round_seats seats in the same order). Only THEN
  -- are the threads collected, so a poster that holds a table's lock commits first and its thread is found
  -- here, and a poster that comes later waits and reads a roster without this person: the member list rows
  -- are deleted in step 7 and the seat is tombstoned (profile_id NULL, which the roster skips) in the same
  -- transaction, before any lock is released.
  -- The seat lookup joins event_room_members on profile_id, so erase_my_account must call this BEFORE it
  -- tombstones those rows (it does: redefined below). Locks are held to the end of the transaction, which
  -- includes the profile delete.
  PERFORM pg_advisory_xact_lock(hashtextextended('p1592:erasing:' || p_uid::text, 0));   -- exclusive marker, first
  -- (P1536 + P1592 merged) Lock order, outermost first: P1592's erasing marker (waits for the posters and the seating trigger that
  -- hold its shared side, while this transaction holds nothing), then the engine's owner locks (next block), then P1592's speaker
  -- and thread locks (step 0), then the p1520 context lock (step 6), then the draft rows. See the header of this file.
  -- The engine's per-owner advisory locks come FIRST, before any row is touched: the erased user's own, and those of every
  -- owner of a draft whose runs read their words, as ONE set taken in owner order. Every engine function takes its owner's
  -- lock before anything else, so an engine transaction in flight (it may hold a conversation or draft row) finishes first,
  -- and two concurrent erasures take the locks in the same global order and cannot cross. Waiting here cannot form a cycle:
  -- the engine only TRIES the p1520 lock (shared) and never waits for it. (An owner who becomes affected only between this
  -- read and the p1520 lock below is the one case not covered: its draft rows are still locked in step 6.)
  -- The step is the helper _erase_lock_canvas_owners (defined above); erase_my_account takes the same locks before its first
  -- mutation, so this call is a re-entrant no-op there (it only adds an owner that became affected in between).
  PERFORM public._erase_lock_canvas_owners(p_uid);

  PERFORM pg_advisory_xact_lock(hashtextextended('p1592:speaker:' || p_uid::text, 0));
  FOR v_key IN
    SELECT k.round_id, k.table_no FROM (
      SELECT t.round_id, t.table_no FROM public.chat_round_threads t
        JOIN public.chat_round_thread_members tm ON tm.thread_id = t.id WHERE tm.profile_id = p_uid
      UNION
      SELECT s.round_id, s.table_no FROM public.event_round_seats s
        JOIN public.event_room_members rm ON rm.id = s.room_member_id WHERE rm.profile_id = p_uid
    ) k ORDER BY k.round_id, k.table_no
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('p1592:thread:' || v_key.round_id::text || ':' || v_key.table_no::text, 0));
  END LOOP;
  SELECT COALESCE(array_agg(x.id ORDER BY x.round_id, x.table_no), '{}') INTO v_threads FROM (
    SELECT t.id, t.round_id, t.table_no FROM public.chat_round_threads t
      JOIN public.chat_round_thread_members tm ON tm.thread_id = t.id WHERE tm.profile_id = p_uid
    UNION
    SELECT t.id, t.round_id, t.table_no FROM public.chat_round_threads t
      JOIN public.event_round_seats s ON s.round_id = t.round_id AND s.table_no = t.table_no
      JOIN public.event_room_members rm ON rm.id = s.room_member_id WHERE rm.profile_id = p_uid
  ) x;

  -- ORDER MATTERS (race with forward_chat_message / clarify_chat_message). Those lock their source
  -- row FOR SHARE, so step 2's UPDATE of the erased user's own rows WAITS for any in-flight copy of
  -- them to commit. Under READ COMMITTED every statement takes a fresh snapshot, so the scrub in
  -- step 3 (a later statement) then SEES a copy that committed while step 2 waited and scrubs it.
  -- Scrubbing first would miss it. A copy that starts after step 2 commits finds the source deleted
  -- and is refused. Step 3 runs twice for the copy-of-a-copy case (a forward of a forward that
  -- committed while step 3's first pass waited).

  -- 1. their mirror and everything copied into it
  DELETE FROM public.chat_conversations c WHERE c.kind = 'mirror' AND c.owner_id = p_uid;
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_mirrors_deleted', n);

  -- 2. their messages in shared conversations
  UPDATE public.chat_messages m
     SET body = NULL, deleted_at = COALESCE(m.deleted_at, now()),
         attachment_kind = NULL, attachment_id = NULL,
         forward_snapshot = NULL, forward_author_id = NULL,
         author_id = NULL
   WHERE m.author_id = p_uid;
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_messages_erased', n);

  -- 3. copies made by OTHER people that carry their words. Erase means erase; D5 snapshot survival
  -- applies to ordinary deletes, not account erasure: the author becomes 'Deleted user', the body is
  -- removed (also from copied thread entries), the attachment and the back-reference are cleared.
  FOR pass IN 1..2 LOOP
    UPDATE public.chat_messages m
       SET forward_snapshot = jsonb_set(jsonb_set(m.forward_snapshot, '{author_name}', to_jsonb('Deleted user'::text)),
                                        '{body}', 'null'::jsonb),
           attachment_kind = NULL, attachment_id = NULL,
           forward_author_id = NULL
     WHERE m.forward_author_id = p_uid AND m.forward_snapshot IS NOT NULL;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_forwards_anonymised_' || pass, n);

    UPDATE public.chat_messages m
       SET forward_snapshot = jsonb_set(m.forward_snapshot, '{thread}', (
             SELECT COALESCE(jsonb_agg(
                      CASE WHEN t.e ->> 'author_ref' = v_ref
                           THEN (t.e - 'author_ref') || jsonb_build_object('author_name', 'Deleted user', 'body', NULL::text)
                           ELSE t.e END
                      ORDER BY t.ord), '[]'::jsonb)
               FROM jsonb_array_elements(m.forward_snapshot -> 'thread') WITH ORDINALITY AS t(e, ord)))
     WHERE m.forward_snapshot IS NOT NULL
       AND jsonb_path_exists(m.forward_snapshot, '$.thread[*] ? (@.author_ref == $ref)',
                             jsonb_build_object('ref', v_ref));
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_threads_anonymised_' || pass, n);

    -- a clarify made in a 1:1 with them carries their name as the chat title
    UPDATE public.chat_messages m
       SET forward_snapshot = jsonb_set(m.forward_snapshot - 'conversation_title_ref', '{conversation_title}',
                                        to_jsonb('Deleted user'::text))
     WHERE m.forward_snapshot ->> 'conversation_title_ref' = v_ref;
  END LOOP;

  -- 4. read state and blocks
  DELETE FROM public.chat_member_state s WHERE s.profile_id = p_uid;
  DELETE FROM public.chat_blocks b WHERE b.blocker_id = p_uid OR b.blocked_id = p_uid;

  -- 5. conversations that would be left with nobody
  DELETE FROM public.chat_conversations c
   WHERE c.kind = 'dm'
     AND ((c.dm_user_a = p_uid AND c.dm_user_b IS NULL) OR (c.dm_user_b = p_uid AND c.dm_user_a IS NULL));
  UPDATE public.chat_conversations c SET created_by = NULL WHERE c.created_by = p_uid;

  -- 6. (P1520) AI work derived from their words. The exclusive lock waits for every job still reading its
  -- context (_mirror_begin_job holds it shared) and keeps new ones out until this commits, so no job can
  -- record refs this step does not see. Jobs first: a completion that commits while this waits leaves a
  -- reply the next statement then scrubs.
  PERFORM pg_advisory_xact_lock(hashtext('p1520_mirror_context'));
  -- the draft rows the engine would lock, in id order, before any reply message or run row is touched (the owner locks are
  -- already held, see the top of this function)
  PERFORM 1 FROM public.canvas_drafts d
   WHERE d.tension_refs @> ARRAY[v_ref]
      OR d.id IN (SELECT r.draft_id FROM public.canvas_draft_runs r WHERE r.derived_refs @> ARRAY[v_ref])
   ORDER BY d.id FOR UPDATE;
  UPDATE public.mirror_jobs j
     SET state = 'cancelled', error_code = 'erased', finished_at = now()
   WHERE j.state IN ('queued', 'running') AND j.derived_refs @> ARRAY[v_ref];
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('mirror_jobs_cancelled', n);
  UPDATE public.chat_messages m
     SET body = NULL, deleted_at = COALESCE(m.deleted_at, now()), derived_refs = NULL
   WHERE m.kind = 'agent' AND m.derived_refs @> ARRAY[v_ref];
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('mirror_replies_erased', n);
  -- P1631 Clarify drafts that read their words fail 'erased' and lose their private point. The p1520 lock above is held exclusively, so no _clarify_begin can record refs this does not see.
  PERFORM public._clarify_erase_person(p_uid);  -- P1631
  PERFORM public._point_chat_erase_author(p_uid);  -- P1631 publish: the private points they published go, with their share rows

  -- 7. (P1592) round-thread titles carry first names. The threads were collected and locked in step 0. Drop
  -- this person from each member list and rebuild the title through the same function the poster uses
  -- ("Round {n}" if nobody named remains). edited_at is never touched. Copies of a root (forward / clarify)
  -- carry "Round {n}" only, so there is nothing to scrub in them.
  FOR v_th IN SELECT t.* FROM public.chat_round_threads t WHERE t.id = ANY (v_threads) ORDER BY t.round_id, t.table_no LOOP
    DELETE FROM public.chat_round_thread_members tm WHERE tm.thread_id = v_th.id AND tm.profile_id = p_uid;
    PERFORM public._transcribe_retitle_thread(v_th.id);
  END LOOP;
  v_out := v_out || jsonb_build_object('chat_round_threads_retitled', COALESCE(array_length(v_threads, 1), 0));

  -- 7b. (P1536 server review, Opus 8) the offers a run made while it read their words. An offer's label and reason are model output of the same class as the tensions
  -- cleared in step 8: they can paraphrase what the run read, they are returned by the state read, and the label is fed to the next run and becomes a fork's focus. An open offer
  -- is deleted; an offer already focused, started or dismissed keeps its label (a canvas already carries it) and loses its reason. The draft rows are locked (step 6), and
  -- a draft whose offers change moves its revision so an open view refetches. A closed draft keeps its material until its own expiry: settlement is not run from here.
  -- It sits before step 8 so that step 8's statements stay one unbroken block, as the earlier migrations' tests pin them.
  UPDATE public.canvas_drafts d SET revision = d.revision + 1
   WHERE d.id IN (SELECT o.draft_id FROM public.canvas_draft_offers o
                   WHERE (o.state = 'offered' OR o.why IS NOT NULL)
                     AND o.created_run_id IN (SELECT r.id FROM public.canvas_draft_runs r WHERE r.derived_refs @> ARRAY[v_ref]));
  DELETE FROM public.canvas_draft_offers o
   WHERE o.state = 'offered'
     AND o.created_run_id IN (SELECT r.id FROM public.canvas_draft_runs r WHERE r.derived_refs @> ARRAY[v_ref]);
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('canvas_draft_offers_erased', n);
  UPDATE public.canvas_draft_offers o SET why = NULL
   WHERE o.why IS NOT NULL
     AND o.created_run_id IN (SELECT r.id FROM public.canvas_draft_runs r WHERE r.derived_refs @> ARRAY[v_ref]);
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('canvas_draft_offer_reasons_cleared', n);

  -- 8. (P1536) canvas draft runs that read their words. Same lock as step 6 (still held), so no run can record refs this
  -- step does not see. A cancelled run's completion writes and posts nothing. The tensions and decided notes of a
  -- draft are model output that can paraphrase what its runs read, and they are fed to its next run: cleared.
  -- a cancelled run changes what the owner sees (the spot stops saying "Updating..."), so the draft's revision moves, once
  -- per draft that had a v6 run cancelled; the draft rows are already locked above
  UPDATE public.canvas_drafts d SET revision = d.revision + 1
   WHERE d.id IN (SELECT r.draft_id FROM public.canvas_draft_runs r
                   WHERE r.state IN ('queued', 'running') AND r.derived_refs @> ARRAY[v_ref]
                     AND r.kind IN ('message', 'focus', 'fork_first'));
  UPDATE public.canvas_draft_runs r
     SET state = 'cancelled', error_code = 'erased', finished_at = now()
   WHERE r.state IN ('queued', 'running') AND r.derived_refs @> ARRAY[v_ref];
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('canvas_draft_runs_cancelled', n);
  UPDATE public.canvas_drafts d
     SET tensions = '[]'::jsonb, decided = '[]'::jsonb, tension_refs = '{}'
   WHERE d.tension_refs @> ARRAY[v_ref]
      OR EXISTS (SELECT 1 FROM public.canvas_draft_runs r WHERE r.draft_id = d.id AND r.derived_refs @> ARRAY[v_ref]);
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('canvas_drafts_scrubbed', n);

  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.erase_chat_data_for(uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
