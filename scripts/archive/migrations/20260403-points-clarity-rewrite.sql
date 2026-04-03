-- P629: Points Clarity Rewrite
-- Strategy:
--   Points with ONLY Slava's positions → UPDATE in place
--   Points with OTHER users' positions → INSERT new v2, tag old as deprecated
--
-- Slava's user ID: a99042ef-e740-446a-8734-389c8589cc17

BEGIN;

-- ============================================================
-- PART 1: UPDATE IN PLACE (only Slava has positions)
-- ============================================================

-- st5 understanding (cb114d49) — only Slava
UPDATE points SET
  statement = E'Two people can hold exactly the same belief and be uncertain if the other holds it or not. That''s a shared belief. Common belief is different: I know that you know that I know, and so on. When we have a common belief, we both know for certain that we understood each other. To verify cognitive understanding, the listener paraphrases and the speaker scores the accuracy of the paraphrase. This turns private or shared beliefs into common beliefs.',
  updated_at = now()
WHERE id = 'cb114d49-21eb-409d-afb1-19e40b9ba36c';

-- st8 understanding v2 (ba8d7e91) — only Slava
UPDATE points SET
  statement = E'In any important partnership — personal or professional — a written commitment to verify cognitive understanding gives both people the same standard to hold each other accountable to. It makes misunderstandings visible early, when it''s still easy to correct. Can your partner explain back when the [clarity partnership agreement](https://claritypledge.com/partner-template) applies, how verification of cognitive understanding works, and why it matters? That''s the test of whether your partner actually understands the commitment you''re both making. Many people can explain back, but won''t. Everything that goes wrong later in your partnership starts there.',
  updated_at = now()
WHERE id = 'ba8d7e91-cbca-4501-930f-cb456891c848';

-- st4-a misunderstanding (f4b1fb42) — only Slava
UPDATE points SET
  statement = E'If you''re explaining back what someone said and you strongly disagree, hiding your frustration is dishonest. Your conversation partner deserves to see your authentic emotional reaction, even if it''s strongly negative. Without an authentic display of your emotions, genuine mutual understanding becomes much harder to achieve.',
  updated_at = now()
WHERE id = 'f4b1fb42-26d5-4610-b7e3-50e0ffe215b4';

-- st5-a misunderstanding (f1a65607) — only Slava
UPDATE points SET
  statement = E'Either somebody understood you or they didn''t. Asking someone to score with numbers how well they believe they understood you turns a simple conversation into an unnecessary grading exercise.',
  updated_at = now()
WHERE id = 'f1a65607-f1ab-4fce-9016-34f4f30415f0';

-- st6-a misunderstanding (c56ec5d2) — only Slava
UPDATE points SET
  statement = E'If after an important conversation someone disagrees with you and doesn''t feel what you feel, you are clearly in a win-lose situation so you must make sure they either agree or even better feel what you feel.',
  updated_at = now()
WHERE id = 'c56ec5d2-62bc-45b9-9870-70de8fc33a16';

-- st7-a misunderstanding (50f767ad) — only Slava
UPDATE points SET
  statement = E'Being asked to paraphrase is an accusation — it says the other person believes you are stupid or weren''t really paying attention. If someone trusted that you were listening, they wouldn''t need you to prove it.',
  updated_at = now()
WHERE id = '50f767ad-0368-4ab0-baff-993b966a46b2';


-- ============================================================
-- PART 2: VERSION BUMP (other users have positions on v1)
-- Tag old as deprecated, insert new v2
-- ============================================================

-- st1 understanding: 9 positions (Slava + 8 others)
-- Old: 6d253c2b → add 'deprecated' tag
UPDATE points SET
  tags = array_append(tags, 'deprecated'),
  updated_at = now()
WHERE id = '6d253c2b-32b1-4a10-826c-4a4844b23e14';

INSERT INTO points (id, statement, first_validator_id, tags, visibility, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  E'When someone says "you don''t understand me," they could mean at least three different things. They might mean you don''t feel what they feel. They might mean you don''t agree with them. Or they might mean you can''t accurately describe their position. These are three separate requests. Satisfying one doesn''t necessarily satisfy the others. The word "understand" never tells you which kind of understanding is being asked for.',
  'a99042ef-e740-446a-8734-389c8589cc17',
  ARRAY['st1', 'understanding', 'v2'],
  'public',
  now(),
  now()
);

-- st6 understanding: 5 positions (Slava + 4 others)
-- Old: 978f7a1e → add 'deprecated' tag
UPDATE points SET
  tags = array_append(tags, 'deprecated'),
  updated_at = now()
WHERE id = '978f7a1e-5e80-41b7-aed5-35cfcd14a379';

INSERT INTO points (id, statement, first_validator_id, tags, visibility, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  E'When interests clash and both people pursue agreement with each other, one of them will have to give up their position (win-lose). When both people pursue emotional validation, again one of them would have to give up their feelings (win-lose). Verifying cognitive understanding asks neither person to give up anything. You can cognitively understand a position you reject. That''s why in a conflict of interests, cognitive understanding is the only shared goal that predictably produces a win-win.',
  'a99042ef-e740-446a-8734-389c8589cc17',
  ARRAY['st6', 'understanding', 'v2'],
  'public',
  now(),
  now()
);

