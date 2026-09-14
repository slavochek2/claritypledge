-- Migration: P1302 — a clarity_sessions row is reachable only by its parties, or by whoever
--            presents an open room's code
-- Created: 2026-09-11
-- Spec: features/p1302_a_session_with_no_named_listener_is_readable_by_anyone.md
-- Reproduced by: e2e/integration/p1302-session-select-scope.spec.ts
--
-- diffed against: 20260901180000_p1207_session_children_inherit_parent_scope.sql (can_read_clarity_session —
--   the predicate changes; the signature, SECURITY DEFINER, search_path and STABLE do not)
-- diffed against: 20260902090000_p520_erasure_hardening.sql (patch_live_state — the ONLY change is the
--   added `code = ANY (clarity_request_room_codes())` term on the guest arm; the cancelled guard, the
--   participant arms and the auto-reveal block are byte-identical)
-- new function: clarity_request_room_codes
--
-- requires-frontend: 84567ac94
--   (the client commit as landed on main — it carries the header code from branch commits
--   5ae93d76e and 8087370e8, which never reach main themselves; decisions.md 2026-09-09)
--   The account-less guest flow reads and writes its room through this row policy. Against this
--   migration, a bundle that does not send the room-code header (src/lib/room-capability.ts)
--   gets zero rows back on a guest's direct reads and zero rows changed on its direct writes —
--   silently. Deploy the client first, and leave a gap of at least one session length before
--   applying (spec, Risks: guest tabs opened on the old bundle are the ones that break).
--
-- WHAT WAS WRONG
--   clarity_sessions_select (P703) and clarity_sessions_creator_update (latest: P520) both admitted
--   any row whose target_listener_id IS NULL, to any caller. That column is set only on the
--   letter-sourced path, so "no named listener" described almost the whole table, and the
--   publishable key could list rows (names, notes, live state) and overwrite them.
--   can_read_clarity_session() (P1207) mirrored the same branch for the child tables, and
--   patch_live_state()'s guest arm authorized on the session id alone.
--
--   The branch existed for a real reason: a guest joins /live by code with no account, so the
--   policy had no identity to test and admitted everyone instead.
--
-- WHAT THIS DOES
--   Access becomes a positive assertion, in ONE function that the row policies and every child
--   table share:
--     1. identity  — auth.uid() is the creator, the seated joiner, or the named listener;
--     2. room code — the room is open (no named listener) AND the request presents its code in the
--                    x-clarity-room-code header. The code is the bearer capability that
--                    claim_joiner_seat and get_session_by_code already accept.
--   A directed session is never reachable by code. There is deliberately no "open invite" branch:
--   production only ever invites a directed session's own listener, whom identity already admits,
--   while the invite INSERT policy accepts any recipient of the letter — so an invite branch would
--   have let a creator open a directed session to a third party.
--
--   The code branch is bounded as a capability, not just as a predicate:
--     * reads: at most TWO codes per request are parsed, so one request tests two guesses, never a
--       batch (the client never needs more — src/lib/room-capability.ts);
--     * writes: anon keeps UPDATE only on the columns a guest writes (state, live_state, mode,
--       demo_status) — the rest are revoked below — and never on a room whose session has ended;
--     * patch_live_state's guest arm now requires the presented code too. Session ids are not a
--       secret (event practice rooms publish theirs), so an id alone must authorize nothing.
--
--   The predicate lives inside the existing SECURITY DEFINER can_read_clarity_session(), so:
--     * no new anon-executable function exists (it already carries that grant; the header parser
--       below is executable by nobody but the definer functions that call it);
--     * the child-table policies call it with only the row id and it re-reads the row as owner,
--       which is safe there because the session row is already committed. The clarity_sessions
--       SELECT policy does NOT: it tests the row's own columns inline, because INSERT … RETURNING
--       checks SELECT against a row the function's snapshot cannot see (see the policy below).
--       The UPDATE policy is superseded by 20260911120200, which restricts the code branch to anon.
--   request.headers is set by PostgREST per transaction. Where it is absent — Realtime, cron, a
--   psql session — the code branch is simply false: fail closed.
--
-- WHAT DELIBERATELY DOES NOT CHANGE
--   The UPDATE policy keeps P520's cancelled guard and P1047's creator-not-null term.
--   `authenticated` keeps its column grants. The child-table policies are untouched — they already
--   call can_read_clarity_session().

