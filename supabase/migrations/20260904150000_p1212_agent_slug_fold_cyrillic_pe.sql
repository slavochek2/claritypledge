-- diffed against: 20260904140000_p1212_reserve_agent_slug.sql (is_reserved_agent_slug)
-- P1212 §2 fix-forward on 20260904140000: fold U+043F (CYRILLIC SMALL LETTER PE) to "n".
--
-- WHY A SECOND FILE AND NOT AN EDIT. 20260904140000 was already applied to test, so its
-- version was stamped and re-running the corrected file did nothing at all — silently, with a
-- "No migrations applied" that reads like success. An applied migration is immutable in
-- practice; a correction is a new one (P1042 is the same lesson from the duplicate-prefix side).
--
-- THE DEFECT. The confusables table folded U+043D (CYRILLIC EN) to "n" — correct, that IS the
-- Cyrillic letter n — but missed U+043F (CYRILLIC PE), which is the one that RENDERS as "n" in
-- the lowercase forms a URL uses. So `ageпt-sam-harris` was mintable by any authenticated user
-- and is visually indistinguishable from `agent-sam-harris` in the address bar.
--
-- Caught by this migration's own integration test, which asserted the lookalike and got false.
-- The lesson is the test's shape, not the codepoint: a reservation test that only feeds it
-- strings the reservation should ACCEPT measures nothing.
--
-- Everything else is 20260904140000's body verbatim.

CREATE OR REPLACE FUNCTION public.is_reserved_agent_slug(p_slug text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_norm text;
BEGIN
  IF p_slug IS NULL THEN
    RETURN false;
  END IF;

  v_norm := lower(normalize(p_slug, NFKC));

  -- Zero-width, bidi and invisible fillers do not end a token and render as nothing, so
  -- they must not be able to split "agent". Same set as is_reserved_machine_slug.
  v_norm := translate(
    v_norm,
    U&'\00AD\034F\061C\180E\115F\1160\200B\200C\200D\200E\200F\2060\2061\2062\2063\2064\2066\2067\2068\2069\202A\202B\202C\202D\202E\3164\17B4\17B5\FEFF',
    ''
  );

  -- Letters that LOOK like the ASCII spelling of "agent" but are distinct codepoints, which
  -- NFKC leaves alone. Cyrillic / Greek / Armenian / IPA / small-capital forms, mapped to the
  -- ASCII letter each impersonates. Carried from is_reserved_machine_slug's table, restricted
  -- to the letters that spell "agent": a g e n t.
  v_norm := translate(
    v_norm,
    U&'\0430\03B1\0251\0261\0262\0435\0454\03B5\1D07\043D\043F\0578\0274\0442\03C4\1D1B',
    'aaaggeeeennnnttt'
  );

  v_norm := regexp_replace(v_norm, '^[[:space:]­͏؜᠎ᅟᅠ]+', '');

  IF v_norm = '' THEN
    RETURN false;
  END IF;

  RETURN (regexp_split_to_array(v_norm, '[^[:alnum:]]+'))[1] = 'agent';
END;
$$;

COMMENT ON FUNCTION public.is_reserved_agent_slug(text) IS
  'P1212: true when a profile slug claims the reserved "agent-" URL namespace. First-token test after NFKC, invisible-stripping and confusables folding (incl. U+043F, added 2026-09-04). is_reserved_machine_slug stays in force for the retired "machine-" namespace.';
