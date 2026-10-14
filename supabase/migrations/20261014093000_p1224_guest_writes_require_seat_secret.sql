-- Migration: P1224 — guest writes now require the seat credential
-- Created: 2026-10-14
-- Spec: features/p1224_guest_live_state_patch_keyed_only_by_session_id.md
-- Reproduced by: e2e/integration/20261014093000_p1224_guest_writes_require_seat_secret.spec.ts
-- Details: .private/docs/security-log.md, 2026-10-14 entries.
--
-- diffed against: 20260911120200_p1302_c_writes_by_identity_or_anon_code.sql (patch_live_state —
--   the guest arm gains the credential match, and an anonymous call that matched no row raises
--   42501. Every other line is unchanged.)
-- diffed against: 20260911120300_p1302_d_child_inserts_are_identity_only.sql
--   (clarity_sessions_creator_update — the anon arm of USING and of WITH CHECK gains the same
--   credential match. The identity arms are unchanged.)
-- diffed against: 20260915100000_p1314_c_release_requires_the_seat_secret.sql (release_joiner_seat —
--   the anonymous arm keeps only its credential branch; the branch for seats without a credential
--   is removed, and the release also clears the seat's credential. Signature, defaults, the
--   signed-in arm and the addressee bound are unchanged.)
-- new function: clarity_request_seat_secrets (internal; executable by no client role)
--
-- requires-frontend: dd3c4ded0755fe97d8836a80c6c002c49134cc34
--   DELIBERATELY MALFORMED UNTIL THE CLIENT COMMIT EXISTS — migrate.sh gate 2 reads a malformed
--   marker as BLOCKED, which is the safe default. Replace the placeholder with the SHA of the
--   client commit (src/lib/room-capability.ts, src/app/data/seat-secret.ts, src/app/data/api.ts)
--   once it is on main. Deploy the client first and leave a gap of at least one session length
--   before applying: a bundle without that commit has its guest writes refused. The reverse order
--   is harmless.
--
-- WHAT THIS DOES
--   An account-less guest's writes to its session — and its release of the seat — are authorized
--   by the per-seat credential claim_joiner_seat issues (P1269), which only the seated guest holds
--   and no client role may read, and only while that seat is occupied. Releasing the seat retires
--   the credential. Signed-in participants keep writing by identity, unchanged.
--
-- SEATS WITHOUT A CREDENTIAL (claimed before P1269) — fail closed, no backfill
--   A backfilled credential would be held by nobody, so it would be equivalent to NULL. Such a
--   seat accepts no guest write or release. Its guest recovers through the normal join path:
--   P1269 reads the seat's presence as its claim time, so it is already past the abandonment
--   threshold and claim_joiner_seat issues a fresh seat and credential.
--
-- WHAT DELIBERATELY DOES NOT CHANGE
--   Signed-in callers' error contract on patch_live_state (silent no-op). Reads.

