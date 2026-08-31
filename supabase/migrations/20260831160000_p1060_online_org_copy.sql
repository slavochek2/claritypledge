-- P1060 follow-up: give "Clarity Practice Community · Online" its own blurb and
-- About body. It was seeded with blurb NULL and description NULL, so its About tab
-- fell through to the "A Clarity Organization." placeholder and its directory card
-- carried no subtitle.
--
-- client-safe: additive only — two UPDATEs against one seeded row. No schema change,
-- no policy change. A deployed client reads the new text with no code change.
--
-- WHY THE COPY IS WHAT IT IS (founder-approved 2026-08-31).
-- The first draft distinguished the two groups as "the topic is set in advance" vs
-- "the room brings the topic". The founder rejected it: that describes one specific
-- event format, not a community, and the audience is professionals of many kinds.
-- The deeper problem was that · Chiang Mai's own About already says "We meet in
-- person AND ONLINE" — so "online" is not a distinction between them at all, which
-- is why the two read as near-duplicates.
--
-- The real difference is not the medium. · Chiang Mai is anchored to a place and to
-- whoever is in that room. · Online has no local chapter and no shared professional
-- context — you practise with people outside your own field and outside your own
-- organisation, which is precisely where assumed shared context stops carrying the
-- conversation. The copy below says that, and deliberately does NOT claim a cadence,
-- a format, or a schedule that nobody has committed to.

UPDATE public.organization
   SET blurb = 'Calibrated communication practice with people outside your own field — no local group needed.'
 WHERE slug = 'online'
   AND blurb IS NULL;   -- never overwrite copy a human has since edited

UPDATE public.organization
   SET description = 'Clarity Practice Community · Online is for practising calibrated communication when there is no local group to walk into. Members join from wherever they are.

Sessions run the same way they do anywhere else: each person says back what they understood before replying, and finds out whether they got it right. What changes here is who is in the room. You practise with people from other fields and other organisations, where shared background cannot quietly do the work for you — which is where most real misunderstanding starts.

Anyone is welcome, whatever you do and wherever you are.'
 WHERE slug = 'online'
   AND description IS NULL;
