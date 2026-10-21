-- new function: get_canvas_share_targets() is new; no earlier migration defines it.
-- P1515 phase 2 (UI): the owner's "add an event or group" list.
--
-- client-safe: purely additive. One new function no deployed client calls; the REVOKE below acts only
--   on the function this same file creates.
--
-- WHY A FUNCTION. The owner may share only with events they host or are admitted to and groups they
--   belong to (share_canvas enforces it). The list the page offers must therefore be the same set,
--   and a client cannot compute it: the 12-hour registration window and the host's removals are
--   decided inside _canvas_event_admits, and a PRIVATE group's name is unreadable to every client
--   (organization_select is public-only), so a member could not even see the group they are about
--   to pick. This returns the caller's own eligible events (recent and upcoming, not cancelled) and
--   every group they belong to, by the same admission rule share_canvas checks.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_canvas_share_targets()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'events', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'id', e.id, 'title', e.title, 'slug', e.slug,
                 'datetime', e.datetime, 'hosted', e.host_id IS NOT DISTINCT FROM v_uid)
               ORDER BY e.datetime DESC, e.id)
        FROM public.events e
       WHERE e.datetime > now() - interval '90 days'
         AND e.status IS DISTINCT FROM 'cancelled'
         AND (e.host_id = v_uid
              OR EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = e.id AND r.profile_id = v_uid))
         AND public._canvas_event_admits(e.id, v_uid)
    ), '[]'::jsonb),
    'groups', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'id', o.id, 'name', o.name, 'slug', o.slug, 'public', o.visibility = 'public')
               ORDER BY o.name, o.id)
        FROM public.membership m
        JOIN public.organization o ON o.id = m.org_id
       WHERE m.user_id = v_uid
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_canvas_share_targets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_canvas_share_targets() TO authenticated;

COMMIT;
