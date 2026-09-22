-- P1349 review follow-up: a checked or confirmed summary must name both its writer and its
-- checker. Without this, the writer<>checker CHECK was vacuous when either column was NULL,
-- so a row could reach `confirmed` (and so become public) with no record of who checked it.
-- Additive constraint on a table with no prod rows yet.
-- client-safe: the client only reads this table.

ALTER TABLE public.video_summaries
  ADD CONSTRAINT video_summaries_checked_names_writer_and_checker
  CHECK (status = 'draft' OR (written_by IS NOT NULL AND checked_by IS NOT NULL));
