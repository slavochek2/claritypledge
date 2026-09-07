-- Online group: adopt the fuller About body that · Chiang Mai used to carry.
--
-- client-safe: one guarded UPDATE on public.organization. No column, RLS policy,
--   grant or function is altered; routing is by `slug` ('online', unchanged).
-- new function: none.
--
-- WHY. · Chiang Mai was rewritten as a communication-activist group
-- (20260907120000), which retired a four-paragraph About body that was stronger
-- than anything · Online had. · Online's own copy was three short paragraphs
-- written to differentiate it from · Chiang Mai on a distinction that has since
-- moved: the two now differ by what MEMBERSHIP means, not by medium. Rather than
-- lose the retired prose, it moves here.
--
-- NOT a verbatim move. Two changes: the closing paragraph named Chiang Mai and
-- in-person meeting, so it is rewritten for online and absorbs the one idea
-- · Online's own copy owned (you practise with people outside your field, where
-- shared background cannot silently carry the conversation); and "a gap in their
-- own understanding" is qualified to "cognitive understanding", matching the
-- precision applied to · Chiang Mai the same day.
--
-- Guarded on the exact superseded opening so a re-apply can never revert a later
-- founder edit (.claude/rules/database.md).

UPDATE public.organization
   SET blurb = 'Practise revealing and bridging gaps in cognitive understanding with people across different interests, opinions, values and industries.'
 WHERE slug = 'online'
   AND blurb LIKE 'Calibrated communication practice%';

UPDATE public.organization
   SET description = 'This community is for people who get curious rather than defensive when they spot a gap in their own cognitive understanding. If "how well do you think you understood me?" strikes you as an interesting question, this is for you.

In every exchange between two people there''s a hidden number: how much you both know, rather than assume, that you understood each other''s intended meaning, 0 to 10. It''s there right now, while you read this. Neither of us knows what it is, because I''m not in the room with you to find out.

Most people never find out. Saying "you don''t understand me" costs whoever says it, so the room nods instead and moves on. Nodding is cheap: options stay open, faces stay saved, nobody has to slow down. The misunderstanding doesn''t go away though. It goes underground, and everything built on top of it inherits the error.

We meet online, from wherever you are. Each person explains back what they understood the other to mean, not parroting the words, then finds out how close they got. You practise with people from other fields and other organisations, where shared background cannot quietly do the work for you, which is where most real misunderstanding starts.

Shared reality isn''t agreement. It''s both people knowing where the other actually stands, disagreements included. That turns out to be deeply satisfying, especially when the stakes are high.

Everything is public: what we are testing, what we tried, what failed. If you want to go deeper, point Claude or ChatGPT at the open source repository and ask it your questions: https://github.com/slavochek2/claritypledge. Your critical feedback is very welcome.'
 WHERE slug = 'online'
   AND description LIKE 'Clarity Practice Community · Online is for practising calibrated communication%';
