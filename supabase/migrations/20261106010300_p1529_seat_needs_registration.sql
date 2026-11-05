-- P1529 D24: in the sales mastermind nobody is seated without a registration, as Clarity Canvas owner, partner or observer.
--
-- new function: _event_round_seats_need_registration
-- client-safe: one new trigger on event_round_seats that returns at once for every flow but the sales mastermind, so Clarity
-- Night and Social Hike seat exactly as before. The host is exempt (the host is not an attendee, and registers for nothing).
--
-- Why a seat guard and not join_event_room: joining the room is open to anyone who can see the event (in this flow it is also
-- where preparation happens), and a registration is what carries the recording acceptance that a seat depends on. The seat
-- is the one place a person becomes part of a table, whoever put them there and by whichever path (host_start_round,
-- host_set_round_seats, a direct insert). The refusal names the person in DETAIL, like the owner-has-canvas refusal, and the
-- host screen shows both. A Demo round is not exempt: its tables are recorded like any other.
-- A person with no profile (a legacy walk-in room row) has no registration and is refused too.

BEGIN;

CREATE OR REPLACE FUNCTION public._event_round_seats_need_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event uuid;
  v_profile uuid;
  v_name text;
BEGIN
  SELECT r.event_id INTO v_event FROM public.event_rounds r WHERE r.id = NEW.round_id;
  IF v_event IS NULL OR public._event_flow(v_event) <> 'sales-mastermind' THEN
    RETURN NEW;
  END IF;
  SELECT m.profile_id, m.display_name INTO v_profile, v_name FROM public.event_room_members m WHERE m.id = NEW.room_member_id;
  IF v_profile IS NOT NULL AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = v_event AND e.host_id = v_profile) THEN
    RETURN NEW;
  END IF;
  IF v_profile IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = v_event AND r.profile_id = v_profile) THEN
    RAISE EXCEPTION 'A person who is not registered for this event cannot be seated'
      USING ERRCODE = '22023', DETAIL = COALESCE(v_name, '');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._event_round_seats_need_registration() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS event_round_seats_need_registration ON public.event_round_seats;
CREATE TRIGGER event_round_seats_need_registration BEFORE INSERT OR UPDATE OF room_member_id ON public.event_round_seats
  FOR EACH ROW EXECUTE FUNCTION public._event_round_seats_need_registration();

COMMIT;
