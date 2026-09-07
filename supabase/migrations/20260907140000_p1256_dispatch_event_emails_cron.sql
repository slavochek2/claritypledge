-- P1256: actually schedule dispatch-event-emails.
--
-- diffed against: no prior migration — public.dispatch_event_emails_tick() is NEW and
--   is created here for the first time. Its shape deliberately mirrors
--   public.tx_jobs_enqueue() in 20260813120000_p1064_tx_jobs_enqueue_from_vault.sql
--   (Vault lookup at run time, WARNING-and-return on missing config, net.http_post,
--   REVOKE from PUBLIC/anon), which is the established pattern in this database for
--   a pg_net call configured out of Vault.
--
-- client-safe: purely additive and entirely server-side. One new function no client
--   can reach (REVOKEd from PUBLIC, anon and authenticated) and one cron schedule.
--   No existing object is altered; no table, column, policy or signature is touched.
--
-- The function has been deployed since P947 (2026-06-10) but NOTHING has ever
-- invoked it. P947's deployment plan called for a `[functions.dispatch-event-emails]`
-- `schedule` block in supabase/config.toml; that block was never added, and it is
-- not a mechanism this project can rely on anyway — config.toml drives the LOCAL
-- stack, and `supabase start` explicitly does not run cron schedules (P947's own
-- trade-off note). Hosted scheduling here is pg_cron, which this database already
-- runs two jobs on.
--
-- Consequence measured before writing this: the 2026-09-06 hike had 8 RSVPs, all
-- with a correctly-computed reminder_scheduled_at AND feedback_scheduled_at, and
-- all with mailgun_message_ids = '{}' and *_attempted_at = NULL. Neither the 24h
-- reminder nor the post-event feedback email has ever been sent for any event.
--
-- Cadence: every 30 minutes. P947 proposed 6-hourly against a 72h look-ahead
-- window, which is fine for handing Mailgun a future delivery time — but the
-- dispatcher's own query is `scheduled_at > now()`, so a row whose scheduled time
-- passes between two runs becomes permanently invisible to it. A tighter cadence
-- shrinks that irrecoverable window from 6 hours to 30 minutes. It is a cheap
-- job: one indexed query that returns nothing on almost every run.
--
-- ENV-SPECIFIC PREREQUISITE — this migration is inert without both Vault secrets,
-- exactly as P1064's tx_jobs_enqueue is:
--
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/dispatch-event-emails',
--                              'dispatch_event_emails_url', 'P1256 cron target');
--   select vault.create_secret('<the CRON_SECRET set on the edge function>',
--                              'dispatch_event_emails_cron_secret', 'P1256 cron auth');
--
-- The secret must match the CRON_SECRET edge-function secret — index.ts compares
-- `Authorization: Bearer <CRON_SECRET>` directly and answers 401 otherwise.
-- Keeping the URL in Vault too is what lets this migration run unchanged on both
-- projects without a project ref landing in this public repo.

CREATE EXTENSION IF NOT EXISTS pg_net;

-- NO `CREATE EXTENSION pg_cron` here, deliberately. pg_cron must be in
-- shared_preload_libraries and can only be created in the cron-enabled database; where
-- it is not preloaded, CREATE EXTENSION RAISES rather than skipping, which would abort
-- this whole migration and make the `IF EXISTS (SELECT 1 FROM pg_extension ...)` guard
-- below dead code — the statement that guard tests for would already have failed the
-- transaction. Both prior cron migrations in this repo (20260414100002_p703 and
-- 20260816120000_p1083) avoid it for exactly this reason and say so. The P1064
-- precedent cited in the header covers pg_net only. Caught in hostile review; the first
-- draft had the CREATE and contradicted the pattern its own header called established.

-- Wrapped in a function rather than inlined into cron.schedule's command string
-- so the Vault lookup happens at RUN time, not at schedule time. Inlining would
-- bake whatever the secret was on migration day into the job definition.
CREATE OR REPLACE FUNCTION public.dispatch_event_emails_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets
   where name = 'dispatch_event_emails_url';

  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'dispatch_event_emails_cron_secret';

  -- WARNING, not EXCEPTION: a misconfigured environment should leave a trail in
  -- the postgres log, not a cron job that errors every 30 minutes forever. The
  -- same degradation choice P1064 made, for the same reason.
  if v_url is null or v_secret is null then
    raise warning 'dispatch_event_emails_tick: vault config missing (url present: %, secret present: %) — skipping tick',
      (v_url is not null), (v_secret is not null);
    return;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_secret
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end
$function$;

-- Never reachable as an RPC by a deployed client. Same posture as P1064.
REVOKE ALL ON FUNCTION public.dispatch_event_emails_tick() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_event_emails_tick() FROM anon;
REVOKE ALL ON FUNCTION public.dispatch_event_emails_tick() FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Idempotent: unschedule first so re-running the migration does not stack jobs.
    PERFORM cron.unschedule('dispatch_event_emails')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch_event_emails');

    PERFORM cron.schedule(
      'dispatch_event_emails',
      '*/30 * * * *',
      $job$ SELECT public.dispatch_event_emails_tick(); $job$
    );
  END IF;
END $$;
