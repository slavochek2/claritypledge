-- P1057 (Migration A): the read accessors that survive the code-column gate.
--
-- new function
--   All four functions below are brand new — no prior migration defines
--   get_session_by_code, get_active_session_by_code, get_room_code_for_invite or
--   get_practice_room_codes, so there is no prior definition to diff against.
--   Verified: grep -rn "get_session_by_code\|get_active_session_by_code\|
--   get_room_code_for_invite\|get_practice_room_codes" supabase/migrations/ → this file only.
--
-- client-safe: additive only. Four new SECURITY DEFINER functions; no grant is narrowed,
-- no policy is dropped, no column is removed. Nothing deployed changes behaviour when this
-- lands — the RPCs are unreachable from the currently deployed bundle until the frontend
-- that calls them ships.
--
-- Applying this file ALONE closes nothing. That is deliberate, and it mirrors P1053's
-- Migration A/B split (20260812150000 header). The narrowing that makes these functions
-- load-bearing is Migration B (20260817140001_p1057_revoke_code_select.sql), which is
-- `requires-frontend` and must not be applied to prod until the bundle calling these
-- functions is an ancestor of origin/main.
--
-- ---------------------------------------------------------------------------------------
-- WHY THESE FUNCTIONS EXIST
-- ---------------------------------------------------------------------------------------
-- The 6-character room `code` is the capability that authorizes claiming a joiner seat —
-- claim_joiner_seat(p_code, p_joiner_name) accepts nothing else. Today the clarity_sessions
-- SELECT grant publishes that column to `anon`, so the capability is readable in bulk by
-- exactly the people it is meant to exclude. Migration B revokes it.
--
-- Three read paths legitimately need something the gate would otherwise take away:
--
--   1. Callers who ALREADY HOLD the code and need the row behind it (join pre-flight,
--      cold /live/:code load, rejoin). They cannot filter on `code` after the gate, because
--      referencing a column in WHERE requires SELECT privilege on it. Hence
--      get_session_by_code / get_active_session_by_code.
--
--   2. Callers who legitimately need to LEARN the code because being invited IS the
--      capability grant (the invite banner, the sender's rejoin control). Hence
--      get_room_code_for_invite — which is also a strengthening: today any authenticated
--      caller who can read a clarity_live_invites row reads the code embedded beside it.
--
--   3. Event practice rooms, where publishing the code to every visitor of a public event
--      page IS the product (P406; docs/technical/database.md). Hence
--      get_practice_room_codes — a faithful port, not a tightening. See FOUNDER DECISION
--      D-A below.
--
-- ---------------------------------------------------------------------------------------
-- FOUNDER DECISION — anon EXECUTE is REQUIRED on two of these, not incidental
-- ---------------------------------------------------------------------------------------
-- [FOUNDER DECISION 2026-08-13, P1057 D-A/D-B]
--
--   get_session_by_code(text)         GRANT to anon  — the guest join path has no session.
--                                     A cold /live/:code visit resolves the room before any
--                                     auth exists, and claim_joiner_seat is already
--                                     deliberately anon-reachable
--                                     (20260812210000_p1053_null_safe_guest_name_match.sql:142-143).
--   get_active_session_by_code(text)  GRANT to anon  — same path, rejoin/grace variant.
--   get_practice_room_codes(uuid)     GRANT to anon  — a public event page renders its
--                                     practice rooms to logged-out visitors (P406).
--   get_room_code_for_invite(uuid)    NO anon grant  — invites are an authenticated surface;
--                                     the function derives the caller from auth.uid() and
--                                     an anon caller can never satisfy its predicate.
--
-- All four are added to scripts/anon-execute-allowlist.txt in this same commit (the three
-- anon ones as entries; the fourth deliberately absent), so P1065's grant-drift check has a
-- baseline the day this lands rather than inheriting three unclassified anon-executable
-- SECURITY DEFINER functions.
--
-- ---------------------------------------------------------------------------------------
-- RULES THIS FILE ENCODES (do not relax them in a later migration)
-- ---------------------------------------------------------------------------------------
-- * `RETURNS TABLE (...)`, never `RETURNS SETOF public.clarity_sessions`. The table row type
--   contains `code`; SECURITY DEFINER runs as owner, so no grant would stop it being handed
--   back. Worse, the row type is open-ended — a future ADD COLUMN joins the output with
--   nobody reviewing it. An explicit column list makes the omission of `code` a structural
--   property of the function, visible in \df+.
-- * `SELECT *` and `RETURNING *` are BANNED inside any definer function on this table, for
--   the same reason.
-- * Unknown code, ended session and expired grace all return the SAME empty result — never a
--   distinguishable error. Moving the grace/ended logic server-side is exactly the moment a
--   well-meaning implementer adds `RAISE EXCEPTION 'session expired'` and creates an
--   existence oracle that does not exist today. claim_joiner_seat collapses five distinct
--   refusals into one generic message for this reason (20260812210000:78-122).
-- * Both REVOKE forms on every function (FROM PUBLIC and FROM anon, authenticated). Each is
--   a silent no-op against the other's grant; REVOKE is idempotent so the redundant half is
--   free (docs/decisions.md, commit fb894456).
-- * P1063 corollary: if any of these later gains an argument, the overload is a NEW function
--   with a fresh EXECUTE-to-PUBLIC default that the REVOKE below does not cover
--   (20260813080000:26-29). Re-run the revoke triple for every new signature.
-- * auth.uid() NULL is fail-CLOSED in a WHERE clause (a USING/WHERE predicate excludes any
--   row that is not TRUE) and fail-OPEN inside an IF (20260813080000:44-49). The invite
--   accessor below therefore guards NULL explicitly AND filters in WHERE — belt and braces,
--   because the identical expression means opposite things in the two positions.

-- ============================================================================
-- 1. get_session_by_code — the row behind a code the caller already holds
-- ============================================================================
-- Replaces the joinClaritySession P921 pre-flight read (api.ts) and getClaritySession.
-- Deliberately UNFILTERED on ended/expired state: both callers need to SEE an ended room in
-- order to route to the "this session ended" screen rather than "no such room". That
-- distinction is a UX contract, not a leak — the caller supplied the code to get here.

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
  -- Same bound + same silent refusal as claim_joiner_seat: an unbounded input is
  -- materialized per request, and a distinguishable failure is an existence oracle.
  -- Empty set, not an exception — the client contract is "null when not found".
  IF p_code IS NULL OR length(btrim(p_code)) <> 6 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.id, s.creator_name, s.creator_note, s.joiner_name,
         s.joiner_profile_id, s.creator_profile_id, s.state,
         s.demo_status, s.partnership_status, s.created_at,
         s.expires_at, s.ended_at, s.mode, s.live_state,
         s.is_private, s.last_activity_at, s.source_letter_id,
         s.source_story_id, s.target_listener_id, s.status,
         s.joiner_seat_claimed_at
    FROM public.clarity_sessions s
   WHERE s.code = upper(btrim(p_code));
END;
$$;

REVOKE ALL ON FUNCTION public.get_session_by_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_session_by_code(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_by_code(text) TO anon, authenticated;

-- ============================================================================
-- 2. get_active_session_by_code — same lookup, with the grace window applied
-- ============================================================================
-- Ports getActiveSessionByCode's JS logic verbatim in behaviour:
--   NULL if live_state.sessionEnded or live_state.joinerEnded is true;
--   else NULL if COALESCE(last_activity_at, created_at) is older than the grace window;
--   else the row. SESSION_GRACE_PERIOD_SECONDS = 120 becomes a literal here. The exported
--   constant stays in api.ts because nothing else reads it from the database.

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
  SELECT s.id, s.creator_name, s.creator_note, s.joiner_name,
         s.joiner_profile_id, s.creator_profile_id, s.state,
         s.demo_status, s.partnership_status, s.created_at,
         s.expires_at, s.ended_at, s.mode, s.live_state,
         s.is_private, s.last_activity_at, s.source_letter_id,
         s.source_story_id, s.target_listener_id, s.status,
         s.joiner_seat_claimed_at
    FROM public.clarity_sessions s
   WHERE s.code = upper(btrim(p_code))
     -- explicitly ended, by either party
     AND COALESCE((s.live_state->>'sessionEnded')::boolean, false) IS NOT TRUE
     AND COALESCE((s.live_state->>'joinerEnded')::boolean,  false) IS NOT TRUE
     -- grace window, last_activity_at falling back to created_at
     AND COALESCE(s.last_activity_at, s.created_at) >= now() - interval '120 seconds';
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_session_by_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_active_session_by_code(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_session_by_code(text) TO anon, authenticated;

-- ============================================================================
-- 3. get_room_code_for_invite — learn a code you were invited to
-- ============================================================================
-- Replaces three embedded `clarity_sessions(code)` projections that the gate would break:
-- getOpenLiveInviteForUser, getOpenInviteForSender, and the useOpenLiveInvite realtime
-- enrichment. Authorized on identity, not on possession of the code — the caller has none,
-- which is the whole reason this function exists.
--
-- Two principals may learn it:
--   * the invite's target_user_id, while the invite is OPEN (closed_at IS NULL). Closing the
--     invite therefore revokes the code from the invitee, which the embedded projection it
--     replaces did not do.
--   * the session's creator_profile_id, unconditionally — the creator minted the code.

CREATE OR REPLACE FUNCTION public.get_room_code_for_invite(p_session_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_code text;
BEGIN
  -- Explicit NULL guard. The WHERE clause below is already fail-closed on a NULL uid (a
  -- comparison against NULL is NULL, and WHERE excludes anything not TRUE), but the same
  -- expression inside an IF would be fail-OPEN, and this function is one refactor away from
  -- someone moving the predicate into one. State the guard rather than rely on position.
  IF v_uid IS NULL OR p_session_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT s.code
    INTO v_code
    FROM public.clarity_sessions s
   WHERE s.id = p_session_id
     AND (
       s.creator_profile_id = v_uid
       OR EXISTS (
         SELECT 1
           FROM public.clarity_live_invites i
          WHERE i.session_id = s.id
            AND i.target_user_id = v_uid
            AND i.closed_at IS NULL
       )
     );

  -- NULL for "not found" and for "not yours" alike — one channel, no discriminator.
  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.get_room_code_for_invite(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_room_code_for_invite(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_room_code_for_invite(uuid) TO authenticated;

-- ============================================================================
-- 4. get_practice_room_codes — the P406 public-event-page port
-- ============================================================================
-- [FOUNDER DECISION 2026-08-13, P1057 D-A] Practice-room codes stay published, scoped.
--
-- getPracticeRooms renders the code to every visitor of a public event page. That is
-- documented design (docs/technical/database.md) and the Join button is gated on it. For
-- that room class, publishing the capability IS the feature — nobody is being excluded,
-- which is the point of an event.
--
-- ACCEPTED CONSEQUENCE, stated so it is never mistaken for an oversight: event practice
-- rooms gain nothing from P1057. A stranger can still join one. The line this draws is
-- "published because it is listed on a public page" vs "shared 1:1 by link" — both are
-- target_listener_id IS NULL, so no column distinguishes them, but the event_practice_rooms
-- join does, exactly and cheaply. Everything without such a row goes dark.
--
-- Whether event rooms should be attendee-only is a PRODUCT question, filed separately and
-- deliberately not decided inside a security fix.
--
-- The predicate mirrors the query it replaces: status IN ('waiting','active') AND unexpired.

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

  RETURN QUERY
  SELECT r.id, s.code
    FROM public.event_practice_rooms r
    JOIN public.clarity_sessions s ON s.id = r.session_id
   WHERE r.event_id = p_event_id
     AND r.status IN ('waiting', 'active')
     AND r.expires_at > now();
END;
$$;

REVOKE ALL ON FUNCTION public.get_practice_room_codes(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_practice_room_codes(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_practice_room_codes(uuid) TO anon, authenticated;

-- ============================================================================
-- 5. Verification — read the live ACL, never this file's text
-- ============================================================================
-- A grant is not what the migration says, it is what the database holds. has_function_privilege
-- resolves PUBLIC and role inheritance; information_schema filtered by grantee does not, and
-- that blindness is what made four RPC lockdowns silent no-ops (docs/decisions.md 2026-08-13).

DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(sig, ', ')
    INTO v_bad
    FROM (
      SELECT 'get_session_by_code'        AS sig WHERE NOT has_function_privilege('anon', 'public.get_session_by_code(text)', 'EXECUTE')
      UNION ALL
      SELECT 'get_active_session_by_code'      WHERE NOT has_function_privilege('anon', 'public.get_active_session_by_code(text)', 'EXECUTE')
      UNION ALL
      SELECT 'get_practice_room_codes'         WHERE NOT has_function_privilege('anon', 'public.get_practice_room_codes(uuid)', 'EXECUTE')
      UNION ALL
      SELECT 'get_room_code_for_invite'        WHERE NOT has_function_privilege('authenticated', 'public.get_room_code_for_invite(uuid)', 'EXECUTE')
    ) t;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'P1057 Migration A: expected EXECUTE grant missing on: %', v_bad;
  END IF;

  -- The negative half: anon must NOT reach the invite accessor.
  IF has_function_privilege('anon', 'public.get_room_code_for_invite(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1057 Migration A: get_room_code_for_invite is anon-executable — the REVOKE did not hold';
  END IF;
END;
$$;
