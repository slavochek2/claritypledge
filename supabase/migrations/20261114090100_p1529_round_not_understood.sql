-- Migration: P1529 / INBOX-338 -- a round whose audio all transcribed empty says so on the owner's next-version card
-- Created: 2026-11-14
-- Spec: features/p1529_canvas_event_host_coordination.md ("INBOX-338 transcription fixes")
-- Guaranteed by: e2e/integration/p1529-db-schema.spec.ts (offer states: not_understood for 'transcribed_empty', no_recording otherwise)
--
-- WHY. The round worker (services/transcribe-room-batch/pipeline.py) now finishes a job whose present audio all came back empty with
--   error 'transcribed_empty' (before: 'partial_table' or no error, with nothing posted). The owner's card read that as "No recording
--   from this round". It now gets its own state, 'not_understood': "We couldn't make out what was said in this round".
--
-- client-safe: a new value of an existing jsonb 'state' field. A client older than this branch maps an unknown state to 'none'
--   (getMyNextVersionOffer's OFFER_STATES guard), so it shows nothing for that round instead of failing.
-- diffed against: 20261111190000_p1529_review_fixes.sql (get_my_next_version_offer; its body matches TEST's live one, compared
--   whitespace-normalised on 2026-11-14).
-- diff: one IF block before the 'no_recording' branch. The signature, STABLE SECURITY DEFINER, search_path, every other state and
--   the grants are unchanged. make_my_next_version is not changed: the card offers no tap in this state.
--
-- Also (INBOX-338 (3)): transcribe_messages.posted_at is the marker of P1592's live posting, which P1596 retired. A live line keeps it
--   NULL for good; the clean text's post is recorded in transcribe_round_clean_posts. The column comment now says so, so a NULL is not
--   read as a lost line again.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_next_version_offer(p_event uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  r record;
  v_canvas uuid;
  v_from uuid;
  v_thread public.chat_round_threads;
  v_since timestamptz;
  v_lines integer;
  v_tap public.event_next_version_taps;
  v_draft public.canvas_drafts;
  v_run public.canvas_draft_runs;
  v_state text;
  v_item jsonb;
  v_info jsonb := NULL;
  v_info_round uuid := NULL;
  v_newest_ended uuid;
BEGIN
  IF v_uid IS NULL OR public._event_flow(p_event) <> 'sales-mastermind' THEN
    RETURN jsonb_build_object('state', 'none');
  END IF;

  SELECT ec.canvas_id INTO v_canvas FROM public.event_canvases ec WHERE ec.event_id = p_event AND ec.profile_id = v_uid;

  FOR r IN
    SELECT rd.id, rd.ended_at, s.table_no
      FROM public.event_rounds rd
      JOIN public.event_round_seats s ON s.round_id = rd.id AND s.role = 'first'
      JOIN public.event_room_members m ON m.id = s.room_member_id AND m.profile_id = v_uid
     WHERE rd.event_id = p_event AND NOT COALESCE(rd.showcase, false) AND rd.ended_at IS NOT NULL
     ORDER BY rd.round_no ASC
  LOOP
    v_item := NULL;
    -- A later owned round already has its run: this older round never drafts over it (nothing is shown for it).
    IF EXISTS (SELECT 1 FROM public.event_next_version_taps t2
                 JOIN public.event_rounds r2 ON r2.id = t2.round_id
                WHERE t2.profile_id = v_uid AND r2.event_id = p_event
                  AND r2.round_no > (SELECT r0.round_no FROM public.event_rounds r0 WHERE r0.id = r.id))
       AND NOT EXISTS (SELECT 1 FROM public.event_next_version_taps t3 WHERE t3.round_id = r.id AND t3.profile_id = v_uid) THEN
      CONTINUE;
    END IF;
    SELECT t.* INTO v_tap FROM public.event_next_version_taps t
     WHERE t.round_id = r.id AND t.profile_id = v_uid ORDER BY t.created_at DESC LIMIT 1;
    IF FOUND THEN
      SELECT d.* INTO v_draft FROM public.canvas_drafts d WHERE d.id = v_tap.draft_id;
      IF v_draft.state = 'open' THEN
        SELECT x.* INTO v_run FROM public.canvas_draft_runs x WHERE x.draft_id = v_draft.id ORDER BY x.created_at DESC, x.id DESC LIMIT 1;
        v_state := CASE WHEN v_run.state IN ('queued', 'running') THEN 'drafting' WHEN v_run.state = 'done' THEN 'ready' ELSE 'failed' END;
        -- One-tap publishes only a draft that starts from the owner's LATEST published version; an older base is left as a draft.
        RETURN jsonb_build_object('state', v_state, 'round_id', r.id, 'draft_id', v_draft.id, 'revision', v_draft.revision,
                                  'run_id', v_run.id,
                                  'auto_publish', v_tap.auto_publish AND v_draft.base_version_id IS NOT DISTINCT FROM
                                    (SELECT v.id FROM public.canvas_versions v
                                      WHERE v.canvas_id = v_draft.canvas_id AND v.published_at IS NOT NULL
                                      ORDER BY v.published_seq DESC NULLS LAST LIMIT 1));
      ELSIF v_draft.state = 'published' THEN
        v_info := jsonb_build_object('state', 'published', 'round_id', r.id); v_info_round := r.id;
      ELSE
        v_info := NULL; v_info_round := NULL;
      END IF;
      CONTINUE;
    END IF;

    SELECT v.id INTO v_from FROM public.canvas_versions v
     WHERE v.canvas_id = v_canvas AND v.published_at IS NOT NULL ORDER BY v.published_seq DESC NULLS LAST LIMIT 1;
    IF v_from IS NULL THEN
      v_info := jsonb_build_object('state', 'no_canvas', 'round_id', r.id); v_info_round := r.id;
      CONTINUE;
    END IF;

    SELECT t.* INTO v_thread FROM public.chat_round_threads t WHERE t.round_id = r.id AND t.table_no = r.table_no;
    v_lines := NULL;
    IF FOUND THEN
      v_since := COALESCE(public._chat_access_since(v_thread.conversation_id, v_uid), 'infinity'::timestamptz);
      IF NOT EXISTS (SELECT 1 FROM public.chat_messages root
                      WHERE root.id = v_thread.root_message_id AND root.deleted_at IS NULL AND root.created_at >= v_since) THEN
        v_info := jsonb_build_object('state', 'no_recording', 'round_id', r.id); v_info_round := r.id;
        CONTINUE;
      END IF;
      SELECT count(*) INTO v_lines FROM public.chat_messages m
       WHERE m.conversation_id = v_thread.conversation_id AND m.thread_root_id = v_thread.root_message_id
         AND m.kind = 'message' AND m.deleted_at IS NULL AND m.created_at >= v_since AND m.body IS NOT NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM public.transcribe_round_clean_jobs j
                WHERE j.round_id = r.id AND j.table_no = r.table_no AND j.status IN ('pending', 'processing')) THEN
      -- Not ready 10 minutes after the round ended: the terminal copy, no button. Never blocks a later round's offer.
      IF now() >= r.ended_at + interval '10 minutes' THEN
        v_info := jsonb_build_object('state', 'transcript_missing', 'round_id', r.id); v_info_round := r.id;
        CONTINUE;
      END IF;
      RETURN jsonb_build_object('state', 'transcript_pending', 'round_id', r.id);
    END IF;
    -- INBOX-338: the table's audio was there and was transcribed, and every chunk came back empty (quiet audio). Its own words, never
    -- "no recording" (there was one) and never a wait.
    IF COALESCE(v_lines, 0) = 0 AND EXISTS (SELECT 1 FROM public.transcribe_round_clean_jobs j
                WHERE j.round_id = r.id AND j.table_no = r.table_no AND j.status = 'completed' AND j.error = 'transcribed_empty') THEN
      v_info := jsonb_build_object('state', 'not_understood', 'round_id', r.id); v_info_round := r.id;
      CONTINUE;
    END IF;
    IF COALESCE(v_lines, 0) = 0 THEN
      v_info := jsonb_build_object('state', 'no_recording', 'round_id', r.id); v_info_round := r.id;
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.canvas_id = v_canvas AND d.state = 'open') THEN
      RETURN jsonb_build_object('state', 'draft_open', 'round_id', r.id);
    END IF;
    RETURN jsonb_build_object('state', 'offer', 'round_id', r.id);
  END LOOP;

  -- Nothing can move: an informational line only for the break right after the person's own newest round.
  SELECT rd.id INTO v_newest_ended FROM public.event_rounds rd
   WHERE rd.event_id = p_event AND rd.ended_at IS NOT NULL ORDER BY rd.round_no DESC LIMIT 1;
  IF v_info IS NOT NULL AND v_info_round = v_newest_ended THEN
    RETURN v_info;
  END IF;
  RETURN jsonb_build_object('state', 'none');
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_next_version_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_next_version_offer(uuid) TO authenticated;

COMMENT ON COLUMN public.transcribe_messages.posted_at IS
  'P1592 live posting marker, retired by P1596: NULL for every line since. The clean, attributed text is posted after the round or the room; its posts are recorded in transcribe_round_clean_posts.';

COMMIT;
