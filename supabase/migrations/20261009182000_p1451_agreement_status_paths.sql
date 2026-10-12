-- P1451 (/finish review round): a party moves an agreement only along the app's own status paths,
-- and records only itself as the one who ended it.
--
-- diffed against: 20261009181000_p1451_agreement_content_fixed.sql
--   (trg_agreements_lock_party_ids: all five guards unchanged; two transition guards added)
--
-- client-safe: the client's only status writes (src/app/data/agreements-service-real.ts) are lazy
--   expiry pending -> expired (~L299), cancelInvitation pending -> terminated with
--   terminated_by = the caller (~L620, guarded by status = 'pending' at ~L613), terminateAgreement
--   active -> terminated with terminated_by = the caller (~L677, guarded at ~L670). Decline is the
--   decline_agreement RPC (SECURITY DEFINER, not governed). accept, rotate and erasure are definer
--   RPCs too.
--
-- Why. 20261009180000/181000 guarded where a status change may END (pending, active) and fixed the
-- content columns. Any other change stayed open: a creator could mark an invitation declined (the
-- partner's act), a party could move an accepted agreement to expired or declined, rewrite how an
-- ended one ended, name the other party as having ended it, or stamp an end time without ending it.
--
-- Also asserts the P857 pin trigger the allowlist relies on for agreement_version.
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

    -- P1451 (/finish review): a party moves an agreement only along the app's own paths —
    -- pending -> expired (lazy expiry), pending -> terminated (cancel), active -> terminated (end
    -- it). Declining is the partner's act and goes through decline_agreement().
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT ((OLD.status = 'pending' AND NEW.status IN ('expired', 'terminated'))
             OR (OLD.status = 'active'  AND NEW.status = 'terminated')) THEN
      RAISE EXCEPTION 'this status change is not open to a party' USING ERRCODE = '42501';
    END IF;

    -- The end of an agreement is recorded only by the party ending it, in the same write.
    IF NEW.terminated_by IS DISTINCT FROM OLD.terminated_by
       AND NEW.terminated_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'only the party who ended it can be recorded as having ended it' USING ERRCODE = '42501';
    END IF;
    IF (NEW.terminated_at IS DISTINCT FROM OLD.terminated_at OR NEW.terminated_by IS DISTINCT FROM OLD.terminated_by)
       AND NOT (NEW.status = 'terminated' AND OLD.status IS DISTINCT FROM 'terminated') THEN
      RAISE EXCEPTION 'an end time is set only when the agreement is ended' USING ERRCODE = '42501';
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
  'P1230 + P1451: for anon/authenticated table writes only — party ids are immutable; status moves only pending->expired, pending->terminated, active->terminated (never to pending or active); terminated_by is only the caller and terminated_at/by change only when ending; invitation_token is not writable; no column other than status / terminated_at / terminated_by may change. SECURITY DEFINER RPCs and service_role run as another role and are exempt by construction.';

DO $$
DECLARE
  v_src       TEXT;
  v_secdef    BOOLEAN;
  v_tgtype    SMALLINT;
  v_tgenabled "char";
  v_tgattr    INT2VECTOR;
  v_tgqual    PG_NODE_TREE;
  v_guard     TEXT;
BEGIN
  SELECT p.prosrc, p.prosecdef INTO v_src, v_secdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'trg_agreements_lock_party_ids';
  IF v_src IS NULL OR v_secdef THEN
    RAISE EXCEPTION 'P1451: trg_agreements_lock_party_ids missing, or SECURITY DEFINER (every guard would be skipped)';
  END IF;
  FOREACH v_guard IN ARRAY ARRAY[
    'agreement parties cannot be reassigned', 'cannot be returned to pending',
    'becomes active only through accept_agreement', 'this status change is not open to a party',
    'only the party who ended it can be recorded', 'an end time is set only when the agreement is ended',
    'invitation_token cannot be set by a party', 'content is fixed; a party may change only its status'
  ] LOOP
    IF position(v_guard IN v_src) = 0 THEN
      RAISE EXCEPTION 'P1451: trigger body lacks the guard "%"', v_guard;
    END IF;
  END LOOP;

  -- Both BEFORE UPDATE row triggers this table's integrity rests on: the lock, and P857's pin
  -- (the allowlist leaves agreement_version to it). Unconditional, every column, enabled.
  FOR v_guard IN SELECT unnest(ARRAY['agreements_lock_party_ids', 'pin_agreement_version']) LOOP
    SELECT t.tgtype, t.tgenabled, t.tgattr, t.tgqual INTO v_tgtype, v_tgenabled, v_tgattr, v_tgqual
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.clarity_agreements'::regclass AND t.tgname = v_guard AND NOT t.tgisinternal;
    IF v_tgtype IS NULL THEN
      RAISE EXCEPTION 'P1451: trigger % missing on clarity_agreements', v_guard;
    END IF;
    -- pg_trigger.tgtype bits: 1 ROW, 2 BEFORE, 16 UPDATE.
    IF (v_tgtype & 19) <> 19 OR v_tgenabled <> 'O'
       OR cardinality(v_tgattr::int2[]) > 0  -- int2vector is 0-based: an empty one casts to length 0, not NULL
       OR v_tgqual IS NOT NULL THEN
      RAISE EXCEPTION 'P1451: trigger % is not an enabled, unconditional BEFORE UPDATE row trigger on every column', v_guard;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.clarity_agreements'::regclass
      AND tgname = 'agreements_lock_party_ids' AND tgfoid = 'public.trg_agreements_lock_party_ids()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'P1451: agreements_lock_party_ids is bound to another function';
  END IF;
END $$;
