-- Migration: P1447 — "Suggest a source" on the Chiang Mai events calendar (/cm)
-- Created: 2026-10-09
-- Spec: features/p1447_cm_calendar_suggest_a_source.md
--
-- new function (all three functions below are new; none exists in an earlier migration)
-- client-safe: additive only — one new table and three new functions. No existing object changes.
--
-- Shape follows P1347 (decisions.md 2026-10-01): RLS on with NO policies, table grants revoked from
-- anon and authenticated, every read and write through a SECURITY DEFINER function.
--
--   * submit_calendar_source  — anon + authenticated. WRITE-ONLY: returns nothing about other rows.
--     http(s) URL ≤ 500 chars, note ≤ 280, de-duplicated by normalised URL (a repeat succeeds without
--     a new row), global cap of new rows per hour (Postgres cannot see the client IP behind
--     PostgREST, so a per-visitor limit is not available — same reasoning as P1347's vote cap).
--   * admin_list_calendar_sources / admin_set_calendar_source_status — assert_admin() first; both
--     revoke forms (role-direct and PUBLIC, P1066).
--
-- Nothing here fetches, previews or publishes a submitted link (spec invariant). The founder reads
-- new rows through /day, which queries via the read-only role (scripts/supabase-readonly-sql.py).

CREATE TABLE public.calendar_source_suggestions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url            text NOT NULL CHECK (char_length(url) BETWEEN 1 AND 500),
  url_key        text NOT NULL UNIQUE,
  note           text CHECK (note IS NULL OR char_length(note) <= 280),
  submitted_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'added', 'declined')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at    timestamptz
);

CREATE INDEX calendar_source_suggestions_created_at_idx
  ON public.calendar_source_suggestions (created_at DESC);

ALTER TABLE public.calendar_source_suggestions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.calendar_source_suggestions FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------- submit (anon + authenticated)

CREATE OR REPLACE FUNCTION public.submit_calendar_source(p_url text, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- A busy week of genuine suggestions is a handful; 30 an hour stops a loop without ever
  -- refusing a real visitor.
  c_new_per_hour CONSTANT integer := 30;
  v_url  text := btrim(COALESCE(p_url, ''));
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_key  text;
BEGIN
  IF char_length(v_url) NOT BETWEEN 1 AND 500
     OR v_url !~* '^https?://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' THEN
    RAISE EXCEPTION 'invalid link' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 280 THEN
    RAISE EXCEPTION 'note too long' USING ERRCODE = '22023';
  END IF;

  -- Normalised for de-duplication only; the URL as typed is what the founder reads.
  v_key := lower(regexp_replace(regexp_replace(v_url, '^https?://(www\.)?', '', 'i'), '[/#?]+$', ''));

  IF EXISTS (SELECT 1 FROM public.calendar_source_suggestions WHERE url_key = v_key) THEN
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.calendar_source_suggestions
      WHERE created_at > now() - interval '1 hour') >= c_new_per_hour THEN
    RAISE EXCEPTION 'rate limit' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.calendar_source_suggestions (url, url_key, note, submitted_by)
  VALUES (v_url, v_key, v_note, auth.uid())
  ON CONFLICT (url_key) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_calendar_source(text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_calendar_source(text, text) TO anon, authenticated;

-- ---------------------------------------------------------------- admin read / review

CREATE OR REPLACE FUNCTION public.admin_list_calendar_sources()
RETURNS TABLE (
  id          uuid,
  url         text,
  note        text,
  status      text,
  created_at  timestamptz,
  reviewed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT s.id, s.url, s.note, s.status, s.created_at, s.reviewed_at
  FROM public.calendar_source_suggestions s
  ORDER BY s.created_at DESC, s.id
  LIMIT 500;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_calendar_source_status(p_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.assert_admin();
  IF p_status NOT IN ('new', 'added', 'declined') THEN
    RAISE EXCEPTION 'invalid status' USING ERRCODE = '22023';
  END IF;
  UPDATE public.calendar_source_suggestions
     SET status = p_status,
         reviewed_at = CASE WHEN p_status = 'new' THEN NULL ELSE now() END
   WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_calendar_sources() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_calendar_sources() FROM anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_calendar_sources() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_calendar_source_status(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_calendar_source_status(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_calendar_source_status(uuid, text) TO authenticated;
