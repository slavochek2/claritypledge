-- Both groups: state the personal benefits of revealing and bridging gaps.
--
-- client-safe: two guarded UPDATEs on public.organization (slugs 'cm', 'online').
--   No column, RLS policy, grant or function is altered. Routing is by `slug`,
--   unchanged. Deployed clients read `description` as opaque display text.
-- new function: none.
--
-- WHY. Both About bodies argued the mechanism and the group-level gain, and left
-- the reader's own payoff implicit. On · Chiang Mai the benefits were present but
-- buried as the tail clause of the definition paragraph, where they read as part
-- of a definition rather than as a promise. Founder-authored list, six items,
-- adopted verbatim.
--
-- On · Chiang Mai the buried clause is REMOVED in the same statement, so the page
-- does not make the same point twice. P2 now ends at "has a working feedback loop."
-- and the new paragraph delivers the personal version.
--
-- PLACEMENT differs per group because the bodies differ:
--   · cm     — after the definition paragraph (P2), before "Communication activism…"
--   · online — after "…deeply satisfying, especially when the stakes are high." (P5),
--              before the closing "Everything is public…" paragraph.
-- The About renderer (org-page.tsx AboutSection) splits `description` on blank
-- lines into <p> elements and supports no lists, bold or markdown — so this is one
-- sentence-run paragraph by construction, and the blank lines are load-bearing.
--
-- GUARDS use `replace()` against an exact anchor rather than rewriting the whole
-- body. Three properties this buys over the LIKE-prefix guards used on 2026-09-07
-- (see docs/decisions.md 2026-09-07 [technical], which flagged prefix imprecision):
--   1. Idempotent by construction — the anchor contains text this migration
--      removes or precedes, so a re-apply matches nothing and changes nothing.
--   2. It cannot revert a later founder edit to any OTHER part of the body, which
--      a whole-body UPDATE would silently do.
--   3. It cannot fire against copy that has already drifted at the anchor.
--
-- ROW_COUNT is asserted per statement. The 2026-09-07 migration noted that its
-- independent UPDATEs made a silent partial apply possible and recommended exactly
-- this; a partial apply here RAISEs and rolls the whole thing back.
--
-- Verified against prod (read-only REST GET) immediately before authoring: both
-- anchors matched byte-for-byte on besjtuodziykmjidubzw.

DO $$
DECLARE
  benefits CONSTANT text :=
    'Here is how you can personally benefit from revealing and bridging gaps in your cognitive understanding: avoid preventable mistakes, accelerate your learning, build trust faster, increase your own trustworthiness, reduce conflicts that get emotionally stuck, and strengthen your professional and personal relationships.';
  cm_anchor CONSTANT text :=
' Mistakes get caught early, learning compounds, and trust rests on something tested rather than assumed.

Communication activism is about';
  online_anchor CONSTANT text :=
'especially when the stakes are high.

Everything is public';
  n integer;
BEGIN
  -- · Chiang Mai: drop the buried clause, insert the benefits paragraph in its place.
  UPDATE public.organization
     SET description = replace(
           description,
           cm_anchor,
           E'\n\n' || benefits || E'\n\nCommunication activism is about'
         )
   WHERE slug = 'cm'
     AND position(cm_anchor in description) > 0;

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION
      'cm About anchor did not match (rows affected: %). The live copy has drifted from what this migration was written against — re-read the row before applying.', n;
  END IF;

  -- · Online: insert the same paragraph before the closing transparency paragraph.
  UPDATE public.organization
     SET description = replace(
           description,
           online_anchor,
           'especially when the stakes are high.' || E'\n\n' || benefits || E'\n\nEverything is public'
         )
   WHERE slug = 'online'
     AND position(online_anchor in description) > 0;

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION
      'online About anchor did not match (rows affected: %). The live copy has drifted from what this migration was written against — re-read the row before applying.', n;
  END IF;
END $$;
