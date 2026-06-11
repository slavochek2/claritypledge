-- P928: allow agreement_version '5' (oath wording "intention" → "intended meaning").
--
-- Additive, idempotent. The agreement oath bumped to v5 (VERIFIED_UNDERSTANDING_OATH[5]);
-- CURRENT_AGREEMENT_VERSION now stamps new rows with '5' server-side
-- (agreementsService.createAgreement, never from client input). The existing CHECK
-- bounded the column to ('legacy','4'), so a v5 insert would be rejected until the
-- constraint is expanded. v4 and 'legacy' stay valid — existing rows are untouched
-- and the pin trigger keeps every signed row on its stored version.
--
-- Rollback: flip CURRENT_AGREEMENT_VERSION back to 4 (code). This migration only
-- widens the allowed set, so it never needs reverting; the CHECK is a backstop.

ALTER TABLE public.clarity_agreements
  DROP CONSTRAINT IF EXISTS clarity_agreements_agreement_version_check;
ALTER TABLE public.clarity_agreements
  ADD CONSTRAINT clarity_agreements_agreement_version_check
    CHECK (agreement_version IN ('legacy', '4', '5'));
