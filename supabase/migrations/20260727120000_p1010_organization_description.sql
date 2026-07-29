-- P1010 follow-up: give each Clarity Organization a real About description.
--
-- client-safe: purely additive — one nullable column on public.organization. No
--   RLS policy, grant, function, or existing column is altered. Deployed clients
--   that select an explicit column list are unaffected.
-- new function: none.
--
-- Why: the About tab previously rendered the Clarity Organization Terms. Terms now
-- live on their own page (/org/:slug/join, accepted as the join gate), so About
-- needs prose describing what the organization IS. `blurb` stays the one-line
-- header subtitle (<=200 chars); `description` is the longer About body.

ALTER TABLE public.organization
  ADD COLUMN IF NOT EXISTS description TEXT;

-- [FOUNDER DECISION: About copy] — first drafts, replace with founder wording.
UPDATE public.organization
   SET description = 'Clarity Community · Chiang Mai is a local group practicing calibrated communication together. We meet in person and online to run sessions where each person says back what they understood before replying — and finds out whether they got it right. Anyone in or passing through Chiang Mai is welcome.'
 WHERE slug = 'cm' AND description IS NULL;

-- A second UPDATE seeded a description for `champions`. That org was cut before this
-- migration ran on prod (founder decision, 2026-07-29 — see the seed migration's
-- section 4), so the statement is removed rather than left to match zero rows.
