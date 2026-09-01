-- P1097 (Migration A): mint the room code server-side from a CSPRNG.
--
-- new function: mint_clarity_room_code(integer, integer), clarity_sessions_mint_code()
--
-- client-safe: additive only. A BEFORE INSERT trigger fills `code` when a row arrives
--   WITHOUT one; a row that arrives WITH a code (every deployed client today, and every
--   service_role fixture) is left untouched. No grant, policy, or column changes.
--   Migration B (20260901200100, requires-frontend) is the half that closes the client path.
--
-- Why two migrations. The deployed client mints its own code and sends it on INSERT. If one
-- migration both minted server-side AND revoked the client's INSERT on `code`, there would be
-- a window between frontend deploy and prod apply in which room creation is broken in one
-- direction or the other. Same A/B split P1057 used: A is safe against the old client, the
-- frontend stops sending a code, B revokes the column once that frontend is on origin/main.
--
-- Why the code is minted here and not by a definer RPC that also does the INSERT. The INSERT
-- policy on clarity_sessions (P1038: verified host, creator binding, letter-sender binding)
-- is the authorization boundary for room creation. A SECURITY DEFINER insert bypasses RLS,
-- so that RPC would have to re-implement the policy — two copies of a security predicate.
-- A trigger runs INSIDE the client's own INSERT, so the policy still applies unchanged, and
-- only the one column the client must not choose is taken over. The creator learns the code
-- afterwards through get_room_code_for_invite (P1057, creator-bound) — one extra round trip.
--
-- Why not a column DEFAULT. A DEFAULT expression cannot retry on collision; the trigger
-- calls mint_clarity_room_code(), which re-draws until the code is unused. The UNIQUE
-- constraint (20250101_initial_schema.sql:139) stays as the backstop for the concurrent
-- case where two inserts draw the same free code in the same instant — the client's
-- existing 23505 retry loop re-runs the insert and the trigger draws again.
--
-- Uniformity. The alphabet has 32 symbols and 256 mod 32 = 0, so `byte % 32` is exactly
-- uniform over the alphabet — no rejection sampling needed. The function asserts this so
-- a future alphabet edit cannot silently introduce modulo bias.
--
-- Keyspace arithmetic and the reason a non-CSPRNG mattered here are recorded in
-- .private/docs/security-log.md under P1097, per the disclosure rule in CLAUDE.md.

-- pgcrypto is enabled on Supabase projects by default, in the `extensions` schema.
-- Idempotent; the DO block below asserts it is actually present rather than assuming.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================================
-- 1. mint_clarity_room_code — CSPRNG draw over an explicit alphabet, retry on collision
-- ============================================================================
-- p_length / p_max_attempts exist so the collision-retry branch can be PROVEN by test on a
-- deliberately tiny keyspace (p_length = 1 → 32 codes) instead of asserted. Production
-- callers (the trigger) use the defaults. The function is callable only by service_role
-- (the integration test) and by the trigger, which runs as owner.

CREATE OR REPLACE FUNCTION public.mint_clarity_room_code(
  p_length       integer DEFAULT 6,
  p_max_attempts integer DEFAULT 16
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  -- No I, O, 0, 1 — the same set the client used, so existing rooms and the /live/:code
  -- route validation (clarity-live-page.tsx) keep matching.
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes    bytea;
  v_code     text;
  v_i        integer;
  v_attempt  integer := 0;
BEGIN
  IF length(v_alphabet) <> 32 OR 256 % length(v_alphabet) <> 0 THEN
    RAISE EXCEPTION 'P1097: alphabet length % is not a divisor of 256 — byte %% n would be biased',
      length(v_alphabet);
  END IF;
  IF p_length IS NULL OR p_length < 1 OR p_length > 64 THEN
    RAISE EXCEPTION 'P1097: p_length must be between 1 and 64, got %', p_length;
  END IF;
  IF p_max_attempts IS NULL OR p_max_attempts < 1 THEN
    RAISE EXCEPTION 'P1097: p_max_attempts must be >= 1, got %', p_max_attempts;
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_bytes := gen_random_bytes(p_length);
    v_code := '';
    FOR v_i IN 0 .. p_length - 1 LOOP
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, v_i) % 32) + 1, 1);
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM public.clarity_sessions s WHERE s.code = v_code) THEN
      RETURN v_code;
    END IF;

    IF v_attempt >= p_max_attempts THEN
      -- Deliberately NOT 23505: the client's insert loop retries only unique_violation,
      -- and an exhausted keyspace should surface, not spin.
      RAISE EXCEPTION 'P1097: no free room code after % attempts (length %)',
        p_max_attempts, p_length;
    END IF;
  END LOOP;
END;
$$;

-- Same revoke triple as every P1057 RPC (see 20260817140000:83-88 for why both forms).
REVOKE ALL ON FUNCTION public.mint_clarity_room_code(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mint_clarity_room_code(integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mint_clarity_room_code(integer, integer) TO service_role;

-- ============================================================================
-- 2. Trigger: fill `code` when the row arrives without one
-- ============================================================================
-- SECURITY DEFINER because the invoker (authenticated) holds no EXECUTE on the mint
-- function and no SELECT on `code` — the existence check inside the mint needs both.
-- A supplied code is respected: service_role fixtures (e2e/helpers/test-session.ts and
-- ~40 spec files) insert explicit codes, and until Migration B so does the deployed client.
-- "The client cannot supply a code" is enforced by the column grant in Migration B, not by
-- overriding here — a trigger that silently replaced a client-sent code would leave the
-- old client navigating to a code that names no row.

CREATE OR REPLACE FUNCTION public.clarity_sessions_mint_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := public.mint_clarity_room_code();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.clarity_sessions_mint_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clarity_sessions_mint_code() FROM anon, authenticated;

DROP TRIGGER IF EXISTS clarity_sessions_mint_code ON public.clarity_sessions;
CREATE TRIGGER clarity_sessions_mint_code
  BEFORE INSERT ON public.clarity_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.clarity_sessions_mint_code();

-- ============================================================================
-- Verification — fail loud, in the migration itself
-- ============================================================================
DO $$
DECLARE
  v_code text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    RAISE EXCEPTION 'P1097: pgcrypto is not installed — gen_random_bytes() is unavailable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'clarity_sessions' AND t.tgname = 'clarity_sessions_mint_code'
  ) THEN
    RAISE EXCEPTION 'P1097: trigger clarity_sessions_mint_code is missing';
  END IF;

  -- Grants: neither client role may call the mint directly; service_role may (the test).
  IF has_function_privilege('anon', 'public.mint_clarity_room_code(integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1097: anon can EXECUTE mint_clarity_room_code — the REVOKE did not hold';
  END IF;
  IF has_function_privilege('authenticated', 'public.mint_clarity_room_code(integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1097: authenticated can EXECUTE mint_clarity_room_code — the REVOKE did not hold';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.mint_clarity_room_code(integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1097: service_role lost EXECUTE on mint_clarity_room_code — the integration test cannot run';
  END IF;

  -- Smoke: a default draw is 6 symbols from the alphabet.
  v_code := public.mint_clarity_room_code();
  IF v_code !~ '^[A-HJ-NP-Z2-9]{6}$' THEN
    RAISE EXCEPTION 'P1097: mint produced % — not 6 symbols of the 32-char alphabet', v_code;
  END IF;

  RAISE NOTICE 'P1097 Migration A: server-side mint installed; smoke draw OK.';
END;
$$;
