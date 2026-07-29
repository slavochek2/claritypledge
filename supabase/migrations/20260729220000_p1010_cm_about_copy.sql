-- P1010 follow-up: founder-authored About copy for the Chiang Mai organization.
--
-- client-safe: two guarded UPDATEs on public.organization. No column, RLS policy,
--   grant, or function is altered. Deployed clients read `blurb` and `description`
--   as opaque display text — nothing keys off their values.
-- new function: none.
--
-- Why a separate migration rather than editing 20260727120000: that migration is
-- already applied on TEST, so an in-place edit would never re-run there.
--
-- This settles the [FOUNDER DECISION: About copy] left open by 20260727120000 and
-- 20260727130000. Both UPDATEs are guarded on the superseded placeholder text, so
-- a re-apply can never revert a later founder edit (.claude/rules/database.md —
-- seeds must not override user-set state).
--
-- `blurb` is the header subtitle (org-header.tsx) and doubles as the SEO meta
-- description (org-page.tsx). `description` is the About tab body, split on blank
-- lines into paragraphs (org-page.tsx AboutSection) — the blank lines below are
-- load-bearing, not formatting.

UPDATE public.organization
   SET blurb = 'In every conversation there''s a hidden number: how well you both know you understood each other. Nobody asks. We ask.'
 WHERE slug = 'cm'
   AND blurb = 'Calibrated communication practice in Chiang Mai.';

UPDATE public.organization
   SET description = 'This community is for people who get curious rather than defensive when they spot a gap in their own understanding. If "how well do you think you understood me?" strikes you as an interesting question, this is for you.

In every exchange between two people there''s a hidden number: how much you both know, rather than assume, that you understood each other''s intended meaning, 0 to 10. It''s there right now, while you read this. Neither of us knows what it is, because I''m not in the room with you to find out.

Most people never find out. Saying "you don''t understand me" costs whoever says it, so the room nods instead and moves on. Nodding is cheap: options stay open, faces stay saved, nobody has to slow down. The misunderstanding doesn''t go away though. It goes underground, and everything built on top of it inherits the error.

We meet in person, in Chiang Mai. Each person explains back what they understood the other to mean, not parroting the words, then finds out how close they got. Shared reality isn''t agreement. It''s both people knowing where the other actually stands, disagreements included. That turns out to be deeply satisfying, especially when the stakes are high.'
 WHERE slug = 'cm'
   AND description LIKE '%is a local group practicing calibrated communication together.%';
