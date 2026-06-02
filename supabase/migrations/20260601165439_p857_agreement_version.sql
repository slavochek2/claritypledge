-- P857: Add agreement_version column to clarity_agreements.
--
-- Additive, grandfathering migration. The Clarity Partner Agreement oath was
-- previously hardcoded (unversioned). This pins each row to a registry version
-- so a text change (v4) never silently re-renders an existing agreement.
--
--   'legacy' = the bilateral oath that existed before versioning was introduced
--   '4'       = the number-first verified-understanding oath (shared with the pledge)
--
-- The CHECK is expanded as each new version ships. New rows are stamped with the
-- current version server-side by agreementsService.createAgreement (never from
-- client input); existing rows are grandfathered to 'legacy' by the DEFAULT.

ALTER TABLE public.clarity_agreements
  ADD COLUMN IF NOT EXISTS agreement_version TEXT NOT NULL DEFAULT 'legacy';

-- Named constraint (matches the name Postgres auto-assigns to an inline column
-- CHECK, so it is identical to what is already applied on test). Explicit naming
-- lets a future version DROP/re-ADD it by name. Idempotent: drop-if-exists then add.
ALTER TABLE public.clarity_agreements
  DROP CONSTRAINT IF EXISTS clarity_agreements_agreement_version_check;
ALTER TABLE public.clarity_agreements
  ADD CONSTRAINT clarity_agreements_agreement_version_check
    CHECK (agreement_version IN ('legacy', '4'));

-- Explicit backfill (idempotent — the DEFAULT already covers every existing row).
UPDATE public.clarity_agreements
  SET agreement_version = 'legacy'
WHERE agreement_version = 'legacy';
