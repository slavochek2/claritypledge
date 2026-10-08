-- diffed against: 20260403224331_p581_clarity_letters.sql (STEP 8 — the UPDATE policy
--   "Receiver can update delivery status" is unchanged; this file narrows the grant beneath it)
--
-- client-safe: every client write to letter_deliveries sets only status, opened_at,
--   completed_at or saved_story_index (src/app/data/letters-service.ts: submitPointResponse,
--   updateDeliveryStatus, saveLetterPauseState). The one other write in the bundle,
--   AuthCallbackPage.tsx's receiver_profile_id link, is unreachable: nothing in src writes the
--   letterCompletion_ sessionStorage keys it iterates, and its receiver_profile_id IS NULL
--   filter matches no row under the UPDATE policy anyway. Service-role callers (edge functions,
--   test fixtures) and SECURITY DEFINER functions are not governed by these grants.
--
-- P1446: a receiver records progress on a delivery and changes nothing else. Which letter a
-- delivery belongs to, who receives it, its address and its invitation window are decided by
-- the server when the delivery is created. Before this file `authenticated` (and `anon`) held
-- UPDATE on every column. Specifics: .private/docs/security-log.md (P1446).
--
-- A whitelist rather than a trigger: a column added later is not client-writable until someone
-- grants it on purpose.

REVOKE UPDATE ON public.letter_deliveries FROM PUBLIC, anon, authenticated;

GRANT UPDATE (status, opened_at, completed_at, saved_story_index)
  ON public.letter_deliveries TO authenticated;

DO $$
DECLARE
  c_writable CONSTANT text[] := ARRAY['status', 'opened_at', 'completed_at', 'saved_story_index'];
  v_col text;
BEGIN
  FOR v_col IN
    SELECT a.attname FROM pg_attribute a
    WHERE a.attrelid = 'public.letter_deliveries'::regclass AND a.attnum > 0 AND NOT a.attisdropped
  LOOP
    IF has_column_privilege('anon', 'public.letter_deliveries', v_col, 'UPDATE') THEN
      RAISE EXCEPTION 'P1446: anon can still UPDATE letter_deliveries.%', v_col;
    END IF;
    IF (v_col = ANY (c_writable))
       IS DISTINCT FROM has_column_privilege('authenticated', 'public.letter_deliveries', v_col, 'UPDATE') THEN
      RAISE EXCEPTION 'P1446: authenticated UPDATE on letter_deliveries.% is %, expected %',
        v_col,
        has_column_privilege('authenticated', 'public.letter_deliveries', v_col, 'UPDATE'),
        v_col = ANY (c_writable);
    END IF;
  END LOOP;
END $$;
