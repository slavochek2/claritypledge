-- P1047 (part 3): restore the `creator_profile_id IS NOT NULL` conjunct that part 1 dropped.
--
-- client-safe: restores a predicate that has been live on prod continuously since
-- 20260415120000. Prod never ran without it. This file exists so that test, which briefly
-- ran without it, converges back to prod's behaviour.
--
-- ---------------------------------------------------------------------------
-- Why part 1 was wrong about this
-- ---------------------------------------------------------------------------
--
-- 20260811150000 dropped `creator_profile_id IS NOT NULL` from the UPDATE policy's
-- WITH CHECK, on the reasoning that with the column grant revoked the conjunct could no
-- longer carry security value, and its only remaining effect was to reject every write to
-- a null-creator row — 112 of 239 live prod rows. That was recorded as a second defect.
--
-- It is not a defect. It is P396, working as designed, and the P396 canary
-- (e2e/integration/p396-host-rls-migration.spec.ts:174, "anonymous caller cannot UPDATE a
-- legacy session with creator_profile_id IS NULL") failed the moment part 1 landed on test.
-- The test was right and the migration was wrong.
--
-- The disproof that settled it, run against live prod:
--
--   SELECT count(*), min(created_at)::date, max(created_at)::date,
--          count(*) FILTER (WHERE created_at > '2026-04-15')
--   FROM clarity_sessions WHERE creator_profile_id IS NULL;
--   -> 112 | 2025-12-21 | 2026-02-23 | 0
--
-- Every null-creator row predates 20260415120000, the migration that introduced the
-- conjunct. ZERO have been created in the four months since. They are legacy rows from
-- before sessions carried a creator, not live guest rooms — so "un-updatable" is the
-- intended lockdown, not breakage. The 112-row count was real; the inference that an
-- active flow depended on writing to them was not, and was never tested before being
-- written into a migration.
--
-- What made the wrong reading plausible: `/clarity-demo` is routed (App.tsx:704) and calls
-- createClaritySession without a profile id, so it *looks* like a live null-creator
-- producer. The row dates say otherwise — whatever that path does now, it has not produced
-- a null-creator row since February.
--
-- Part 1's actual fix — the column-grant revoke that closes the ownership forgery — is
-- untouched by this file and stands. Only its section 2 is reversed.

DROP POLICY IF EXISTS clarity_sessions_creator_update ON public.clarity_sessions;

CREATE POLICY clarity_sessions_creator_update
  ON public.clarity_sessions
  FOR UPDATE
  USING (
    (target_listener_id IS NULL)
    OR (auth.uid() = target_listener_id)
    OR (auth.uid() = creator_profile_id)
  )
  WITH CHECK (
    (creator_profile_id IS NOT NULL)
    AND (
      (target_listener_id IS NULL)
      OR (auth.uid() = target_listener_id)
      OR (auth.uid() = creator_profile_id)
    )
  );

-- Net policy state after parts 1+3: byte-identical to what has been live on prod since
-- 20260415120000. The ownership binding for P1047 lives entirely in the column grants
-- (part 1) and the joiner trigger (part 2), not in this predicate.
