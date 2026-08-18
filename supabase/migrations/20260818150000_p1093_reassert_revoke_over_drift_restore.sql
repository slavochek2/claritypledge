-- P1093: re-assert the revoke that a grant-drift remediation restored.
--
-- WHAT HAPPENED, because the ordering is the whole point of this file.
--
-- 20260818090000 (P1093) revoked `authenticated` EXECUTE on
-- persist_anonymous_completion and applied it to TEST. Prod was deliberately left
-- unpatched — the deploy is its own gated step, and the branch carrying the fix had not
-- reached main.
--
-- The P1065 grant-drift check then compared live prod against live test, found this one
-- function disagreeing, and correctly reported it. Its remediation
-- (20260818140000_p1065_restore_authenticated_grant_persist_anonymous_completion.sql)
-- read prod as the baseline — "Prod is exactly what P1063 intended" — and restored the
-- grant on test. That reasoning was sound on the evidence available to it: the
-- revocation genuinely had "no trace in migration text" *on main*, because its trace was
-- on an unmerged feature branch.
--
-- Nothing was done wrong. A security fix lands on test FIRST by design, so for the whole
-- window between "applied to test" and "deployed to prod", every such fix is
-- indistinguishable from drift — and the drift check's own remediation is to undo it.
--
-- WHY A NEW FILE RATHER THAN AN EDIT.
-- The restore is timestamped 20260818140000, LATER than this spec's 20260818090000. On
-- any ordered apply — a fresh environment, a replay, and specifically the pending PROD
-- deploy — the restore therefore runs AFTER the revoke and re-opens the hole. Editing
-- 20260818090000 would not change that; only a statement ordered after 20260818140000
-- can. Reverting the P1065 commit was rejected: it is shipped on main, its header is the
-- record of a check working as designed, and deleting it would erase the evidence of the
-- interaction rather than resolve it.
--
-- client-safe: revoke-only on a function with zero callers anywhere in the repo, already
--   verified as never having written a production row. No signature, return shape or
--   behaviour changes. Idempotent — a no-op where the grant is already absent.
--
-- The regression test for this file is the P1093 canary itself: layers L1, L2 and L3 fail
-- the moment `authenticated` can execute this function again, which is exactly how the
-- restore was detected. Run it after any grant-drift remediation touching this function.
--
-- Integration test: e2e/integration/20260818090000_p1093_signup_payload_gates.spec.ts

BEGIN;

REVOKE EXECUTE ON FUNCTION public.persist_anonymous_completion(uuid, uuid, jsonb, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.persist_anonymous_completion(uuid, uuid, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.persist_anonymous_completion(uuid, uuid, jsonb, jsonb) FROM PUBLIC;

COMMIT;
