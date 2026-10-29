-- P1576 Part A: per-user request limiter for the transcribe-clip edge function (chat dictation).
--
-- Same shape as mail_rate_limits (20261014130000_p1225_mail_rate_limits.sql): one row per request,
-- counted over a sliding window, decided in the database on its own clock inside one function
-- call, serialized per key with a transaction-scoped advisory lock so exactly `limit` requests are
-- admitted per window however many arrive at once. A refused request keeps its row, so it still
-- counts. The key here is the authenticated user id (dictation is logged-in only), not a salted
-- hash, so the rows go with the account (ON DELETE CASCADE, like ai_rate_limits).
--
-- Written and read only by the edge function through the service role. RLS on, no policies, every
-- client grant on the table AND the function revoked, including the role-direct grants ALTER
-- DEFAULT PRIVILEGES hands new tables and functions (the anon-EXECUTE trap,
-- docs/technical/database.md §P1065). The edge function fails CLOSED when this errors.
--
-- client-safe: brand-new table and function; no deployed client reads, writes or calls them, so
-- revoking client grants on them breaks nothing.

CREATE TABLE IF NOT EXISTS public.transcribe_clip_rate_limits (
  id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  called_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transcribe_clip_rate_limits_user_window_idx
  ON public.transcribe_clip_rate_limits (user_id, called_at);

CREATE INDEX IF NOT EXISTS transcribe_clip_rate_limits_called_at_idx
  ON public.transcribe_clip_rate_limits (called_at);

ALTER TABLE public.transcribe_clip_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.transcribe_clip_rate_limits FROM PUBLIC;
REVOKE ALL ON TABLE public.transcribe_clip_rate_limits FROM anon, authenticated;
-- service_role receives every privilege by default; narrow it. INSERT + SELECT are what the
-- reservation function (SECURITY INVOKER) needs; DELETE lets an integration test reset a bucket.
-- The pg_cron sweep runs as the owner.
REVOKE ALL ON TABLE public.transcribe_clip_rate_limits FROM service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.transcribe_clip_rate_limits TO service_role;

COMMENT ON TABLE public.transcribe_clip_rate_limits IS
  'P1576: one row per request to the transcribe-clip edge function, keyed by the authenticated '
  'user. Service role only. Rows older than the window (1 minute; swept at 1 hour) never affect '
  'a decision.';

-- new function: reserve_transcribe_clip_slot does not exist in any earlier migration.
-- Reserve one slot and decide, all on database time.
-- Returns 0 when admitted; otherwise the Retry-After in seconds (the window length).
CREATE OR REPLACE FUNCTION public.reserve_transcribe_clip_slot(
  p_user_id        uuid,
  p_limit          integer,
  p_window_seconds integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_user_id IS NULL OR p_limit IS NULL OR p_limit < 1
     OR p_window_seconds IS NULL OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'invalid limit' USING ERRCODE = '22023';
  END IF;

  -- One reservation at a time per user: the count below then sees every earlier reservation.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('p1576|transcribe-clip|' || p_user_id::text, 0)
  );

  INSERT INTO public.transcribe_clip_rate_limits (user_id) VALUES (p_user_id);

  SELECT pg_catalog.count(*) INTO v_count
  FROM public.transcribe_clip_rate_limits
  WHERE user_id = p_user_id
    AND called_at > pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds);

  IF v_count <= p_limit THEN
    RETURN 0;
  END IF;
  RETURN p_window_seconds;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_transcribe_clip_slot(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_transcribe_clip_slot(uuid, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_transcribe_clip_slot(uuid, integer, integer) TO service_role;

COMMENT ON FUNCTION public.reserve_transcribe_clip_slot(uuid, integer, integer) IS
  'P1576: reserve one transcribe-clip request slot for a user and decide on database time. '
  '0 = admitted, otherwise Retry-After seconds. Service role only.';

-- Retention: the window is a minute, so rows older than an hour never affect a decision. Same
-- pg_cron availability guard as the mail limiter (local/test instances may lack the extension).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup_transcribe_clip_rate_limits',
      '*/15 * * * *',
      $job$
        DELETE FROM public.transcribe_clip_rate_limits
          WHERE called_at < now() - interval '1 hour';
      $job$
    );
  END IF;
END;
$$;
