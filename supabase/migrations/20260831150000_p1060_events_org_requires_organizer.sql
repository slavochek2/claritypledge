-- P1060 follow-up: hosting an event INTO an organization is an ORGANIZER capability.
--
-- new function — public.events_org_requires_organizer() does not exist in any prior
-- migration (verified: `grep -rn events_org_requires_organizer supabase/migrations/`
-- matches this file only). CREATE OR REPLACE is used for re-runnability, not because
-- it replaces a prior definition. PL/pgSQL defers symbol resolution, so a broken body
-- would apply cleanly and fail at call time — the integration test below exercises
-- both the allow and the refuse path against a real database for exactly that reason.
--
-- client-safe: additive only — one trigger function and one trigger. No column is
-- added, dropped, retyped or revoked, and no existing policy is touched. A deployed
-- client that never sets org_id is completely unaffected: the trigger's guard clause
-- returns immediately when NEW.org_id IS NULL, which is every insert such a client
-- makes.
--
-- WHY A TRIGGER AND NOT RLS.
-- The events INSERT policy is `WITH CHECK (auth.uid() = host_id)`
-- (20260118_create_events.sql:46) and says nothing about org_id. Widening that policy
-- would mean rewriting a policy every other event path depends on, and an RLS refusal
-- surfaces as "0 rows affected" — indistinguishable from a row that simply did not
-- match. A trigger raises a named error the client can show a human. Same reasoning
-- p1010 used for the membership guard.
--
-- WHAT IT PREVENTS.
-- Without this, org_id is a plain nullable column on a table whose INSERT policy only
-- checks host_id. Any authenticated user could POST an event carrying ANY org's id --
-- including an org they are not a member of -- and it would appear on that
-- organization's Events tab. The org page's own UI gates hosting behind
-- `canHost = myRole === 'organizer'` (org-page.tsx:83), but a UI gate is a suggestion:
-- the ?org= slug travels in a URL and the insert is a plain PostgREST call.
--
-- SCOPE: org_id only. Everything else about creating an event is unchanged.

CREATE OR REPLACE FUNCTION public.events_org_requires_organizer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
-- Pinned search_path: SECURITY DEFINER without it is the classic privilege-escalation
-- shape (a caller-controlled search_path can resolve `membership` to their own table).
SET search_path = public, pg_temp
AS $$
BEGIN
  -- An event that belongs to no organization is the ordinary case and stays open to
  -- any authenticated host. This is the standalone /events funnel and it must not
  -- acquire a new requirement.
  IF NEW.org_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- The host must be an ORGANIZER of the organization the event claims. Checked
  -- against NEW.host_id rather than auth.uid() so the rule holds for every write
  -- path, including a service-role backfill that sets a host explicitly.
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

COMMENT ON FUNCTION public.events_org_requires_organizer() IS
  'P1060: refuses an event whose org_id names an organization the host does not organize. NULL org_id is always allowed.';

-- BEFORE INSERT OR UPDATE: re-pointing an existing event at an org is the same
-- capability as creating one there, so both are guarded. UPDATE is scoped to org_id
-- changes so ordinary edits (title, time) on an already-valid org event do not re-run
-- the membership lookup.
DROP TRIGGER IF EXISTS events_org_requires_organizer_ins ON public.events;
CREATE TRIGGER events_org_requires_organizer_ins
  BEFORE INSERT ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.events_org_requires_organizer();

DROP TRIGGER IF EXISTS events_org_requires_organizer_upd ON public.events;
CREATE TRIGGER events_org_requires_organizer_upd
  BEFORE UPDATE OF org_id ON public.events
  FOR EACH ROW
  WHEN (NEW.org_id IS DISTINCT FROM OLD.org_id)
  EXECUTE FUNCTION public.events_org_requires_organizer();
