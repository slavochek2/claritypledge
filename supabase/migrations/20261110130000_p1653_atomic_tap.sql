-- P1653 tap gap fix (review). The applied migrations 20261110100000, 20261110110000 and 20261110120000 stay as they are.
--
-- diffed against: 20261110120000_p1653_structured_tap.sql (_canvas_draft_effective_input: that body with ONE more condition on the message list, nothing else;
--   canvas_mark_tap: dropped, replaced by the atomic send below); 20261103010000 / 20261030080000 (canvas_workspace_send: CALLED, never restated or changed).
-- client-safe: one new function a signed-in owner may call; two functions dropped that no deployed client calls (canvas_mark_tap shipped one migration ago and
--   its only caller is replaced in the same change; _canvas_draft_newest_reply is service-role only and has no caller left); one function body whose only change
--   is one more row left out for the fork call (p_run IS NULL). canvas_workspace_send keeps its name, arguments, grants and every answer.
--
-- 1. ONE call sends a tap and marks it. The first design sent the message (`canvas_workspace_send`) and marked it in a second call, so a moment existed in
--    which a token message and its queued run existed unmarked, and a dropped second call, another tab or the stranded-run recovery started that run as ordinary
--    typed words. `canvas_workspace_send_tap` checks that the question is still open, calls `canvas_workspace_send` inside its own transaction, and inserts the marker
--    in the same transaction: either both exist or neither does. A tap that is not the open question sends nothing and returns {status:'refused', code:'stale_button'}.
--    Any refusal or error of the send itself (stale view, busy, too many drafts) is passed through and nothing is marked. A repeat with the same client id returns
--    the first result (the send's own idempotency) and does not re-check the question: it is the same message.
--    The message text is fixed by the token, never taken from the caller.
-- 2. Marked tap messages never enter a fork's material (the fork's "Your messages" row reads this selector with p_run NULL). A run still gets them: the engine
--    leaves them out of the material itself, by the marker.
-- 3. `canvas_mark_tap` is dropped (no caller). `_canvas_draft_newest_reply` is dropped (superseded by `_canvas_draft_tap_state`, no caller: grepped).

