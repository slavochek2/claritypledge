-- Migration: P1493 — a session's state is read by its participants
-- Created: 2026-10-14
-- Spec: features/p1493_session_read_scope.md
-- Reproduced by: e2e/integration/20261014180000_p1493_session_reads_need_a_participant.spec.ts
-- Details: .private/docs/security-log.md, 2026-10-14, P1493.
--
-- diffed against: 20260817140000_p1057_session_read_rpcs.sql (get_session_by_code,
--   get_active_session_by_code — signature, RETURNS TABLE, SECURITY DEFINER, search_path, the
--   input bound and the code normalization are unchanged; the projection and row filter now
--   distinguish a participant from any other caller)
-- diffed against: 20260911120000_p1302_session_access_predicate.sql (can_read_clarity_session —
--   the room-code arm also asks for the occupied seat's credential; identity arms unchanged)
-- diffed against: 20260911120100_p1302_b_select_policy_reads_row_columns.sql
--   (clarity_sessions_select — same change, inlined; identity arms unchanged)
-- diffed against: feature/p1224-guest-seat-secret 20261014093000 (clarity_request_seat_secrets —
--   byte-identical body, so whichever of the two migrations lands first defines it)
-- new function: clarity_request_seat_secrets (internal; executable by no client role)
--
-- requires-frontend: 3fe728208bb6722a8c61e9da9a95726e05c400c9
--   Against this migration a bundle that does not present the seat credential loses a guest's view
--   of its own room, and its direct row writes match no row. Deploy the client first (src/app/data/api.ts,
--   src/app/data/seat-secret.ts) and leave at least one session length before applying. The
--   reverse order is harmless: the new client's extra header is ignored by the old database.
--
-- WHAT THIS DOES
--   A PARTICIPANT is the creator, the seated signed-in joiner, the named listener, or the seated
--   guest presenting the credential its seat claim returned (P1269) in the x-clarity-seat-secret
--   header — the same header and parse P1224 uses for guest writes.
--
--   * The two room lookups return the full row to a participant, ended sessions included (the
--     ended-session screens read it). Anyone else receives only the fields the pre-join screen
--     reads — id, creator_name, is_private; every other column NULL — and only while the session
--     has not ended. An ended session returns the same empty set as an unknown code, so the
--     lookup gains no new oracle.
--   * The row SELECT policy and can_read_clarity_session() (which the child tables inherit) admit
--     a request presenting the room code only when it also presents the occupied seat's
--     credential.
--   Return shapes and signatures are unchanged; deployed callers keep resolving.
--
-- WHAT DELIBERATELY DOES NOT CHANGE
--   Write authorization (P1224 owns it; note the client now presents the credential on a guest's
--   direct row writes too, because an UPDATE that filters on a column must also pass this SELECT
--   policy). Realtime (authorizes from the JWT alone).
--   Grants: both lookups stay anon-executable (P1057 D-A/D-B; scripts/anon-execute-allowlist.txt).
--   No rate limiter: see the spec, Risks.

-- ---------------------------------------------------------------------------
-- 1. The seat credentials this request presents. Internal. Body identical to P1224's.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clarity_request_seat_secrets()
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(
    SELECT lower(btrim(part))
      FROM unnest(string_to_array(
             left(COALESCE(
               NULLIF(current_setting('request.headers', true), '')::json ->> 'x-clarity-seat-secret',
               ''), 80),
             ',')) WITH ORDINALITY AS t(part, ord)
     WHERE lower(btrim(part)) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     ORDER BY ord
     LIMIT 2
  ), '{}'::text[]);
$$;

