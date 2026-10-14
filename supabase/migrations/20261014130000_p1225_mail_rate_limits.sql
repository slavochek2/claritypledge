-- P1225: request-count table + reservation function for anonymous mail-sending /
-- account-creating edge functions.
--
-- Same shape as ai_rate_limits (20260225120000_p425_ai_rate_limits.sql): one row per request,
-- counted over a sliding window. ai_rate_limits itself cannot be reused — its key is a NOT NULL
-- user_id referencing auth.users, and these callers have no account yet. Here the key is a
-- salted SHA-256 hex digest (of the caller's address or of the target email), plus the function
-- name and which bucket the row belongs to. No raw address or email is ever stored; the CHECK
-- below refuses anything that is not a 64-char hex digest.
--
-- The window is computed in the database (now()) inside one function call, so the edge
-- runtime's clock never takes part in a decision. Reservations for one key are serialized with a
-- transaction-scoped advisory lock, so exactly `limit` requests are admitted per window however
-- many arrive at once. A refused request keeps its row, so it still counts.
--
-- Written and read only by edge functions through the service role
-- (supabase/functions/_shared/mail-rate-limit.ts). RLS on, no policies, every client grant on
-- the table AND the function revoked — including the role-direct grants ALTER DEFAULT PRIVILEGES
-- hands new tables and functions (the anon-EXECUTE trap, docs/technical/database.md §P1065).
--
-- client-safe: brand-new table and function — no deployed client reads, writes or calls them,
-- so revoking client grants on them breaks nothing.

CREATE TABLE IF NOT EXISTS public.mail_rate_limits (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text        NOT NULL CHECK (function_name ~ '^[a-z0-9-]{1,64}$'),
  bucket        text        NOT NULL CHECK (bucket IN ('ip', 'target')),
  key_hash      text        NOT NULL CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  called_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mail_rate_limits_key_window_idx
  ON public.mail_rate_limits (function_name, bucket, key_hash, called_at);

CREATE INDEX IF NOT EXISTS mail_rate_limits_called_at_idx
  ON public.mail_rate_limits (called_at);

ALTER TABLE public.mail_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.mail_rate_limits FROM PUBLIC;
REVOKE ALL ON TABLE public.mail_rate_limits FROM anon, authenticated;
-- service_role receives every privilege by default; narrow it. INSERT + SELECT are what the
-- reservation function (SECURITY INVOKER) needs; DELETE lets the integration test reset the
-- bucket of the machine it runs on. The pg_cron sweep runs as the owner.
REVOKE ALL ON TABLE public.mail_rate_limits FROM service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.mail_rate_limits TO service_role;

COMMENT ON TABLE public.mail_rate_limits IS
  'P1225: one row per request to an anonymous mail-sending edge function, keyed by a salted hash '
  '(caller address or target email). Service role only. Rows older than the longest window '
  '(1 hour) are swept by pg_cron.';

-- new function: reserve_mail_rate_slot does not exist in any earlier migration.
-- Reserve one slot and decide, all on database time.
-- Returns 0 when admitted; otherwise the Retry-After in seconds (the window length).
CREATE OR REPLACE FUNCTION public.reserve_mail_rate_slot(
  p_function_name  text,
  p_bucket         text,
  p_key_hash       text,
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
  IF p_limit IS NULL OR p_limit < 1 OR p_window_seconds IS NULL OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'invalid limit' USING ERRCODE = '22023';
  END IF;

  -- One reservation at a time per key: the count below then sees every earlier reservation.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('p1225|' || p_function_name || '|' || p_bucket || '|' || p_key_hash, 0)
  );

  INSERT INTO public.mail_rate_limits (function_name, bucket, key_hash)
  VALUES (p_function_name, p_bucket, p_key_hash);

  SELECT pg_catalog.count(*) INTO v_count
  FROM public.mail_rate_limits
  WHERE function_name = p_function_name
    AND bucket = p_bucket
    AND key_hash = p_key_hash
    AND called_at > pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds);

  IF v_count <= p_limit THEN
    RETURN 0;
  END IF;
  RETURN p_window_seconds;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_mail_rate_slot(text, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_mail_rate_slot(text, text, text, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_mail_rate_slot(text, text, text, integer, integer) TO service_role;

COMMENT ON FUNCTION public.reserve_mail_rate_slot(text, text, text, integer, integer) IS
  'P1225: reserve one request slot for (function, bucket, key hash) and decide on database time. '
  '0 = admitted, otherwise Retry-After seconds. Service role only.';

-- Retention: the longest window is 1 hour, so older rows never affect a decision. Same
-- pg_cron availability guard as 20260816120000_p1083_ready_submissions.sql (local/test
-- instances may not have the extension).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup_mail_rate_limits',
      '*/15 * * * *',
      $job$
        DELETE FROM public.mail_rate_limits
          WHERE called_at < now() - interval '1 hour';
      $job$
    );
  END IF;
END;
$$;
