-- P1653 fix batch (build review). The applied migration 20261110100000 stays as it is.
--
-- diffed against: 20261110100000_p1653_never_a_wall.sql (_canvas_draft_remove_material: that body with the delete turned into a tombstone, nothing else);
--   20261030080000_p1536_v6_engine.sql (canvas_draft_material_kind_check: the same list plus one value).
-- client-safe: one added value in a check constraint no client writes (the table is closed to clients, they read id, kind, label only), one service-role function
--   body, and one new service-role function. No signature, no grant a client can reach, no existing answer changes.
--
-- 1. "Not mine" must take a page out of EVERY later run. Deleting its row (the first version) left the URL in the owner's thread, and a retry or a run with no
--    trigger message read the page again from that URL, because the engine reads a URL again when no material row holds it. Now the row stays as a TOMBSTONE:
--    kind 'link_rejected', no text, no characters. The label is kept, so the URL is still known and is never read again; the page's words are gone from the
--    database, so no later input, fork seed or consolidation can carry them. The engine builds every model input from kinds file, link and messages only,
--    so a tombstone is in none of them.
-- 2. `_canvas_draft_newest_reply`: the newest agent reply of the run's own thread before the run's own message, so the engine can tell whether a tap on
--    "Yes, this is my business" or "Not mine" answers the question that is still open (the thread a run reads holds only the owner's messages).

ALTER TABLE public.canvas_draft_material DROP CONSTRAINT IF EXISTS canvas_draft_material_kind_check;
ALTER TABLE public.canvas_draft_material ADD CONSTRAINT canvas_draft_material_kind_check
  CHECK (kind IN ('file', 'link', 'messages', 'link_rejected'));

CREATE OR REPLACE FUNCTION public._canvas_draft_remove_material(p_run uuid, p_owner uuid, p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run public.canvas_draft_runs;
  n     integer;
BEGIN
  IF p_run IS NULL OR p_owner IS NULL OR p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN 0;
  END IF;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run;
  IF NOT FOUND OR v_run.owner_id IS DISTINCT FROM p_owner THEN
    RETURN 0;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_run.owner_id::text, 0));
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run FOR UPDATE;
  IF v_run.state <> 'running' THEN
    RETURN 0;
  END IF;
  UPDATE public.canvas_draft_material m
     SET kind = 'link_rejected', text = '', chars = 0
   WHERE m.draft_id = v_run.draft_id AND m.owner_id = p_owner AND m.kind = 'link' AND m.id = ANY (p_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_remove_material(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_draft_remove_material(uuid, uuid, uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public._canvas_draft_newest_reply(p_run uuid, p_owner uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run  public.canvas_draft_runs;
  v_d    public.canvas_drafts;
  v_trig public.chat_messages;
  v_body text;
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
  SELECT m.body INTO v_body
    FROM public.chat_messages m
   WHERE m.conversation_id = v_d.conversation_id AND m.thread_root_id = v_d.thread_root_id
     AND m.kind = 'agent' AND m.deleted_at IS NULL
     AND (v_trig.created_at IS NULL OR m.created_at < v_trig.created_at)
   ORDER BY m.created_at DESC, m.id DESC
   LIMIT 1;
  RETURN v_body;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_newest_reply(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_draft_newest_reply(uuid, uuid)
  TO service_role;
