-- P770: Allow sender to delete sealed letters with zero deliveries
--
-- The original "Sender can delete draft letters" policy restricted DELETE to
-- status='draft'. Sealed letters on the Published tab were silently blocked
-- (PostgREST returns no error when USING clause filters out rows).
--
-- The new policy extends DELETE to sealed letters only when no delivery records
-- exist, performing the check atomically inside RLS so there is no TOCTOU window
-- between a JS-level delivery count query and the delete call.

DROP POLICY IF EXISTS "Sender can delete draft letters" ON clarity_letters;

CREATE POLICY "Sender can delete own letters"
  ON clarity_letters FOR DELETE
  USING (
    sender_id = auth.uid()
    AND (
      status = 'draft'
      OR (
        status = 'sealed'
        AND NOT EXISTS (
          SELECT 1 FROM letter_deliveries d WHERE d.letter_id = clarity_letters.id
        )
      )
    )
  );
