-- P904: Async letter verification "explain-back" threads (v0)
-- client-safe: adds a new table + new functions; deployed clients read only
--   existing tables and will not call story_explain_backs or the new helpers
--   until the frontend ships. No existing queries are altered.
-- new function: _is_letter_participant
-- new function: _is_delivery_receiver
-- new function: mark_explain_back_read
--
-- Adds the pair-private `story_explain_backs` table — one audio (or text-fallback)
-- explain-back per (story × delivery), recorded by the letter receiver and read async
-- by the sender. No transcription, no grading in v0 (verification stays in /live).
--
-- Security model (see features/p904 § Security Review):
--   * SELECT  — pair-private: only the letter's sender OR receiver (via
--               _is_letter_participant, a SECURITY DEFINER helper that composes the
--               existing _is_letter_sender / _is_letter_receiver — never an inline join,
--               to avoid the RLS-recursion class of decisions.md 2026-04-04).
--   * INSERT  — receiver-only (auth.uid() is the delivery's receiver AND recorder_id).
--   * UPDATE  — receiver-only, CONTENT columns only. author_read_at is NOT in the
--               column grant, so a receiver UPDATE touching it is rejected at the
--               privilege layer (P886 column-grant pattern: table UPDATE is revoked
--               first, then column UPDATE granted — a column grant alone is a no-op
--               while a table grant lingers, decisions.md 2026-06-04).
--   * DELETE  — blocked for clients (USING (false)); retention deletion (the
--               [FOUNDER DECISION] deleted_at column) is reserved for a future
--               SECURITY DEFINER RPC.
--   * Read-state — mark_explain_back_read(id) is SENDER-ONLY and SECURITY DEFINER;
--               it is the only path that writes author_read_at. NOT reused from
--               mark_inbox_item_read (P660), which authorizes BOTH parties.
--
-- All new SECURITY DEFINER functions use `SET search_path = ''` with schema-qualified
-- references (P850/P851/P878), NOT the deprecated `SET search_path = public` of P660,
-- and set grants explicitly (REVOKE FROM public, anon; GRANT EXECUTE TO authenticated)
-- so callers do not hit "permission denied for function" (the P850 signal).

BEGIN;

-- ============================================================================
-- 1. Table: story_explain_backs
-- ============================================================================
-- letter_id is denormalized (derivable from delivery_id) but required to satisfy the
-- composite FK to letter_story_snapshots, whose PK is (letter_id, story_id) and which
-- has no surrogate id column (20260403224331_p581_clarity_letters.sql:62). The business
-- key is UNIQUE(delivery_id, story_id) — one explain-back per story per receiver in v0.
CREATE TABLE IF NOT EXISTS public.story_explain_backs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  letter_id          UUID NOT NULL,
  story_id           UUID NOT NULL,
  delivery_id        UUID NOT NULL REFERENCES public.letter_deliveries(id) ON DELETE CASCADE,
  recorder_id        UUID NOT NULL REFERENCES public.profiles(id),
  medium             TEXT NOT NULL DEFAULT 'audio' CHECK (medium IN ('audio', 'text')),
  audio_storage_path TEXT,        -- GCS path 'gs://claritypledge-explain-backs/{delivery_id}/{story_id}.webm' (private bucket)
  text_fallback      TEXT,        -- populated only when medium = 'text'
  author_read_at     TIMESTAMPTZ, -- NULL = unread; written ONLY via mark_explain_back_read() (sender-only)
  deleted_at         TIMESTAMPTZ, -- soft-delete for retention [FOUNDER DECISION]; NULL = retained
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (letter_id, story_id)
    REFERENCES public.letter_story_snapshots(letter_id, story_id) ON DELETE CASCADE,
  UNIQUE (delivery_id, story_id)
);

CREATE INDEX IF NOT EXISTS idx_story_explain_backs_delivery
  ON public.story_explain_backs (delivery_id);

-- Drives the "N new from <name>" sender-side unread count (Branch 3 of getUnreadLetterCount).
CREATE INDEX IF NOT EXISTS idx_story_explain_backs_delivery_read
  ON public.story_explain_backs (delivery_id, author_read_at);

ALTER TABLE public.story_explain_backs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. Helper functions (SECURITY DEFINER, search_path = '')
-- ============================================================================

