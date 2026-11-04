-- P1529: the owner-has-canvas refusal keeps its first wording; the person's name moves to DETAIL.
-- client-safe: same trigger function, same refusal condition.
-- diffed against: 20261105200000_p1529_review_fixes_2.sql (_event_round_seats_owner_has_canvas).
BEGIN;
CREATE OR REPLACE FUNCTION public._event_round_seats_owner_has_canvas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event uuid;
  v_showcase boolean;
  v_profile uuid;
  v_name text;
BEGIN
  IF NEW.role <> 'first' THEN
    RETURN NEW;
  END IF;
  SELECT r.event_id, COALESCE(r.showcase, false) INTO v_event, v_showcase
    FROM public.event_rounds r WHERE r.id = NEW.round_id;
  IF v_showcase OR public._event_flow(v_event) <> 'sales-mastermind' THEN
    RETURN NEW;
  END IF;
  -- Already the owner this round: moving someone else must not fail because this owner later stopped sharing.
  IF EXISTS (SELECT 1 FROM public.event_round_seats s
              WHERE s.round_id = NEW.round_id AND s.room_member_id = NEW.room_member_id AND s.role = 'first') THEN
    RETURN NEW;
  END IF;
  SELECT m.profile_id, m.display_name INTO v_profile, v_name FROM public.event_room_members m WHERE m.id = NEW.room_member_id;
  IF v_profile IS NULL OR NOT public._event_canvas_shared(v_event, v_profile) THEN
    RAISE EXCEPTION 'a Clarity Canvas owner needs a canvas shared with this event'
      USING ERRCODE = '22023', DETAIL = COALESCE(v_name, '');
  END IF;
  RETURN NEW;
END;
$$;
COMMIT;
