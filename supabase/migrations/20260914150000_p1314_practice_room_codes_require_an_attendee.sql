-- P1314 (D): the event room's registration wall exists in the browser only.
--
-- diffed against: 20260817140000_p1057_session_read_rpcs.sql
-- Changes vs that definition: adds the signed-out guard and the registrant/host predicate.
-- The RETURNS TABLE shape, the SECURITY DEFINER/search_path settings, the final SELECT and
-- the grant are carried over BYTE-FOR-BYTE — P1057 chose that explicit column list precisely
-- so `code` could never rejoin the output unreviewed, and this migration does not relax it.
--
-- get_practice_room_codes applied NO authorization of any kind. SECURITY DEFINER, granted to
-- anon, it returned every active practice room's code for whatever event_id it was handed. The
-- anon key it needs ships in the public JavaScript bundle and event ids are public, so the wall
-- that EventRoomGate renders constrained the product experience and nothing else. Measured on
-- test 2026-09-14: an anonymous caller with no account received a live room code (HTTP 200),
-- while the same caller against get_room_code_for_invite — which IS restricted to authenticated
-- — was refused (HTTP 401 permission denied). One executes, one does not; the 200 was a real
-- grant, not an artefact of the probe.
--
-- This is a gap between two recorded decisions, not a decision:
--   2026-08-17  P1057 D-A  — practice room codes stay published to every event-page visitor.
--                            This is why the grant is open to anon.
--   2026-08-20  P1114 rev2 — "gate + split pages, retire the anon room surface". The product
--                            decision was reversed three days later. The grant was not.
-- This migration brings the grant along. It implements the August decision; it does not make a
-- new one.
--
-- THE PREDICATE MIRRORS THE UI, IT DOES NOT INVENT A STRICTER RULE.
-- EventRoomAccess.tsx: `granted: isLoggedIn && (isRegistered || isHost)`, where isRegistered is a
-- row in event_rsvps for (event, profile) and isHost is events.host_id = the caller. The three
-- arms below are that sentence, in SQL. If the UI lets someone in, the database must too — a
-- database rule stricter than the wall it mirrors is a new product decision wearing a bug fix.
--
-- WHY THE anon GRANT STAYS.
-- Revoking it would make an unauthorized call a distinguishable ERROR. P1057 set the opposite
-- rule for this table's read path — "unknown code, ended session and expired grace all return the
-- SAME empty result, never a distinguishable error" — because the error itself is an oracle. The
-- predicate returns zero rows instead, which is also what the one UI caller already handles:
-- PracticeRooms.tsx guards `if (!room.sessionCode) return;` and disables the launch control.
--
-- NO FALSE POSITIVE FOR A LEGITIMATE CALLER (epistemic gate 7c).
-- getPracticeRooms has exactly one UI call site: PracticeRooms.tsx, rendered only by
-- EventRoomMeet.tsx — i.e. /events/:slug/meet, behind the gate. P1114 moved it off the public
-- event page deliberately and src/tests/p1114-room-composition.test.tsx asserts EventDetail no
-- longer renders it. So every legitimate caller of this function is already past the wall this
-- predicate enforces.
--
-- client-safe: narrows a read. No client breaks: the sole caller already treats a missing code as
-- a disabled control, and an unauthorized caller now receives an empty list rather than an error.
-- No existing object, grant, policy or column is dropped or altered.

CREATE OR REPLACE FUNCTION public.get_practice_room_codes(p_event_id uuid)
RETURNS TABLE (
  room_id uuid,
  code    text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_event_id IS NULL THEN
    RETURN;
  END IF;

  -- Signed out is never granted: EventRoomAccess requires isLoggedIn before either arm.
  -- Written as an explicit guard rather than folded into the EXISTS below, so that a future
  -- edit to the arms cannot accidentally make an anonymous caller eligible.
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  -- Every table qualified with public. — inside SECURITY DEFINER an unqualified relation can be
  -- shadowed by a session temp table through pg_temp, which precedes the search_path (P1292).
  IF NOT EXISTS (
        SELECT 1 FROM public.event_rsvps r
         WHERE r.event_id = p_event_id AND r.profile_id = auth.uid()
      )
     AND NOT EXISTS (
        SELECT 1 FROM public.events e
         WHERE e.id = p_event_id AND e.host_id = auth.uid()
      )
  THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT r.id, s.code
    FROM public.event_practice_rooms r
    JOIN public.clarity_sessions s ON s.id = r.session_id
   WHERE r.event_id = p_event_id
     AND r.status IN ('waiting', 'active')
     AND r.expires_at > now();
END;
$$;

-- Grant unchanged and restated, so a reader of this file alone knows the surface it leaves.
REVOKE ALL ON FUNCTION public.get_practice_room_codes(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_practice_room_codes(uuid) TO anon, authenticated;

DO $$
DECLARE
  v_src text;
BEGIN
  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_practice_room_codes';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'P1314: get_practice_room_codes is missing after this migration';
  END IF;

  -- The three properties this migration exists to establish. Asserted against the INSTALLED
  -- source, not the file, so a later CREATE OR REPLACE that drops one is caught here rather
  -- than by someone re-running the reproduction by hand.
  IF v_src !~ 'auth\.uid\(\) IS NULL' THEN
    RAISE EXCEPTION 'P1314: the signed-out guard is gone — an anonymous caller can read room codes again';
  END IF;
  IF v_src !~ 'public\.event_rsvps' THEN
    RAISE EXCEPTION 'P1314: the registration arm is gone — the predicate no longer mirrors EventRoomGate';
  END IF;
  IF v_src !~ 'public\.events' THEN
    RAISE EXCEPTION 'P1314: the host arm is gone — an event host would be locked out of their own room';
  END IF;

  -- P1057's standing rule for this table's definer reads, restated as an assertion because
  -- P1269 relaxed it on a sibling function and nothing caught that either.
  IF v_src ~ 'SELECT[[:space:]]+\*' OR v_src ~ 'RETURNING[[:space:]]+\*' THEN
    RAISE EXCEPTION 'P1314: SELECT */RETURNING * reintroduced — a future ADD COLUMN would join the anon output unreviewed (P1057)';
  END IF;

  IF NOT has_function_privilege('anon', 'public.get_practice_room_codes(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1314: the anon grant was dropped — an unauthorized call must return empty, not a distinguishable error (P1057)';
  END IF;

  RAISE NOTICE 'P1314 D: practice room codes now require a signed-in registrant or the event host.';
END;
$$;
