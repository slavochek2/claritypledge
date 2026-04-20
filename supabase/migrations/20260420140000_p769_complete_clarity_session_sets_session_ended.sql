-- P769: complete_clarity_session — atomically set sessionEnded in live_state
-- diffed against: 20260415130000_p703_complete_session_closes_invites.sql
-- diff: adds live_state JSONB merge before status update; adds target_listener_id to auth check
--
-- Extends the existing function (last updated by P703) to also merge
-- {sessionEnded: true, sessionEndedAt: now()} into the live_state JSONB column
-- in the same transaction as setting status='completed'.
--
-- This makes session-end authoritative: any subscriber watching live_state receives
-- sessionEnded=true immediately after the creator exits, with no race between the
-- status update and a separate live_state PATCH.
--
-- Idempotent: re-running on an already-ended session merges the same keys (no-op).

CREATE OR REPLACE FUNCTION public.complete_clarity_session(p_session_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorization: session creator, joiner, target_listener, OR service_role caller
  -- (service_role is identified by auth.uid() IS NULL — trusted server-side path)
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM clarity_sessions
    WHERE id = p_session_id
      AND (
        creator_profile_id = auth.uid()
        OR joiner_profile_id = auth.uid()
        OR target_listener_id = auth.uid()
      )
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- P769: Set sessionEnded flag in live_state atomically
  UPDATE clarity_sessions
    SET live_state = COALESCE(live_state, '{}') || jsonb_build_object('sessionEnded', true, 'sessionEndedAt', now()::text)
    WHERE id = p_session_id;

  -- Mark session completed
  UPDATE clarity_sessions
    SET status = 'completed'
    WHERE id = p_session_id;

  -- Close linked invite(s) atomically (no-op for non-letter sessions)
  UPDATE clarity_live_invites
    SET closed_at = now()
    WHERE session_id = p_session_id
      AND closed_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_clarity_session(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_clarity_session(UUID) TO authenticated;
