-- P1093: close the completion writer that recorded whatever the caller sent it.
--
-- The originating spec expected to harden a payload. The evidence said otherwise, and
-- the fix shape changed accordingly:
--
--   * The function has NO call site anywhere in the repo — the two source mentions are
--     comments, and both test mentions are schema introspection.
--   * On prod it has never written a row. It is the only writer of
--     story_verifications.sort_order, and that column is NULL across every row.
--   * It was nonetheless executable by every signed-in user (live prod ACL carried
--     `authenticated=X`; `anon` was already removed by 20260813080000).
--
-- A writer with no caller does not need its payload validated. It needs its grant
-- removed — which closes all four unchecked fields at once (story, version, speaker,
-- ordering) plus the positions half nobody had named, where a caller-chosen point_id
-- became that caller's own recorded position on an unrelated point.
--
-- WHAT THIS DELIBERATELY DOES NOT DO: it does not DROP the function. The P1063
-- regression test asserts an anonymous caller receives 42501 from it; dropping would
-- turn that into "function does not exist" and retire a live guard against a
-- different defect. The body stays, unreachable from any client role.
--
-- THE HALF THAT WAS REAL. P705 built this function to replay a reader's staged
-- letter_point_responses into point_positions once they verify — RLS blocks the
-- client write until then. With no caller, that replay never ran: unverified readers'
-- positions have been stranded in staging. Restored below as replay_letter_positions(),
-- which takes NO PARAMETERS. Caller, deliveries and positions are all derived from
-- server state, so there is no payload to forge — the same defect cannot recur here
-- by construction rather than by validation.
--
-- diffed against: the LIVE prod catalog (pg_proc.proacl and prosrc via the Management
--   API), not migration text — same method and reason as 20260813170000 and
--   20260817120000. Prod realized damage measured before writing this file: 0 forged
--   stories, 0 speaker mismatches, 0 version mismatches across 35 linked letter rows,
--   and 0 rows from this writer at all.
--
-- client-safe: no signature changes to any function a client calls today, and no path
--   that works today begins refusing. The only behaviour change for a client is the
--   new replay entry point, which is additive.
--
-- Integration test: e2e/integration/20260818090000_p1093_signup_payload_gates.spec.ts
--   (4 layers fail before this migration, 3 controls pass; all 7 pass after)

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Remove the reachable grant
-- ---------------------------------------------------------------------------
-- PUBLIC is re-asserted alongside `authenticated`: a grant to PUBLIC would let
-- `authenticated` back in through role inheritance, and revoking one without the
-- other is the failure mode 20260813080000 documented on this same function.

REVOKE EXECUTE ON FUNCTION public.persist_anonymous_completion(uuid, uuid, jsonb, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.persist_anonymous_completion(uuid, uuid, jsonb, jsonb) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 2. The replay, with no caller payload
-- ---------------------------------------------------------------------------
-- Every value is derived:
--   caller     := auth.uid()
--   deliveries := those whose receiver_profile_id IS the caller
--   positions  := rows already staged against those deliveries
--
-- The enum filter mirrors the one it replaces (20260414000000): staging stores TEXT,
-- and rows predating P718 can still hold numeric strings that would fail the cast.
--
-- DISTINCT ON keeps this deterministic when the same point was answered in two of the
-- caller's deliveries — the most recently staged answer wins, rather than whichever
-- row the planner happened to reach first.

CREATE OR REPLACE FUNCTION public.replay_letter_positions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_count     INTEGER;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO point_positions (point_id, user_id, position)
  SELECT DISTINCT ON (lpr.point_id)
         lpr.point_id,
         v_caller_id,
         lpr.position::position_type
  FROM letter_point_responses lpr
  JOIN letter_deliveries ld ON ld.id = lpr.delivery_id
  WHERE ld.receiver_profile_id = v_caller_id
    AND lpr.position IN (
      'strongly_disagree', 'disagree', 'slightly_disagree', 'neutral',
      'slightly_agree', 'agree', 'strongly_agree'
    )
  ORDER BY lpr.point_id, lpr.created_at DESC NULLS LAST
  ON CONFLICT (point_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- Signed-in callers only.
--
-- `anon` is revoked EXPLICITLY, not via PUBLIC. Supabase ships
-- `ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon, authenticated`,
-- so a newly created function is granted to `anon` as a ROLE the moment it exists --
-- and `REVOKE ... FROM PUBLIC` does not touch a role-specific grant. Writing only the
-- PUBLIC revoke here left `anon=X` on the live catalog; caught by reading pg_proc.proacl
-- after applying, not by reading this file. Same class as 20260813080000.
--
-- An anonymous caller would be refused by the body anyway (auth.uid() IS NULL), so this
-- is defence in depth rather than a live hole -- but an unreachable grant is still a
-- grant, and the next body edit is what would make it matter.
REVOKE EXECUTE ON FUNCTION public.replay_letter_positions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replay_letter_positions() FROM anon;
GRANT EXECUTE ON FUNCTION public.replay_letter_positions() TO authenticated;

COMMIT;