-- _is_letter_participant(delivery_id): true when auth.uid() is the sender OR receiver
-- of the delivery's parent letter. Composes the existing two-arg helpers; never inlines
-- the letter_deliveries join into the policy itself (RLS recursion risk).
CREATE OR REPLACE FUNCTION public._is_letter_participant(p_delivery_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
  v_letter_id UUID;
BEGIN
  SELECT letter_id INTO v_letter_id
  FROM public.letter_deliveries
  WHERE id = p_delivery_id;

  IF v_letter_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN public._is_letter_sender(v_letter_id, auth.uid())
      OR public._is_letter_receiver(v_letter_id, auth.uid());
END;
$$;

-- _is_delivery_receiver(delivery_id): true when auth.uid() is the delivery's receiver.
-- Used by INSERT/UPDATE policies so the receiver check does not depend on the caller's
-- RLS visibility of letter_deliveries (SECURITY DEFINER bypasses it).
CREATE OR REPLACE FUNCTION public._is_delivery_receiver(p_delivery_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.letter_deliveries
    WHERE id = p_delivery_id AND receiver_profile_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public._is_letter_participant(UUID) FROM public, anon;
REVOKE ALL ON FUNCTION public._is_delivery_receiver(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public._is_letter_participant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public._is_delivery_receiver(UUID) TO authenticated;

-- ============================================================================
-- 3. RLS policies
-- ============================================================================

-- SELECT: pair-private. This is the real server-side gate for the view page —
-- a guessed UUID returns zero rows, so no signed URL is ever issued.
CREATE POLICY story_explain_backs_select ON public.story_explain_backs
  FOR SELECT TO authenticated
  USING (public._is_letter_participant(delivery_id));

-- INSERT: only the delivery's receiver, recording as themselves.
CREATE POLICY story_explain_backs_insert ON public.story_explain_backs
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = recorder_id
    AND public._is_delivery_receiver(delivery_id)
  );

-- UPDATE: receiver-only at the row level (re-record). Column-level grants below keep
-- author_read_at out of reach — that is the column-write half of the gate.
CREATE POLICY story_explain_backs_update ON public.story_explain_backs
  FOR UPDATE TO authenticated
  USING (public._is_delivery_receiver(delivery_id))
  WITH CHECK (public._is_delivery_receiver(delivery_id));

-- DELETE: blocked for all clients. Retention deletion is reserved for a future RPC.
CREATE POLICY story_explain_backs_delete ON public.story_explain_backs
  FOR DELETE TO authenticated
  USING (false);

-- ============================================================================
-- 4. Column-level write grants (P886 pattern)
-- ============================================================================
-- Supabase default privileges grant table-level DML to anon/authenticated on new
-- public tables. A column-level UPDATE grant is a no-op while that table-level UPDATE
-- grant lingers (P886), so revoke the table-level UPDATE first, then grant UPDATE on
-- the content columns only. author_read_at and deleted_at are deliberately excluded —
-- the receiver can re-record content but can never fake "the author heard it" or
-- self-delete for retention.
REVOKE UPDATE ON public.story_explain_backs FROM anon, authenticated;
GRANT UPDATE (medium, audio_storage_path, text_fallback)
  ON public.story_explain_backs TO authenticated;

-- ============================================================================
-- 5. RPC: mark_explain_back_read(id) — SENDER ONLY
-- ============================================================================
-- The only writer of author_read_at. Asserts auth.uid() = the parent letter's sender.
-- Do NOT reuse mark_inbox_item_read (P660) — it authorizes both parties; here only the
-- sender (who receives the explain-back) may mark it read.
CREATE OR REPLACE FUNCTION public.mark_explain_back_read(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sender_id UUID;
BEGIN
  SELECT l.sender_id
  INTO v_sender_id
  FROM public.story_explain_backs eb
  JOIN public.letter_deliveries d ON d.id = eb.delivery_id
  JOIN public.clarity_letters l ON l.id = d.letter_id
  WHERE eb.id = p_id;

  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'Explain-back % not found', p_id;
  END IF;

  IF auth.uid() IS DISTINCT FROM v_sender_id THEN
    RAISE EXCEPTION 'Only the letter sender may mark an explain-back as read';
  END IF;

  UPDATE public.story_explain_backs
  SET author_read_at = now()
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_explain_back_read(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_explain_back_read(UUID) TO authenticated;

COMMIT;
