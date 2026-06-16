-- P904 follow-up: force story_explain_backs.letter_id from the delivery (integrity guard)
-- client-safe: adds a new trigger + function on the brand-new story_explain_backs table
--   (shipped in 20260616160000). No deployed client reads or writes this table yet, and
--   no existing table or query is altered.
-- new function: set_explain_back_letter_id
--
-- Why: the INSERT WITH CHECK validates the receiver + delivery, but letter_id is a
-- client-supplied column and the composite FK only proves (letter_id, story_id) exists
-- in SOME snapshot — not that it belongs to THIS delivery's letter. A receiver could
-- therefore attach their (pair-private) explain-back to a story from an unrelated letter,
-- corrupting the view-page story context. Forcing letter_id from the delivery makes it
-- non-spoofable; the composite FK then guarantees story_id belongs to the delivery's
-- letter. (Code review finding, P904.)

BEGIN;

CREATE OR REPLACE FUNCTION public.set_explain_back_letter_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Authoritative: ignore any client-supplied letter_id; derive from the delivery.
  SELECT letter_id INTO NEW.letter_id
  FROM public.letter_deliveries
  WHERE id = NEW.delivery_id;
  -- NULL (delivery not found) leaves letter_id NULL → NOT NULL + FK reject the insert.
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_explain_back_letter_id() FROM public, anon;

DROP TRIGGER IF EXISTS trg_set_explain_back_letter_id ON public.story_explain_backs;
CREATE TRIGGER trg_set_explain_back_letter_id
  BEFORE INSERT ON public.story_explain_backs
  FOR EACH ROW EXECUTE FUNCTION public.set_explain_back_letter_id();

COMMIT;
