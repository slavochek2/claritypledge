-- P1529 D24: a small waiting list for the sales mastermind (reverses D18's "no waitlist build", founder 2026-11-05).
--
-- new function: join_event_waitlist, leave_event_waitlist, get_event_waitlist
-- client-safe: one new table and three new functions. Nothing existing changes; no other flow can join a list.
--
-- Joining the list is not a seat: nothing here writes event_rsvps, and nothing promotes anyone automatically. The host raises
-- the limit by hand and writes to the people on the list. The answers are stored like a registration's, so a person who is
-- later given a place does not answer twice (the host reads them; the client only reads its own row).

BEGIN;

CREATE TABLE IF NOT EXISTS public.event_waitlist (
  id bigint GENERATED ALWAYS AS IDENTITY,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  participation text NOT NULL CHECK (participation IN ('canvas_before', 'canvas_at_doors', 'observer')),
  observer_prep text CHECK (observer_prep IS NULL OR observer_prep IN ('home', 'doors')),
  phone text NOT NULL CHECK (phone IN ('usbc', 'lightning', 'other')),
  hope text CHECK (hope IS NULL OR length(hope) <= 500),
  recording_accepted_at timestamptz NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, profile_id),
  CHECK (observer_prep IS NULL OR participation = 'observer')
);
CREATE INDEX IF NOT EXISTS event_waitlist_order ON public.event_waitlist (event_id, joined_at, id);
COMMENT ON TABLE public.event_waitlist IS
  'P1529 D24: people waiting for a place at a full event of the sales-mastermind flow. Written by join_event_waitlist / leave_event_waitlist only; not a seat.';

ALTER TABLE public.event_waitlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_waitlist FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.event_waitlist TO authenticated;
DROP POLICY IF EXISTS "own or host reads the waiting list" ON public.event_waitlist;
CREATE POLICY "own or host reads the waiting list" ON public.event_waitlist
  FOR SELECT TO authenticated
  USING (
    profile_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.host_id = (SELECT auth.uid()))
  );

-- Returns 'ok' (on the list), 'already' (answers updated), 'registered' (this person already has a place), 'not_full'
-- (a place is free: register instead, and the list is not used), 'cancelled' or 'not_found'. A refused recording acceptance,
-- an observer without the second answer, or a malformed answer raises 22023 / 23514 and saves nothing.
CREATE OR REPLACE FUNCTION public.join_event_waitlist(
  p_slug text, p_participation text, p_phone text, p_hope text, p_recording_accepted boolean, p_observer_prep text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event public.events%ROWTYPE;
  v_already boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in to join the waiting list' USING ERRCODE = '42501';
  END IF;
  IF p_recording_accepted IS NOT TRUE THEN
    RAISE EXCEPTION 'accepting transcription is a condition of this event' USING ERRCODE = '22023';
  END IF;
  IF p_participation = 'observer' AND p_observer_prep IS NULL THEN
    RAISE EXCEPTION 'choose where you will prepare' USING ERRCODE = '22023';
  END IF;
  -- The same row lock register_for_event takes: a registration and a join cannot both read "full" and "free".
  SELECT * INTO v_event FROM public.events e WHERE e.slug = p_slug FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF public._event_flow(v_event.id) <> 'sales-mastermind' THEN
    RAISE EXCEPTION 'this event has no waiting list' USING ERRCODE = '22023';
  END IF;
  IF v_event.status = 'cancelled' THEN
    RETURN 'cancelled';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = v_event.id AND r.profile_id = v_uid) THEN
    RETURN 'registered';
  END IF;
  -- The host's own place never counts toward the limit (register_for_event), so the host is never "full".
  IF v_uid = v_event.host_id OR v_event.max_attendees IS NULL
     OR (SELECT count(*) FROM public.event_rsvps r
          WHERE r.event_id = v_event.id AND r.profile_id IS DISTINCT FROM v_event.host_id) < v_event.max_attendees THEN
    RETURN 'not_full';
  END IF;

  v_already := EXISTS (SELECT 1 FROM public.event_waitlist w WHERE w.event_id = v_event.id AND w.profile_id = v_uid);
  INSERT INTO public.event_waitlist AS w
    (event_id, profile_id, participation, observer_prep, phone, hope, recording_accepted_at)
  VALUES (v_event.id, v_uid, p_participation,
          CASE WHEN p_participation = 'observer' THEN p_observer_prep END,
          p_phone, NULLIF(btrim(COALESCE(p_hope, '')), ''), now())
  ON CONFLICT (event_id, profile_id) DO UPDATE
    SET participation = EXCLUDED.participation, observer_prep = EXCLUDED.observer_prep, phone = EXCLUDED.phone,
        hope = EXCLUDED.hope, recording_accepted_at = EXCLUDED.recording_accepted_at;
  RETURN CASE WHEN v_already THEN 'already' ELSE 'ok' END;
END;
$$;
REVOKE ALL ON FUNCTION public.join_event_waitlist(text, text, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_event_waitlist(text, text, text, text, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_event_waitlist(p_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.event_waitlist w
   USING public.events e
   WHERE e.slug = p_slug AND w.event_id = e.id AND w.profile_id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.leave_event_waitlist(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_event_waitlist(text) TO authenticated;

-- The host's list, in the order people joined. Names only; the answers stay in the table for the host's own reads.
CREATE OR REPLACE FUNCTION public.get_event_waitlist(p_event uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event AND e.host_id = (SELECT auth.uid())) THEN
    RAISE EXCEPTION 'host only' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('profile_id', w.profile_id, 'name', COALESCE(p.name, 'Someone'), 'joined_at', w.joined_at)
                     ORDER BY w.joined_at, w.id)
      FROM public.event_waitlist w
      LEFT JOIN public.profiles p ON p.id = w.profile_id
     WHERE w.event_id = p_event
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.get_event_waitlist(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_waitlist(uuid) TO authenticated;

COMMIT;
