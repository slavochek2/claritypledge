-- Record HOW a user accepted a terms version: 'explicit' (blocking popup, Continue)
-- or 'notice' (dismissible banner, continued use). Without it, a notice dismissal
-- is indistinguishable from explicit consent in the audit trail.
-- Existing rows all came from explicit flows, hence the DEFAULT.
ALTER TABLE public.terms_acceptances
  ADD COLUMN IF NOT EXISTS acceptance_mode text NOT NULL DEFAULT 'explicit';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'terms_acceptances_acceptance_mode_check'
  ) THEN
    ALTER TABLE public.terms_acceptances
      ADD CONSTRAINT terms_acceptances_acceptance_mode_check
      CHECK (acceptance_mode IN ('explicit', 'notice'));
  END IF;
END $$;
