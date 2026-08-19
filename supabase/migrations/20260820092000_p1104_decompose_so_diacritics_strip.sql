-- P1104: closes the last name-guard bypass — a combining mark.
--
-- client-safe: tightens a predicate only.
--
-- Function-redefinition provenance (pre-commit gate):
--   is_reserved_agent_name -- diffed against: 20260820091000_p1104_reserved_name_both_tests_on_cleaned_string.sql
--     (identical except NFKC -> NFKD on one line)
--
-- After 091000 closed the invisible-character class, one case still passed:
--
--   is_reserved_agent_name('A<U+0301>gent · Real Public Figure') -> false   (should be true)
--
-- It is a DIFFERENT class and the allow-list cannot reach it. `normalize(..., NFKC)` COMPOSES
-- A + U+0301 into the single character Á, which IS alphanumeric — so it survives the
-- allow-list strip, the head token becomes 'ágent', and the name is not recognised. Stripping
-- harder cannot help: by the time the strip runs there is no combining mark left to strip.
--
-- Fix: decompose instead of compose. NFKD splits Á back into A + U+0301; U+0301 is a combining
-- mark (category Mn), which the allow-list already removes, leaving 'agent'. NFKD keeps every
-- compatibility fold NFKC gave us (fullwidth Ａ still folds to 'a'), and the confusables table
-- below is unaffected — those are single characters with no decomposition.
--
-- Verified on the live test DB after applying: all 9 rendering-as-agent forms return true
-- (plain, ZWSP, VS16, VS15, tag char, combining acute, ZWNJ, Cyrillic а, fullwidth Ａ) and all
-- 6 ordinary names return false (Agent Smith, Agentic Systems, agenda item, Agent, Jane Agent,
-- Jane Smith).

BEGIN;

CREATE OR REPLACE FUNCTION public.is_reserved_agent_name(p_name text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_norm   text;
  v_head   text;
  v_vis    text;
  v_tokens text[];
BEGIN
  IF p_name IS NULL THEN
    RETURN false;
  END IF;

  -- NFKD, not NFKC: decomposing leaves combining marks as separate characters so the
  -- allow-list strip below can remove them. Composing hides them inside a letter.
  v_norm := lower(normalize(p_name, NFKD));

  v_norm := translate(v_norm,
    U&'\0430\0435\043E\0440\0441\0442\03B1\03BF\03B5\0578\13AA\AB7A\0261\0251\1D07',
    'aeopctaoenaagae');

  v_norm := regexp_replace(v_norm, '^[[:space:]]+', '');

  IF v_norm = '' THEN
    RETURN false;
  END IF;

  v_vis := regexp_replace(v_norm, '[^[:alnum:][:space:][:punct:]]', '', 'g');

  v_tokens := regexp_split_to_array(v_vis, '[^[:alnum:]]+');
  v_head := v_tokens[1];

  IF v_head IS DISTINCT FROM 'agent' THEN
    RETURN false;
  END IF;

  RETURN v_vis ~ '^agent[[:space:]]*[^[:alnum:][:space:]]'
      OR (array_length(v_tokens, 1) >= 2 AND length(v_tokens[2]) = 1);
END;
$$;

COMMIT;
