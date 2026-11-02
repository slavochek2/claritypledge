-- Migration: P1494 — taking over an abandoned guest seat starts a new session under the room code
-- Spec: features/p1494_fresh_room_on_seat_takeover.md
-- Reproduced by: e2e/integration/p1494-fresh-room-on-seat-takeover.spec.ts
--
-- diffed against: 20261014200000_p1493_b_left_seat_stays_closed.sql (claim_joiner_seat —
--   signature, RETURNS TABLE, SECURITY DEFINER, search_path, grants, every guard and the
--   projection are unchanged; the SELECT reads more creator fields, and one branch is added
--   after the last guard for the takeover case. Every other path is the previous UPDATE.)
--
-- deploy order: requires-frontend. The creator's open tab must follow the new session id for its
--   code, and a guest tab must treat a code that now resolves elsewhere as a lost seat; a client
--   without that stays on the finished session. Stamp this file with the
--   `-- requires-frontend: <sha>` marker (scripts/migrate.sh) once the client commit exists.
--   The reverse order is harmless: the new client behaves as before against the old function.
--
-- WHAT THIS DOES
--   When a seat that shows no presence for 15 minutes is claimed by a caller who does not hold
--   its credential, the claim no longer re-uses the finished conversation's row. In one
--   transaction:
--     1. the old row is ended (ended_at, status 'completed'), drops its seat credential and takes
--        a freshly minted code that is never published; its live_state, turns and the rest of its
--        history stay on it, readable by the creator;
--     2. a new row is inserted under the room code, carrying the creator's fields and settings,
--        default live state, and the new seat;
--     3. pointers that resolve a room code through a session (practice rooms, sub-rooms, open
--        invites) are re-pointed at the new row;
--     4. the new row is returned with the same column list as before.
--   `code` stays UNIQUE, so every code-keyed lookup keeps returning exactly one row. A caller
--   that holds the seat credential, a first claim on an empty seat, and a signed-in participant
--   reclaiming their own seat all behave exactly as before.

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
  -- Creator fields and settings the successor row carries (rollover only).
  v_creator_name       text;
  v_creator_note       text;
  v_creator_profile_id uuid;
  v_is_private         boolean;
  v_mode               text;
  v_expires_at         timestamptz;
  v_source_letter_id   uuid;
  v_source_story_id    uuid;
  v_status             text;
  v_presence   timestamptz;
  v_secret_ok  boolean;
  v_abandoned  boolean;
  v_new_secret uuid;
  v_new_id     uuid;
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
         s.joiner_seat_claimed_at, s.joiner_last_seen_at, s.joiner_seat_secret, s.live_state,
         s.creator_name, s.creator_note, s.creator_profile_id, s.is_private, s.mode,
         s.expires_at, s.source_letter_id, s.source_story_id, s.status
    INTO v_id, v_ended_at, v_target_listener_id, v_joiner_profile_id,
         v_seat_claimed_at, v_last_seen_at, v_seat_secret, v_live_state,
         v_creator_name, v_creator_note, v_creator_profile_id, v_is_private, v_mode,
         v_expires_at, v_source_letter_id, v_source_story_id, v_status
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
  -- A legacy seat (claimed before P1269) has no joiner_last_seen_at, so presence falls back to
  -- its claim time. Both operands can still be NULL for an UNCLAIMED seat, in which case
  -- v_abandoned is NULL — handled by only ever consulting it under
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
  --       it is not a reclaim, it is a free seat (and, from P1494, a new session: see below).
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

  -- ── P1494: a seat that was held and went quiet is handed to a new session ───────────────
  -- The guards above have already admitted this caller. What is left to decide is whether the
  -- claim continues the conversation held in this row or starts a new one. It continues when the
  -- seat was never held, or the caller holds its credential (the reload case, including a
  -- credentialed return after the quiet period). It starts a new one when the seat was held, has
  -- shown no presence for 15 minutes, and the caller holds no valid credential: the occupant is
  -- indistinguishable from a newcomer, and nothing of the finished conversation may travel with
  -- the seat. v_abandoned is NULL-safe here for the reason stated at its definition.
  IF v_seat_claimed_at IS NOT NULL
     AND v_abandoned IS TRUE
     AND NOT v_secret_ok
     AND v_joiner_profile_id IS NULL
  THEN
    -- 1. Finish the old row. It gives up the room code first (code is UNIQUE and the successor
    --    takes it), moving to a freshly minted one that no client can read or look up. Its
    --    credential is dropped so the previous holder's secret authorizes nothing on it.
    --    live_state and joiner_name stay: they are the creator's history.
    UPDATE public.clarity_sessions s
       SET code               = public.mint_clarity_room_code(),
           ended_at           = now(),
           status             = 'completed',
           joiner_seat_secret = NULL
     WHERE s.id = v_id;

    -- 2. The successor takes the room code (supplied explicitly: the BEFORE INSERT trigger
    --    respects a supplied code and only mints when it is NULL). Fields not listed take the
    --    column defaults a fresh creation gets (state, live_state, created_at). The creator's
    --    identity and the room's settings are carried over; the conversation is not.
    INSERT INTO public.clarity_sessions AS s (
      code, creator_name, creator_note, creator_profile_id, is_private, mode, expires_at,
      source_letter_id, source_story_id, target_listener_id, status,
      demo_status, partnership_status, last_activity_at,
      joiner_name, joiner_profile_id, joiner_seat_claimed_at, joiner_last_seen_at,
      joiner_seat_secret
    ) VALUES (
      upper(btrim(p_code)), v_creator_name, v_creator_note, v_creator_profile_id, v_is_private,
      v_mode, v_expires_at, v_source_letter_id, v_source_story_id, v_target_listener_id, v_status,
      'waiting', 'pending', now(),
      btrim(p_joiner_name), auth.uid(), now(), now(),
      v_new_secret
    )
    RETURNING s.id INTO v_new_id;

    -- 3. Pointers that resolve a room code THROUGH a session follow the code to the successor.
    --    History rows (turns, rounds, ideas, transcripts, badge points, verifications, member
    --    rows) deliberately stay on the finished row.
    UPDATE public.event_practice_rooms r SET session_id = v_new_id WHERE r.session_id = v_id;
    UPDATE public.event_sub_rooms r SET session_id = v_new_id WHERE r.session_id = v_id;
    UPDATE public.clarity_live_invites i
       SET session_id = v_new_id
     WHERE i.session_id = v_id AND i.closed_at IS NULL;

    -- 4. Same explicit column list as the ordinary path.
    RETURN QUERY
    SELECT s.id, s.creator_name, s.creator_note, s.joiner_name, s.joiner_profile_id,
           s.creator_profile_id, s.state, s.demo_status, s.partnership_status, s.created_at,
           s.expires_at, s.ended_at, s.mode, s.live_state, s.is_private, s.last_activity_at,
           s.source_letter_id, s.source_story_id, s.target_listener_id, s.status,
           s.joiner_seat_claimed_at, s.joiner_seat_secret
      FROM public.clarity_sessions s
     WHERE s.id = v_new_id;
    RETURN;
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
    RAISE EXCEPTION 'P1494: claim_joiner_seat lost the left-seat guard (P1493b)';
  END IF;
  IF position('mint_clarity_room_code' in v_src) = 0
     OR position('event_practice_rooms' in v_src) = 0 THEN
    RAISE EXCEPTION 'P1494: claim_joiner_seat does not start a new session on a takeover';
  END IF;
  IF NOT has_function_privilege('anon', 'public.claim_joiner_seat(text, text, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.claim_joiner_seat(text, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1494: a client role lost EXECUTE on claim_joiner_seat';
  END IF;
  IF has_function_privilege('anon', 'public.mint_clarity_room_code(integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1494: anon can EXECUTE mint_clarity_room_code';
  END IF;
  RAISE NOTICE 'P1494: a takeover of an abandoned seat starts a new session under the room code.';
END
$$;
