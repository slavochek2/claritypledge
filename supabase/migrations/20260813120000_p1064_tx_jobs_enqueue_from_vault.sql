-- P1064: bring tx_jobs_enqueue() under migration control and read its config from Vault.
--
-- client-safe: the only privilege change is REVOKE anon/PUBLIC EXECUTE on a
--   trigger-returning function. PostgREST excludes trigger functions from its
--   schema cache and the PL/pgSQL handler refuses a direct call, so no deployed
--   client can be invoking it and none can be affected. Verified: /rpc/ on a
--   trigger function returns PGRST202 regardless of grant.
--
-- diffed against: live prod pg_proc.prosrc — NOT a prior migration, because none
--   exists. This function was created out-of-band directly against prod and
--   appears in no migration file, which is half of what this change fixes. The
--   prior body was read with pg_get_functiondef() and differs only in that the
--   endpoint and secret were literals; the request it builds is byte-identical,
--   confirmed by comparing the queued net.http_request_queue row before and after.
--
-- Two problems this closes, both surfaced by the P1064 anon-EXECUTE audit:
--
--   1. The function existed ONLY on prod and in no migration file — the single
--      object in the whole SECURITY DEFINER surface with no reviewed source.
--      It is therefore created here for both environments.
--
--   2. It embedded its endpoint and its shared secret as literals in the body,
--      which puts them in pg_proc.prosrc and in every pg_dump. Both now come
--      from Vault, so the value lives in one place and rotating it is a Vault
--      update with no code change.
--
-- ENV-SPECIFIC PREREQUISITE — this migration is inert without it. Each database
-- must hold two Vault secrets before the trigger can enqueue anything:
--
--   select vault.create_secret('<shared secret>', 'transcription_webhook_secret', '...');
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/enqueue-transcription',
--                              'transcription_webhook_url', '...');
--
-- The secret must match the enqueue-transcription edge function's WEBHOOK_SECRET
-- (supabase/functions/enqueue-transcription/index.ts compares them directly).
-- Keeping the URL in Vault too is what lets this one migration run unchanged in
-- both environments without a project ref appearing in the repo.
--
-- Missing config degrades to a WARNING and a no-op enqueue rather than an
-- exception, because this is an AFTER INSERT trigger: raising here would roll
-- back the caller's insert, turning a misconfigured webhook into lost job rows.

-- pg_net was installed on prod and NOT on test — the original function only ever
-- existed on prod, so the dependency was never declared anywhere. Applying this
-- migration to test failed on `schema "net" does not exist` until this line was
-- added. Declared here so the two environments cannot drift apart again.
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.tx_jobs_enqueue()
RETURNS trigger
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
   where name = 'transcription_webhook_url';

  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'transcription_webhook_secret';

  if v_url is null or v_secret is null then
    raise warning 'tx_jobs_enqueue: vault config missing (url present: %, secret present: %) — skipping enqueue for job %',
      (v_url is not null), (v_secret is not null), NEW.id;
    return NEW;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',     'application/json',
                 'x-webhook-secret', v_secret
               ),
    body    := jsonb_build_object(
                 'type',   'INSERT',
                 'table',  'transcription_jobs',
                 'record', jsonb_build_object('id', NEW.id)
               ),
    timeout_milliseconds := 5000
  );

  return NEW;
end
$function$;

-- Grant posture. A trigger function is never invoked as an RPC — PostgREST
-- excludes trigger-returning functions from its schema cache, and the PL/pgSQL
-- handler refuses a direct call — so the anon/PUBLIC EXECUTE this previously
-- carried granted nothing usable. It is removed so the anon-executable
-- inventory reflects the real surface (P1064) rather than carrying dead entries.
-- Both forms are required: a PUBLIC grant and a role-direct grant are separate,
-- and revoking either one alone leaves the other in place.
REVOKE ALL ON FUNCTION public.tx_jobs_enqueue() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tx_jobs_enqueue() FROM anon;

DROP TRIGGER IF EXISTS tx_jobs_enqueue ON public.transcription_jobs;
CREATE TRIGGER tx_jobs_enqueue
  AFTER INSERT ON public.transcription_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tx_jobs_enqueue();
