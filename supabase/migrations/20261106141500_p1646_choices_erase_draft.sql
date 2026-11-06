-- client-safe: only the body of a trigger function changes (no client calls it, no grant to anon or authenticated); no table,
-- policy, column or client-callable function changes.
-- diffed against: 20261106125500_p1646_canvas_choices.sql
-- P1646 round 1 (code review): _canvas_draft_choices_on_erase deletes EVERY choice of the draft whose run reply had its derived_refs
-- erased, not only the choice made by that run. A re-offer copies the earlier request and statements into a new choice on another run,
-- so deleting by offer_run_id alone could leave a copy of the erased person's material behind.
-- Idempotent: CREATE OR REPLACE only (the trigger itself is unchanged).

CREATE OR REPLACE FUNCTION public._canvas_draft_choices_on_erase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.canvas_draft_choices c
   WHERE c.draft_id = (SELECT r.draft_id FROM public.canvas_draft_runs r WHERE r.id = OLD.canvas_run_id);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_choices_on_erase() FROM PUBLIC, anon, authenticated;
