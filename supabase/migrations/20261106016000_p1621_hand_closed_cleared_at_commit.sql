-- P1621 round 3 review (U1): an idle run does not clear undo_closed_by_hand; only a step that still exists at commit does.
--
-- diffed against: 20261106015000_p1621_undo_closed_by_hand.sql (the AFTER INSERT trigger canvas_draft_steps_clear_hand_closed and its function). Nothing else changes: the column,
--   the state read and the three hand-write functions are untouched.
-- client-safe: replaces one internal trigger; no signature, grant, table, column or answer key changes.
--
-- Before: _canvas_draft_run_complete inserts the run's Undo step first (20261103010000:1165) and deletes it again when the run turns out idle (a later message that added, reworded,
--   moved or removed no point; :1296). The row trigger fired at the insert, so the flag was cleared although no step was left: Undo stayed closed (no step) but the draft no longer
--   said the owner's hand-write had closed it, against the contract of 20261106015000.
-- Now: a DEFERRABLE INITIALLY DEFERRED constraint trigger runs at commit and clears the flag only when that step row (run_id is its primary key) still exists. An idle run's step is gone by
--   then, so the flag stays; a run that applied keeps its step, so the flag clears. Same transaction, so the flag and the step are never seen apart.
--   (The header of 20261106015000 said "a drafting run completes with steps": read it as "a step row still present at commit"; its comment is corrected, its code is replaced here.)

DROP TRIGGER IF EXISTS canvas_draft_steps_clear_hand_closed ON public.canvas_draft_steps;

CREATE OR REPLACE FUNCTION public._canvas_draft_step_clears_hand_closed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.canvas_draft_steps s WHERE s.run_id = NEW.run_id) THEN
    UPDATE public.canvas_drafts d SET undo_closed_by_hand = false WHERE d.id = NEW.draft_id AND d.undo_closed_by_hand;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_step_clears_hand_closed() FROM PUBLIC, anon, authenticated;

CREATE CONSTRAINT TRIGGER canvas_draft_steps_clear_hand_closed AFTER INSERT ON public.canvas_draft_steps
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public._canvas_draft_step_clears_hand_closed();
