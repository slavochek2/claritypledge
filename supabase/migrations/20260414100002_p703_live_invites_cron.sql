-- P703: Orphan cleanup cron for clarity_live_invites (AD6)
--
-- Hourly job: close open invites older than 24h.
-- Safety net for tab-close and other cases where completeClaritySession() never fires.
-- Unique partial index (see main migration) prevents new invites while orphan is open;
-- this cron ensures the slot clears within at most 1h.

-- pg_cron availability check: Supabase hosted projects have pg_cron enabled;
-- local/test instances may not. Skip gracefully if schema missing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup_stale_live_invites',
      '0 * * * *',
      $job$
        UPDATE clarity_live_invites
          SET closed_at = now()
          WHERE closed_at IS NULL
            AND created_at < now() - interval '24 hours';
      $job$
    );
  END IF;
END;
$$;
