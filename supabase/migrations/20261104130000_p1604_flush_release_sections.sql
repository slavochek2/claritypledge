-- Migration: P1604 (9/9) — the thread sooner after Stop; sections and the thread's place for the transcript view and the toast
-- Created: 2026-11-04
-- Spec: features/p1604_transcription_belongs_to_a_chat.md (founder final-look batch, 2026-11-04)
-- Guaranteed by: e2e/integration/p1604-flush-and-sections.spec.ts
--
-- diffed against: 20261103090200_p1604_transcription_belongs_to_a_chat_clean.sql (_transcribe_room_end_job: same trigger, same insert, one
--   PERFORM added after it; the 2-minute not_before stays as the upper bound)
--
-- What changes:
--   1. transcribe_room_members.audio_flushed_at: the moment a seat's LAST archive chunk reached storage (the client reports it once its
--      isLast chunk has uploaded). Cleared when the seat is continued (capture_ended_at back to NULL), so a rejoin cannot inherit it.
--   2. report_audio_flushed(room): the caller's seat reports it. Then _transcribe_release_room_job(room): when the room has ended and
--      EVERY seat of its pending room job has reported, not_before moves to now(). A seat that never reports (a phone that vanished)
--      leaves the job on the original ended_at + 2 minutes, so the bound is unchanged.
--   3. _transcribe_room_end_job also releases at room end (all seats may have flushed before the last Stop closed the room).
--   4. get_my_clean_transcript_sections(room): per job the caller was a seat of: the round number and table, or the place
--      (session / end) for the stretches outside rounds, and when the stretch began. Lets the transcript view head each block "Round N
--      · Table M" in time order.
--   5. get_my_transcript_thread(room): where the thread is (chat + root message), for a member of the room with access to the chat.
--      The table is service-role only; this is the narrow, member-scoped read.
--
-- client-safe: one nullable column added, new functions only, one trigger function body; no existing signature changes.

ALTER TABLE public.transcribe_room_members ADD COLUMN IF NOT EXISTS audio_flushed_at timestamptz;
COMMENT ON COLUMN public.transcribe_room_members.audio_flushed_at IS
  'P1604: when this seat reported its last archive chunk uploaded. Cleared when the seat is continued. Releases the room''s clean job early.';

CREATE OR REPLACE FUNCTION public._transcribe_clear_flush_on_continue()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.audio_flushed_at := NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_clear_flush_on_continue() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS transcribe_clear_flush_on_continue ON public.transcribe_room_members;
CREATE TRIGGER transcribe_clear_flush_on_continue BEFORE UPDATE OF capture_ended_at ON public.transcribe_room_members
  FOR EACH ROW WHEN (OLD.capture_ended_at IS NOT NULL AND NEW.capture_ended_at IS NULL)
  EXECUTE FUNCTION public._transcribe_clear_flush_on_continue();

CREATE OR REPLACE FUNCTION public._transcribe_release_room_job(p_room uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.transcribe_round_clean_jobs j
     SET not_before = now(), updated_at = now()
   WHERE j.kind = 'room' AND j.room_id = p_room AND j.status = 'pending' AND j.not_before > now()
     AND EXISTS (SELECT 1 FROM public.transcribe_rooms r WHERE r.id = p_room AND r.ended_at IS NOT NULL)
     AND jsonb_array_length(j.seats) > 0
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(j.seats) s
         JOIN public.transcribe_room_members m ON m.id = (s ->> 'member_id')::uuid
        WHERE m.audio_flushed_at IS NULL);
