-- client-safe: is_reserved_agent_slug is BRAND NEW in this migration. No deployed client
--   calls it — nothing can call a function that did not exist — so the REVOKE below removes a
--   grant no shipped code holds. It grants EXECUTE to authenticated and service_role in the
--   same statement, matching is_reserved_machine_slug's posture (20260825070000 revoked anon
--   there for the same reason: an unauthenticated caller has no business probing the
--   reservation, and letting it would hand an attacker a free oracle for testing lookalikes).
--   Nothing about a currently-deployed bundle changes when this applies.
-- diffed against: 20260824140000_p1104_slug_guard_decompose.sql (is_reserved_machine_slug)
-- P1212 §2 continuation: the URL namespace moves from "machine-" to "agent-".
--
-- WHY. P1104 reserved "machine-" and its own comment gave the reason: "The word is machine,
-- not agent, because that is what every reader already sees (the chip, the /machines
-- explainer, the footer line)". P1212 §2 changed what every reader sees -- the chip now reads
-- AGENT, by founder decision 2026-09-04. The stated justification for "machine-" therefore no
-- longer holds, and the slug had become the odd one out.
--
-- THE COST, STATED. P1104's second reason still stands on its own: "agent" reads in English
-- as *representative of*, the one implication these accounts must never carry. The founder
-- overruled that for the visible byline, where the connective "on" answers it
-- (`AGENT · on Yann LeCun` -- the preposition restores the account->subject relation). A slug
-- carries no connective, so `/p/agent-yann-lecun` is the weaker form of the two. It is still
-- unambiguously not `/p/yann-lecun`, which is the property the reservation exists to protect,
-- and consistency with every other marker was judged worth more than the residual.
--
-- WHY NOW AND NOT LATER. Verified against PROD 2026-09-04 (besjtuodziykmjidubzw, anon read,
-- 107 profiles readable as a control): ZERO profiles with a "machine-" slug and ZERO with an
-- "Agent " name. No public URL exists to break, so no redirect layer is owed. After the first
-- prod agent account this becomes a URL migration with permanent redirects.
--
-- "machine-" STAYS RESERVED FROM CLIENTS, PERMANENTLY. This is the half that must not be
-- dropped in a rename. The prefix's job is that a reader seeing /p/machine-sam-harris cannot
-- be looking at a page Sam Harris made. Un-reserving it would let any authenticated user mint
-- exactly that URL -- and a retired namespace is a MORE attractive impersonation target than a
-- live one, because old links and screenshots still point at it. Retiring the namespace for
-- CREATION and keeping it closed for CLIENTS are different decisions; only the first is made
-- here.
--
-- WHAT A USER LOSES: a slug whose first token is "agent" (`/p/agent-smith`). "machine" was an
-- implausible handle; "agent" is less so. Judged acceptable -- `is_reserved_agent_name` has
-- reserved the same word in the NAME namespace since 20260819160000, so this closes a gap
-- rather than opening a new class of refusal, and the token test is exact: `agentic-systems`
-- and `agents-of-change` are unaffected.

-- ============================================================================
-- 1. The predicate. Same shape as is_reserved_machine_slug, same reasoning.
-- ============================================================================
-- Decides on the FIRST TOKEN after NFKC + invisible-stripping + confusables folding, so the
-- separator set is closed rather than enumerated: agent-x / agent_x / agent.x / agent~x are
-- one rule, not four.
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
  'P1212: true when a profile slug claims the reserved "agent-" URL namespace. Same first-token / NFKC / confusables shape as is_reserved_machine_slug, which stays in force for the retired "machine-" namespace. Called by the profiles guard trigger, upsert_my_profile, and create_or_reuse_agent_account.';

REVOKE ALL ON FUNCTION public.is_reserved_agent_slug(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_reserved_agent_slug(text) TO authenticated, service_role;
