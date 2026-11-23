-- P1715: my_event_removed(uuid) is callable only by signed-in users.
-- Spec: features/p1715_revoke_anon_my_event_removed.md
--
-- P1700 (20261117171000_p1700_removal_notice.sql:85) granted EXECUTE to anon AND authenticated. No signed-out
-- caller exists: EventDetail reads it only when isLoggedIn (src/app/prototypes/events/components/EventDetail.tsx:431)
-- and after a registration refusal, which needs a session (:445). The body already returns false when auth.uid() is
-- NULL, so nothing leaked; the grant was simply unjustified (scripts/anon-execute-allowlist.txt rule 2) and kept the
-- daily grant drift check red (function-grant-drift-check.py: anon-unlisted).
-- PUBLIC was already revoked by P1700 (line 84); this removes the role-direct anon grant, the only remaining path.
--
-- client-safe: an anon caller that reached it got false; it now gets a permission error, which getMyEventRemoval
-- (src/app/data/event-waitlist.ts:27-34) already reads as false. Signed-in behaviour is unchanged.

REVOKE EXECUTE ON FUNCTION public.my_event_removed(uuid) FROM anon;