-- st7 understanding: 3 positions (Slava + 2 others)
-- Old: b5e50000 → add 'deprecated' tag
UPDATE points SET
  tags = array_append(tags, 'deprecated'),
  updated_at = now()
WHERE id = 'b5e50000-0000-4000-b000-000000000005';

INSERT INTO points (id, statement, first_validator_id, tags, visibility, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  E'Once both people know how to verify cognitive understanding — I know that you know that I know that you know and so on — they share a method for reaching it together. From that moment, asking each other to explain back what they understood becomes a normal part of how they have important conversations. There are valid and invalid reasons to decline a paraphrasing request. Declining without explaining why leaves the other person wondering whether you have a genuine reason — or whether you''re avoiding the check out of [fear, ego, laziness, or self-interest](https://claritypledge.com/manifesto#the-psychological-motives-that-exploit-these-asymmetries).',
  'a99042ef-e740-446a-8734-389c8589cc17',
  ARRAY['st7', 'understanding', 'v2'],
  'public',
  now(),
  now()
);

-- st9 understanding: 3 positions (Slava + 2 others)
-- Old: b5e70000 → add 'deprecated' tag
UPDATE points SET
  tags = array_append(tags, 'deprecated'),
  updated_at = now()
WHERE id = 'b5e70000-0000-4000-b000-000000000007';

INSERT INTO points (id, statement, first_validator_id, tags, visibility, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  E'You might already practice verified cognitive understanding. But other people don''t know that. Without a public signal, every person you meet has to guess whether it''s safe to request you to explain back what you understood — and risk offending you by asking. The [ClarityPledge](https://claritypledge.com/sign-pledge) removes that uncertainty. It tells your partners, colleagues, and strangers: it''s safe to request you to explain back anything. The aim is not to change your behavior — it''s to change what others feel safe requesting from you.',
  'a99042ef-e740-446a-8734-389c8589cc17',
  ARRAY['st9', 'understanding', 'v2'],
  'public',
  now(),
  now()
);

-- ============================================================
-- PART 3: Add Slava's positions on the new v2 points
-- (Copy his position value from v1 to v2)
-- ============================================================

-- For each new v2 point, copy Slava's position from the old v1
-- st1: old 6d253c2b → new (just inserted)
INSERT INTO point_positions (user_id, point_id, position, created_at, updated_at)
SELECT
  'a99042ef-e740-446a-8734-389c8589cc17',
  new_p.id,
  old_pos.position,
  now(),
  now()
FROM point_positions old_pos
JOIN points new_p ON 'st1' = ANY(new_p.tags) AND 'v2' = ANY(new_p.tags) AND 'understanding' = ANY(new_p.tags) AND NOT ('deprecated' = ANY(new_p.tags))
WHERE old_pos.point_id = '6d253c2b-32b1-4a10-826c-4a4844b23e14'
  AND old_pos.user_id = 'a99042ef-e740-446a-8734-389c8589cc17'
ON CONFLICT (user_id, point_id) DO NOTHING;

-- st6: old 978f7a1e → new v2
INSERT INTO point_positions (user_id, point_id, position, created_at, updated_at)
SELECT
  'a99042ef-e740-446a-8734-389c8589cc17',
  new_p.id,
  old_pos.position,
  now(),
  now()
FROM point_positions old_pos
JOIN points new_p ON 'st6' = ANY(new_p.tags) AND 'v2' = ANY(new_p.tags) AND 'understanding' = ANY(new_p.tags) AND NOT ('deprecated' = ANY(new_p.tags))
WHERE old_pos.point_id = '978f7a1e-5e80-41b7-aed5-35cfcd14a379'
  AND old_pos.user_id = 'a99042ef-e740-446a-8734-389c8589cc17'
ON CONFLICT (user_id, point_id) DO NOTHING;

-- st7: old b5e50000 → new v2
INSERT INTO point_positions (user_id, point_id, position, created_at, updated_at)
SELECT
  'a99042ef-e740-446a-8734-389c8589cc17',
  new_p.id,
  old_pos.position,
  now(),
  now()
FROM point_positions old_pos
JOIN points new_p ON 'st7' = ANY(new_p.tags) AND 'v2' = ANY(new_p.tags) AND 'understanding' = ANY(new_p.tags) AND NOT ('deprecated' = ANY(new_p.tags))
WHERE old_pos.point_id = 'b5e50000-0000-4000-b000-000000000005'
  AND old_pos.user_id = 'a99042ef-e740-446a-8734-389c8589cc17'
ON CONFLICT (user_id, point_id) DO NOTHING;

-- st9: old b5e70000 → new v2
INSERT INTO point_positions (user_id, point_id, position, created_at, updated_at)
SELECT
  'a99042ef-e740-446a-8734-389c8589cc17',
  new_p.id,
  old_pos.position,
  now(),
  now()
FROM point_positions old_pos
JOIN points new_p ON 'st9' = ANY(new_p.tags) AND 'v2' = ANY(new_p.tags) AND 'understanding' = ANY(new_p.tags) AND NOT ('deprecated' = ANY(new_p.tags))
WHERE old_pos.point_id = 'b5e70000-0000-4000-b000-000000000007'
  AND old_pos.user_id = 'a99042ef-e740-446a-8734-389c8589cc17'
ON CONFLICT (user_id, point_id) DO NOTHING;

COMMIT;
