-- P1104: the reserved-name guard enumerated invisible characters to DELETE. That list can
-- never be complete, and it wasn't.
--
-- client-safe: tightens a predicate. Names that were reserved stay reserved; names that were
-- ordinary stay ordinary. The only behaviour change is that a name which *renders* as
-- "Agent · X" is now recognised as such regardless of what is hidden inside the word.
--
-- Function-redefinition provenance (pre-commit gate):
--   is_reserved_agent_name -- diffed against: 20260819160000_p1104_reserve_agent_name_at_the_table.sql
--     (both fold tables reproduced byte-identical below; only the tokenizing step changed)
--
-- THE BYPASS, measured against the live test DB before this migration:
--
--   is_reserved_agent_name('Agent · Real Public Figure')      -> true    (correct)
--   is_reserved_agent_name('Ag<U+FE0F>ent · Real Public Figure') -> FALSE
--   is_reserved_agent_name('Ag<U+FE0E>ent · Real Public Figure') -> FALSE
--   is_reserved_agent_name('Ag<U+E0067>ent · Real Public Figure') -> FALSE
--   is_reserved_agent_name('A<U+0301>gent · Real Public Figure') -> FALSE
--
-- All four render as "Agent · Real Public Figure" in a browser. The mechanism: the head test
-- tokenizes with `regexp_split_to_array(v_norm, '[^[:alnum:]]+')`, and every one of those
-- characters is non-alphanumeric, so it SPLITS the word — tokens become ['ag','ent'] and the
-- head is 'ag', not 'agent'. The strip list did not contain variation selectors (U+FE00-FE0F,
-- U+E0100-E01EF), Unicode tag characters (U+E0000-E007F), or combining marks.
--
-- Direction of the harm: this is the guard's INVERSE failure. It does not let an agent escape
-- the marker; it lets a HUMAN wear it — self-naming to look like a machine reading while
-- keeping a real pledge ring, a round avatar and a real ear count. The spec names that as
-- actively deceptive.
--
-- THE FIX. An enumerate-the-bad list is unbounded: Unicode keeps minting invisible characters
-- and any one omitted re-opens the hole. So the head test now runs over a POSITIVE allow-list —
-- everything that is not a letter, a digit, or a space is removed before tokenizing. A
-- character nobody has heard of yet is dropped by default rather than treated as a word break.
--
-- The two fold tables are kept: NFKC plus the confusables map still close the homoglyph class
-- (Cyrillic а, Greek ο, Cherokee Ꭺ), which stripping cannot reach because those characters ARE
-- alphanumeric. Allow-list and fold tables cover different halves of the problem.

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
