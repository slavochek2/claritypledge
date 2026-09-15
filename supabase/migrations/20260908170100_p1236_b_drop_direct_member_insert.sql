-- Migration: P1236 (b) — the contract half: remove the direct room-membership INSERT policy
-- Created: 2026-09-08 (designed) · committed 2026-09-15 under P1315
-- Design: features/done/2026-06-10/p1236_server_side_live_transcription_for_rooms.md ("The contract
--   migration is held back deliberately")
--
-- WHY THIS FILE CARRIES A 2026-09-08 VERSION. It is the contract half of the expand/contract pair
-- begun by 20260908170000_p1236_transcribe_consent_and_limits.sql, designed on that date and held
-- until the client stopped writing member rows itself. It was recorded in one environment's ledger
-- under exactly this version and name before the file was committed; recreating it under the SAME
-- version and name keeps that ledger row matched to a real file (a new timestamp would orphan it).
-- Because that ledger row exists, this file must contain exactly the statement that was recorded —
-- the DROP — and nothing new: an environment that already holds the version will never run it
-- again. Follow-on hardening lives in 20260915120000_p1315_member_table_write_revoke.sql.
--
-- diffed against: 20260823190000_p1149_transcribe_room_tables.sql:107 (the policy removed here)
--
-- client-safe: no client writes transcribe_room_members. The client creates membership only through
--   enter_transcribe_room() and join_transcribe_room() (src/app/data/transcribe-service.ts:245, :361),
--   both SECURITY DEFINER and so unaffected by table policies. grep finds no .insert on the table in src/.

DROP POLICY IF EXISTS "authenticated users can join as themselves" ON public.transcribe_room_members;

-- ============================================================================
-- Verification — assert the live catalog, never this file's text
-- ============================================================================
DO $$
DECLARE
  v_insert_policies int;
  v_select_policies int;
BEGIN
  -- 1. No INSERT policy may remain under any name. ALL covers a policy with no FOR clause.
  SELECT count(*) INTO v_insert_policies
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'transcribe_room_members' AND cmd IN ('INSERT', 'ALL');
  IF v_insert_policies <> 0 THEN
    RAISE EXCEPTION 'P1315: % INSERT/ALL policy(ies) still on transcribe_room_members', v_insert_policies;
  END IF;

  -- 2. Positive control: the roster read must survive, or this broke the room while check 1 passed.
  SELECT count(*) INTO v_select_policies
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'transcribe_room_members' AND cmd = 'SELECT';
  IF v_select_policies = 0 THEN
    RAISE EXCEPTION 'P1315: no SELECT policy left on transcribe_room_members — the roster read was removed';
  END IF;

  -- 3. RLS must still be enabled: with RLS off, "no INSERT policy" would mean "no restriction".
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.transcribe_room_members'::regclass) THEN
    RAISE EXCEPTION 'P1315: RLS is disabled on transcribe_room_members';
  END IF;

  RAISE NOTICE 'P1315: transcribe_room_members has no client INSERT policy.';
END;
$$;
