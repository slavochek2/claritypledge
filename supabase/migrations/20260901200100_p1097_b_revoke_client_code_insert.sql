-- P1097 (Migration B): the client can no longer supply a room code.
--
-- requires-frontend: a8b6c43f
--   "fix(p1097): mint room codes server-side from CSPRNG (Migration A + frontend); client no
--   longer sends a code". Until that bundle is deployed, the live client still sends `code` on
--   INSERT and this REVOKE would 42501 every room creation. migrate.sh holds this file back
--   from prod until the sha is an ancestor of origin/main. If /ship's cherry-pick changes the
--   sha, repoint it here (P1057 Migration B and P1071 needed exactly that — see their headers).
--
-- Migration A (20260901200000) installed the server-side mint; it is client-safe and applies
-- first. This file is the enforcement half: with INSERT on `code` revoked from both client
-- roles, a client insert that names the column fails at the grant check — before RLS, before
-- the trigger — so the only way a row gets a code is the trigger's CSPRNG draw.
--
-- Mechanism, same as P1057 (SELECT) and P1047 (UPDATE) on this table: a column-level REVOKE
-- has no effect while a table-level grant is held (PostgreSQL GRANT docs), so the table-level
-- INSERT is revoked and re-granted as an explicit column list. The list is every column
-- EXCEPT `code` — the 21 columns P1057 enumerated on 2026-08-17, and the DO block below
-- asserts against the live catalog that no column is missing from it. A grant narrower than
-- the deployed bundle is the P886 outage shape; the positive control is not optional.
--
-- DEFAULT-DENY for INSERT is now in force on this table, as it already was for SELECT
-- (P1057): a column added later is not client-insertable until it is added to the GRANT
-- below. Intentional. Add new columns here deliberately.
--
-- service_role keeps table-level INSERT (the REVOKE names anon/authenticated and PUBLIC, and
-- service_role holds its own direct grant): e2e fixtures and admin tooling still insert
-- explicit codes, and the trigger respects a supplied code.

REVOKE INSERT ON public.clarity_sessions FROM PUBLIC;
REVOKE INSERT ON public.clarity_sessions FROM anon, authenticated;

GRANT INSERT (
  id, creator_name, creator_note, joiner_name, joiner_profile_id, state,
  demo_status, partnership_status, created_at, expires_at, mode, live_state,
  is_private, last_activity_at, source_letter_id, source_story_id, status,
  creator_profile_id, target_listener_id, joiner_seat_claimed_at, ended_at
) ON public.clarity_sessions TO anon, authenticated;

-- ============================================================================
-- Verification — has_column_privilege, never information_schema (P1057 rationale)
-- ============================================================================
DO $$
DECLARE
  v_missing text;
BEGIN
  -- 1. The point of the migration: neither client role may insert `code`.
  IF has_column_privilege('anon', 'public.clarity_sessions', 'code', 'INSERT') THEN
    RAISE EXCEPTION 'P1097: anon can still INSERT clarity_sessions.code — the REVOKE did not hold';
  END IF;
  IF has_column_privilege('authenticated', 'public.clarity_sessions', 'code', 'INSERT') THEN
    RAISE EXCEPTION 'P1097: authenticated can still INSERT clarity_sessions.code — the REVOKE did not hold';
  END IF;

  -- 2. Positive control: every OTHER column stays insertable by authenticated (the only
  --    role the INSERT policy admits). A REVOKE that took the table down would pass check 1.
  SELECT string_agg(c.column_name, ', ')
    INTO v_missing
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name = 'clarity_sessions'
     AND c.column_name <> 'code'
     AND NOT has_column_privilege('authenticated', 'public.clarity_sessions', c.column_name, 'INSERT');

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'P1097: authenticated lost INSERT on non-code column(s): % — the grant is narrower than the deployed bundle (P886 shape)', v_missing;
  END IF;

  -- 3. service_role must keep inserting `code`: the e2e fixtures depend on it.
  IF NOT has_column_privilege('service_role', 'public.clarity_sessions', 'code', 'INSERT') THEN
    RAISE EXCEPTION 'P1097: service_role lost INSERT on code — the FROM PUBLIC revoke over-reached';
  END IF;

  -- 4. Migration A must be in place, or a code-less insert now has no way to get a code.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'clarity_sessions' AND t.tgname = 'clarity_sessions_mint_code'
  ) THEN
    RAISE EXCEPTION 'P1097: trigger clarity_sessions_mint_code is missing — apply Migration A first';
  END IF;

  RAISE NOTICE 'P1097 Migration B: code is INSERT-gated for anon/authenticated; all other columns still insertable.';
END;
$$;
