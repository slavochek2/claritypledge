-- P1223 (G5 of the 2026-09-01 security sweep): pin search_path on the four SECURITY DEFINER
-- functions that had none.
--
-- diffed against:
--   create_transcription_job  — 20260313140327_p495_create_transcription_job_rpc.sql
--   expire_stale_sub_rooms    — 20260208_p124_event_sub_rooms.sql
--   retry_transcription       — 20260313120000_p495_transcription_tables.sql
--   update_last_activity      — 20260315141534_p511_session_resilience.sql
-- The ONLY changes are `SET search_path = public` and schema-qualifying every table
-- reference (public.clarity_sessions, public.transcription_jobs, public.event_sub_rooms).
-- Signatures, bodies, error messages, trigger bindings and grants are otherwise
-- byte-for-byte. auth.uid() was already qualified; now()/interval resolve via pg_catalog.
--
-- Why `= public` and not `= ''`: docs/decisions.md 2026-06-06 [technical] (P878) — all four
-- are WRITE paths (INSERT transcription_jobs / UPDATE clarity_sessions / UPDATE
-- event_sub_rooms), and the ruling is that writes which can fire legacy triggers use
-- `= public` + qualified names, because a trigger body with an unqualified reference fails
-- with 42P01 under an empty search_path. Reads use `= ''` (2026-05-31). With the path pinned
-- to `public` alone, a schema injected ahead of it by a caller's session setting is no
-- longer consulted, which is the whole exposure this closes.
--
-- client-safe: function bodies only; no grant, policy, column or behaviour change.
-- Why not `ALTER FUNCTION … SET`: it would pin the path but leave the bodies unqualified,
-- which is the half of the convention every other definer function in this repo carries.

-- ============================================================================
-- 1. create_transcription_job(uuid) — P495
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_transcription_job(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_code TEXT;
  v_is_private BOOLEAN;
BEGIN
  -- Verify caller is a participant and get session details
  SELECT code, is_private INTO v_session_code, v_is_private
  FROM public.clarity_sessions
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
    SELECT 1 FROM public.transcription_jobs WHERE session_id = p_session_id
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.transcription_jobs (session_id, session_code, status)
  VALUES (p_session_id, v_session_code, 'pending');
END;
$$;

-- ============================================================================
-- 2. expire_stale_sub_rooms() — P124 trigger function (BEFORE INSERT ON event_sub_rooms)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.expire_stale_sub_rooms()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.event_sub_rooms
  SET status = 'expired'
  WHERE event_id = NEW.event_id
    AND status = 'pending'
    AND expires_at < NOW();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. retry_transcription(uuid) — P495
-- ============================================================================
CREATE OR REPLACE FUNCTION public.retry_transcription(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_code TEXT;
  v_last_retry TIMESTAMPTZ;
BEGIN
  -- Verify caller is a participant
  IF NOT EXISTS (
    SELECT 1 FROM public.clarity_sessions
    WHERE id = p_session_id
      AND (creator_profile_id = auth.uid() OR joiner_profile_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not a participant of this session';
  END IF;

  -- Rate limit: 5 minutes between retries
  SELECT MAX(created_at) INTO v_last_retry
  FROM public.transcription_jobs
  WHERE session_id = p_session_id AND status = 'pending';

  IF v_last_retry IS NOT NULL AND v_last_retry > now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'Please wait 5 minutes before retrying';
  END IF;

  -- Get session code
  SELECT code INTO v_session_code
  FROM public.clarity_sessions
  WHERE id = p_session_id;

  -- Insert new pending job
  INSERT INTO public.transcription_jobs (session_id, session_code, status)
  VALUES (p_session_id, v_session_code, 'pending');
END;
$$;

-- ============================================================================
-- 4. update_last_activity(uuid) — P511
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_last_activity(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.clarity_sessions
  SET last_activity_at = now()
  WHERE id = p_session_id
    AND creator_profile_id = auth.uid();
  -- No-op if caller is not the creator (anonymous joiners, non-participants)
END;
$$;

-- ============================================================================
-- 5. Positive control — the migration fails loudly if any of the four is still unpinned
-- ============================================================================
DO $$
DECLARE
  v_missing text[];
BEGIN
  SELECT array_agg(p.proname::text ORDER BY p.proname)
    INTO v_missing
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('create_transcription_job', 'expire_stale_sub_rooms',
                      'retry_transcription', 'update_last_activity')
    AND (
      NOT p.prosecdef
      OR p.proconfig IS NULL
      OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')
    );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'P1223: search_path still unpinned (or not SECURITY DEFINER) on: %', v_missing;
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('create_transcription_job', 'expire_stale_sub_rooms',
                          'retry_transcription', 'update_last_activity')) <> 4 THEN
    RAISE EXCEPTION 'P1223: expected exactly 4 target functions in public, found a different count';
  END IF;
END $$;
