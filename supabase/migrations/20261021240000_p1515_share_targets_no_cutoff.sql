-- diffed against: 20261021150000_p1515_canvas_share_targets.sql (get_canvas_share_targets, its only live body).
--   The body below is byte-for-byte its source except where this header says otherwise.
-- P1515 phase 3k: the owner's "add an event" list no longer drops events older than 90 days.
--
-- client-safe: the canvas feature is unreleased (prod holds no get_canvas_share_targets). Same name, same (empty)
--   argument list, same return shape; the REVOKE and GRANT are restated.
--
-- WHAT CHANGES
--   share_canvas and the admission rule (_canvas_event_admits) accept an event of any age the caller hosts or was
--   admitted to, but the list that offers events to the owner cut them off at 90 days, so an owner could not pick a
--   past event the server would have accepted. The cutoff line `e.datetime > now() - interval '90 days'` is removed.
--   Newest-first ordering (datetime DESC, id) and the cancelled exclusion stay; the host-or-RSVP and admission checks
--   stay, so the list is still exactly the set share_canvas accepts.

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
       WHERE e.status IS DISTINCT FROM 'cancelled'
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
