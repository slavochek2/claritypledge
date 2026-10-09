-- Migration: P1321 step 3 — revoke anonymous EXECUTE where no anonymous caller exists
-- Created: 2026-10-08
-- Spec: features/p1321_agent_access_security_gate_and_phase1_design.md
--
-- client-safe: no unauthenticated code path calls any of these. Each call site was re-read on
-- 2026-10-08 and every one runs with a signed-in user (inbox, sent tab, results page, my-sessions,
-- the creator-only heartbeat, the authed branch of the letter page). Two exceptions, both
-- behaviour-neutral: create_transcription_job is reached by a guest leaving a room, and its body
-- already raises for a NULL auth.uid() into the same catch; same_variant_misunderstanding is
-- called only by the points trigger, which anon cannot fire (the only INSERT policy on points
-- requires a signed-in, verified user, and anon has no UPDATE policy). get_letter_by_token's only
-- live caller is the create-and-open-letter edge function, which uses the service role.
--
-- Why revoke rather than allowlist: these were the eleven gating findings of
-- scripts/function-grant-drift-check.py, carried in its baseline as "known-open" since the P1064
-- classification (2026-08-13) found no anonymous call site for any of them. An allowlist entry
-- needs a real anonymous caller at file:line; none exists, so each grant is revoked.
--
-- Scope: anon and PUBLIC only. Every function here has a DIRECT grant to authenticated (read from
-- the live ACL on both projects, 2026-10-08), so revoking PUBLIC does not reach signed-in users;
-- the GRANT below restates it rather than relying on that. Both revoke forms are required (P1066):
-- Supabase's default privileges grant anon role-directly.
--
-- get_listener_calibration_avgs / get_speaker_calibration_avgs exist on production only — no
-- migration creates them (object drift; the app reads calibration through direct queries,
-- src/app/data/calibration-service-real.ts). They are revoked only where they exist.
--
-- Verify post-apply by reading the live catalog — scripts/function-grant-drift-check.py, or
-- e2e/integration/p1321-anon-function-grants.spec.ts on test — never by "migration applied".

REVOKE ALL ON FUNCTION public.create_letter_delivery_on_open(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_letter_delivery_on_open(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.create_transcription_job(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_transcription_job(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_deliveries_with_progress(uuid[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_deliveries_with_progress(uuid[]) TO authenticated;

REVOKE ALL ON FUNCTION public.get_inbox_items() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_inbox_items() TO authenticated;

REVOKE ALL ON FUNCTION public.get_letter_by_token(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_letter_by_token(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_letter_results(uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_letter_results(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.retry_transcription(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.retry_transcription(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.same_variant_misunderstanding(text[], text[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.same_variant_misunderstanding(text[], text[]) TO authenticated;

REVOKE ALL ON FUNCTION public.update_last_activity(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_last_activity(uuid) TO authenticated;

DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.get_listener_calibration_avgs(uuid)',
    'public.get_speaker_calibration_avgs(uuid)'
  ] LOOP
    IF to_regprocedure(sig) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, PUBLIC', sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', sig);
    END IF;
  END LOOP;
END
$$;
