-- P422: Clarity Partner Agreement
-- Creates clarity_agreements table, display_id trigger, and RLS policies.

-- ── Sequence for display ID ────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS clarity_agreements_display_seq START 1;

-- ── Main table ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clarity_agreements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parties (both stored as profile UUIDs)
  creator_profile_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  partner_profile_id    UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,

  -- Invitation target (always stored; used for lookup on acceptance)
  partner_email         TEXT NOT NULL,

  -- Agreement content
  terms_text            TEXT NOT NULL CHECK (char_length(terms_text) <= 1000),

  -- Status lifecycle: pending → active | declined | expired | terminated
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'active', 'declined', 'expired', 'terminated')),

  -- Visibility: private or public
  visibility            TEXT NOT NULL DEFAULT 'private'
                          CHECK (visibility IN ('private', 'public')),

  -- Invitation token for the acceptance URL
  invitation_token      TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  invitation_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),

  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  partner_signed_at     TIMESTAMPTZ,
  terminated_at         TIMESTAMPTZ,
  terminated_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Display short ID — A-NNNN format, display only
  display_id            TEXT UNIQUE,

  -- Prevent self-agreements
  CONSTRAINT no_self_agreement
    CHECK (partner_profile_id IS NULL OR partner_profile_id != creator_profile_id)
);

-- ── Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clarity_agreements_creator
  ON public.clarity_agreements(creator_profile_id);
CREATE INDEX IF NOT EXISTS idx_clarity_agreements_partner
  ON public.clarity_agreements(partner_profile_id);
CREATE INDEX IF NOT EXISTS idx_clarity_agreements_token
  ON public.clarity_agreements(invitation_token);
CREATE INDEX IF NOT EXISTS idx_clarity_agreements_partner_email
  ON public.clarity_agreements(partner_email);
CREATE INDEX IF NOT EXISTS idx_clarity_agreements_status
  ON public.clarity_agreements(status);

-- ── Display ID trigger ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_set_agreement_display_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.display_id := 'A-' || LPAD(nextval('clarity_agreements_display_seq')::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_agreement_display_id
  BEFORE INSERT ON public.clarity_agreements
  FOR EACH ROW
  WHEN (NEW.display_id IS NULL)
  EXECUTE FUNCTION trg_set_agreement_display_id();

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.clarity_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agreements readable by visibility and parties"
  ON public.clarity_agreements FOR SELECT
  USING (
    visibility = 'public'
    OR creator_profile_id = auth.uid()
    OR partner_profile_id = auth.uid()
  );

CREATE POLICY "Authenticated users can create agreements"
  ON public.clarity_agreements FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND creator_profile_id = auth.uid()
  );

CREATE POLICY "Parties can update their agreements"
  ON public.clarity_agreements FOR UPDATE
  USING (
    creator_profile_id = auth.uid()
    OR partner_profile_id = auth.uid()
  );
