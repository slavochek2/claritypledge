-- P1576 Part B: backoff for the storage purge queue (round-3 review). The earlier voice-notes migrations
-- are applied on the test database and are NOT edited.
--
-- client-safe: server-side only. Two columns with defaults on a service-role-only table, one index, and two
--   new service-role-only functions. No existing object is altered, no client role can reach any of them,
--   and no deployed client reads or writes the table.
--
-- diffed against: no earlier migration; chat_voice_purge_due and chat_voice_purge_failed are new.
--   chat_voice_purge itself comes from 20261027120100_p1576_chat_voice_notes.sql.
--
-- THE PROBLEM. The sweep deleted the oldest queued object first, every tick. An object whose DELETE keeps
-- timing out therefore sat at the head of the queue and used up the sweep's purge share on every tick,
-- while the healthy objects behind it were never tried; an in-memory "skip these" list reset with each run.
--
-- THE FIX lives in the data. Every row carries `attempts` and `next_attempt_at`. The sweep reads only rows
-- that are DUE (database clock), soonest due first, and reports each failed delete; the database then
-- pushes that row out by 2^attempts minutes (2, 4, 8, ... at most a day). A fresh row is due at once, so it
-- is read before a backed-off one, and a stuck object costs one attempt per backoff window instead of one
-- per tick.

ALTER TABLE public.chat_voice_purge
  ADD COLUMN IF NOT EXISTS attempts        integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS chat_voice_purge_due
  ON public.chat_voice_purge (next_attempt_at);

-- The paths the sweep should try now: due on the database clock, soonest due first (a backed-off path
-- sorts behind every fresh one), oldest first among equals. Bounded.
CREATE OR REPLACE FUNCTION public.chat_voice_purge_due(p_limit integer DEFAULT 100)
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.path
    FROM public.chat_voice_purge p
   WHERE p.next_attempt_at <= now()
   ORDER BY p.next_attempt_at, p.enqueued_at
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100);
$$;
REVOKE ALL ON FUNCTION public.chat_voice_purge_due(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_voice_purge_due(integer) TO service_role;

-- A delete of this path failed: count the attempt and schedule the next one 2^attempts minutes from now
-- (2, 4, 8, ... capped at a day). 2^11 is already past the cap, so the exponent is bounded too.
CREATE OR REPLACE FUNCTION public.chat_voice_purge_failed(p_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.chat_voice_purge p
     SET attempts        = p.attempts + 1,
         next_attempt_at = now() + make_interval(mins => LEAST(1440, (2 ^ LEAST(p.attempts + 1, 11))::integer))
   WHERE p.path = p_path;
END;
$$;
REVOKE ALL ON FUNCTION public.chat_voice_purge_failed(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_voice_purge_failed(text) TO service_role;

DO $assert$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid, p.proname,
           (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                                         WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')) AS public_exec
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN ('chat_voice_purge_due', 'chat_voice_purge_failed')
  LOOP
    IF has_function_privilege('anon', f.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', f.oid, 'EXECUTE') OR f.public_exec THEN
      RAISE EXCEPTION 'P1576: a client role can execute public.%', f.proname;
    END IF;
  END LOOP;
  IF has_table_privilege('authenticated', 'public.chat_voice_purge', 'SELECT')
     OR has_table_privilege('anon', 'public.chat_voice_purge', 'SELECT') THEN
    RAISE EXCEPTION 'P1576: a client role can read the purge queue';
  END IF;
END;
$assert$;
