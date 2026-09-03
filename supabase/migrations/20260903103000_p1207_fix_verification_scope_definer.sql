-- Migration: P1207 F11 follow-up — the scope check must not itself be blocked by RLS
-- Created: 2026-09-03
-- diffed against: 20260903100000_p1207_verifications_inherit_session_scope.sql (re-issues that
--   file's SELECT policy with the message lookup moved inside a SECURITY DEFINER function)
--
-- WHY THIS EXISTS. The policy shipped minutes earlier read:
--   USING (EXISTS (SELECT 1 FROM clarity_chat_messages m
--                  WHERE m.id = message_id AND can_read_clarity_session(m.session_id)))
-- A subquery inside an RLS policy is evaluated WITH THE CALLER'S OWN PERMISSIONS, so RLS on the
-- referenced table applies too. clarity_chat_messages has RLS enabled and NO SELECT policy —
-- default-deny — so that EXISTS returned false for EVERY caller and EVERY row. The policy did not
-- merely tighten the private case; it hid every verification, including the anonymous /live
-- flow's own.
--
-- Caught by the spec's CONTROL assertion, which runs BEFORE the leak assertion for exactly this
-- reason: "an open session's verification must stay readable". Without it the suite would have
-- gone green on a fix that broke the product, because the leak assertion passes most emphatically
-- when nothing is readable at all. A fixture containing only inputs the gate should REJECT cannot
-- measure what it wrongly rejects (epistemic gate 7c).
--
-- FIX: move the message->session lookup inside a SECURITY DEFINER function, matching
-- can_read_clarity_session's own reason for being one. The privilege boundary is unchanged — the
-- function returns a boolean, never a row, and answers only the question the policy asks.
--
-- new function: can_read_verification_message does not exist in any prior migration (grep) and is
-- absent from prod's pg_proc (checked 2026-09-03).
--
-- client-safe: restores the open-session read the previous migration removed; the private case
-- stays closed. Net effect versus two migrations ago is exactly F11's intent.

CREATE OR REPLACE FUNCTION public.can_read_verification_message(p_message_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM clarity_chat_messages m
    WHERE m.id = p_message_id
      AND can_read_clarity_session(m.session_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_read_verification_message(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Verifications follow their session's visibility" ON public.clarity_verifications;

CREATE POLICY "Verifications follow their session's visibility"
  ON public.clarity_verifications FOR SELECT
  TO anon, authenticated
  USING (can_read_verification_message(message_id));

COMMENT ON POLICY "Verifications follow their session's visibility" ON public.clarity_verifications IS
  'P1207 F11: a verification is session content one join further out than F10 reached. The lookup '
  'MUST be SECURITY DEFINER — clarity_chat_messages is default-denied, so an inline subquery here '
  'evaluates false for everyone and silently hides every verification, including public ones.';
