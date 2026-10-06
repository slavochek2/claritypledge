-- client-safe: additive nullable column on email_send_log; set_rsvp_message_ids (service_role only, introduced by 20261006120000 in the same change, never called by a client) is replaced by a signature with one more defaulted parameter.
-- new functions: set_rsvp_message_ids (replaces the 8-argument version from 20261006120000, same change)
-- P1425 review round 3: two holes in the per-key compare-and-set.
--
-- 1. A CLAIM DID NOT CHECK THE SCHEDULE. A cron tick reads a row, the host moves (or cancels) the
--    event and the update handler finishes its reset, and only THEN the tick claims from its old
--    read — the key is absent again, so the claim succeeded, the email went out for the OLD time,
--    and its stored id then blocked the correct one. p_scheduled_for makes the claim atomic with
--    the schedule it was computed from: reminder/feedback must still have that *_scheduled_at,
--    starting_soon must still have that events.datetime, and the event must not be cancelled.
--
-- 2. THE SEND-LOG REPAIR MATCHED BY TIME. A stuck claim is repaired from email_send_log when its
--    send was recorded; "a sent row created after the claim" could be a DIFFERENT claim's send (an
--    old-schedule send that finished late), which then suppressed the replacement for good.
--    email_send_log.claim_token records which claim a send belongs to, so repair matches exactly.

ALTER TABLE public.email_send_log
  ADD COLUMN IF NOT EXISTS claim_token timestamptz;

COMMENT ON COLUMN public.email_send_log.claim_token IS
  'P1425: the *_attempted_at token of the event_rsvps claim this send was made under (reminder, feedback, starting_soon). Lets a stuck claim be repaired from the log without mistaking another claim''s send for its own.';

DROP FUNCTION IF EXISTS public.set_rsvp_message_ids(uuid, text, text, jsonb, boolean, timestamptz, boolean, timestamptz);

CREATE FUNCTION public.set_rsvp_message_ids(
  p_rsvp_id uuid,
  p_key text,
  p_expected text,
  p_patch jsonb,
  p_set_attempted boolean DEFAULT false,
  p_attempted_at timestamptz DEFAULT NULL,
  p_match_attempted boolean DEFAULT false,
  p_attempted_was timestamptz DEFAULT NULL,
  p_scheduled_for timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF p_key IS NULL OR p_key NOT IN ('reminder', 'feedback', 'starting_soon') THEN
    RAISE EXCEPTION 'set_rsvp_message_ids: unknown key %', p_key USING ERRCODE = '22023';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'set_rsvp_message_ids: patch must be a json object' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(p_patch) e
     WHERE e.key NOT IN ('reminder', 'feedback', 'starting_soon', 'starting_soon_for')
        OR jsonb_typeof(e.value) NOT IN ('string', 'null')
  ) THEN
    RAISE EXCEPTION 'set_rsvp_message_ids: patch may only set known keys to a string or null'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.event_rsvps r
     SET mailgun_message_ids =
           (CASE WHEN jsonb_typeof(r.mailgun_message_ids) = 'object'
                 THEN r.mailgun_message_ids ELSE '{}'::jsonb END
             - ARRAY(SELECT e.key FROM jsonb_each(p_patch) e WHERE jsonb_typeof(e.value) = 'null'))
           || jsonb_strip_nulls(p_patch),
         reminder_attempted_at = CASE WHEN p_set_attempted AND p_key = 'reminder'
                                      THEN p_attempted_at ELSE r.reminder_attempted_at END,
         feedback_attempted_at = CASE WHEN p_set_attempted AND p_key = 'feedback'
                                      THEN p_attempted_at ELSE r.feedback_attempted_at END,
         starting_soon_attempted_at = CASE WHEN p_set_attempted AND p_key = 'starting_soon'
                                           THEN p_attempted_at ELSE r.starting_soon_attempted_at END
   WHERE r.id = p_rsvp_id
     AND (r.mailgun_message_ids ->> p_key) IS NOT DISTINCT FROM p_expected
     AND (NOT p_match_attempted
          OR (CASE p_key WHEN 'reminder' THEN r.reminder_attempted_at
                         WHEN 'feedback' THEN r.feedback_attempted_at
                         ELSE r.starting_soon_attempted_at END) IS NOT DISTINCT FROM p_attempted_was)
     AND (p_scheduled_for IS NULL OR (
          EXISTS (SELECT 1 FROM public.events ev
                   WHERE ev.id = r.event_id
                     AND ev.status IS DISTINCT FROM 'cancelled'
                     AND (CASE p_key WHEN 'reminder' THEN r.reminder_scheduled_at
                                     WHEN 'feedback' THEN r.feedback_scheduled_at
                                     ELSE ev.datetime END) = p_scheduled_for)));

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

COMMENT ON FUNCTION public.set_rsvp_message_ids(uuid, text, text, jsonb, boolean, timestamptz, boolean, timestamptz, timestamptz) IS
  'P1425: per-key compare-and-set on event_rsvps.mailgun_message_ids; with p_scheduled_for, a claim also requires the schedule it was computed from to still hold and the event not to be cancelled. The only writer of that column.';

REVOKE EXECUTE ON FUNCTION public.set_rsvp_message_ids(uuid, text, text, jsonb, boolean, timestamptz, boolean, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_rsvp_message_ids(uuid, text, text, jsonb, boolean, timestamptz, boolean, timestamptz, timestamptz) TO service_role;
