-- P495: RPC for client-side transcription job creation
-- Direct INSERT blocked by RLS (service_role only). This SECURITY DEFINER
-- function validates the caller is a session participant before inserting.

CREATE OR REPLACE FUNCTION create_transcription_job(p_session_id UUID)
RETURNS VOID AS $$
DECLARE
  v_session_code TEXT;
  v_is_private BOOLEAN;
BEGIN
  -- Verify caller is a participant and get session details
  SELECT code, is_private INTO v_session_code, v_is_private
  FROM clarity_sessions
  WHERE id = p_session_id
    AND (creator_profile_id = auth.uid() OR joiner_profile_id = auth.uid());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not a participant of this session';
  END IF;

  -- Block private sessions
  IF v_is_private THEN
    RAISE EXCEPTION 'Cannot create transcription job for private session';
  END IF;

  -- Idempotency: skip if a job already exists for this session
  IF EXISTS (
    SELECT 1 FROM transcription_jobs WHERE session_id = p_session_id
  ) THEN
    RETURN;
  END IF;

  INSERT INTO transcription_jobs (session_id, session_code, status)
  VALUES (p_session_id, v_session_code, 'pending');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
