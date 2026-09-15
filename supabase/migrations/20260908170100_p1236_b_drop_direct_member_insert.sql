-- Migration: P1236 (b) — the contract half: remove the direct room-membership INSERT policy
-- Created: 2026-09-08 (designed) · committed 2026-09-15 under P1315
-- Spec: features/p1315_room_membership_contract.md; design in
--   features/done/2026-06-10/p1236_server_side_live_transcription_for_rooms.md ("The contract
--   migration is held back deliberately")
--
-- WHY THIS FILE CARRIES A 2026-09-08 VERSION. It is the contract half of the expand/contract pair
-- begun by 20260908170000_p1236_transcribe_consent_and_limits.sql. The original file was held back
-- until main's client stopped inserting member rows directly, was applied to the TEST database by
-- hand under exactly this version and name, and was then lost with the worktree it lived in — so
-- test's schema_migrations records 20260908170100 / p1236_b_drop_direct_member_insert with no file
-- behind it, and prod never received it. Recreating it under the SAME version and name matches
-- that ledger row (a new timestamp would leave the row orphaned) and gives prod the step it missed.
--
-- diffed against: 20260823190000_p1149_transcribe_room_tables.sql:107 (the policy being removed)
--
-- client-safe: main's client creates membership only through enter_transcribe_room() and
--   join_transcribe_room() (src/app/data/transcribe-service.ts:245, :361), both SECURITY DEFINER and
--   unaffected by table policies; grep finds no .insert on transcribe_room_members anywhere in src/.
--   The P1236 hold reason (transcribe-service.ts:180 performing that insert) no longer exists.
--
-- WHAT IT DOES NOT DO. It removes a client write path only. The SELECT policy ("room members can see
-- the roster") and every RPC grant are untouched.

DROP POLICY IF EXISTS "authenticated users can join as themselves" ON public.transcribe_room_members;

-- ============================================================================
-- Verification — assert the live catalog, never this file's text
-- ============================================================================
DO $$
DECLARE
  v_insert_policies int;
  v_select_policies int;
BEGIN
  -- 1. No INSERT policy of any name may remain: a renamed copy would be the same hole.
  SELECT count(*) INTO v_insert_policies
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'transcribe_room_members' AND cmd IN ('INSERT', 'ALL');
  IF v_insert_policies <> 0 THEN
    RAISE EXCEPTION 'P1315: % INSERT/ALL policy(ies) still on transcribe_room_members — a client write path survives', v_insert_policies;
  END IF;

  -- 2. Positive control: the roster read must survive, or members could no longer see each other
  --    and this migration would have broken the room while checks 1 passed.
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

  RAISE NOTICE 'P1315: transcribe_room_members has no client INSERT path; membership is RPC-only.';
END;
$$;
