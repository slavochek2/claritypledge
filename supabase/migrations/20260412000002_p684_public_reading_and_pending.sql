-- Migration: P684 — get_letter_for_public_reading RPC + letter_response_pending table
-- Created: 2026-04-12
-- Feature: P684 — One-to-Many Letter: Account Gates Response Submission
--
-- Part 1: get_letter_for_public_reading SECURITY DEFINER RPC
--   Anonymous one-to-many reading without a delivery token.
--   Validates letter exists, status='sealed', mode='one-to-many'.
--   Returns letter metadata + story snapshots (NO predictions, NO delivery row).
--
-- P690 invariant: Stories and points are fetched INSIDE the SECURITY DEFINER body.
--   One-to-many letters routinely reference clarity_docs rows with visibility='private'
--   which anon readers cannot select through RLS. A PostgREST follow-up join would
--   silently drop those rows (phantom count). Fetching inside SECURITY DEFINER bypasses
--   RLS for the narrow snapshot data the reader needs.
--
-- Part 2: letter_response_pending table
--   Service-role-only staging table. Stores ratings + positions + TOS acceptance
--   between signin-request and magic-link confirmation.

-- ============================================================================
-- PART 1: get_letter_for_public_reading RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION get_letter_for_public_reading(p_letter_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_letter  JSONB;
  v_snapshots JSONB;
BEGIN
  -- Validate: letter must exist, be sealed, and be one-to-many
  SELECT jsonb_build_object(
    'id',                   cl.id,
    'sender_id',            cl.sender_id,
    'sender_display_name',  COALESCE(p.name, 'Someone'),
    'mode',                 cl.mode,
    'status',               cl.status,
    'sealed_at',            cl.sealed_at,
    'created_at',           cl.created_at
  ) INTO v_letter
  FROM clarity_letters cl
  LEFT JOIN profiles p ON p.id = cl.sender_id
  WHERE cl.id = p_letter_id
    AND cl.status = 'sealed'
    AND cl.mode = 'one-to-many';

  -- Return NULL if the letter doesn't exist, isn't sealed, or isn't one-to-many
  IF v_letter IS NULL THEN
    RETURN NULL;
  END IF;

  -- Fetch story snapshots (ordered by position).
  -- CRITICAL (P690 invariant): fetched here inside SECURITY DEFINER, NOT via
  -- a PostgREST join from the client. One-to-many letters can reference source
  -- clarity_docs rows with visibility='private'. Anon callers cannot SELECT
  -- those rows through RLS, so a client-side join would silently drop them.
  -- By reading letter_story_snapshots directly inside SECURITY DEFINER we bypass
  -- RLS for snapshot data that was already validated at seal time.
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'letter_id',   lss.letter_id,
      'story_id',    lss.story_id,
      'version_id',  lss.version_id,
      'position',    lss.position,
      'point_config', lss.point_config,
      'visibility',  lss.visibility
    ) ORDER BY lss.position
  ), '[]'::jsonb) INTO v_snapshots
  FROM letter_story_snapshots lss
  WHERE lss.letter_id = p_letter_id;

  -- NOTE: predictions are intentionally excluded (sealed-bid — revealed only after rating)
  -- NOTE: delivery row is intentionally excluded (one-to-many has no per-reader delivery at read time)

  RETURN jsonb_build_object(
    'letter',    v_letter,
    'snapshots', v_snapshots
  );
END;
$$;

-- Allow anonymous access — one-to-many reading is public
GRANT EXECUTE ON FUNCTION get_letter_for_public_reading(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_letter_for_public_reading(UUID) TO authenticated;

-- ============================================================================
-- PART 2: letter_response_pending table
-- ============================================================================

CREATE TABLE IF NOT EXISTS letter_response_pending (
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  letter_id      UUID        NOT NULL REFERENCES clarity_letters(id) ON DELETE CASCADE,
  name           TEXT        NOT NULL CHECK (length(name) <= 100),
  ratings_json   JSONB       NOT NULL,
  positions_json JSONB       NOT NULL,
  terms_version  TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),

  CONSTRAINT letter_response_pending_pkey PRIMARY KEY (user_id, letter_id)
);

-- Index for cleanup job: sweep expired rows
CREATE INDEX IF NOT EXISTS idx_letter_response_pending_expires_at
  ON letter_response_pending (expires_at);

-- RLS: table enabled but all policies blocked — service_role bypasses RLS by default
ALTER TABLE letter_response_pending ENABLE ROW LEVEL SECURITY;

-- Revoke all access from anon and authenticated roles.
-- Only service_role (edge functions) may read or write this table.
REVOKE ALL ON letter_response_pending FROM anon;
REVOKE ALL ON letter_response_pending FROM authenticated;

-- End of migration
