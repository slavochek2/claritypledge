-- Migration: P1493 (b) — a seat its occupant has left cannot be claimed again
-- Created: 2026-10-14
-- Spec: features/p1493_session_read_scope.md
-- Reproduced by: e2e/integration/20261014200000_p1493_b_left_seat_stays_closed.spec.ts
-- Founder decision 2026-10-14: "seat closes".
--
-- diffed against: 20260911090000_p1269_guest_seat_secret_and_presence.sql (claim_joiner_seat —
--   signature, RETURNS TABLE, SECURITY DEFINER, search_path, grants and every existing guard are
--   unchanged; one refusal is added after F1 and live_state joins the guard's read set)
-- client-safe: refuses one more claim with the error every other refused claim already returns;
--   no signature, grant, policy or column change.
--
-- WHAT THIS DOES
--   Once the occupant of a room's joiner seat has left it, the seat stays closed: no other caller
--   can claim it. Joining an open seat for the first time, and the seated guest reclaiming its own
--   seat (reload), are unchanged.

CREATE OR REPLACE FUNCTION public.claim_joiner_seat(
  p_code        text,
  p_joiner_name text,
  p_seat_secret uuid DEFAULT NULL
)
RETURNS TABLE (
  id                     uuid,
  creator_name           text,
  creator_note           text,
  joiner_name            text,
  joiner_profile_id      uuid,
  creator_profile_id     uuid,
  state                  jsonb,
  demo_status            text,
  partnership_status     text,
  created_at             timestamptz,
  expires_at             timestamptz,
  ended_at               timestamptz,
  mode                   text,
  live_state             jsonb,
  is_private             boolean,
  last_activity_at       timestamptz,
  source_letter_id       uuid,
  source_story_id        uuid,
  target_listener_id     uuid,
  status                 text,
  joiner_seat_claimed_at timestamptz,
  joiner_seat_secret     uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Named scalars, not a %ROWTYPE. P1057 bans star-projection inside a definer function on
  -- this table, and a row variable is how it creeps back in. (These comments deliberately do
  -- NOT spell the banned tokens: pg_proc.prosrc includes comments, so a guard that greps the
  -- installed source for them would trip on the note explaining why they are absent.)
  v_id                 uuid;
  v_ended_at           timestamptz;
  v_target_listener_id uuid;
  v_joiner_profile_id  uuid;
  v_seat_claimed_at    timestamptz;
  v_last_seen_at       timestamptz;
  v_seat_secret        uuid;
  v_live_state         jsonb;
  v_presence   timestamptz;
  v_secret_ok  boolean;
  v_abandoned  boolean;
  v_new_secret uuid;
BEGIN
  IF p_code IS NULL OR length(btrim(p_code)) <> 6 THEN
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  IF p_joiner_name IS NULL OR btrim(p_joiner_name) = '' THEN
    RAISE EXCEPTION 'joiner name is required' USING ERRCODE = '22023';
  END IF;

  -- P1057: no star-projection here, not even into a local variable. The row type is
  -- open-ended, so a future ADD COLUMN would silently widen what this function handles, and
  -- these fields are what every guard below is built from.
  SELECT s.id, s.ended_at, s.target_listener_id, s.joiner_profile_id,
         s.joiner_seat_claimed_at, s.joiner_last_seen_at, s.joiner_seat_secret, s.live_state
    INTO v_id, v_ended_at, v_target_listener_id, v_joiner_profile_id,
         v_seat_claimed_at, v_last_seen_at, v_seat_secret, v_live_state
    FROM public.clarity_sessions s
   WHERE s.code = upper(btrim(p_code))
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE LOG 'claim_joiner_seat: no room for code %', upper(btrim(p_code));
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  IF v_ended_at IS NOT NULL THEN
    RAISE LOG 'claim_joiner_seat: session % already ended', v_id;
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  -- F3: a session addressed to a specific listener is claimable only by that listener.
  IF v_target_listener_id IS NOT NULL
     AND auth.uid() IS DISTINCT FROM v_target_listener_id
  THEN
    RAISE LOG 'claim_joiner_seat: session % is addressed to %', v_id, v_target_listener_id;
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  -- F2: a recorded session is not joinable by a newcomer.
  IF (v_joiner_profile_id IS NULL OR v_joiner_profile_id IS DISTINCT FROM auth.uid())
     AND (
       EXISTS (SELECT 1 FROM public.session_transcripts t WHERE t.session_id = v_id)
       OR EXISTS (SELECT 1 FROM public.transcription_jobs j WHERE j.session_id = v_id)
     )
  THEN
    RAISE LOG 'claim_joiner_seat: session % already carries a recording', v_id;
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  -- ── P1269: presence and secret, computed once and NULL-safe by construction ────────────
  -- A legacy seat (claimed before this migration) has no joiner_last_seen_at, so presence
  -- falls back to its claim time. Both operands can still be NULL for an UNCLAIMED seat, in
  -- which case v_abandoned is NULL — handled by only ever consulting it under
  -- `joiner_seat_claimed_at IS NOT NULL`, below.
  v_presence := COALESCE(v_last_seen_at, v_seat_claimed_at);
  v_abandoned := v_presence IS NOT NULL AND v_presence < now() - interval '15 minutes';

  -- `IS NOT DISTINCT FROM` would make two NULLs equal, which would let a caller sending no
  -- secret match a seat holding no secret. Both sides are required to be present.
  v_secret_ok := p_seat_secret IS NOT NULL
                 AND v_seat_secret IS NOT NULL
                 AND p_seat_secret = v_seat_secret;

  -- Occupancy. A stamped seat is re-claimable by exactly three callers:
  --   (a) the seated SIGNED-IN participant (refresh, mic retry, rejoin prompt);
  --   (b) the seated GUEST presenting the seat secret minted when they claimed it;
  --   (c) anyone at all, once the seat has shown no presence for 15 minutes — at which point
  --       it is not a reclaim, it is a free seat.
  -- Arm (b) replaces P1053's name comparison. The name is no longer consulted anywhere in
  -- this function's authorization, which is the whole of P1269.
  --
  -- Every arm uses NULL-safe operators. A plain `=` against a nullable column here yields
  -- NULL, and plpgsql SKIPS an IF whose condition is NULL — a skipped refusal guard is an
  -- allow. That was P1053 F5, and arms (b) and (c) are pinned the same way.
  IF v_seat_claimed_at IS NOT NULL
     AND NOT (auth.uid() IS NOT NULL AND v_joiner_profile_id IS NOT DISTINCT FROM auth.uid())
     AND NOT (
       auth.uid() IS NULL
       AND v_joiner_profile_id IS NULL
       AND v_secret_ok
       AND NOT EXISTS (SELECT 1 FROM public.session_transcripts t WHERE t.session_id = v_id)
       AND NOT EXISTS (SELECT 1 FROM public.transcription_jobs j WHERE j.session_id = v_id)
     )
     AND NOT (
       v_joiner_profile_id IS NULL
       AND v_abandoned IS TRUE
       AND NOT EXISTS (SELECT 1 FROM public.session_transcripts t WHERE t.session_id = v_id)
       AND NOT EXISTS (SELECT 1 FROM public.transcription_jobs j WHERE j.session_id = v_id)
     )
  THEN
    RAISE LOG 'claim_joiner_seat: seat on session % already held', v_id;
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  -- F1: a vacated seat still carries whoever participated in it.
  IF v_joiner_profile_id IS NOT NULL
     AND v_joiner_profile_id IS DISTINCT FROM auth.uid()
  THEN
    RAISE LOG 'claim_joiner_seat: session % carries participant %', v_id, v_joiner_profile_id;
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  -- P1493 (seat closes): a seat its occupant has left stays closed. Only release_joiner_seat
  -- clears joiner_seat_claimed_at, and it leaves the presence stamp and the departure marker in
  -- place, so either one on an unclaimed seat means the seat was held and then given up. A
  -- signed-in participant returning to their own seat is unaffected (F1 above already keeps
  -- everyone else out of a seat that carries a profile).
  IF v_seat_claimed_at IS NULL
     AND (v_last_seen_at IS NOT NULL
          OR COALESCE(v_live_state ->> 'joinerEnded', '') = 'true')
     AND NOT (auth.uid() IS NOT NULL AND v_joiner_profile_id IS NOT DISTINCT FROM auth.uid())
  THEN
    RAISE LOG 'claim_joiner_seat: seat on session % was left by its occupant', v_id;
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  -- A guest who presented the right secret KEEPS it: re-minting on every reload would
  -- invalidate any other tab the same guest still has open. Every other guest claim — a first
  -- claim, or a claim on an abandoned seat — mints a fresh one, so the previous holder's
  -- secret stops working the moment their seat is taken.
  IF auth.uid() IS NULL THEN
    v_new_secret := CASE WHEN v_secret_ok THEN v_seat_secret ELSE gen_random_uuid() END;
  ELSE
    v_new_secret := NULL;  -- a signed-in seat is authorized by auth.uid(), never by a secret
  END IF;

  -- P1057: the UPDATE's returning clause is explicit for the same reason the projection
  -- above is — the row type is open-ended, so the next ADD COLUMN on this table would join the
  -- output of an anon-executable SECURITY DEFINER function unreviewed. The list below is
  -- P1057's own 21-column allowlist (get_session_by_code's RETURNS TABLE, verbatim) plus
  -- joiner_seat_secret, which the client needs and no client role may SELECT. `code` is absent
  -- and its absence is now a structural property of the function, visible in \df+.
  RETURN QUERY
  UPDATE public.clarity_sessions s
     SET joiner_name            = btrim(p_joiner_name),
         joiner_profile_id      = COALESCE(auth.uid(), s.joiner_profile_id),
         joiner_seat_claimed_at = now(),
         joiner_seat_secret     = v_new_secret,
         joiner_last_seen_at    = now()
   WHERE s.id = v_id
  RETURNING s.id, s.creator_name, s.creator_note, s.joiner_name, s.joiner_profile_id,
            s.creator_profile_id, s.state, s.demo_status, s.partnership_status, s.created_at,
            s.expires_at, s.ended_at, s.mode, s.live_state, s.is_private, s.last_activity_at,
            s.source_letter_id, s.source_story_id, s.target_listener_id, s.status,
            s.joiner_seat_claimed_at, s.joiner_seat_secret;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_joiner_seat(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_joiner_seat(text, text, uuid) TO anon, authenticated;

-- Verification — fail loud.
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.claim_joiner_seat(text, text, uuid)'::regprocedure;
  IF position('was left by its occupant' in v_src) = 0 THEN
    RAISE EXCEPTION 'P1493b: claim_joiner_seat does not keep a left seat closed';
  END IF;
  IF NOT has_function_privilege('anon', 'public.claim_joiner_seat(text, text, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.claim_joiner_seat(text, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1493b: a client role lost EXECUTE on claim_joiner_seat';
  END IF;
  RAISE NOTICE 'P1493b: a left seat stays closed.';
END
$$;
