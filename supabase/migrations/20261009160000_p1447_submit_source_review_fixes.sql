-- Migration: P1447 review fixes for submit_calendar_source (Codex review, 2026-10-09)
-- Created: 2026-10-09
-- Spec: features/p1447_cm_calendar_suggest_a_source.md
-- diffed against: 20261009150000_p1447_calendar_source_suggestions.sql
--
-- client-safe: same signature, same success/refusal messages; only the order of checks, a lock and
-- the de-dup key change. CREATE OR REPLACE with an unchanged signature keeps the existing ACL
-- (anon + authenticated EXECUTE, PUBLIC revoked) — restated below anyway.
--
-- Three fixes, each a finding that held on reading the function:
--   1. Cap race: the count and the insert ran unserialised, so N concurrent submits at 29 rows all
--      saw 29 and all inserted. A transaction-scoped advisory lock now covers check + insert.
--      Volume is a handful an hour, so serialising every submit costs nothing.
--   2. Existence oracle: with the cap full, a known URL returned success and an unseen one
--      'rate limit', which let an anonymous caller learn which links had been suggested. The cap is
--      now checked BEFORE the de-dup, so a full cap answers 'rate limit' for every URL.
--   3. De-dup key lowercased the whole URL, merging distinct case-sensitive paths. Only the host is
--      lowercased now; path and query keep their case. Existing keys on test were all-lowercase
--      URLs, which the new rule maps to the same key, so no row is re-keyed.

CREATE OR REPLACE FUNCTION public.submit_calendar_source(p_url text, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_new_per_hour CONSTANT integer := 30;
  v_url  text := btrim(COALESCE(p_url, ''));
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_host text;
  v_rest text;
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
  v_host := lower(substring(v_url from '^https?://(?:www\.)?([^/?#]+)'));
  v_rest := regexp_replace(substring(v_url from '^https?://[^/?#]+(.*)$'), '[/#?]+$', '');
  v_key  := v_host || COALESCE(v_rest, '');

  PERFORM pg_advisory_xact_lock(hashtext('p1447_submit_calendar_source'));

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
