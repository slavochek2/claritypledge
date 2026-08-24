-- P1104 — close a combining-mark bypass in is_reserved_machine_slug.
--
-- FOUND IN CODE REVIEW of 20260824120000, then CONFIRMED against the test database
-- before this fix was written:
--
--   is_reserved_machine_slug('machine-sam-harris')          -> true   (correct)
--   is_reserved_machine_slug('m' || chr(818) || 'achine-x')  -> false  (BYPASS)
--   is_reserved_machine_slug('m' || chr(769) || 'achine-x')  -> false  (BYPASS)
--   is_reserved_agent_name  ('Agent' || chr(818) || ' x')    -> true   (sibling catches it)
--
-- The failure direction matters. `guard_profile_trust_columns` and `upsert_my_profile` RAISE
-- when the predicate returns TRUE, so a false negative is permissive: an ordinary user could
-- register `m<U+0332>achine-sam-harris`, a URL that reads as an official ClarityPledge machine
-- account for a named public figure. That is the impersonation the reservation exists to stop,
-- pointing the other way. (`create_or_reuse_agent_account` asserts the predicate positively, so
-- there the same bug is merely fail-closed — it would refuse to create the account.)
--
-- Root cause: 20260824120000 normalises with NFKC and then tokenises immediately. NFKC composes
-- base+mark ONLY where a precomposed codepoint exists; U+0332 and most of U+0300–U+036F have
-- none, so the mark survives as its own character. It is not in the invisible-strip list, and
-- combining marks are category Mn — not [[:alnum:]] — so it acts as a TOKEN SEPARATOR:
-- "m<U+0332>achine" splits to {'m','achine'} and the first token is never 'machine'.
--
-- This is a gap the sibling guard had already closed. 20260820092000 switched
-- is_reserved_agent_name to NFKD (decompose, so marks are separate and strippable) and added an
-- explicit visible-character pass before tokenising. 20260824120000 inherited the token idea but
-- not that hardening, and so reopened it. The fix here is to mirror the sibling exactly rather
-- than invent a third normalisation: one lesson, one implementation.
--
-- Everything else about the predicate is unchanged — same confusables, same invisible set, same
-- first-token-equals-'machine' rule, same volatility and search_path.

-- diffed against: 20260824120000_p1104_reserve_machine_slug.sql
--
-- Line-by-line against that file's definition of is_reserved_machine_slug, since PL/pgSQL
-- defers symbol resolution and a broken body would apply cleanly and only fail at call time.
-- Exactly three changes; everything else is byte-identical:
--
--   1. normalize(..., NFKC)            -> normalize(..., NFKD)
--   2. declare v_vis text              (new local)
--   3. tokenize v_norm directly        -> strip [^[:alnum:][:space:][:punct:]] into v_vis first,
--                                         then tokenize v_vis
--
-- Also dropped the literal invisible characters that were pasted inside the leading-whitespace
-- regexp_replace class in the prior version: they are already removed by the translate() above
-- it, so the class is now plain [[:space:]] and no longer carries unreviewable codepoints.
--
-- NOT changed: the invisible-strip set, the confusables set and their mapping, the
-- first-token-equals-'machine' rule, IMMUTABLE, SET search_path = '', and the signature.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_reserved_machine_slug(p_slug text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_norm text;
  v_vis  text;
BEGIN
  IF p_slug IS NULL THEN
    RETURN false;
  END IF;

  -- NFKD, not NFKC: decomposing leaves combining marks as separate characters so the
  -- visible-character strip below can remove them. Composing hides them inside a letter.
  v_norm := lower(normalize(p_slug, NFKD));

  -- Zero-width, bidi and invisible fillers do not end a token and render as nothing, so
  -- they must not be able to split "machine". Same set as is_reserved_agent_name.
  v_norm := translate(
    v_norm,
    U&'\00AD\034F\061C\180E\115F\1160\200B\200C\200D\200E\200F\2060\2061\2062\2063\2064\2066\2067\2068\2069\202A\202B\202C\202D\202E\3164\17B4\17B5\FEFF',
    ''
  );

  -- Letters that LOOK like the ASCII spelling of "machine" but are distinct codepoints.
  -- Cyrillic / Greek / Armenian / IPA / small-capital forms.
  v_norm := translate(
    v_norm,
    U&'\043C\0430\0441\04BB\0456\0435\0578\03B1\03F2\03B9\1D0D\0251\026A\1D07\0274',
    'machienacimaien'
  );

  v_norm := regexp_replace(v_norm, '^[[:space:]]+', '');

  IF v_norm = '' THEN
    RETURN false;
  END IF;

  -- THE FIX. Drop everything that is neither alphanumeric, space nor punctuation — which is
  -- exactly the combining marks NFKD has just exposed. Without this they survive as
  -- separators and split the very token being tested.
  v_vis := regexp_replace(v_norm, '[^[:alnum:][:space:][:punct:]]', '', 'g');

  RETURN (regexp_split_to_array(v_vis, '[^[:alnum:]]+'))[1] = 'machine';
END;
$$;

COMMENT ON FUNCTION public.is_reserved_machine_slug(text) IS
  'P1104: true when a slug claims the reserved "machine-" namespace. NFKD + invisible strip + confusables fold + combining-mark strip, then first-token equality. The combining-mark strip is not optional — see 20260824140000 for the confirmed bypass it closes.';

COMMIT;
