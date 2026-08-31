-- P1060 fix: the organizer-required trigger must not mask a foreign-key violation.
--
-- diffed against: 20260831150000_p1060_events_org_requires_organizer.sql
-- The ONLY change is the new "org does not exist -> stand aside" guard clause added
-- after the NULL check. Everything else — signature, SECURITY DEFINER, pinned
-- search_path, the membership lookup, the error text, both triggers — is byte-identical
-- to that migration. Re-read both before editing either.
--
-- client-safe: additive only — replaces one function body. No schema or policy change.
--
-- WHY. A BEFORE INSERT trigger runs BEFORE the foreign key is evaluated. An event
-- naming an org_id that does not exist therefore hit this trigger first (the host is
-- trivially not an organizer of a row that isn't there) and came back as
-- check_violation (23514) instead of foreign_key_violation (23503). That is a worse
-- error — it tells the caller "you lack permission" for what is actually "no such
-- organization" — and it silently changed the contract an existing integration test
-- had already pinned (p1060-events-org-migration.spec.ts:112 asserts 23503). The test
-- caught it; this restores the original semantics.
--
-- The authorization property is unchanged: a real org still requires an organizer.
-- A non-existent org_id is rejected either way — now by the FK, with the accurate code.

CREATE OR REPLACE FUNCTION public.events_org_requires_organizer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Existence is the foreign key's job, not this trigger's. Standing aside lets the
  -- FK raise 23503 with its own accurate message. Without this, every bad-id insert
  -- is reported as an authorization failure.
  IF NOT EXISTS (SELECT 1 FROM public.organization o WHERE o.id = NEW.org_id) THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.membership m
     WHERE m.org_id  = NEW.org_id
       AND m.user_id = NEW.host_id
       AND m.role    = 'organizer'
  ) THEN
    RAISE EXCEPTION
      'events.org_id: host % is not an organizer of organization % — hosting into an organization is an organizer capability (P1060 D4)',
      NEW.host_id, NEW.org_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
