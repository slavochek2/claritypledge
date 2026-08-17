-- P1083: /ready always-visible distribution — ephemeral submissions table.
--
-- No auth, no owner column, no identity: same "anonymous ephemeral table" shape as
-- clarity_feed_ideas (20251218_p19_3_idea_feed.sql). The retention window is enforced
-- twice: the SELECT policy filters expired rows out of every read regardless of query
-- shape, and the pg_cron job below hard-deletes them so they don't sit on disk either.
--
-- client-safe: brand-new table — no deployed client reads or writes it yet, so there
-- is nothing for the DROP POLICY/CREATE POLICY pair below to break.

CREATE TABLE IF NOT EXISTS public.ready_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  value SMALLINT NOT NULL CHECK (value BETWEEN 0 AND 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ready_submissions_created_at
  ON public.ready_submissions (created_at);

ALTER TABLE public.ready_submissions ENABLE ROW LEVEL SECURITY;

-- intentionally-public: /ready's whole appeal is a frictionless, no-login entry
-- point (matches P1077's own UI Contract) — this table has no owner column and no
-- identity to bind an INSERT to, so public INSERT is the only INSERT this table
-- can ever have. No-auth abuse risk explicitly accepted, see the spec's Risks
-- section: low-stakes vibe signal, no rate-limiting infra for a threat with no
-- real consequence.
DROP POLICY IF EXISTS "anyone can submit a ready value" ON public.ready_submissions;
CREATE POLICY "anyone can submit a ready value"
  ON public.ready_submissions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- RLS is row-level only — WITH CHECK (true) above says nothing about which COLUMNS
-- a client may set. Without this, a client could POST {"value":5,"created_at":"2099-..."}
-- and defeat both retention layers at once: a future created_at passes the SELECT
-- policy's `>` filter forever, and never matches the cron's `<` filter, so the row
-- is permanently visible and never cleaned up (adversarial review finding, 2026-08-17).
-- id/created_at keep their DEFAULT (gen_random_uuid()/now()) as long as the client
-- never references them — PostgREST only needs column INSERT privilege for columns
-- present in the request body. seed helpers use the service-role client, which
-- bypasses RLS and column grants entirely, so backdating test fixtures still works.
REVOKE INSERT ON public.ready_submissions FROM anon, authenticated;
GRANT INSERT (value) ON public.ready_submissions TO anon, authenticated;

-- The retention window itself: no client can ever read a row older than 10 minutes,
-- independent of how the client queries — this is what "not retained beyond the
-- window" actually means from the read side, not just eventual deletion.
DROP POLICY IF EXISTS "anyone can read recent ready submissions" ON public.ready_submissions;
CREATE POLICY "anyone can read recent ready submissions"
  ON public.ready_submissions FOR SELECT
  TO anon, authenticated
  USING (created_at > now() - interval '10 minutes');

-- No UPDATE/DELETE policy for clients — rows are write-once, cleaned up server-side only.

-- pg_cron availability check: Supabase hosted projects have pg_cron enabled;
-- local/test instances may not. Skip gracefully if schema missing (same pattern as
-- 20260414100002_p703_live_invites_cron.sql).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup_expired_ready_submissions',
      '*/5 * * * *',
      $job$
        DELETE FROM public.ready_submissions
          WHERE created_at < now() - interval '10 minutes';
      $job$
    );
  END IF;
END;
$$;