-- ---------------------------------------------------------------------------
-- 1. The seat credentials this request presents. Internal: executable only by its owner, i.e. by
--    SECURITY DEFINER functions. Mirrors clarity_request_room_codes(): at most two values per
--    request, each validated as a canonical uuid.
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
-- 2. patch_live_state — the guest arm asks for the seat credential.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.patch_live_state(
  p_session_id uuid,
  p_patch      jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  merged jsonb;
BEGIN
  UPDATE clarity_sessions
  SET live_state = COALESCE(live_state, '{}'::jsonb) || p_patch
  WHERE id = p_session_id
    AND status IS DISTINCT FROM 'cancelled'
    AND (
      creator_profile_id = auth.uid()
      OR joiner_profile_id = auth.uid()
      OR (
        auth.uid() IS NULL
        AND joiner_profile_id IS NULL
        AND joiner_name IS NOT NULL
        AND joiner_seat_claimed_at IS NOT NULL
        AND ended_at IS NULL
        AND code = ANY (public.clarity_request_room_codes())
        -- P1224: the seated guest.
        AND joiner_seat_secret IS NOT NULL
        AND joiner_seat_secret::text = ANY (public.clarity_request_seat_secrets())
      )
    )
  RETURNING live_state INTO merged;

  -- An anonymous write that matched nothing is refused out loud, so a guest sees a failed write
  -- rather than a silently diverging screen. Signed-in callers keep the existing silent no-op.
  IF NOT FOUND AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'cannot write to this session' USING ERRCODE = '42501';
  END IF;

  IF merged IS NOT NULL
     AND (merged->>'checkerSubmitted')::boolean IS TRUE
     AND (merged->>'responderSubmitted')::boolean IS TRUE
     AND merged->>'ratingPhase' = 'waiting'
  THEN
    UPDATE clarity_sessions
    SET live_state = live_state || '{"ratingPhase": "revealed"}'::jsonb
    WHERE id = p_session_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.patch_live_state(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.patch_live_state(uuid, jsonb) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Row UPDATE policy — the anon arm asks for the seat credential too. The header parses are
--    inlined because anon may not EXECUTE the internal parsers; each is byte-identical to its
--    function. A policy's reference to the row's own column needs no column privilege.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS clarity_sessions_creator_update ON public.clarity_sessions;
CREATE POLICY clarity_sessions_creator_update
  ON public.clarity_sessions
  FOR UPDATE
  TO anon, authenticated
  USING (
    status IS DISTINCT FROM 'cancelled'
    AND (
      auth.uid() = creator_profile_id
      OR auth.uid() = joiner_profile_id
      OR auth.uid() = target_listener_id
      OR (
        auth.uid() IS NULL
        AND ended_at IS NULL
        AND target_listener_id IS NULL
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
        AND joiner_name IS NOT NULL
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
    )
  )
  WITH CHECK (
    creator_profile_id IS NOT NULL
    AND (
      auth.uid() = creator_profile_id
      OR auth.uid() = joiner_profile_id
      OR auth.uid() = target_listener_id
      OR (
        auth.uid() IS NULL
        AND ended_at IS NULL
        AND target_listener_id IS NULL
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
        AND joiner_name IS NOT NULL
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
    )
  );

-- ---------------------------------------------------------------------------
-- 4. release_joiner_seat — an anonymous release requires the seat credential, always.
--    Ported from 20260915100000; the only change is the removal of the branch for seats that
--    hold no credential. p_code is kept in the signature so deployed clients' calls still
--    resolve; it no longer authorizes anything.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_joiner_seat(
  p_session_id  uuid,
  p_code        text DEFAULT NULL,
  p_seat_secret uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.clarity_sessions
     SET joiner_name            = NULL,
         joiner_seat_claimed_at = NULL,
         -- P1224: a released seat's credential dies with the seat; the next claim issues a new one.
         joiner_seat_secret     = NULL,
         live_state = COALESCE(live_state, '{}'::jsonb)
                      || jsonb_build_object('joinerEnded', true,
                                            'joinerEndedAt', now()::text)
   WHERE id = p_session_id
     AND joiner_seat_claimed_at IS NOT NULL
     -- F3 (P1053): on an addressed session, only the addressee may vacate the seat.
     AND (target_listener_id IS NULL OR target_listener_id = auth.uid())
     AND (
       -- Signed-in participant vacating their own seat. Unchanged.
       (auth.uid() IS NOT NULL AND joiner_profile_id = auth.uid())
       -- Anonymous guest vacating their own seat: the seat credential, nothing else.
       OR (
         auth.uid() IS NULL
         AND joiner_profile_id IS NULL
         AND joiner_name IS NOT NULL
         AND joiner_seat_secret IS NOT NULL
         AND p_seat_secret  IS NOT NULL
         AND joiner_seat_secret = p_seat_secret
       )
     );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'not the seated joiner' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.release_joiner_seat(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_joiner_seat(uuid, text, uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Verification — fail loud, in the migration itself.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_extra text;
  v_count integer;
  v_src   text;
  v_qual  text;
  v_check text;
BEGIN
  -- Permissive policies OR together: a stray UPDATE/SELECT policy would reopen the arm.
  SELECT string_agg(policyname || ' (' || cmd || ')', ', ')
    INTO v_extra
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'clarity_sessions'
     AND cmd IN ('SELECT', 'UPDATE', 'ALL')
     AND policyname NOT IN ('clarity_sessions_select', 'clarity_sessions_creator_update');
  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION 'P1224: unexpected read/write policy on clarity_sessions: %', v_extra;
  END IF;

  SELECT qual, with_check INTO v_qual, v_check
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'clarity_sessions'
     AND policyname = 'clarity_sessions_creator_update';
  IF position('x-clarity-seat-secret' in v_qual) = 0 OR position('x-clarity-seat-secret' in v_check) = 0 THEN
    RAISE EXCEPTION 'P1224: the row UPDATE policy does not require the seat credential in both USING and WITH CHECK';
  END IF;

  SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'patch_live_state';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'P1224: expected exactly one patch_live_state overload, found %', v_count;
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.patch_live_state(uuid, jsonb)'::regprocedure;
  IF position('clarity_request_seat_secrets' in v_src) = 0 THEN
    RAISE EXCEPTION 'P1224: patch_live_state guest arm does not require the seat credential';
  END IF;
  IF position('joiner_seat_claimed_at IS NOT NULL' in v_src) = 0 THEN
    RAISE EXCEPTION 'P1224: patch_live_state guest arm does not require an occupied seat';
  END IF;

  -- The guest path must stay reachable without an account.
  IF NOT has_function_privilege('anon', 'public.patch_live_state(uuid, jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.patch_live_state(uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1224: a client role lost EXECUTE on patch_live_state';
  END IF;

  -- The parser is internal (and the ALTER DEFAULT PRIVILEGES anon-EXECUTE trap is closed).
  IF has_function_privilege('anon', 'public.clarity_request_seat_secrets()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.clarity_request_seat_secrets()', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1224: a client role can EXECUTE clarity_request_seat_secrets()';
  END IF;

  -- The capability itself must stay unreadable and unwritable by client roles (P1269's property;
  -- this migration depends on it).
  IF has_column_privilege('anon', 'public.clarity_sessions', 'joiner_seat_secret', 'SELECT')
     OR has_column_privilege('authenticated', 'public.clarity_sessions', 'joiner_seat_secret', 'SELECT')
     OR has_column_privilege('anon', 'public.clarity_sessions', 'joiner_seat_secret', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.clarity_sessions', 'joiner_seat_secret', 'UPDATE') THEN
    RAISE EXCEPTION 'P1224: a client role can read or write joiner_seat_secret — the seat capability is void';
  END IF;

  -- release_joiner_seat: one overload, still reachable by both client roles, and the installed
  -- body (comments stripped, since prosrc keeps them) no longer authorizes anything by the code.
  SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'release_joiner_seat';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'P1224: expected exactly one release_joiner_seat overload, found %', v_count;
  END IF;
  IF NOT has_function_privilege('anon', 'public.release_joiner_seat(uuid, text, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.release_joiner_seat(uuid, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1224: a client role lost EXECUTE on release_joiner_seat — the leave path is dead';
  END IF;
  SELECT regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g') INTO v_src
    FROM pg_proc WHERE oid = 'public.release_joiner_seat(uuid, text, uuid)'::regprocedure;
  IF v_src ~ 'p_code' OR v_src ~ 'joiner_seat_secret IS NULL' THEN
    RAISE EXCEPTION 'P1224: release_joiner_seat still authorizes an anonymous release without the seat credential';
  END IF;
  IF v_src !~ 'joiner_seat_secret[[:space:]]*=[[:space:]]*p_seat_secret' THEN
    RAISE EXCEPTION 'P1224: release_joiner_seat lost its credential comparison';
  END IF;
  IF v_src !~ 'joiner_seat_secret[[:space:]]*=[[:space:]]*NULL' THEN
    RAISE EXCEPTION 'P1224: release_joiner_seat no longer retires the seat credential';
  END IF;
  IF position('joiner_seat_claimed_at IS NOT NULL' in v_qual) = 0 OR position('joiner_seat_claimed_at IS NOT NULL' in v_check) = 0 THEN
    RAISE EXCEPTION 'P1224: the row UPDATE policy no longer requires an occupied guest seat';
  END IF;

  RAISE NOTICE 'P1224: guest writes and releases require the seat credential.';
END
$$;