$$;
REVOKE ALL ON FUNCTION public._transcribe_release_room_job(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.report_audio_flushed(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.transcribe_room_members m SET audio_flushed_at = now()
   WHERE m.room_id = p_room_id AND m.profile_id = auth.uid();
  PERFORM public._transcribe_release_room_job(p_room_id);
END;
$$;
COMMENT ON FUNCTION public.report_audio_flushed(uuid) IS
  'P1604: the caller''s seat reports its last archive chunk uploaded. When every seat of the room''s pending clean job has, the job is due now.';
REVOKE ALL ON FUNCTION public.report_audio_flushed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_audio_flushed(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public._transcribe_room_end_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_seg jsonb;
BEGIN
  IF NOT public._transcribe_clean_enabled() THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_seg := public._transcribe_room_end_segments(NEW.id);
    IF jsonb_array_length(v_seg) > 0 THEN
      INSERT INTO public.transcribe_round_clean_jobs
        (kind, place, event_id, conversation_id, room_id, seats, window_start, window_end, segments, not_before)
      SELECT 'room', CASE WHEN NEW.event_id IS NULL THEN 'session' ELSE 'end' END, NEW.event_id, NEW.conversation_id, NEW.id,
             COALESCE(jsonb_agg(jsonb_build_object('member_id', m.id, 'room_id', m.room_id) ORDER BY m.id), '[]'::jsonb),
             NEW.created_at, NEW.ended_at, v_seg,
             -- the UPPER BOUND: audio recorded before a Stop may still upload for 2 minutes after it (Resolved Decision 4); the job is
             -- released earlier, the moment every seat has reported its last chunk (_transcribe_release_room_job)
             NEW.ended_at + interval '2 minutes'
        FROM public.transcribe_room_members m
       WHERE m.room_id = NEW.id AND m.consent_given_at IS NOT NULL AND m.profile_id IS NOT NULL
      ON CONFLICT (room_id, place) WHERE kind = 'room' DO NOTHING;
    END IF;
    -- everyone already finished uploading before the room closed: no reason to wait out the bound
    PERFORM public._transcribe_release_room_job(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_transcribe_room_end_job: no room job created (sqlstate %)', SQLSTATE;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_room_end_job() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_clean_transcript_sections(p_room_id uuid)
RETURNS TABLE (job_id uuid, kind text, place text, round_no integer, table_no integer, window_start timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT j.id, j.kind, j.place, er.round_no, j.table_no, j.window_start
    FROM public.transcribe_room_members me
    JOIN public.transcribe_round_clean_jobs j
      ON EXISTS (SELECT 1 FROM jsonb_array_elements(j.seats) s WHERE s ->> 'member_id' = me.id::text)
    LEFT JOIN public.event_rounds er ON er.id = j.round_id
   WHERE me.room_id = p_room_id AND me.profile_id = auth.uid() AND auth.uid() IS NOT NULL
   ORDER BY j.window_start, j.id;
$$;
COMMENT ON FUNCTION public.get_my_clean_transcript_sections(uuid) IS
  'P1604: the clean jobs the CALLER was a seat of in this room, with round number and table (round jobs) or the place (stretches outside rounds), in time order.';
REVOKE ALL ON FUNCTION public.get_my_clean_transcript_sections(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_clean_transcript_sections(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_transcript_thread(p_room_id uuid)
RETURNS TABLE (conversation_id uuid, root_message_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT t.conversation_id, t.root_message_id
    FROM public.transcribe_session_threads t
   WHERE t.room_id = p_room_id AND auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.transcribe_room_members m WHERE m.room_id = p_room_id AND m.profile_id = auth.uid())
     AND public._chat_access_since(t.conversation_id, auth.uid()) IS NOT NULL;
$$;
COMMENT ON FUNCTION public.get_my_transcript_thread(uuid) IS
  'P1604: where the session thread of a room the caller was in is posted (chat + root message), only while the caller can still read that chat.';
REVOKE ALL ON FUNCTION public.get_my_transcript_thread(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_transcript_thread(uuid) TO authenticated;

DO $check$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['public._transcribe_release_room_job(uuid)', 'public._transcribe_room_end_job()',
                               'public._transcribe_clear_flush_on_continue()']
  LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'P1604: % is client-callable', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY['public.report_audio_flushed(uuid)', 'public.get_my_clean_transcript_sections(uuid)',
                               'public.get_my_transcript_thread(uuid)']
  LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'P1604: % grants are wrong', v_fn;
    END IF;
  END LOOP;
END
$check$;
