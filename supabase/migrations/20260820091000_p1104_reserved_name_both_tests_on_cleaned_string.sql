-- P1104: corrects 20260820090000, which was applied to test with a real defect.
--
-- client-safe: tightens a predicate only.
--
-- Function-redefinition provenance (pre-commit gate):
--   is_reserved_agent_name -- diffed against: 20260820090000_p1104_reserve_agent_name_by_allowlist.sql
--
-- WHY A SECOND FILE: 20260820090000 is already recorded as applied on test, and migrations are
-- forward-only — an applied file is never edited in place. Its body stripped invisible
-- characters before TOKENIZING but still ran the separator test against the RAW string, so
-- "Ag<U+200B>ent · X" produced the correct head token 'agent' and then failed '^agent' because
-- the zero-width was still sitting inside the word. Every hidden-character bypass still passed.
--
-- Measured on the live test DB after 090000 was applied — the fix had changed nothing:
--   is_reserved_agent_name('Ag<U+200B>ent · Real Public Figure')  -> false   (should be true)
--   is_reserved_agent_name('Ag<U+E0067>ent · Real Public Figure') -> false   (should be true)
--   is_reserved_agent_name('A<U+0301>gent · Real Public Figure')  -> false   (should be true)
--
-- Both tests now run on the same cleaned string. Verification for this file is below its body.

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

  v_norm := lower(normalize(p_name, NFKC));

  -- Fold confusables. Unchanged from 20260819160000 — these characters are alphanumeric, so
  -- the allow-list below keeps them and they must be mapped, not stripped.
  v_norm := translate(v_norm,
    U&'\0430\0435\043E\0440\0441\0442\03B1\03BF\03B5\0578\13AA\AB7A\0261\0251\1D07',
    'aeopctaoenaagae');

  v_norm := regexp_replace(v_norm, '^[[:space:]]+', '');

  IF v_norm = '' THEN
    RETURN false;
  END IF;

  -- THE CHANGE. Previously: delete an enumerated list of invisible characters, then split on
  -- any non-alphanumeric run. Now: delete everything that is NOT a letter, digit, space or
  -- punctuation — which removes format characters (Cf: variation selectors, tag characters,
  -- zero-widths) and combining marks (Mn) as a CLASS, including ones not yet invented, while
  -- keeping the separator glyph the reserved form depends on.
  --
  -- BOTH tests below run on this cleaned string. Running the head test on the cleaned string
  -- and the separator test on the raw one is the mistake that made the first draft of this
  -- migration fail: an invisible inside "agent" collapsed correctly for tokenizing but still
  -- sat between 'ag' and 'ent' in the raw string, so '^agent' never matched and every hidden
  -- character still passed. Measured, not reasoned about.
  v_vis := regexp_replace(v_norm, '[^[:alnum:][:space:][:punct:]]', '', 'g');

  v_tokens := regexp_split_to_array(v_vis, '[^[:alnum:]]+');
  v_head := v_tokens[1];

  IF v_head IS DISTINCT FROM 'agent' THEN
    RETURN false;
  END IF;

  -- Unchanged: "agent" alone is an ordinary word. The reserved FORM is "agent" followed by a
  -- separator glyph, or by a single-character second token. "Agent Smith" stays available.
  RETURN v_vis ~ '^agent[[:space:]]*[^[:alnum:][:space:]]'
      OR (array_length(v_tokens, 1) >= 2 AND length(v_tokens[2]) = 1);
END;
$$;

COMMIT;
