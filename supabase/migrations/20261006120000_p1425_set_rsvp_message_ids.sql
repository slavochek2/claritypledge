-- client-safe: new function only; the REVOKE lines withhold it from anon/authenticated, which have never had it. No column or policy changes.
-- new functions: set_rsvp_message_ids (no prior definition to diff against)
-- P1425: per-key compare-and-set on event_rsvps.mailgun_message_ids.
--
-- WHY. mailgun_message_ids is ONE jsonb object shared by every scheduled email kind
-- (reminder, feedback, starting_soon + starting_soon_for). Every edge-function writer used to
-- read the row, spread the object it had read, change its own key and write the WHOLE object
-- back. A writer holding an older read therefore erased whatever another writer had set since.
-- In production (2026-10-03) the feedback claim erased the reminder id the reminder dispatch had
-- just written, every 30-minute tick, so one attendee received the same reminder 13 times.
--
-- THE CONTRACT. A caller names ONE key it owns (p_key) and the value it believes that key holds
-- (p_expected, NULL = absent). The UPDATE applies only if that is still true, and changes only the
-- keys in p_patch: a string value sets the key, a JSON null removes it. Keys not named in p_patch
-- are never touched, so no caller can erase a sibling's id however stale its read is.
-- Optionally it stamps the kind's *_attempted_at column (p_set_attempted) and/or also requires
-- that column to still hold p_attempted_was (p_match_attempted, used for stuck-claim takeover).
--
-- Returns true iff exactly one row was changed. Callers treat false as "someone else holds it".
--
-- service_role only: edge functions call it with the service-role client. Nothing in the browser
-- writes message ids, and an authenticated caller able to clear a key could trigger a re-send.

CREATE OR REPLACE FUNCTION public.set_rsvp_message_ids(
  p_rsvp_id uuid,
  p_key text,
  p_expected text,
  p_patch jsonb,
  p_set_attempted boolean DEFAULT false,
  p_attempted_at timestamptz DEFAULT NULL,
  p_match_attempted boolean DEFAULT false,
  p_attempted_was timestamptz DEFAULT NULL
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
                         ELSE r.starting_soon_attempted_at END) IS NOT DISTINCT FROM p_attempted_was);

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

COMMENT ON FUNCTION public.set_rsvp_message_ids(uuid, text, text, jsonb, boolean, timestamptz, boolean, timestamptz) IS
  'P1425: per-key compare-and-set on event_rsvps.mailgun_message_ids. The only sanctioned writer of that column besides send-event-emails handleUpdate''s deliberate reset.';

REVOKE EXECUTE ON FUNCTION public.set_rsvp_message_ids(uuid, text, text, jsonb, boolean, timestamptz, boolean, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_rsvp_message_ids(uuid, text, text, jsonb, boolean, timestamptz, boolean, timestamptz) TO service_role;
