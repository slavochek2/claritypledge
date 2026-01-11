-- P37.2a: Recording Consent Mechanism
-- Provides: terms_acceptances, session_consents tables + profiles column

-- ============================================================================
-- 1. Add accepted_terms_version to profiles (for quick lookup)
-- ============================================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS
  accepted_terms_version TEXT DEFAULT NULL;

-- ============================================================================
-- 2. Terms Acceptances Table (audit trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS terms_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User identification (works for both verified and anonymous users)
  user_id UUID NOT NULL,

  -- Terms version accepted
  terms_version TEXT NOT NULL,  -- e.g., "v1.0", "v1.1"

  -- Audit trail
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash TEXT,
  user_agent TEXT,

  -- Unique constraint: one acceptance per user per version
  UNIQUE(user_id, terms_version)
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_terms_acceptances_user_id ON terms_acceptances(user_id);

-- RLS Policies
ALTER TABLE terms_acceptances ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert (includes anonymous auth users)
CREATE POLICY "Authenticated users can record acceptance"
  ON terms_acceptances FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Users can view their own (authenticated users)
CREATE POLICY "Users can view own acceptances"
  ON terms_acceptances FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================================
-- 3. Session Consents Table (per-session audit trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS session_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Session identification
  session_id TEXT NOT NULL,  -- Live Meeting session code

  -- User identification (works for both verified and anonymous users)
  user_id UUID NOT NULL,

  -- Consent record
  consent_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  terms_version TEXT NOT NULL,  -- Version of terms at time of consent

  -- Audit trail
  ip_hash TEXT,
  user_agent TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_session_consents_session_id ON session_consents(session_id);
CREATE INDEX IF NOT EXISTS idx_session_consents_user_id ON session_consents(user_id);

-- RLS Policies
ALTER TABLE session_consents ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert (includes anonymous auth users)
CREATE POLICY "Authenticated users can record consent"
  ON session_consents FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Users can view their own
CREATE POLICY "Users can view own consents"
  ON session_consents FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================================
-- Notes:
-- ============================================================================
-- 1. RLS INSERT policies use `WITH CHECK (auth.uid() IS NOT NULL)` because:
--    - Anonymous auth users have a valid `auth.uid()` from `signInAnonymously()`
--    - This prevents completely unauthenticated requests from inserting records
--    - Profile creation happens BEFORE the profile row exists, so we can't check `auth.uid() = user_id`
--    - SELECT still requires `auth.uid() = user_id` for privacy
--
-- 2. The `user_id` columns intentionally have no FK to `auth.users` because:
--    - Anonymous users may be cleaned up by Supabase before consent records
--    - Consent records should persist for legal audit even if user is deleted
--    - When deleting a user, consider archiving consent records first
