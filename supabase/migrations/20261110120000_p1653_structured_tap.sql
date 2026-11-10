-- P1653 final batch (re-review). The applied migrations 20261110100000 and 20261110110000 stay as they are.
--
-- diffed against: 20261030080000_p1536_v6_engine.sql (_canvas_draft_effective_input: that body with one added condition on the material list, nothing else).
-- client-safe: one new table closed to clients, one new function a signed-in owner may call for their own message (typed refusals, never an error), one new
--   service-role function, and one function body whose only change is one more row left out for the fork call (p_run IS NULL). No signature, no existing grant
--   and no existing answer changes for a client.
--
-- 1. A tap on "Yes, this is my business" or "Not mine" is identified by a MARKER the client sets at send time, never by matching message text. Typed words equal
--    to a button label are always an ordinary owner message (remembered, used as material). The marker lives in `canvas_draft_taps` (one row per message), written only by
--    `canvas_mark_tap`, which the client calls for the message it just sent, before the run starts. The function refuses unless the caller wrote the message,
--    the message is in the thread of an open draft of theirs, and its text is exactly the fixed token for the button. The engine reads the markers through
--    `_canvas_draft_tap_state`, which also says whether the question is still open: the newest agent reply before the tap, and whether anyone wrote in the thread
--    between that reply and the tap. An edited message stops counting (its text no longer equals the token).
-- 2. A fork never copies a rejected page ("Not mine" tombstone): the selector leaves `link_rejected` rows out when it is called for a fork (p_run IS NULL). A
--    run still gets them, because the tombstone's label is how it knows the page is not to be read again.

CREATE TABLE IF NOT EXISTS public.canvas_draft_taps (
  message_id uuid PRIMARY KEY REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  owner_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token      text NOT NULL CHECK (token IN ('yes', 'no')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.canvas_draft_taps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.canvas_draft_taps FROM PUBLIC, anon, authenticated;

-- The client marks the message it just sent as a tap. {status: 'ok'} or {status: 'refused'}; nothing is raised for a refusal.
CREATE OR REPLACE FUNCTION public.canvas_mark_tap(p_message uuid, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_m      public.chat_messages;
  v_expect text;
BEGIN
  IF v_uid IS NULL OR p_message IS NULL OR p_token IS NULL OR p_token NOT IN ('yes', 'no') THEN
    RETURN jsonb_build_object('status', 'refused');
  END IF;
  -- the fixed text of the button, in a variable: a CASE inside an IF condition would end the condition at its own THEN (plpgsql reads an IF up to the first THEN)
  v_expect := CASE p_token WHEN 'yes' THEN 'Yes, this is my business' ELSE 'Not mine' END;
  SELECT m.* INTO v_m FROM public.chat_messages m
   WHERE m.id = p_message AND m.author_id = v_uid AND m.kind = 'message' AND m.deleted_at IS NULL;
  IF NOT FOUND
     OR btrim(COALESCE(v_m.body, '')) IS DISTINCT FROM v_expect
     OR NOT EXISTS (SELECT 1 FROM public.canvas_drafts d
                     WHERE d.owner_id = v_uid AND d.state = 'open'
                       AND d.conversation_id = v_m.conversation_id AND d.thread_root_id = v_m.thread_root_id) THEN
    RETURN jsonb_build_object('status', 'refused');
  END IF;
  INSERT INTO public.canvas_draft_taps (message_id, owner_id, token) VALUES (v_m.id, v_uid, p_token) ON CONFLICT (message_id) DO NOTHING;
  RETURN jsonb_build_object('status', 'ok');
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_mark_tap(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.canvas_mark_tap(uuid, text) TO authenticated;

-- What the engine needs to decide whether a run's message is a tap that still counts: the marked taps of this thread (message ids whose text still equals
-- their token), the newest agent reply before the run's message, and whether any message was written in the thread after that reply and before the run's.
CREATE OR REPLACE FUNCTION public._canvas_draft_tap_state(p_run uuid, p_owner uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run     public.canvas_draft_runs;
  v_d       public.canvas_drafts;
  v_trig    public.chat_messages;
  v_body    text;
  v_at      timestamptz;
  v_after   boolean := false;
  v_taps    uuid[];
BEGIN
  IF p_run IS NULL OR p_owner IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run;
  IF NOT FOUND OR v_run.owner_id IS DISTINCT FROM p_owner THEN
    RETURN NULL;
  END IF;
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = v_run.draft_id;
  IF v_run.trigger_message_id IS NOT NULL THEN
    SELECT m.* INTO v_trig FROM public.chat_messages m WHERE m.id = v_run.trigger_message_id;
  END IF;
  v_taps := ARRAY(
    SELECT t.message_id FROM public.canvas_draft_taps t
      JOIN public.chat_messages m ON m.id = t.message_id
     WHERE t.owner_id = p_owner AND m.conversation_id = v_d.conversation_id AND m.thread_root_id = v_d.thread_root_id
       AND m.deleted_at IS NULL
       AND ((t.token = 'yes' AND btrim(COALESCE(m.body, '')) = 'Yes, this is my business')
         OR (t.token = 'no' AND btrim(COALESCE(m.body, '')) = 'Not mine')));
  SELECT m.body, m.created_at INTO v_body, v_at
    FROM public.chat_messages m
   WHERE m.conversation_id = v_d.conversation_id AND m.thread_root_id = v_d.thread_root_id
     AND m.kind = 'agent' AND m.deleted_at IS NULL
     AND (v_trig.created_at IS NULL OR m.created_at < v_trig.created_at)
   ORDER BY m.created_at DESC, m.id DESC
   LIMIT 1;
  IF v_at IS NOT NULL AND v_trig.id IS NOT NULL THEN
    v_after := EXISTS (SELECT 1 FROM public.chat_messages m
                        WHERE m.conversation_id = v_d.conversation_id AND m.thread_root_id = v_d.thread_root_id
                          AND m.kind <> 'agent' AND m.author_id IS NOT NULL AND m.deleted_at IS NULL
                          AND m.id <> v_trig.id AND m.created_at > v_at AND m.created_at < v_trig.created_at);
  END IF;
  RETURN jsonb_build_object('taps', to_jsonb(v_taps), 'newest_reply', v_body, 'owner_after', v_after);
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_tap_state(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_draft_tap_state(uuid, uuid)
  TO service_role;

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
