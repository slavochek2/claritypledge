-- P1243 part B: close the check-then-write race in rotate_invitation_token().
--
-- diffed against: 20260902001500_p1230_b_accept_partner_guard_and_rotate_rpc.sql
--
-- Recreated from the function's CURRENT pg_get_functiondef on the live test database, which
-- was confirmed byte-identical to 20260902001500_p1230_b_accept_partner_guard_and_rotate_rpc.sql
-- (no drift). Only the decision mechanism changes; the error contract does not.
--
-- THE RACE
--
-- The previous body read `status` into a variable with a plain SELECT (no FOR UPDATE),
-- validated it, then issued an UNCONDITIONAL update:
--
--     SELECT a.creator_profile_id, a.status INTO v_creator, v_status ...   -- (1) read
--     IF v_creator IS NULL OR v_creator <> auth.uid() THEN RAISE ...       -- (2) check
--     IF v_status NOT IN ('pending','expired') THEN RAISE ...              -- (3) check
--     UPDATE clarity_agreements SET status = 'pending', invitation_token = ...
--      WHERE id = p_agreement_id;                                          -- (4) write
--
-- Nothing holds the row between (1) and (4). erase_my_account()
-- (20260903090000_p520_erasure_hardening_2.sql:197) can land in that window when the PARTNER
-- erases their account: it sets status = 'terminated', stamps terminated_at, and anonymises
-- partner_profile_id / partner_email / partner_display_name. Statement (4) then overwrites the
-- terminated row back to 'pending' with a fresh, usable invitation token — undoing the
-- erasure-time termination and re-opening an agreement whose counterparty no longer exists.
--
-- The P1230 UPDATE trigger does not catch it: this RPC is SECURITY DEFINER and the trigger
-- exempts that role, which is the whole reason the RPC is the one party-reachable path allowed
-- to write invitation_token.
--
-- THE FIX
--
-- The conditions move INTO the WHERE clause of the write itself, so the row is matched, locked
-- and updated in one statement. A check performed against a value read outside the write's own
-- predicate is not a check. ROW_COUNT is then the authority: `id` is the primary key, so it can
-- only be 0 or 1, and 1 means every condition held at the instant of the write.
--
-- ERROR CONTRACT — PRESERVED EXACTLY. The pre-existing messages, SQLSTATEs and their ORDER are
-- part of this function's contract and are unchanged:
--
--   * no auth.uid()                     -> 42501 'Not authorized: authentication required'
--   * no such row, OR not the creator   -> 42501 'Not authorized: only the creator may resend
--                                         this invitation' — the SAME message for both, so a
--                                         caller who is not the creator still learns nothing
--                                         about whether the id exists
--   * creator, but wrong status         -> 42501 'Cannot resend an invitation for an agreement
--                                         with status %'
--
-- To keep those, a zero-row result is followed by a diagnostic re-read whose ONLY job is to pick
-- which message to raise. That re-read is itself unsynchronised, and deliberately so: it decides
-- wording, never whether the write happens. The write has already been refused by then.
--
-- ONE DELIBERATE BEHAVIOUR CHANGE. The old body returned `v_updated > 0` — so a caller whose
-- checks passed but whose row then vanished got a quiet `false`. That silent false is what made
-- this race invisible. Now a zero-row rotation always raises. The boolean return is kept for the
-- client's signature; it is now only ever `true`.

CREATE OR REPLACE FUNCTION public.rotate_invitation_token(p_agreement_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_creator uuid;
  v_status  text;
  v_updated INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized: authentication required' USING ERRCODE = '42501';
  END IF;

  -- Match, lock and write in ONE statement. Every condition that authorises the rotation is
  -- part of the predicate the write itself evaluates, so no concurrent transaction can change
  -- the row's creator or status between the decision and the update. A concurrent
  -- erase_my_account() either commits first (this UPDATE then matches nothing, because
  -- status is 'terminated') or commits second (it terminates a row that had already been
  -- legitimately rotated). Both orderings leave the erasure's termination standing.
  --
  -- M6 (agreements-service-real.ts): resend is for a live or lapsed invitation only. An
  -- active/terminated agreement has no invitation to resend, and allowing it here would
  -- reopen exactly the active -> pending step the P1230 migration pair closes.
  UPDATE clarity_agreements
     SET invitation_token      = gen_random_uuid()::text,
         invitation_expires_at = now() + interval '7 days',
         status                = 'pending'
   WHERE id                 = p_agreement_id
     AND creator_profile_id = auth.uid()
     AND status IN ('pending', 'expired');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 1 THEN
    RETURN true;
  END IF;

  -- Zero rows. Re-read ONLY to choose which of the pre-existing errors to raise; the refusal
  -- itself has already been decided by the predicate above.
  SELECT a.creator_profile_id, a.status
    INTO v_creator, v_status
  FROM clarity_agreements a
  WHERE a.id = p_agreement_id;

  -- Same error for "no such row" and "not yours": a caller who is not the creator learns
  -- nothing about whether the id exists.
  IF v_creator IS NULL OR v_creator <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized: only the creator may resend this invitation' USING ERRCODE = '42501';
  END IF;

  RAISE EXCEPTION 'Cannot resend an invitation for an agreement with status %', v_status USING ERRCODE = '42501';
END;
$function$;

COMMENT ON FUNCTION public.rotate_invitation_token(uuid) IS
  'P1230 part B, hardened by P1243: creator-only invitation resend. Mints a new token, extends the expiry by 7 days and returns the row to pending, for a pending or expired agreement only. Creator and status are enforced in the UPDATE''s own WHERE clause, so a concurrent erase_my_account() cannot have its termination overwritten (P1243). The one party-reachable path allowed to write invitation_token (see the trigger in 20260902001600).';

-- ============================================================================
-- Verification
-- ============================================================================
-- Asserts the shape that makes the fix true, not that the function was merely replaced: the
-- authorising conditions must appear in the body AFTER the UPDATE keyword. A body-wide
-- substring search for 'creator_profile_id = auth.uid()' passed on the RACY version too — the
-- old body contained that comparison, just in an IF statement instead of the write's predicate.
DO $$
DECLARE
  body       text;
  after_upd  text;
BEGIN
  SELECT prosrc INTO body
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rotate_invitation_token';

  IF body IS NULL THEN
    RAISE EXCEPTION 'P1243: rotate_invitation_token not found';
  END IF;

  after_upd := substring(body from position('UPDATE clarity_agreements' in body));
  IF after_upd = '' OR after_upd IS NULL THEN
    RAISE EXCEPTION 'P1243: no UPDATE clarity_agreements statement in rotate_invitation_token';
  END IF;
  -- Truncate at the diagnostic re-read so the trailing error-selection block cannot satisfy
  -- these assertions on its own.
  after_upd := split_part(after_upd, 'GET DIAGNOSTICS', 1);

  IF position('creator_profile_id = auth.uid()' in after_upd) = 0 THEN
    RAISE EXCEPTION 'P1243: the UPDATE predicate does not bind creator_profile_id to auth.uid() — the creator check is not atomic with the write';
  END IF;

  IF position('status IN (''pending'', ''expired'')' in after_upd) = 0 THEN
    RAISE EXCEPTION 'P1243: the UPDATE predicate does not constrain status — a terminated agreement can be rotated back to pending';
  END IF;

  RAISE NOTICE 'P1243 OK: rotate_invitation_token decides creator and status inside the UPDATE predicate';
END $$;
