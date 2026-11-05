-- Migration: P1619 — word splitting keeps every script
-- Created: 2026-11-05
-- Spec: features/p1619_mirror_agent_stop_resending_copies.md (Build contract, The match)
-- Guaranteed by: e2e/integration/p1619-mirror-fold-copies.spec.ts
--
-- diffed against: 20261105233100_p1619_review_fixes.sql (_mirror_tokens only). The explicit list dropped [:punct:], so Arabic, Hebrew,
--   Devanagari and full-width punctuation stayed glued to names, and its CJK range split letters such as the one in a three-character
--   Japanese surname. Restored [:punct:], which depends on the database locale; removed the CJK and full-width ranges; kept the symbol ranges.
--
-- client-safe: function body only, same signature.

CREATE OR REPLACE FUNCTION public._mirror_tokens(p_text text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT array_remove(regexp_split_to_array(lower(normalize(COALESCE(p_text, ''))),
    '[\s[:punct:]\u0000-/:-@[-`{-©«-´¶-¹»-¿×÷ -⯿︀-️\U0001F000-\U0001FAFF]+'), '');
$$;
