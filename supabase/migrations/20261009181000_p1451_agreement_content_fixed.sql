-- P1451 (review round): what the partner accepted is fixed. A client may change an agreement's
-- status, and the terminated_at / terminated_by that go with ending it — nothing else.
--
-- diffed against: 20261009180000_p1451_agreement_active_via_accept_only.sql
--   (trg_agreements_lock_party_ids: all four guards unchanged; one column allowlist added)
--
-- client-safe: every client UPDATE of clarity_agreements is in
--   src/app/data/agreements-service-real.ts — lazy expiry sends {status} (~L299), cancelInvitation
--   and terminateAgreement send {status, terminated_at, terminated_by} (~L620, ~L677); the legacy
--   resend fallback (~L568) sends the token and was already refused since P1230 part B. No client
--   update writes terms_text, visibility, partner_signed_at, partner_display_name, partner_email or
--   invitation_expires_at. Definer RPCs (accept_agreement, rotate_invitation_token, decline,
--   erasure) and service_role run as other roles and are not governed by this trigger.
--
-- Why. 20261009180000 stops a client making an agreement active. After a genuine acceptance the
-- row was still column-agnostic for both parties: the terms, the visibility, the signature time
-- and the partner's displayed name could be rewritten while the agreement stayed active and kept
-- the partner's name on it. Same harm as the activation hole — a public claim that a named person
-- agreed to something they did not. An allowlist rather than a denylist, so a column added later
-- is fixed by default.
--
-- agreement_version is left out of the comparison on purpose: pin_agreement_version (P857) already
-- restores it silently, and fires after this trigger (name order), so comparing it here would turn
-- that documented silent pin into an error.
--
-- Specifics: .private/docs/security-log.md (P1451).

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

    -- P1451 (review): everything other than the status columns is fixed for a
    -- client. Re-sending an unchanged value is allowed (IS DISTINCT FROM).
    IF (to_jsonb(NEW) - ARRAY['status', 'terminated_at', 'terminated_by', 'agreement_version'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status', 'terminated_at', 'terminated_by', 'agreement_version']) THEN
      RAISE EXCEPTION 'an agreement''s content is fixed; a party may change only its status' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_agreements_lock_party_ids() IS
  'P1230 + P1451: for anon/authenticated table writes only — party ids are immutable, status may not return to pending, status may not become active (accept_agreement only), invitation_token may not be written, and no column other than status / terminated_at / terminated_by may change. SECURITY DEFINER RPCs and service_role run as another role and are exempt by construction.';

-- Assert the end state, including the binding (Codex review finding 4): a trigger
-- narrowed to some columns (tgattr) or given a WHEN clause (tgqual) keeps the same
-- tgtype and would pass a type-only check while never running for a status write.
DO $$
DECLARE
  v_src       TEXT;
  v_tgtype    SMALLINT;
  v_tgenabled "char";
  v_tgattr    INT2VECTOR;
  v_tgqual    PG_NODE_TREE;
  v_secdef    BOOLEAN;
BEGIN
  SELECT p.prosrc, p.prosecdef INTO v_src, v_secdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'trg_agreements_lock_party_ids';
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'P1451: trg_agreements_lock_party_ids missing';
  END IF;
  IF v_secdef THEN
    RAISE EXCEPTION 'P1451: trg_agreements_lock_party_ids must be SECURITY INVOKER — as definer, current_user is the owner and every guard is skipped';
  END IF;
  IF position('content is fixed; a party may change only its status' IN v_src) = 0
     OR position('becomes active only through accept_agreement' IN v_src) = 0
     OR position('agreement parties cannot be reassigned' IN v_src) = 0
     OR position('cannot be returned to pending' IN v_src) = 0
     OR position('invitation_token cannot be set by a party' IN v_src) = 0 THEN
    RAISE EXCEPTION 'P1451: trigger body lacks one of its five guards';
  END IF;

  SELECT t.tgtype, t.tgenabled, t.tgattr, t.tgqual
    INTO v_tgtype, v_tgenabled, v_tgattr, v_tgqual
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
  IF cardinality(v_tgattr::int2[]) > 0 THEN  -- int2vector is 0-based: an empty one casts to length 0, not NULL
    RAISE EXCEPTION 'P1451: trigger is limited to UPDATE OF some columns (tgattr=%) — it must fire for every UPDATE', v_tgattr;
  END IF;
  IF v_tgqual IS NOT NULL THEN
    RAISE EXCEPTION 'P1451: trigger carries a WHEN condition — it must fire unconditionally';
  END IF;
END $$;
