-- P1104: "an agent cannot take a position on its own behalf" was a property of the test
-- fixture, not of the design. Make it structural.
--
-- client-safe: adds a registry check to two RPCs that no agent account can legitimately
-- call today. Every human caller is unaffected — an agent_accounts row is the only thing
-- that changes the outcome, and no human has one.
--
-- Function-redefinition provenance (pre-commit gate):
--   mark_self_verified -- diffed against: 20260605120000_p880_trust_column_guard.sql
--   set_my_pledge      -- diffed against: 20260605120000_p880_trust_column_guard.sql
--     (both bodies reproduced byte-identical below except for the added registry guard)
--
-- WHY. Adversarial review traced this chain. The claim that an agent cannot hold a
-- position rests on two facts about how the FIXTURE mints its auth user: no password, and
-- email_confirm: false. Neither is forbidden anywhere. If a production filer ever mints
-- with a confirmable mailbox — or the mailbox is confirmed later — then anyone holding a
-- session for that auth user (a magic link needs no password) can:
--
--   1. mark_self_verified()  -> passes; it checks only auth.users.email_confirmed_at
--   2. INSERT point_positions -> the policy is auth.uid() = user_id AND is_verified,
--                                and step 1 just satisfied the second half
--   3. set_my_pledge(true)   -> passes, because step 1 satisfied its is_verified gate
--
-- None of the three consults agent_accounts. After step 3 the agent's profile page also
-- offers "Their Clarity Pledge" and the Clarity Badge, which the Non-Goals forbid outright:
-- "Do NOT let one of these accounts hold a pledge, an oath, or a reputation count."
--
-- The registry check makes the Non-Goal enforced rather than incidental. It does not
-- depend on how the auth user was minted, which is the point: the guarantee should not
-- rest on a caller's choice of email_confirm flag.

BEGIN;

CREATE OR REPLACE FUNCTION public.mark_self_verified()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := auth.uid();
  v_confirmed boolean;
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'mark_self_verified requires an authenticated caller';
  END IF;

  -- P1104: a machine's reading of a person never becomes a verified account.
  IF EXISTS (SELECT 1 FROM public.agent_accounts a WHERE a.profile_id = v_id) THEN
    RETURN false;
  END IF;

  SELECT (u.email_confirmed_at IS NOT NULL) INTO v_confirmed
  FROM auth.users u WHERE u.id = v_id;

  IF COALESCE(v_confirmed, false) THEN
    UPDATE public.profiles SET is_verified = true WHERE id = v_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_my_pledge(p_pledged boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := auth.uid();
  v_rows integer;
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'set_my_pledge requires an authenticated caller';
  END IF;

  -- P1104: an agent account holds no pledge. Guarded on the way UP only — clearing a
  -- pledge stays available, so this can never trap a value on.
  IF p_pledged AND EXISTS (SELECT 1 FROM public.agent_accounts a WHERE a.profile_id = v_id) THEN
    RETURN false;
  END IF;

  IF p_pledged THEN
    -- Atomic check-and-set: the is_verified gate is part of the UPDATE's WHERE, so there
    -- is no read-then-write window where is_verified could change between the two.
    UPDATE public.profiles SET has_pledged = true
      WHERE id = v_id AND is_verified = true;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows > 0;  -- false when not verified (no row matched)
  END IF;

  UPDATE public.profiles SET has_pledged = false WHERE id = v_id;
  RETURN true;
END;
$$;

-- CREATE OR REPLACE does not reset grants; both keep their P880 authenticated-only
-- EXECUTE grant.

COMMIT;