CREATE OR REPLACE FUNCTION public.canvas_workspace_send_tap(p_canvas uuid, p_expected_draft uuid, p_expected_revision integer, p_token text, p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_d       public.canvas_drafts;
  v_text    text;
  v_replay  boolean;
  v_first   boolean;
  v_reply   text;
  v_reply_at timestamptz;
  v_open    boolean := false;
  v_after   boolean := false;
  v_res     jsonb;
  v_msg     uuid;
BEGIN
  IF v_uid IS NULL OR p_canvas IS NULL OR p_expected_draft IS NULL OR p_client_id IS NULL OR p_token IS NULL OR p_token NOT IN ('yes', 'no') THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'stale_button');
  END IF;
  -- the fixed text of the button, in a variable: a CASE inside an IF condition would end the condition at its own THEN (plpgsql reads an IF up to the first THEN)
  v_text := CASE p_token WHEN 'yes' THEN 'Yes, this is my business' ELSE 'Not mine' END;
  SELECT d.* INTO v_d FROM public.canvas_drafts d
   WHERE d.id = p_expected_draft AND d.owner_id = v_uid AND d.canvas_id = p_canvas AND d.state = 'open';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'stale_button');
  END IF;
  v_replay := EXISTS (SELECT 1 FROM public.canvas_draft_runs r WHERE r.owner_id = v_uid AND r.client_id = p_client_id);
  IF NOT v_replay THEN
    -- the question must be open: a first draft, the newest agent reply ends with the question, and nobody wrote in the thread since that reply
    v_first := cardinality(public._canvas_draft_point_ids(v_d.id)) = 0 AND v_d.base_version_id IS NULL AND v_d.focus IS NULL;
    SELECT m.body, m.created_at INTO v_reply, v_reply_at
      FROM public.chat_messages m
     WHERE m.conversation_id = v_d.conversation_id AND m.thread_root_id = v_d.thread_root_id AND m.kind = 'agent' AND m.deleted_at IS NULL
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT 1;
    IF v_reply IS NOT NULL THEN
      v_open := btrim(v_reply) LIKE '%' || chr(10) || 'Is this your business?';
      v_after := EXISTS (SELECT 1 FROM public.chat_messages m
                          WHERE m.conversation_id = v_d.conversation_id AND m.thread_root_id = v_d.thread_root_id
                            AND m.kind <> 'agent' AND m.author_id IS NOT NULL AND m.deleted_at IS NULL AND m.created_at > v_reply_at);
    END IF;
    IF NOT (v_first AND v_open AND NOT v_after) THEN
      RETURN jsonb_build_object('status', 'refused', 'code', 'stale_button');
    END IF;
  END IF;

  v_res := public.canvas_workspace_send(p_canvas, NULL, p_expected_draft, p_expected_revision, false, v_text, NULL, NULL, p_client_id);
  IF v_res ->> 'status' IS DISTINCT FROM 'ok' THEN
    RETURN v_res;       -- a refusal of the send itself (stale view, busy, cap): nothing was sent, nothing is marked
  END IF;
  v_msg := (v_res ->> 'message_id')::uuid;
  INSERT INTO public.canvas_draft_taps (message_id, owner_id, token) VALUES (v_msg, v_uid, p_token) ON CONFLICT (message_id) DO NOTHING;
  RETURN v_res;
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_workspace_send_tap(uuid, uuid, integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.canvas_workspace_send_tap(uuid, uuid, integer, text, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.canvas_mark_tap(uuid, text);
DROP FUNCTION IF EXISTS public._canvas_draft_newest_reply(uuid, uuid);

CREATE OR REPLACE FUNCTION public._canvas_draft_effective_input(p_draft uuid, p_run uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_d       public.canvas_drafts;
  v_trigger uuid;
  v_msgs    uuid[];
  v_mats    uuid[];
  v_copies  uuid[];
BEGIN
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = p_draft;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('message_ids', '[]'::jsonb, 'material_ids', '[]'::jsonb, 'copy_ids', '[]'::jsonb);
  END IF;
  IF p_run IS NOT NULL THEN
    SELECT r.trigger_message_id INTO v_trigger FROM public.canvas_draft_runs r WHERE r.id = p_run AND r.draft_id = p_draft;
  END IF;

  v_msgs := ARRAY(
    SELECT m.id
      FROM public.chat_messages m
     WHERE m.conversation_id = v_d.conversation_id AND m.thread_root_id = v_d.thread_root_id
       AND m.kind = 'message' AND m.author_id = v_d.owner_id
       AND m.context_conversation_id IS NULL AND m.deleted_at IS NULL
       AND (p_run IS NOT NULL OR NOT EXISTS (SELECT 1 FROM public.canvas_draft_taps t WHERE t.message_id = m.id))
       AND (m.id = v_trigger
            OR (SELECT r.state FROM public.canvas_draft_runs r
                 WHERE r.trigger_message_id = m.id
                 ORDER BY r.created_at DESC, r.id DESC LIMIT 1) = 'done')
     ORDER BY m.created_at, m.id);

  v_mats := ARRAY(
    SELECT x.id FROM public.canvas_draft_material x
     WHERE x.draft_id = p_draft AND (x.origin = 'fork_seed' OR x.message_id = ANY (v_msgs))
       AND (p_run IS NOT NULL OR x.kind <> 'link_rejected')
     ORDER BY x.created_at, x.id);

  v_copies := ARRAY(
    SELECT m.id
      FROM public.chat_messages m
     WHERE m.conversation_id = v_d.conversation_id AND m.thread_root_id = v_d.thread_root_id
       AND m.kind IN ('forward', 'clarify') AND m.author_id = v_d.owner_id
       AND m.context_conversation_id IS NULL AND m.deleted_at IS NULL
     ORDER BY m.created_at, m.id);

  RETURN jsonb_build_object('message_ids', to_jsonb(v_msgs), 'material_ids', to_jsonb(v_mats), 'copy_ids', to_jsonb(v_copies));
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_effective_input(uuid, uuid) FROM PUBLIC, anon, authenticated;
