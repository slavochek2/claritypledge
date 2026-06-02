-- P857 (review H1): pin agreement_version after insert.
--
-- The clarity_agreements UPDATE RLS policy (P422) is column-agnostic, so a party
-- to an agreement could PATCH agreement_version post-signing and change which oath
-- their signed certificate displays — without the other party re-affirming. The
-- CHECK only bounds the value to ('legacy','4'); it does not pin it.
--
-- Nothing legitimately UPDATEs the column (createAgreement INSERTs it;
-- accept/resend/cancel/terminate never touch it), so pin it at the DB layer to
-- enforce the grandfathering invariant ("existing rows never re-render"). A future
-- deliberate re-stamp would drop/recreate this trigger around the change.

-- new function (trg_pin_agreement_version has no prior definition)
CREATE OR REPLACE FUNCTION public.trg_pin_agreement_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Ignore any attempt to change the pinned version; the rest of the UPDATE proceeds.
  NEW.agreement_version := OLD.agreement_version;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pin_agreement_version ON public.clarity_agreements;
CREATE TRIGGER pin_agreement_version
  BEFORE UPDATE ON public.clarity_agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_pin_agreement_version();
