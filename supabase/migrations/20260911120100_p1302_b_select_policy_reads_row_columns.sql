-- Migration: P1302 (b) — the clarity_sessions SELECT policy tests the row's own columns
-- Created: 2026-09-11
-- Spec: features/p1302_a_session_with_no_named_listener_is_readable_by_anyone.md
-- Reproduced by: e2e/integration/p1302-session-select-scope.spec.ts (C14)
--
-- client-safe: re-creates clarity_sessions_select with exactly the body that
--   20260911120000_p1302_session_access_predicate.sql now carries. On a database that applied the
--   final 20260911120000 this is a no-op; it exists because the TEST database applied an earlier
--   revision of it.
--
-- WHAT WAS WRONG IN THAT EARLIER REVISION
--   Its SELECT policy was `USING (can_read_clarity_session(id))`, which re-reads the row by id inside
--   a STABLE function. INSERT … RETURNING checks the SELECT policy against the NEW row, and the
--   function's statement snapshot cannot see a row the same statement is inserting — so every
--   `.insert().select()` by its own creator failed with "new row violates row-level security
--   policy", createClaritySession included. Caught by the integration suite on test before the
--   branch was committed; never on prod.
--
-- The UPDATE policy keeps can_read_clarity_session(id): an UPDATE's USING and WITH CHECK both see
-- the committed row, and every column the predicate reads is outside the client UPDATE grant.

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
