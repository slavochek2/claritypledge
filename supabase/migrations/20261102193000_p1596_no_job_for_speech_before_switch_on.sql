-- P1596 (security review of 20261102190000): the auto-close floor covered only the tick. A host closing an old round by hand,
-- or an old room ending, after posting is switched on could still post speech recorded under older consent wording.
-- Now no clean job at all is created for a window that starts before the switch was turned on (every path inserts here).
-- Created: 2026-11-02
-- Spec: features/p1596_event_transcripts_one_speaker_per_sentence.md
--
-- client-safe: a trigger on transcribe_round_clean_jobs, which clients cannot reach; its function has EXECUTE revoked
--   (checked at the end). No table, column or policy changes. It only removes job rows, so a client sees fewer posts.
-- new function: _transcribe_job_after_switch_on
-- A NULL enabled_at creates no job: the safe direction.
-- LIMIT: a round or room running at the moment of switch-on gets no clean transcript, so switch on before the test starts.

CREATE OR REPLACE FUNCTION public._transcribe_job_after_switch_on()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_on timestamptz;
BEGIN
  SELECT p.enabled_at INTO v_on FROM public.transcribe_channel_posting p WHERE p.singleton;
  IF v_on IS NULL OR NEW.window_start < v_on THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_job_after_switch_on() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS transcribe_job_after_switch_on ON public.transcribe_round_clean_jobs;
CREATE TRIGGER transcribe_job_after_switch_on
  BEFORE INSERT ON public.transcribe_round_clean_jobs
  FOR EACH ROW EXECUTE FUNCTION public._transcribe_job_after_switch_on();

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public._transcribe_job_after_switch_on()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._transcribe_job_after_switch_on()', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1596: the job floor is client-reachable';
  END IF;
END
$check$;
