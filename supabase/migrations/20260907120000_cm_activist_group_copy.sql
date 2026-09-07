-- Chiang Mai group: rename to a communication-activist chapter + new blurb/About.
--
-- client-safe: three guarded UPDATEs on one public.organization row. No column,
--   RLS policy, grant, or function is altered. Deployed clients read `name`,
--   `blurb` and `description` as opaque display text; routing is by `slug`
--   ('cm', unchanged).
-- new function: none.
--
-- WHY. The two groups (· Chiang Mai, · Online) read as near-duplicates because
-- both descriptions described the same mechanic and differed only by location.
-- The real difference is what MEMBERSHIP means: · Online is where the paid level
-- lives; · Chiang Mai is free, non-commercial, and membership there means
-- practising this, carrying it outward, and saying when it fails. The Clarity
-- Group Terms are NOT touched — they are generic across every group on purpose,
-- and the purpose of a group belongs to the group's own description.
--
-- Copy went through three independent adversarial reviews (Fable, Codex, Gemini)
-- plus founder correction. The reviewers' central fix was WRONG and is not
-- applied: they demanded the copy state the explain-back mechanic, but the terms
-- commit members to REVEALING a gap (an honest 0-10), not to bridging it.
-- Explaining back is one way to bridge, and bridging is case by case. Applied
-- from the reviews: the paid-work disclaimer is cut (it answered a question no
-- reader asks and planted the one they would); the "every session tests
-- something" format promise is cut; hidden-actor passives and unsupported
-- absolutes are gone. Applied from the founder: the description states WHY, not
-- HOW, and links the terms rather than paraphrasing them; the barriers to
-- revealing are named; the cost argument (established cognitive science made
-- cheap) and the organizer's home motivation are in.
--
-- Every UPDATE is guarded on the exact superseded value so a re-apply can never
-- revert a later founder edit (.claude/rules/database.md — seeds must not
-- override user-set state). If any guard no-ops, prod has drifted from what these
-- migrations record: read the live row before re-running anything.
--
-- NAME: founder decision, taken 2026-09-07. 'Communication Activism Community ·
-- Chiang Mai' names the field rather than labelling each member an activist.
-- The sibling org ('online') keeps its name for now; renaming it away from
-- "Community" is a separate open decision.

UPDATE public.organization
   SET name = 'Communication Activism Community · Chiang Mai'
 WHERE slug = 'cm'
   AND name = 'Clarity Practice Community · Chiang Mai';

UPDATE public.organization
   SET blurb = 'We reveal gaps in cognitive understanding instead of pretending, and carry the habit out of the room.'
 WHERE slug = 'cm'
   AND blurb = 'In every conversation there''s a hidden number: how well you both know you understood each other. Nobody asks. We ask.';

-- `description` is the About tab body, split on blank lines into paragraphs
-- (org-page.tsx AboutSection) — the blank lines below are load-bearing.
UPDATE public.organization
   SET description = 'Ask a colleague what they understood from your words and it reads as disrespect. Admit you did not fully understand them and they might think you are stupid. So people pretend they understood, and the gap in cognitive understanding stays hidden. Many groups run on that damaging social norm: revealing a cognitive understanding gap is punished. Five common barriers keep it in place: ego, fear, laziness, plausible deniability and ignorance. The first four are hard to shift. Ignorance is not. It can be filled.

Cognitive understanding is knowing what the other person means, and both of you knowing that the other knows it. It is not emotional understanding and it is not agreement. You can fully understand someone, not feel what they feel, and still disagree. That is why cognitive understanding can reach across different interests, opinions and values, where emotional understanding and agreement cannot. A group with a social norm to reveal gaps in cognitive understanding has a working feedback loop. Mistakes get caught early, learning compounds, and trust rests on something tested rather than assumed.

Communication activism is about spreading good communication practice. And it is about finding out together how to spread it faster, cheaper and with less effort, in a way that spreads on its own. That second half is research. We try methods, we measure, and some of them fail. We disagree with each other in the room, often. Joining needs no skill. It needs the will to improve your own communication and other people''s.

None of this is new. Many cognitive scientists, communication researchers, psychotherapists and B2B sales people put these ideas into practice to succeed. Most people have no five years to spend learning and practising them. This community is about the shorter journey, and about driving down the cost of acquiring good communication habits.

The organizer believes belonging does not have to come from a nation or a place. A lasting home is not a place. It is the people who share the value of integrity, and who practise intellectual honesty to help each other catch their own mistakes.

Everything is public: what we are testing, what we tried, what failed. If you want to go deeper, point Claude or ChatGPT at the open source repository and ask it your questions: https://github.com/slavochek2/claritypledge. Your critical feedback is very welcome.'
 WHERE slug = 'cm'
   AND description LIKE 'This community is for people who get curious rather than defensive%';
