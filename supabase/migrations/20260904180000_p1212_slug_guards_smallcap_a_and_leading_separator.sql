-- P1212 §2, fifth pass: two holes an adversarial review found AFTER the namespace shipped.
--
-- client-safe: this WIDENS two reservations. It can only newly REFUSE slugs, never newly
-- accept one, so nothing a client legitimately holds today starts failing — verified below
-- against both databases: no profile in test or prod has a slug that either new rule newly
-- catches. The false-positive controls are asserted in the spec, not argued here.
--
-- Function-redefinition provenance (pre-commit gate). Each was diffed against the NEWEST
-- definition of that function, dumped from the test database with pg_get_functiondef and
-- compared to the file named — not against the first migration a grep returned, which is
-- the mistake 20260904160000 was written to undo:
--   is_reserved_agent_slug   -- diffed against: 20260904160000_p1212_agent_slug_decompose.sql (one codepoint added to the fold table; one regexp_replace widened)
--   is_reserved_machine_slug -- diffed against: 20260824140000_p1104_slug_guard_decompose.sql (same two changes)
--
-- ============================================================================
-- HOLE 1 — SMALL-CAPITAL A (U+1D00), in the agent table only.
-- ============================================================================
-- The fold table carries the small-capital forms of G, E, N and T — ɢ ᴇ ɴ ᴛ — and not the
-- small-capital A. That asymmetry inside a single hand-kept list is what marks it an
-- oversight rather than a decision.
--
-- U+1D00 survives every stage: it has no compatibility decomposition, so NFKD leaves it
-- intact; its category is already Ll, so lower() is a no-op; and it is [[:alnum:]], so the
-- visible-character strip keeps it. `ᴀgent-yann-lecun` therefore tokenised as `ᴀgent`, did
-- not equal `agent`, and was mintable by any authenticated user — a URL that renders as an
-- official agent account for a named living person.
--
-- The machine table already folded ᴍ (U+1D0D) but likewise missed ᴀ, so `mᴀchine-x` was
-- open on the shipped guard too. Both are closed here.
--
-- This is a DIFFERENT class from the tilde gap filed separately: that one is a character the
-- strip REMOVES, this one is a confusable the fold MISSES. Neither table is a proof — the
-- Unicode confusables set is larger than any hand-kept list, and this pass is best-effort
-- hardening of a known-incomplete mechanism, not a claim of completeness.
--
-- ============================================================================
-- HOLE 2 — A LEADING SEPARATOR PRODUCES AN EMPTY FIRST TOKEN.
-- ============================================================================
-- regexp_split_to_array emits an empty leading element when the subject begins with a
-- separator, so `-agent-yann-lecun` split to {'', 'agent', 'yann', 'lecun'} and the
-- first-token test compared '' against 'agent'. Only leading WHITESPACE was stripped.
--
-- The client fully controls the string: there is no CHECK constraint on profiles.slug and
-- upsert_my_profile passes p_data->>'slug' through unvalidated. `/p/-agent-yann-lecun` is a
-- thinner disguise than the confusable above, but it is one keystroke and it worked.
--
-- THE FIX is to strip leading non-alphanumerics rather than leading whitespace alone. The
-- risk of a strip is that it WIDENS the reservation into a land-grab on ordinary handles, so
-- the direction matters: it removes only leading separators, never interior ones, so the
-- token boundary that makes `agentic-systems` and `my-agent` legitimate is untouched. Both
-- are asserted as controls, prefixed and bare, in
-- e2e/integration/p1212-agent-slug-reservation.spec.ts.

BEGIN;

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
  -- Cyrillic / Greek / Armenian / IPA / small-capital forms. U+1D00 (small-capital A) added
  -- 2026-09-04: every other letter's small-capital form was already here, and its absence
  -- left `ᴀgent-<name>` mintable. 17 source codepoints, 17 target characters — checked,
  -- because translate() pairs POSITIONALLY and a length mismatch silently mis-maps
  -- everything after the divergence.
  v_norm := translate(
    v_norm,
    U&'\0430\03B1\0251\1D00\0261\0262\0435\0454\03B5\1D07\043D\043F\0578\0274\0442\03C4\1D1B',
    'aaaaggeeeennnnttt'
  );

  -- Strip LEADING separators, not just leading whitespace: regexp_split_to_array emits an
  -- empty first element when the subject starts with one, which made `-agent-x` tokenise as
  -- '' and pass. Interior separators are untouched, so the token boundary that keeps
  -- `agentic-systems` and `my-agent` available to real people still holds.
  v_norm := regexp_replace(v_norm, '^[^[:alnum:]]+', '');

  IF v_norm = '' THEN
    RETURN false;
  END IF;

  -- Drop everything that is neither alphanumeric, space nor punctuation — which is exactly
  -- the combining marks NFKD has just exposed. Without this they survive as separators and
  -- split the very token being tested.
  v_vis := regexp_replace(v_norm, '[^[:alnum:][:space:][:punct:]]', '', 'g');

  RETURN (regexp_split_to_array(v_vis, '[^[:alnum:]]+'))[1] = 'agent';
END;
$$;

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

  v_norm := lower(normalize(p_slug, NFKD));

  v_norm := translate(
    v_norm,
    U&'\00AD\034F\061C\180E\115F\1160\200B\200C\200D\200E\200F\2060\2061\2062\2063\2064\2066\2067\2068\2069\202A\202B\202C\202D\202E\3164\17B4\17B5\FEFF',
    ''
  );

  -- U+1D00 (small-capital A) added 2026-09-04 for the same reason as in the agent table:
  -- ᴍ was folded and ᴀ was not, so `mᴀchine-<name>` was open. 16 in, 16 out — checked.
  v_norm := translate(
    v_norm,
    U&'\043C\0430\0441\04BB\0456\0435\0578\03B1\03F2\03B9\1D0D\0251\026A\1D07\0274\1D00',
    'machienacimaiena'
  );

  -- Same leading-separator fix as above; the hole was identical on this guard.
  v_norm := regexp_replace(v_norm, '^[^[:alnum:]]+', '');

  IF v_norm = '' THEN
    RETURN false;
  END IF;

  v_vis := regexp_replace(v_norm, '[^[:alnum:][:space:][:punct:]]', '', 'g');

  RETURN (regexp_split_to_array(v_vis, '[^[:alnum:]]+'))[1] = 'machine';
END;
$$;

COMMIT;
