-- P511: Session resilience — grace period support
-- Adds last_activity_at for heartbeat-based liveness detection

ALTER TABLE public.clarity_sessions
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

-- Backfill existing sessions (use created_at as initial value)
UPDATE public.clarity_sessions
SET last_activity_at = created_at
WHERE last_activity_at IS NULL;

-- Index for efficient stale-session queries
CREATE INDEX IF NOT EXISTS idx_clarity_sessions_last_activity
  ON public.clarity_sessions(last_activity_at)
  WHERE last_activity_at IS NOT NULL;

-- RPC to update last_activity_at atomically
-- SECURITY DEFINER with participant authorization check
-- Only the session creator (authenticated) can send heartbeats.
-- Anonymous joiners do NOT heartbeat — the creator's heartbeat keeps the session alive.
-- Joiners rejoin by re-entering the session code within the grace period.
CREATE OR REPLACE FUNCTION update_last_activity(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE clarity_sessions
  SET last_activity_at = now()
  WHERE id = p_session_id
    AND creator_profile_id = auth.uid();
  -- No-op if caller is not the creator (anonymous joiners, non-participants)
END;
$$;
