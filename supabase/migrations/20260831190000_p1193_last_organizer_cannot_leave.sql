-- P1193 — the sole organizer of a group cannot leave it.
--
-- new function
--   public.membership_last_organizer_cannot_leave() does not exist before this
--   migration; nothing is being redefined, so there is no prior version to diff
--   against. The trigger of the same name is new too.
--
-- client-safe: additive only — one new function and one new trigger. No column,
-- policy or grant changes.
--
-- WHY A TRIGGER AND NOT AN RLS CHANGE. membership_delete is
-- `USING (user_id = auth.uid())` — self-deletion, no role condition — so the state
-- "a group with members and zero organizers" is reachable from the API by anyone
-- who is the last organizer. Tightening the USING clause instead would make the
-- delete match zero rows, and zero-rows-deleted is ALREADY the contract for
-- "you had already left": organizationsService.leaveOrganization returns
-- { left: false } for it. A guard expressed that way is indistinguishable from a
-- no-op, so the caller cannot tell a refusal from a double-click. A trigger raises,
-- which is the only way the client learns WHY.
--
-- This is P1010's own deferred decision coming due. Its Risks section accepted
-- "Sole-organizer self-orphan" for v1 on the premise that "the organizer is
-- founder-designated (won't self-remove)", and deferred this guard "until self-serve
-- org creation ships". The premise failed in review — the founder asked for exactly
-- that leave path to be exercised — so the guard is pulled forward ahead of its own
-- stated trigger, deliberately (founder, 2026-08-31).
--
-- Recovery if this ships wrong and locks an organizer out: a one-row admin re-seed,
-- the same path P1010 named. There is still no product surface that can MAKE someone
-- an organizer (membership_insert forces role='member'), which is why blocking the
-- last one is safe to do and a handover flow is now a real backlog item.

CREATE OR REPLACE FUNCTION public.membership_last_organizer_cannot_leave()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only organizer rows can orphan a group. A plain member leaving changes nothing
  -- about who can schedule an event.
  IF OLD.role IS DISTINCT FROM 'organizer' THEN
    RETURN OLD;
  END IF;

  -- CASCADE DELETES MUST PASS THROUGH. Both org_id and user_id are ON DELETE
  -- CASCADE, so deleting an organization or a profile deletes membership rows —
  -- including organizer rows — and this trigger fires for each. Blocking there would
  -- make an organization undeletable and would strand any profile whose owner
  -- organizes a group, which is a far worse defect than the one being fixed.
  --
  -- pg_trigger_depth() is the discriminator: a cascade is carried out by the foreign
  -- key's own internal RI trigger, so this trigger runs NESTED inside it (depth > 1).
  -- A direct `DELETE FROM membership` from the client runs it at depth 1. Verified by
  -- exercising both paths, not by reading the docs — see
  -- e2e/integration/p1193-last-organizer-guard.spec.ts, which deletes a whole
  -- organization and a whole profile out from under an organizer row and asserts both
  -- succeed.
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  -- Belt to the cascade braces: if the organization is already gone, there is nothing
  -- left to orphan. Mirrors the stand-aside guard in
  -- 20260831170000_p1060_org_trigger_defers_to_fk.sql.
  IF NOT EXISTS (SELECT 1 FROM public.organization o WHERE o.id = OLD.org_id) THEN
    RETURN OLD;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.membership m
     WHERE m.org_id = OLD.org_id
       AND m.role   = 'organizer'
       AND m.id    <> OLD.id
  ) THEN
    RAISE EXCEPTION
      'membership: % is the only organizer of group % and cannot leave it — a group with no organizer has nobody who can schedule an event (P1193)',
      OLD.user_id, OLD.org_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS membership_last_organizer_cannot_leave ON public.membership;

CREATE TRIGGER membership_last_organizer_cannot_leave
  BEFORE DELETE ON public.membership
  FOR EACH ROW
  EXECUTE FUNCTION public.membership_last_organizer_cannot_leave();