-- ---------------------------------------------------------------------------
-- 1. The room codes this request presents. Internal: executable only by its owner, i.e. by the
--    SECURITY DEFINER functions below. Nothing exposes it through PostgREST.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clarity_request_room_codes()
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(
    SELECT upper(btrim(part))
      FROM unnest(string_to_array(
             left(COALESCE(
               NULLIF(current_setting('request.headers', true), '')::json ->> 'x-clarity-room-code',
               ''), 32),
             ',')) WITH ORDINALITY AS t(part, ord)
     WHERE upper(btrim(part)) ~ '^[A-Z0-9]{6}$'
     ORDER BY ord
     LIMIT 2
  ), '{}'::text[]);
$$;

REVOKE ALL ON FUNCTION public.clarity_request_room_codes() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The access predicate — single source of truth for the row and its children.
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
      FROM clarity_sessions s
     WHERE s.id = p_session_id
       AND (
             auth.uid() = s.creator_profile_id
          OR auth.uid() = s.joiner_profile_id
          OR auth.uid() = s.target_listener_id
          OR (s.target_listener_id IS NULL AND s.code = ANY (public.clarity_request_room_codes()))
       )
  );
$$;

COMMENT ON FUNCTION public.can_read_clarity_session(uuid) IS
  'P1207 F10 / P1302: the single source of truth for "may this caller reach this session". '
  'Identity (creator, seated joiner, named listener) or - for an open room only - its code '
  'presented in the x-clarity-room-code request header. Used by the clarity_sessions SELECT and '
  'UPDATE policies and by every child table, so the row and its content cannot drift apart. '
  'Never admit a row for the ABSENCE of a column: that was P1302.';

-- ---------------------------------------------------------------------------
-- 3. Row policies.
-- ---------------------------------------------------------------------------
-- The SELECT policy tests the row's OWN columns, never re-reads the row by id. INSERT … RETURNING
-- (every `.insert().select()`, including createClaritySession) checks this policy against the NEW
-- row, which a STABLE function's statement snapshot cannot see — re-reading by id there refused
-- every creator their own freshly created session. The same predicate as can_read_clarity_session,
-- written inline; the header parse is an uncorrelated subquery, evaluated once per statement.
-- The parse MUST stay identical to clarity_request_room_codes() above.
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
    )
  );

DROP POLICY IF EXISTS clarity_sessions_creator_update ON public.clarity_sessions;
CREATE POLICY clarity_sessions_creator_update
  ON public.clarity_sessions
  FOR UPDATE
  TO anon, authenticated
  USING (
    status IS DISTINCT FROM 'cancelled'
    AND public.can_read_clarity_session(id)
    -- A code holder (anon) writes only while the room is live.
    AND (auth.uid() IS NOT NULL OR ended_at IS NULL)
  )
  WITH CHECK (
    creator_profile_id IS NOT NULL
    AND public.can_read_clarity_session(id)
  );

-- ---------------------------------------------------------------------------
-- 4. A room code is a guest's credential, so it grants a guest's writes and nothing more.
--    Guests write state, live_state + mode and demo_status (api.ts); every other client-writable
--    column is the creator's, or the server's (last_activity_at and ended_at are written by
--    SECURITY DEFINER RPCs). `authenticated` is untouched.
-- ---------------------------------------------------------------------------
REVOKE UPDATE (
  creator_name, creator_note, partnership_status, expires_at, is_private,
  last_activity_at, source_letter_id, source_story_id, status
) ON public.clarity_sessions FROM anon;

-- ---------------------------------------------------------------------------
-- 5. patch_live_state — the guest arm asks for the code like every other guest path.
--    Ported from 20260902090000_p520_erasure_hardening.sql; the ONLY change is the added
--    `code = ANY (clarity_request_room_codes())` term on the guest arm.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION patch_live_state(
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
        AND code = ANY (public.clarity_request_room_codes())
      )
    )
  RETURNING live_state INTO merged;

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

-- ---------------------------------------------------------------------------
-- 6. Permissive policies OR together: one stray SELECT or UPDATE policy — a prod-only drift like
--    the one P1046 removed — would reopen everything above. Refuse to finish if any exists.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_extra text;
BEGIN
  SELECT string_agg(policyname || ' (' || cmd || ')', ', ')
    INTO v_extra
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'clarity_sessions'
     AND cmd IN ('SELECT', 'UPDATE', 'ALL')
     AND policyname NOT IN ('clarity_sessions_select', 'clarity_sessions_creator_update');
  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION 'P1302: unexpected read/write policy on clarity_sessions: %', v_extra;
  END IF;
END
$$;
