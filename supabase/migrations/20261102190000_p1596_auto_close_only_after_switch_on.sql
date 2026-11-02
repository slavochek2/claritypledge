-- P1596 (adversarial review of 20261102180000): the tick's auto-close had no time floor. The first tick after posting is
-- switched on would have closed every old abandoned round, started transcription and posted speech recorded under older
-- consent wording to event channels. Now only a round that started after the switch was turned on can be auto-closed.
-- Created: 2026-11-02
-- Spec: features/p1596_event_transcripts_one_speaker_per_sentence.md
--
-- client-safe: adds a nullable column to transcribe_channel_posting (clients have no access to that table) and a trigger;
--   the tick stays cron-internal (EXECUTE revoked from PUBLIC, anon and authenticated; checked at the end).
-- diffed against: transcribe_round_clean_tick 20261102180000_p1596_abandoned_open_rounds.sql (same body; one added condition)
-- A NULL enabled_at (switch never turned on through the trigger) closes nothing: the safe direction.

ALTER TABLE public.transcribe_channel_posting ADD COLUMN IF NOT EXISTS enabled_at timestamptz;

CREATE OR REPLACE FUNCTION public._transcribe_posting_stamp_enabled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.enabled IS TRUE AND OLD.enabled IS NOT TRUE THEN
    NEW.enabled_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_posting_stamp_enabled() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS transcribe_posting_stamp_enabled ON public.transcribe_channel_posting;
CREATE TRIGGER transcribe_posting_stamp_enabled
  BEFORE UPDATE OF enabled ON public.transcribe_channel_posting
  FOR EACH ROW EXECUTE FUNCTION public._transcribe_posting_stamp_enabled();

CREATE OR REPLACE FUNCTION public.transcribe_round_clean_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public._transcribe_clean_enabled() THEN
    RETURN;
  END IF;
  -- A round left open after every room of its event ended 2 h ago is closed where the audio ended, so its table's words
  -- are cut (the room-end job left them to this round). The update fires the normal cut trigger.
  UPDATE public.event_rounds er
     SET ended_at = last_room.ended_at
    FROM (SELECT tr.event_id, max(tr.ended_at) AS ended_at
            FROM public.transcribe_rooms tr
           WHERE tr.event_id IS NOT NULL
           GROUP BY tr.event_id
          HAVING bool_and(tr.ended_at IS NOT NULL) AND max(tr.ended_at) < now() - interval '2 hours') last_room
   WHERE er.event_id = last_room.event_id AND er.ended_at IS NULL AND er.started_at < last_room.ended_at
     -- never a round from before posting was switched on: it was recorded under older consent wording
     AND er.started_at >= (SELECT p.enabled_at FROM public.transcribe_channel_posting p WHERE p.singleton);
  FOR v_id IN
    SELECT j.id FROM public.transcribe_round_clean_jobs j
     WHERE j.status = 'pending' AND j.dispatched_at IS NULL AND j.not_before <= now()
     ORDER BY j.not_before LIMIT 50
  LOOP
    UPDATE public.transcribe_round_clean_jobs SET dispatched_at = now() WHERE id = v_id AND dispatched_at IS NULL;
    IF FOUND THEN
      PERFORM public._transcribe_round_clean_dispatch(v_id);
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.transcribe_round_clean_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transcribe_round_clean_tick() TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.transcribe_round_clean_tick()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.transcribe_round_clean_tick()', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1596: the tick is client-reachable';
  END IF;
END
$check$;
