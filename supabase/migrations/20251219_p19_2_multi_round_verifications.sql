-- P19.2 Multi-Round Verification Support
-- Run this migration in Supabase SQL Editor

-- Add correction_text column for author feedback
ALTER TABLE public.clarity_verifications
  ADD COLUMN IF NOT EXISTS correction_text TEXT;

-- Add round_number column to track attempt number
ALTER TABLE public.clarity_verifications
  ADD COLUMN IF NOT EXISTS round_number INT DEFAULT 1;

-- Update status check constraint to include 'needs_retry'
-- First drop existing constraint, then add new one
ALTER TABLE public.clarity_verifications
  DROP CONSTRAINT IF EXISTS clarity_verifications_status_check;

ALTER TABLE public.clarity_verifications
  ADD CONSTRAINT clarity_verifications_status_check
  CHECK (status IN ('pending', 'accepted', 'needs_retry'));

-- Add index for efficient round queries
CREATE INDEX IF NOT EXISTS idx_clarity_verifications_round
  ON public.clarity_verifications(message_id, verifier_name, round_number);

COMMENT ON COLUMN public.clarity_verifications.correction_text IS 'Author feedback if not accepted - what was missed or misunderstood';
COMMENT ON COLUMN public.clarity_verifications.round_number IS 'Which attempt this is (1 = first try, 2 = retry after correction, etc)';
COMMENT ON COLUMN public.clarity_verifications.status IS 'pending = awaiting rating, accepted = understanding verified, needs_retry = author provided correction';
