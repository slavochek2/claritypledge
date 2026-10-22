-- P1543: One community. Rename cm to "Clarity Practice Community · Chiang Mai" with the
-- approved subtitle and About, and hide the (empty) online group.
--
-- client-safe: two guarded UPDATEs on public.organization (slugs 'cm', 'online'). No column,
--   RLS policy, grant or function is altered. Routing is by `slug`, unchanged. Deployed clients
--   read name / blurb / description as opaque display text. Setting visibility = 'private' on
--   `online` removes that row from the anon/public SELECT policy (visibility = 'public'); no
--   deployed client depends on the row existing (its only member keeps the membership row).
-- new function: none.
--
-- WHY. The founder will not say "Communication Activism" aloud in Chiang Mai; the activism
-- ask now lives in the About text ("carry this practice outside of our community"), not the
-- name. The online group has no events and no audience yet, so it is hidden, never deleted:
-- no organization row and no membership row is removed or touched, and it can be reopened
-- with one UPDATE back to 'public'.
--
-- GUARD (drift-safe, re-run-safe). The cm UPDATE matches only the exact prior name
-- 'Communication Activism Community · Chiang Mai' (the live row on test and prod,
-- checked 2026-10-22). If it matches 0 rows, the row must already be in the full target
-- state (name, blurb AND description all equal) or the migration RAISEs naming the drift.
-- So: a re-run after success is a no-op, a re-run against drifted copy is an error, and
-- it can never double-apply. The online UPDATE is idempotent (visibility <> 'private').
--
-- The About renderer (org-page.tsx AboutSection) splits `description` on blank lines
-- into <p> elements; the blank lines below are load-bearing. Text is dollar-quoted
-- because it contains apostrophes.

DO $$
DECLARE
  old_name CONSTANT text := $t$Communication Activism Community · Chiang Mai$t$;
  new_name CONSTANT text := $t$Clarity Practice Community · Chiang Mai$t$;
  new_blurb CONSTANT text := $t$Practise revealing and bridging gaps in cognitive understanding with people across different interests, opinions, values and industries.$t$;
  new_description CONSTANT text := $t$This community is for people who get curious rather than defensive when they spot a gap in their own cognitive understanding of other people. In every conversation between two people there's a hidden number: how much, from 0 to 10, do you understand each other's intended meaning? It is here right now. Your interpreted meaning of what you read might not fully match my intended meaning.

Most people never reveal gaps in their assumed understanding. Ask a colleague what they understood from your words and it reads as disrespect. Admit you did not understand them and they might think you are stupid. So the room nods and moves on. The gap in understanding of each other doesn't go away though. Everything built on top of it inherits the error.

Cognitive understanding is knowing what the other person means, and both of you knowing that the other knows it. It is not agreement. You can fully understand someone and still disagree. Knowing where you both actually stand is deeply satisfying, especially when the stakes are high.

Bridging these gaps helps you avoid preventable mistakes, learn faster, build trust faster, become more trustworthy, reduce conflicts that get emotionally stuck, and strengthen your professional and personal relationships.

We also try to carry this practice outside of our community, and to find out how to spread it faster and cheaper. Cognitive scientists, communication researchers, psychotherapists and B2B salespeople already use these ideas. Most people don't have five years to learn them. We are looking for the shorter journey.

The founder believes belonging does not have to come from a nation or a place. A lasting home is not a place. It is the people who share the value of integrity, and who practise intellectual honesty to help each other catch their own mistakes.

Joining needs no skill, only the will to improve your own communication and other people's. Everything is public: what we are testing, what we tried, what failed. To go deeper, point Claude or ChatGPT at our open source repository: https://github.com/slavochek2/claritypledge. Your critical feedback is very welcome.$t$;
  n integer;
BEGIN
  -- 1. cm: rename + new subtitle + new About, only against the exact prior name.
  UPDATE public.organization
     SET name = new_name,
         blurb = new_blurb,
         description = new_description
   WHERE slug = 'cm'
     AND name = old_name
     -- Review fix (Gemini + Codex): pin the prior copy too, so an edit made to the subtitle or
     -- About since 2026-10-22 raises below instead of being overwritten. Hashes are of the live
     -- prod row read that day (identical on test before this migration ran).
     AND md5(blurb) = 'd32bd4b7165d9bdf6a38ae23698eb3c8'
     AND md5(description) = '98a3b6c47ed06be303208840dea1f2ef';

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    -- Not the old row. Acceptable only if a previous run already put it in the target state.
    IF NOT EXISTS (
      SELECT 1 FROM public.organization
       WHERE slug = 'cm'
         AND name = new_name
         AND blurb = new_blurb
         AND description = new_description
    ) THEN
      RAISE EXCEPTION
        'P1543: organization cm is neither the expected prior state (name = %) nor the target state (name, subtitle or About differ). The live row has drifted from what this migration was written against; re-read it before applying.', old_name;
    END IF;
  ELSIF n <> 1 THEN
    RAISE EXCEPTION 'P1543: cm UPDATE affected % rows, expected 1.', n;
  END IF;

  -- 2. online: hide, never delete. Idempotent; the row must exist.
  UPDATE public.organization
     SET visibility = 'private'
   WHERE slug = 'online'
     AND visibility <> 'private';

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 AND NOT EXISTS (
    SELECT 1 FROM public.organization WHERE slug = 'online' AND visibility = 'private'
  ) THEN
    RAISE EXCEPTION 'P1543: organization online not found; nothing to hide.';
  END IF;

  -- No membership row is touched.
END $$;
