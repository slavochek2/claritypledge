-- diffed against: 20260824140000_p1104_slug_guard_decompose.sql (is_reserved_machine_slug) —
--   the CORRECTED base this predicate should have been cloned from in the first place.
-- P1212 §2, third pass on is_reserved_agent_slug: close the combining-mark bypass.
--
-- WHAT WENT WRONG, because the shape matters more than the codepoint. The predicate was
-- cloned from `20260824120000`'s definition of is_reserved_machine_slug. That file was found
-- first and read like the current one -- but it is SUPERSEDED: `20260824140000` replaced that
-- function four hours later specifically to close a combining-mark bypass, and the clone
-- carried the pre-fix body forward into a brand-new namespace.
--
-- So a hole that was found, fixed and documented was reintroduced the same way a fresh one
-- would be. epistemic.md gate 4 names exactly this ("read the manifest before guessing among
-- N paths"): the newest definition of a function is the one to copy, and "grep found this
-- file" is not that check.
--
-- THE BYPASS. U+0332 COMBINING LOW LINE renders as an underline beneath the preceding letter,
-- leaves it fully legible, and survives NFKC. So `a` + U+0332 + `gent-sam-harris` renders as
-- "agent-sam-harris" in an address bar while tokenising differently -- any authenticated user
-- could mint it. Verified failing before this migration by
-- `e2e/integration/p1212-agent-slug-reservation.spec.ts`.
--
-- THE FIX, line-for-line from 20260824140000: normalize with NFKD rather than NFKC so the
-- marks separate from their base letters, then strip everything that is neither alphanumeric,
-- space nor punctuation -- which is exactly the exposed marks -- before tokenising.

CREATE OR REPLACE FUNCTION public.is_reserved_agent_slug(p_slug text)
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
  -- they must not be able to split "agent". Same set as is_reserved_machine_slug.
  v_norm := translate(
    v_norm,
    U&'\00AD\034F\061C\180E\115F\1160\200B\200C\200D\200E\200F\2060\2061\2062\2063\2064\2066\2067\2068\2069\202A\202B\202C\202D\202E\3164\17B4\17B5\FEFF',
    ''
  );

  -- Letters that LOOK like the ASCII spelling of "agent" but are distinct codepoints.
  -- Cyrillic / Greek / Armenian / IPA / small-capital forms, including U+043F (CYRILLIC PE),
  -- which renders as "n" and which the machine- table did not need.
  -- BEST EFFORT, not a proof: Unicode's confusables set is larger than any hand-kept list.
  -- Kept in step with is_reserved_machine_slug so both namespaces refuse the same inputs.
  v_norm := translate(
    v_norm,
    U&'\0430\03B1\0251\0261\0262\0435\0454\03B5\1D07\043D\043F\0578\0274\0442\03C4\1D1B',
    'aaaggeeeennnnttt'
  );

  v_norm := regexp_replace(v_norm, '^[[:space:]]+', '');

  IF v_norm = '' THEN
    RETURN false;
  END IF;

  -- THE FIX. Drop everything that is neither alphanumeric, space nor punctuation — which is
  -- exactly the combining marks NFKD has just exposed. Without this they survive as
  -- separators and split the very token being tested.
  v_vis := regexp_replace(v_norm, '[^[:alnum:][:space:][:punct:]]', '', 'g');

  RETURN (regexp_split_to_array(v_vis, '[^[:alnum:]]+'))[1] = 'agent';
END;
$$;

COMMENT ON FUNCTION public.is_reserved_agent_slug(text) IS
  'P1212: true when a profile slug claims the reserved "agent-" URL namespace. NFKD + invisible strip + confusables fold + combining-mark strip, then a FIRST-TOKEN test. Mirrors is_reserved_machine_slug (20260824140000), which stays in force for the retired "machine-" namespace.';
