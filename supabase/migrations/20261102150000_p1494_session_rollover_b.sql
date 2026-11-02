-- Migration: P1494 (b) — the new session is private; expired rooms do not roll over; retry refuses private
-- Spec: features/p1494_fresh_room_on_seat_takeover.md
-- Reproduced by: e2e/integration/p1494-fresh-room-on-seat-takeover.spec.ts
--
-- diffed against: 20261102130000_p1494_session_rollover.sql (claim_joiner_seat — signature,
--   RETURNS TABLE, SECURITY DEFINER, search_path, grants and every guard are unchanged; the
--   takeover arm inserts the new row with is_private = true instead of copying it, and refuses
--   with the usual 42501 when the room's expires_at is set and past)
-- diffed against: 20260901230000_p1223_pin_search_path_definer_functions.sql (retry_transcription —
--   body unchanged except one refusal for a private session, the refusal create_transcription_job
--   already makes)
--
-- client-safe: refuses more calls with errors the same functions already return; no signature,
--   grant, policy or column change. Deploy order: with or after 20261102130000 (the client
--   that follows a rollover is already required by that migration).
--
-- WHAT THIS DOES
--   Room audio is stored under the room code, and the transcription worker reads everything under
--   it. A new session opened under the same code would therefore be transcribed from the previous
--   conversation's audio. The new session is private, so no transcription job can be created for
--   it and no transcript can be stored (create_transcription_job and the transcript insert trigger
--   already refuse private sessions; retry_transcription now does too).

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
         s.creator_name, s.creator_note, s.creator_profile_id, s.mode,
         s.expires_at, s.source_letter_id, s.source_story_id, s.status
    INTO v_id, v_ended_at, v_target_listener_id, v_joiner_profile_id,
         v_seat_claimed_at, v_last_seen_at, v_seat_secret, v_live_state,
         v_creator_name, v_creator_note, v_creator_profile_id, v_mode,
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
    -- A room whose window has passed does not continue as a new session. Only this arm asks:
    -- every other path is exactly as before.
    IF v_expires_at IS NOT NULL AND v_expires_at < now() THEN
      RAISE LOG 'claim_joiner_seat: session % expired, no new session opened', v_id;
      RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
    END IF;

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
    --    identity and the room's settings are carried over; the conversation is not. The new row
    --    is private whatever the old one was: the room's audio is stored under the room code, so
    --    a recording started in the old conversation must not be transcribed for this one.
    INSERT INTO public.clarity_sessions AS s (
      code, creator_name, creator_note, creator_profile_id, is_private, mode, expires_at,
      source_letter_id, source_story_id, target_listener_id, status,
      demo_status, partnership_status, last_activity_at,
      joiner_name, joiner_profile_id, joiner_seat_claimed_at, joiner_last_seen_at,
      joiner_seat_secret
    ) VALUES (
      upper(btrim(p_code)), v_creator_name, v_creator_note, v_creator_profile_id, true,
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

CREATE OR REPLACE FUNCTION public.retry_transcription(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_code TEXT;
  v_last_retry TIMESTAMPTZ;
BEGIN
  -- Verify caller is a participant
  IF NOT EXISTS (
    SELECT 1 FROM public.clarity_sessions
    WHERE id = p_session_id
      AND (creator_profile_id = auth.uid() OR joiner_profile_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not a participant of this session';
  END IF;

  -- Block private sessions (same refusal as create_transcription_job)
  IF EXISTS (
    SELECT 1 FROM public.clarity_sessions
    WHERE id = p_session_id AND is_private
  ) THEN
    RAISE EXCEPTION 'Cannot create transcription job for private session';
  END IF;

  -- Rate limit: 5 minutes between retries
  SELECT MAX(created_at) INTO v_last_retry
  FROM public.transcription_jobs
  WHERE session_id = p_session_id AND status = 'pending';

  IF v_last_retry IS NOT NULL AND v_last_retry > now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'Please wait 5 minutes before retrying';
  END IF;

  -- Get session code
  SELECT code INTO v_session_code
  FROM public.clarity_sessions
  WHERE id = p_session_id;

  -- Insert new pending job
  INSERT INTO public.transcription_jobs (session_id, session_code, status)
  VALUES (p_session_id, v_session_code, 'pending');
END;
$$;

REVOKE ALL ON FUNCTION public.retry_transcription(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.retry_transcription(uuid) TO authenticated;


-- Verification — fail loud.
DO $$
DECLARE
  v_claim text;
  v_retry text;
BEGIN
  SELECT prosrc INTO v_claim FROM pg_proc WHERE oid = 'public.claim_joiner_seat(text, text, uuid)'::regprocedure;
  SELECT prosrc INTO v_retry FROM pg_proc WHERE oid = 'public.retry_transcription(uuid)'::regprocedure;
  IF position('was left by its occupant' in v_claim) = 0 OR position('mint_clarity_room_code' in v_claim) = 0 THEN
    RAISE EXCEPTION 'P1494b: claim_joiner_seat lost the P1493 guard or the takeover branch';
  END IF;
  IF position('no new session opened' in v_claim) = 0 THEN
    RAISE EXCEPTION 'P1494b: claim_joiner_seat does not refuse the takeover of an expired room';
  END IF;
  IF v_claim ~ 'v_is_private' THEN
    RAISE EXCEPTION 'P1494b: claim_joiner_seat still copies is_private from the old row';
  END IF;
  IF position('Cannot create transcription job for private session' in v_retry) = 0 THEN
    RAISE EXCEPTION 'P1494b: retry_transcription does not refuse private sessions';
  END IF;
  IF NOT has_function_privilege('anon', 'public.claim_joiner_seat(text, text, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.claim_joiner_seat(text, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1494b: a client role lost EXECUTE on claim_joiner_seat';
  END IF;
  IF has_function_privilege('anon', 'public.retry_transcription(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.retry_transcription(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1494b: retry_transcription grants drifted';
  END IF;
  RAISE NOTICE 'P1494b: new sessions are private, expired rooms do not roll over, retry refuses private.';
END
$$;
