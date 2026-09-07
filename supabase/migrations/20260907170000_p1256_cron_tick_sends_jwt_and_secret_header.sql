-- P1256 (second correction): the tick must satisfy the API gateway AND the function.
--
-- diffed against: 20260907140000_p1256_dispatch_event_emails_cron.sql — same function,
--   same Vault-lookup shape and same WARNING-and-return degradation. The only change is
--   the headers it sends, plus one more Vault lookup for the anon key.
--
-- client-safe: server-side only. Replaces one SECURITY DEFINER function that no client
--   can reach (REVOKEd from PUBLIC/anon/authenticated) and re-points nothing else.
--
-- WHAT THE FIRST FIX MISSED. dispatch-event-emails is deployed WITH gateway JWT
-- verification (scripts/deploy-functions.sh passes --no-verify-jwt to create-and-sign and
-- to nothing else). Supabase's gateway therefore parses `Authorization` and rejects
-- anything that is not a well-formed JWT before the function runs. CRON_SECRET is a
-- 64-char hex string. So `Authorization: Bearer <CRON_SECRET>` — the shape the original
-- job used and the shape 20260907140000 faithfully reproduced — cannot reach the
-- function from anywhere, ever.
--
-- This means the quoting bug was never the only thing wrong. Repairing it alone would
-- have converted 328 Postgres errors into 328 gateway 401s and sent exactly as many
-- emails: none. Confirmed by invoking the repaired tick against prod and reading
-- net._http_response: 401 UNAUTHORIZED_INVALID_JWT_FORMAT, "Invalid JWT".
--
-- The fix: send the ANON key in Authorization — a real JWT, public by design, and the
-- gateway asks for nothing more than a valid one — and carry the real secret in
-- `x-cron-secret`, which the function now also accepts. Authorization is not the
-- security boundary here and never was; CRON_SECRET is.
--
-- ADDITIONAL PREREQUISITE beyond 20260907140000's two:
--   select vault.create_secret('<the project anon key>', 'dispatch_event_emails_anon_key', '...');

CREATE OR REPLACE FUNCTION public.dispatch_event_emails_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_url    text;
  v_secret text;
  v_jwt    text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'dispatch_event_emails_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'dispatch_event_emails_cron_secret';
  select decrypted_secret into v_jwt
    from vault.decrypted_secrets where name = 'dispatch_event_emails_anon_key';

  -- WARNING, not EXCEPTION: a misconfigured environment should leave a trail in the
  -- postgres log, not a cron job that errors every 30 minutes forever.
  if v_url is null or v_secret is null or v_jwt is null then
    raise warning 'dispatch_event_emails_tick: vault config missing (url: %, secret: %, jwt: %) — skipping tick',
      (v_url is not null), (v_secret is not null), (v_jwt is not null);
    return;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',   'application/json',
                 -- Gateway's requirement: a well-formed JWT. Not the auth boundary.
                 'Authorization',  'Bearer ' || v_jwt,
                 -- The actual credential the function checks.
                 'x-cron-secret',  v_secret
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end
$function$;

REVOKE ALL ON FUNCTION public.dispatch_event_emails_tick() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_event_emails_tick() FROM anon;
REVOKE ALL ON FUNCTION public.dispatch_event_emails_tick() FROM authenticated;
