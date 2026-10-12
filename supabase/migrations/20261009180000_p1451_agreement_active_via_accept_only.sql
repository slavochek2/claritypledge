-- P1451: only the partner-authorised accept path makes an agreement active.
--
-- diffed against: 20260902001600_p1230_b_lock_status_and_token.sql
--   (trg_agreements_lock_party_ids: party-id, return-to-pending and token guards
--    unchanged; one guard added)
--
-- client-safe: every client UPDATE of clarity_agreements is in
--   src/app/data/agreements-service-real.ts and none sets status 'active' —
--   lazy expiry writes 'expired' (~L299), cancelInvitation and terminateAgreement
--   write 'terminated' (~L620, ~L677), and the legacy resend fallback writes
--   'pending' (~L568), already refused since P1230 part B. No other src/ file
--   names the table. accept_agreement (SECURITY DEFINER) and the
--   send-agreement-emails edge function (service_role) run as other roles and
--   are not governed by this trigger.
--
-- Why. P1230 locked the parties, the return to pending and the token for client
-- roles, and left forward transitions open on purpose (pending -> expired,
-- * -> terminated). That also left "-> active" open, so a party could mark an
-- agreement accepted without the partner ever accepting. Arriving AT active is
-- now refused for anon/authenticated; staying active (an UPDATE of an already
-- active row, e.g. to terminate it) is unaffected.
-- Specifics: .private/docs/security-log.md (P1451 / P1446 F5).

CREATE OR REPLACE FUNCTION public.trg_agreements_lock_party_ids()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- current_user is the role the statement runs as: 'anon' / 'authenticated'
  -- for PostgREST table writes; the function OWNER for SECURITY DEFINER RPCs
  -- (accept_agreement assigns the partner and activates, rotate_invitation_token
  -- rotates the token, both legitimately); 'service_role' for edge functions and
  -- test fixtures. Only the first two are locked.
  IF current_user IN ('anon', 'authenticated') THEN
    IF NEW.creator_profile_id IS DISTINCT FROM OLD.creator_profile_id
       OR NEW.partner_profile_id IS DISTINCT FROM OLD.partner_profile_id THEN
      RAISE EXCEPTION 'agreement parties cannot be reassigned' USING ERRCODE = '42501';
    END IF;

    -- No reopening. Forward transitions a party legitimately makes —
    -- pending -> expired (lazy expiry), * -> terminated (cancel / terminate) —
    -- are untouched; only arriving AT pending from something else is refused.
    -- Resending an expired invitation goes through rotate_invitation_token().
    IF NEW.status = 'pending' AND OLD.status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'an agreement cannot be returned to pending; use rotate_invitation_token()' USING ERRCODE = '42501';
    END IF;

    -- P1451: acceptance is the partner's act. Only accept_agreement() may make
    -- an agreement active; a party arriving AT active from any other status is
    -- refused.
    IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'an agreement becomes active only through accept_agreement()' USING ERRCODE = '42501';
    END IF;

    -- The token is the acceptance credential. A party choosing its value is the
    -- second step of the composed takeover.
    IF NEW.invitation_token IS DISTINCT FROM OLD.invitation_token THEN
      RAISE EXCEPTION 'invitation_token cannot be set by a party; use rotate_invitation_token()' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_agreements_lock_party_ids() IS
  'P1230 + P1451: for anon/authenticated table writes only — party ids are immutable, status may not return to pending, status may not become active (accept_agreement only), and invitation_token may not be written. SECURITY DEFINER RPCs (accept_agreement, rotate_invitation_token) and service_role run as another role and are exempt by construction.';

-- Assert the end state. The trigger binding is untouched by CREATE OR REPLACE
-- (it binds by oid); re-check it anyway, plus all four guards in the body.
DO $$
DECLARE
  v_src       TEXT;
  v_tgtype    SMALLINT;
  v_tgenabled "char";
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'trg_agreements_lock_party_ids';
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'P1451: trg_agreements_lock_party_ids missing';
  END IF;
  IF position('becomes active only through accept_agreement' IN v_src) = 0 THEN
    RAISE EXCEPTION 'P1451: trigger body lacks the activation guard';
  END IF;
  IF position('agreement parties cannot be reassigned' IN v_src) = 0
     OR position('cannot be returned to pending' IN v_src) = 0
     OR position('invitation_token cannot be set by a party' IN v_src) = 0 THEN
    RAISE EXCEPTION 'P1451: trigger body lost a P1230 guard';
  END IF;

  SELECT t.tgtype, t.tgenabled INTO v_tgtype, v_tgenabled
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'clarity_agreements'
    AND t.tgname = 'agreements_lock_party_ids' AND NOT t.tgisinternal
    AND t.tgfoid = 'public.trg_agreements_lock_party_ids()'::regprocedure;
  IF v_tgtype IS NULL THEN
    RAISE EXCEPTION 'P1451: trigger agreements_lock_party_ids missing or rebound';
  END IF;
  -- pg_trigger.tgtype bits: 1 ROW, 2 BEFORE, 16 UPDATE.
  IF (v_tgtype & 19) <> 19 OR v_tgenabled <> 'O' THEN
    RAISE EXCEPTION 'P1451: trigger is not an enabled BEFORE UPDATE row trigger (tgtype=%, enabled=%)', v_tgtype, v_tgenabled;
  END IF;

  -- The accept path that this guard leaves as the only way in must still exist.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'accept_agreement' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'P1451: accept_agreement missing or not SECURITY DEFINER';
  END IF;
END $$;