REVOKE ALL ON FUNCTION public.clarity_request_seat_secrets() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clarity_request_seat_secrets() FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. get_session_by_code — participant: full row; anyone else: pre-join fields of a live room.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_session_by_code(p_code text)
RETURNS TABLE (
  id uuid,
  creator_name text,
  creator_note text,
  joiner_name text,
  joiner_profile_id uuid,
  creator_profile_id uuid,
  state jsonb,
  demo_status text,
  partnership_status text,
  created_at timestamptz,
  expires_at timestamptz,
  ended_at timestamptz,
  mode text,
  live_state jsonb,
  is_private boolean,
  last_activity_at timestamptz,
  source_letter_id uuid,
  source_story_id uuid,
  target_listener_id uuid,
  status text,
  joiner_seat_claimed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Same bound + same silent refusal as claim_joiner_seat (P1057).
  IF p_code IS NULL OR length(btrim(p_code)) <> 6 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.id,
         s.creator_name,
         CASE WHEN a.party THEN s.creator_note END,
         CASE WHEN a.party THEN s.joiner_name END,
         CASE WHEN a.party THEN s.joiner_profile_id END,
         CASE WHEN a.party THEN s.creator_profile_id END,
         CASE WHEN a.party THEN s.state END,
         CASE WHEN a.party THEN s.demo_status END,
         CASE WHEN a.party THEN s.partnership_status END,
         CASE WHEN a.party THEN s.created_at END,
         CASE WHEN a.party THEN s.expires_at END,
         CASE WHEN a.party THEN s.ended_at END,
         CASE WHEN a.party THEN s.mode END,
         CASE WHEN a.party THEN s.live_state END,
         s.is_private,
         CASE WHEN a.party THEN s.last_activity_at END,
         CASE WHEN a.party THEN s.source_letter_id END,
         CASE WHEN a.party THEN s.source_story_id END,
         CASE WHEN a.party THEN s.target_listener_id END,
         CASE WHEN a.party THEN s.status END,
         CASE WHEN a.party THEN s.joiner_seat_claimed_at END
    FROM public.clarity_sessions s
    CROSS JOIN LATERAL (
      SELECT COALESCE(
               auth.uid() = s.creator_profile_id
            OR auth.uid() = s.joiner_profile_id
            OR auth.uid() = s.target_listener_id
            OR (s.joiner_profile_id IS NULL
                AND s.joiner_seat_claimed_at IS NOT NULL
                AND s.joiner_seat_secret IS NOT NULL
                AND s.joiner_seat_secret::text = ANY (public.clarity_request_seat_secrets())),
             false) AS party,
             COALESCE(
               s.ended_at IS NOT NULL
            OR s.status IN ('completed', 'cancelled')
            OR s.live_state ->> 'sessionEnded' = 'true'
            OR s.live_state ->> 'joinerEnded' = 'true',
             false) AS ended
    ) a
   WHERE s.code = upper(btrim(p_code))
     AND (a.party OR NOT a.ended);
END;
$$;

REVOKE ALL ON FUNCTION public.get_session_by_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_session_by_code(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_by_code(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. get_active_session_by_code — the grace-window filter applies to everyone, as before; the
--    projection and the ended rule are the same as get_session_by_code's.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_session_by_code(p_code text)
RETURNS TABLE (
  id uuid,
  creator_name text,
  creator_note text,
  joiner_name text,
  joiner_profile_id uuid,
  creator_profile_id uuid,
  state jsonb,
  demo_status text,
  partnership_status text,
  created_at timestamptz,
  expires_at timestamptz,
  ended_at timestamptz,
  mode text,
  live_state jsonb,
  is_private boolean,
  last_activity_at timestamptz,
  source_letter_id uuid,
  source_story_id uuid,
  target_listener_id uuid,
  status text,
  joiner_seat_claimed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_code IS NULL OR length(btrim(p_code)) <> 6 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.id,
         s.creator_name,
         CASE WHEN a.party THEN s.creator_note END,
         CASE WHEN a.party THEN s.joiner_name END,
         CASE WHEN a.party THEN s.joiner_profile_id END,
         CASE WHEN a.party THEN s.creator_profile_id END,
         CASE WHEN a.party THEN s.state END,
         CASE WHEN a.party THEN s.demo_status END,
         CASE WHEN a.party THEN s.partnership_status END,
         CASE WHEN a.party THEN s.created_at END,
         CASE WHEN a.party THEN s.expires_at END,
         CASE WHEN a.party THEN s.ended_at END,
         CASE WHEN a.party THEN s.mode END,
         CASE WHEN a.party THEN s.live_state END,
         s.is_private,
         CASE WHEN a.party THEN s.last_activity_at END,
         CASE WHEN a.party THEN s.source_letter_id END,
         CASE WHEN a.party THEN s.source_story_id END,
         CASE WHEN a.party THEN s.target_listener_id END,
         CASE WHEN a.party THEN s.status END,
         CASE WHEN a.party THEN s.joiner_seat_claimed_at END
    FROM public.clarity_sessions s
    CROSS JOIN LATERAL (
      SELECT COALESCE(
               auth.uid() = s.creator_profile_id
            OR auth.uid() = s.joiner_profile_id
            OR auth.uid() = s.target_listener_id
            OR (s.joiner_profile_id IS NULL
                AND s.joiner_seat_claimed_at IS NOT NULL
                AND s.joiner_seat_secret IS NOT NULL
                AND s.joiner_seat_secret::text = ANY (public.clarity_request_seat_secrets())),
             false) AS party,
             COALESCE(
               s.ended_at IS NOT NULL
            OR s.status IN ('completed', 'cancelled')
            OR s.live_state ->> 'sessionEnded' = 'true'
            OR s.live_state ->> 'joinerEnded' = 'true',
             false) AS ended
    ) a
   WHERE s.code = upper(btrim(p_code))
     -- explicitly ended, by either party (unchanged)
     AND COALESCE((s.live_state->>'sessionEnded')::boolean, false) IS NOT TRUE
     AND COALESCE((s.live_state->>'joinerEnded')::boolean,  false) IS NOT TRUE
     -- grace window, last_activity_at falling back to created_at (unchanged)
     AND COALESCE(s.last_activity_at, s.created_at) >= now() - interval '120 seconds'
     AND (a.party OR NOT a.ended);
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_session_by_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_active_session_by_code(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_session_by_code(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. can_read_clarity_session — the room-code arm also asks for the seat credential.
--    Child tables (rounds, ideas, turns, verifications) inherit it unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_read_clarity_session(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.clarity_sessions s
     WHERE s.id = p_session_id
       AND (
             auth.uid() = s.creator_profile_id
          OR auth.uid() = s.joiner_profile_id
          OR auth.uid() = s.target_listener_id
          OR (s.target_listener_id IS NULL
              AND s.code = ANY (public.clarity_request_room_codes())
              AND s.joiner_profile_id IS NULL
              AND s.joiner_seat_claimed_at IS NOT NULL
              AND s.joiner_seat_secret IS NOT NULL
              AND s.joiner_seat_secret::text = ANY (public.clarity_request_seat_secrets()))
       )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_read_clarity_session(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Row SELECT policy — same predicate, inlined (anon may not EXECUTE the internal parsers;
--    each inlined parse is byte-identical to its function). It tests the row's own columns, never
--    re-reads by id (P1302 b: INSERT … RETURNING). A policy's reference to the row's own column
--    needs no column privilege.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS clarity_sessions_select ON public.clarity_sessions;
CREATE POLICY clarity_sessions_select
  ON public.clarity_sessions
  FOR SELECT
  TO anon, authenticated
  USING (
    auth.uid() = creator_profile_id
    OR auth.uid() = joiner_profile_id
    OR auth.uid() = target_listener_id
    OR (
      target_listener_id IS NULL
      AND code = ANY (ARRAY(
        SELECT upper(btrim(part))
          FROM unnest(string_to_array(
                 left(COALESCE(
                   NULLIF(current_setting('request.headers', true), '')::json ->> 'x-clarity-room-code',
                   ''), 32),
                 ',')) WITH ORDINALITY AS t(part, ord)
         WHERE upper(btrim(part)) ~ '^[A-Z0-9]{6}$'
         ORDER BY ord
         LIMIT 2
      ))
      AND joiner_profile_id IS NULL
      AND joiner_seat_claimed_at IS NOT NULL
      AND joiner_seat_secret IS NOT NULL
      AND joiner_seat_secret::text = ANY (ARRAY(
        SELECT lower(btrim(part))
          FROM unnest(string_to_array(
                 left(COALESCE(
                   NULLIF(current_setting('request.headers', true), '')::json ->> 'x-clarity-seat-secret',
                   ''), 80),
                 ',')) WITH ORDINALITY AS t(part, ord)
         WHERE lower(btrim(part)) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         ORDER BY ord
         LIMIT 2
      ))
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Verification — read the live catalog, fail loud.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_extra text;
  v_qual  text;
  v_src   text;
  v_fn    text;
BEGIN
  -- Permissive policies OR together: a stray SELECT/UPDATE policy would reopen the read.
  SELECT string_agg(policyname || ' (' || cmd || ')', ', ')
    INTO v_extra
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'clarity_sessions'
     AND cmd IN ('SELECT', 'UPDATE', 'ALL')
     AND policyname NOT IN ('clarity_sessions_select', 'clarity_sessions_creator_update');
  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION 'P1493: unexpected read/write policy on clarity_sessions: %', v_extra;
  END IF;

  SELECT qual INTO v_qual
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'clarity_sessions' AND policyname = 'clarity_sessions_select';
  IF v_qual IS NULL OR position('x-clarity-seat-secret' in v_qual) = 0 THEN
    RAISE EXCEPTION 'P1493: the row SELECT policy does not require the seat credential';
  END IF;

  FOREACH v_fn IN ARRAY ARRAY['get_session_by_code(text)', 'get_active_session_by_code(text)', 'can_read_clarity_session(uuid)'] LOOP
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = ('public.' || v_fn)::regprocedure;
    IF position('clarity_request_seat_secrets' in v_src) = 0 THEN
      RAISE EXCEPTION 'P1493: % does not consult the seat credential', v_fn;
    END IF;
  END LOOP;

  -- The guest join path stays reachable without an account (P1057 D-A/D-B).
  IF NOT has_function_privilege('anon', 'public.get_session_by_code(text)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.get_active_session_by_code(text)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.can_read_clarity_session(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1493: anon lost EXECUTE on a session read path';
  END IF;

  -- The parser is internal (ALTER DEFAULT PRIVILEGES anon-EXECUTE trap closed).
  IF has_function_privilege('anon', 'public.clarity_request_seat_secrets()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.clarity_request_seat_secrets()', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1493: a client role can EXECUTE clarity_request_seat_secrets()';
  END IF;

  -- The credential itself must stay unreadable by client roles (P1269).
  IF has_column_privilege('anon', 'public.clarity_sessions', 'joiner_seat_secret', 'SELECT')
     OR has_column_privilege('authenticated', 'public.clarity_sessions', 'joiner_seat_secret', 'SELECT') THEN
    RAISE EXCEPTION 'P1493: a client role can read joiner_seat_secret — the seat credential is void';
  END IF;

  RAISE NOTICE 'P1493: session reads need a participant.';
END
$$;
