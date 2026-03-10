-- Migration: Points & Stories Refresh — 7 stories + 7 points framework
-- Date: 2026-03-10
-- Spec: pp/docs/business/points-stories-update-spec.md
--
-- IDEMPOTENT: Uses INSERT ... ON CONFLICT DO UPDATE throughout.
-- Safe to run on both test (empty) and prod (has 5 stories + 5 points).
-- Runs with triggers disabled (replica mode) to avoid auto-version creation.

-- ============================================================================
-- SETUP: Disable triggers
-- ============================================================================
SET session_replication_role = replica;

-- ============================================================================
-- CONSTANTS
-- ============================================================================
-- author_id / user_id: a99042ef-e740-446a-8734-389c8589cc17 (Slava)

-- ============================================================================
-- A. STORIES (7 total: update 5 existing + insert 2 new)
-- ============================================================================

-- Story 1 (Point 1) — existing 883d89f5
INSERT INTO stories (id, author_id, title, content, visibility, tags, current_version, created_at, updated_at)
VALUES (
  '883d89f5-4449-46b2-a663-f4f2c7204c22',
  'a99042ef-e740-446a-8734-389c8589cc17',
  '',
  E'She''s someone I''ve known for years. We were on a call trying to work something out. I paraphrased her position back to her. She said yes, that''s right, you understood me. A few days later, she said she didn''t feel understood. My first thought: her memory was failing her. She''d forgotten. I had the confirmation. She''d said it herself. But then I recognized it. She''d confirmed one thing and was wishing for another. Same word: understand. Two completely different meanings. She confirmed I cognitively understood her. I reproduced her position accurately. But what she needed was emotional understanding. Feeling what she was feeling. Without that distinction named, it looks like she''s lying. Or misremembering. She wasn''t. She just had no language for the split. Neither did I. Not until that moment. #st1 #understanding',
  'public',
  ARRAY['st1', 'understanding'],
  1,
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  content = EXCLUDED.content,
  tags = EXCLUDED.tags,
  current_version = stories.current_version + 1,
  updated_at = now();

-- Story 2 (Point 2) — existing 079eb4e5
INSERT INTO stories (id, author_id, title, content, visibility, tags, current_version, created_at, updated_at)
VALUES (
  '079eb4e5-14f3-4601-b531-29e7277b7ff9',
  'a99042ef-e740-446a-8734-389c8589cc17',
  '',
  'I was given 24 hours to comply. When I asked to talk, they refused. They acted without understanding my situation and caused avoidable harm. I expect this to happen again. They will demand emotional validation (feeling what they feel) or agreement (confirming they are right) without first giving me cognitive understanding. Expected harm kills trust. #st2 #understanding',
  'public',
  ARRAY['st2', 'understanding'],
  1,
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  content = EXCLUDED.content,
  tags = EXCLUDED.tags,
  current_version = stories.current_version + 1,
  updated_at = now();

-- Story 3 (Point 3) — existing f2a073c6
INSERT INTO stories (id, author_id, title, content, visibility, tags, current_version, created_at, updated_at)
VALUES (
  'f2a073c6-de12-480b-925a-9bd304ced82f',
  'a99042ef-e740-446a-8734-389c8589cc17',
  '',
  'I had a disagreement with someone. I asked them to explain back what they thought I meant. They refused. I insisted. They refused again — they already understand me well. When a listener insists they understand the speaker despite contrary feedback, it often stems from ignorance about the [information asymmetry](https://claritypledge.com/manifesto#asymmetry-of-information-the-illusion-of-understanding) in the sender-receiver communication model. This leads to preventable errors compounding, and trust deteriorating. #st3 #understanding',
  'public',
  ARRAY['st3', 'understanding'],
  1,
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  content = EXCLUDED.content,
  tags = EXCLUDED.tags,
  current_version = stories.current_version + 1,
  updated_at = now();

-- Story 4 (Point 4) — existing 425fac1f
INSERT INTO stories (id, author_id, title, content, visibility, tags, current_version, created_at, updated_at)
VALUES (
  '425fac1f-c7b7-4187-9a90-197170e79f2f',
  'a99042ef-e740-446a-8734-389c8589cc17',
  '',
  E'I watched two people in an emotional conflict try to understand each other and fail. When the listener explained back what she thought the speaker meant, her criticism and judgmental tone leaked into her paraphrasing. The speaker felt judged and stopped clarifying. On the surface, the listener was trying to cognitively understand the speaker, but the emotional leakage revealed that the actual goal was emotional validation of her own feelings, not an accurate cognitive understanding of the speaker. The error correction mechanism died. This stems from ignorance about the [vulnerability asymmetry](https://claritypledge.com/manifesto#asymmetry-of-vulnerability-the-illusion-of-emotional-freedom) in the sender-receiver communication model. They remained with a false disagreement — thinking they disagreed while misunderstanding each other. #st4 #understanding',
  'public',
  ARRAY['st4', 'understanding'],
  1,
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  content = EXCLUDED.content,
  tags = EXCLUDED.tags,
  current_version = stories.current_version + 1,
  updated_at = now();

-- Story 5 (Point 5) — NEW
INSERT INTO stories (id, author_id, title, content, visibility, tags, current_version, created_at, updated_at)
VALUES (
  'b5e50000-0000-4000-a000-000000000005',
  'a99042ef-e740-446a-8734-389c8589cc17',
  '',
  E'I''ve lost relationships to unexplained silence. Once I verify that you understand the valid and invalid reasons to refuse a paraphrasing request — and why naming your reason matters so much to me — you''ll know that refusing without explaining why will hurt the relationship. And I''ll know that you know. That''s trust. #st5 #understanding',
  'public',
  ARRAY['st5', 'understanding'],
  1,
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  content = EXCLUDED.content,
  tags = EXCLUDED.tags,
  updated_at = now();

-- Story 6 (Point 6) — existing c4e438b5
INSERT INTO stories (id, author_id, title, content, visibility, tags, current_version, created_at, updated_at)
VALUES (
  'c4e438b5-b4c2-4cd8-95b7-88a97f3987b2',
  'a99042ef-e740-446a-8734-389c8589cc17',
  '',
  E'I lost at least three co-founders to false disagreements. They thought they disagreed with me, but they didn''t understand my perspective, while I understood theirs — as confirmed by them. I built the [Clarity Partnership Agreement](http://claritypledge.com/agreements/new) to prevent that. I''m curious if any rational argument could persuade me to enter a risky long-term partnership with someone who refuses to sign it. #st6 #understanding',
  'public',
  ARRAY['st6', 'understanding'],
  1,
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  content = EXCLUDED.content,
  tags = EXCLUDED.tags,
  current_version = stories.current_version + 1,
  updated_at = now();

-- Story 7 (Point 7) — NEW
INSERT INTO stories (id, author_id, title, content, visibility, tags, current_version, created_at, updated_at)
VALUES (
  'b5e70000-0000-4000-a000-000000000007',
  'a99042ef-e740-446a-8734-389c8589cc17',
  '',
  'Asking someone to paraphrase what you said is considered rude. I want to live in a world where refusing a paraphrasing request without a stated reason is what''s considered unacceptable. The [ClarityPledge](https://claritypledge.com/sign-pledge) is my tool for that change. Anyone who wants this shift can use it too. #st7 #understanding',
  'public',
  ARRAY['st7', 'understanding'],
  1,
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  content = EXCLUDED.content,
  tags = EXCLUDED.tags,
  updated_at = now();

-- ============================================================================
-- B. STORY VERSIONS for updated/new stories (manual since triggers disabled)
-- ============================================================================

-- For existing stories: insert a new version with incremented version_number
-- We use a subquery to get the next version number

-- Story 1 version
INSERT INTO story_versions (id, story_id, version_number, title, content, created_at)
SELECT
  gen_random_uuid(),
  '883d89f5-4449-46b2-a663-f4f2c7204c22',
  COALESCE((SELECT MAX(version_number) FROM story_versions WHERE story_id = '883d89f5-4449-46b2-a663-f4f2c7204c22'), 0) + 1,
  '',
  E'She''s someone I''ve known for years. We were on a call trying to work something out. I paraphrased her position back to her. She said yes, that''s right, you understood me. A few days later, she said she didn''t feel understood. My first thought: her memory was failing her. She''d forgotten. I had the confirmation. She''d said it herself. But then I recognized it. She''d confirmed one thing and was wishing for another. Same word: understand. Two completely different meanings. She confirmed I cognitively understood her. I reproduced her position accurately. But what she needed was emotional understanding. Feeling what she was feeling. Without that distinction named, it looks like she''s lying. Or misremembering. She wasn''t. She just had no language for the split. Neither did I. Not until that moment. #st1 #understanding',
  now();

-- Story 2 version
INSERT INTO story_versions (id, story_id, version_number, title, content, created_at)
SELECT
  gen_random_uuid(),
  '079eb4e5-14f3-4601-b531-29e7277b7ff9',
  COALESCE((SELECT MAX(version_number) FROM story_versions WHERE story_id = '079eb4e5-14f3-4601-b531-29e7277b7ff9'), 0) + 1,
  '',
  'I was given 24 hours to comply. When I asked to talk, they refused. They acted without understanding my situation and caused avoidable harm. I expect this to happen again. They will demand emotional validation (feeling what they feel) or agreement (confirming they are right) without first giving me cognitive understanding. Expected harm kills trust. #st2 #understanding',
  now();

-- Story 3 version
INSERT INTO story_versions (id, story_id, version_number, title, content, created_at)
SELECT
  gen_random_uuid(),
  'f2a073c6-de12-480b-925a-9bd304ced82f',
  COALESCE((SELECT MAX(version_number) FROM story_versions WHERE story_id = 'f2a073c6-de12-480b-925a-9bd304ced82f'), 0) + 1,
  '',
  'I had a disagreement with someone. I asked them to explain back what they thought I meant. They refused. I insisted. They refused again — they already understand me well. When a listener insists they understand the speaker despite contrary feedback, it often stems from ignorance about the [information asymmetry](https://claritypledge.com/manifesto#asymmetry-of-information-the-illusion-of-understanding) in the sender-receiver communication model. This leads to preventable errors compounding, and trust deteriorating. #st3 #understanding',
  now();

-- Story 4 version
INSERT INTO story_versions (id, story_id, version_number, title, content, created_at)
SELECT
  gen_random_uuid(),
  '425fac1f-c7b7-4187-9a90-197170e79f2f',
  COALESCE((SELECT MAX(version_number) FROM story_versions WHERE story_id = '425fac1f-c7b7-4187-9a90-197170e79f2f'), 0) + 1,
  '',
  E'I watched two people in an emotional conflict try to understand each other and fail. When the listener explained back what she thought the speaker meant, her criticism and judgmental tone leaked into her paraphrasing. The speaker felt judged and stopped clarifying. On the surface, the listener was trying to cognitively understand the speaker, but the emotional leakage revealed that the actual goal was emotional validation of her own feelings, not an accurate cognitive understanding of the speaker. The error correction mechanism died. This stems from ignorance about the [vulnerability asymmetry](https://claritypledge.com/manifesto#asymmetry-of-vulnerability-the-illusion-of-emotional-freedom) in the sender-receiver communication model. They remained with a false disagreement — thinking they disagreed while misunderstanding each other. #st4 #understanding',
  now();

-- Story 5 version (new story)
INSERT INTO story_versions (id, story_id, version_number, title, content, created_at)
SELECT
  gen_random_uuid(),
  'b5e50000-0000-4000-a000-000000000005',
  COALESCE((SELECT MAX(version_number) FROM story_versions WHERE story_id = 'b5e50000-0000-4000-a000-000000000005'), 0) + 1,
  '',
  E'I''ve lost relationships to unexplained silence. Once I verify that you understand the valid and invalid reasons to refuse a paraphrasing request — and why naming your reason matters so much to me — you''ll know that refusing without explaining why will hurt the relationship. And I''ll know that you know. That''s trust. #st5 #understanding',
  now();

-- Story 6 version
INSERT INTO story_versions (id, story_id, version_number, title, content, created_at)
SELECT
  gen_random_uuid(),
  'c4e438b5-b4c2-4cd8-95b7-88a97f3987b2',
  COALESCE((SELECT MAX(version_number) FROM story_versions WHERE story_id = 'c4e438b5-b4c2-4cd8-95b7-88a97f3987b2'), 0) + 1,
  '',
  E'I lost at least three co-founders to false disagreements. They thought they disagreed with me, but they didn''t understand my perspective, while I understood theirs — as confirmed by them. I built the [Clarity Partnership Agreement](http://claritypledge.com/agreements/new) to prevent that. I''m curious if any rational argument could persuade me to enter a risky long-term partnership with someone who refuses to sign it. #st6 #understanding',
  now();

-- Story 7 version (new story)
INSERT INTO story_versions (id, story_id, version_number, title, content, created_at)
SELECT
  gen_random_uuid(),
  'b5e70000-0000-4000-a000-000000000007',
  COALESCE((SELECT MAX(version_number) FROM story_versions WHERE story_id = 'b5e70000-0000-4000-a000-000000000007'), 0) + 1,
  '',
  'Asking someone to paraphrase what you said is considered rude. I want to live in a world where refusing a paraphrasing request without a stated reason is what''s considered unacceptable. The [ClarityPledge](https://claritypledge.com/sign-pledge) is my tool for that change. Anyone who wants this shift can use it too. #st7 #understanding',
  now();

-- ============================================================================
-- C. POINTS (7 total: update 5 existing + insert 2 new)
-- ============================================================================

-- Point 1 — existing 6d253c2b
INSERT INTO points (id, statement, first_validator_id, tags, created_at, updated_at)
VALUES (
  '6d253c2b-32b1-4a10-826c-4a4844b23e14',
  E'Most people assume understanding is binary — you either get it or you don''t. "Understand" covers at least three different requests. Cognitive understanding: reproduce someone''s position accurately. Emotional understanding: feel what they feel. Agreement: accept that they''re right. Satisfying one while missing another doesn''t signal dishonesty or poor memory. It signals a word doing too much work.',
  'a99042ef-e740-446a-8734-389c8589cc17',
  ARRAY['understanding'],
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  statement = EXCLUDED.statement,
  tags = EXCLUDED.tags,
  updated_at = now();

-- Point 2 — existing 978f7a1e (full rewrite — merged old Points 3+4)
INSERT INTO points (id, statement, first_validator_id, tags, created_at, updated_at)
VALUES (
  '978f7a1e-5e80-41b7-aed5-35cfcd14a379',
  E'When interests clash in a conversation and one party pursues agreement ("confirm I''m right") or emotional validation ("feel what I feel"), the other party must give up their position. Verifying cognitive understanding doesn''t require anybody to give up their position. Without cognitive understanding, you may believe you agree or disagree — but you might be misunderstanding each other entirely. Cognitive understanding is therefore the most effective first shared goal. Sometimes emotional regulation needs to come first. But the sequence holds.',
  'a99042ef-e740-446a-8734-389c8589cc17',
  ARRAY['understanding'],
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  statement = EXCLUDED.statement,
  tags = EXCLUDED.tags,
  updated_at = now();

-- Point 3 — existing 86fb9e04
INSERT INTO points (id, statement, first_validator_id, tags, created_at, updated_at)
VALUES (
  '86fb9e04-e04d-4399-9928-83fd8da9ab03',
  E'The speaker knows what they meant to communicate. The listener doesn''t. The only way to verify cognitive understanding is for the listener to explain back what they think the speaker meant, and for the speaker to confirm or correct. Because the speaker''s confirmation is the strongest available signal that cognitive understanding has occurred.',
  'a99042ef-e740-446a-8734-389c8589cc17',
  ARRAY['understanding'],
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  statement = EXCLUDED.statement,
  tags = EXCLUDED.tags,
  updated_at = now();

-- Point 4 — existing a0096d98
INSERT INTO points (id, statement, first_validator_id, tags, created_at, updated_at)
VALUES (
  'a0096d98-768d-46c3-832d-ba104a31282c',
  'The listener explains back what they think the speaker meant. If they express judgment or criticism while doing so, the speaker shifts from correcting errors to self-protection. The error correction mechanism breaks. Less judgment from the listener means more effective verification of cognitive understanding.',
  'a99042ef-e740-446a-8734-389c8589cc17',
  ARRAY['understanding'],
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  statement = EXCLUDED.statement,
  tags = EXCLUDED.tags,
  updated_at = now();

-- Point 5 — NEW
INSERT INTO points (id, statement, first_validator_id, tags, created_at, updated_at)
VALUES (
  'b5e50000-0000-4000-b000-000000000005',
  'Once two people both understand the process of how to reach verified cognitive understanding and both know the other understands it, they achieved [common knowledge](https://claritypledge.com/manifesto#verified-alignment-the-goal-state) on how to create common knowledge. There are valid reasons to decline a paraphrasing request. But there is no valid reason to decline without explaining why. Because from the partner''s perspective, an unexplained refusal is indistinguishable from the [many invalid reasons people refuse to paraphrase](https://claritypledge.com/manifesto#the-psychological-motives-that-exploit-these-asymmetries).',
  'a99042ef-e740-446a-8734-389c8589cc17',
  ARRAY['understanding'],
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  statement = EXCLUDED.statement,
  tags = EXCLUDED.tags,
  updated_at = now();

-- Point 6 — existing cbdfadce (full rewrite)
INSERT INTO points (id, statement, first_validator_id, tags, created_at, updated_at)
VALUES (
  'cbdfadce-10ca-4c79-b028-ecc1856aa7db',
  'The only reliable process for verifying mutual understanding is for the listener to explain back what they understood and for the speaker to confirm or correct. In high-stakes partnerships without this process, false agreements, false disagreements, compounding errors, and eventual breakdown become more likely.',
  'a99042ef-e740-446a-8734-389c8589cc17',
  ARRAY['understanding'],
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  statement = EXCLUDED.statement,
  tags = EXCLUDED.tags,
  updated_at = now();

-- Point 7 — NEW
INSERT INTO points (id, statement, first_validator_id, tags, created_at, updated_at)
VALUES (
  'b5e70000-0000-4000-b000-000000000007',
  'If you understand how cognitive understanding works and why it matters, the [ClarityPledge](https://claritypledge.com/sign-pledge) is making that commitment public. A voluntary signal to everyone — partners, colleagues, strangers — that you take verified cognitive understanding seriously enough to be held to it.',
  'a99042ef-e740-446a-8734-389c8589cc17',
  ARRAY['understanding'],
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  statement = EXCLUDED.statement,
  tags = EXCLUDED.tags,
  updated_at = now();

-- ============================================================================
-- D. STORY_POINTS links (7 links)
-- ============================================================================
-- Existing links stay (ON CONFLICT DO NOTHING), new ones added.
-- Note: story_points PK is (story_id, point_id), plus unique on (author_id, point_id)

-- Link 1: Story 1 → Point 1 (existing)
INSERT INTO story_points (story_id, point_id, author_id, created_at)
VALUES ('883d89f5-4449-46b2-a663-f4f2c7204c22', '6d253c2b-32b1-4a10-826c-4a4844b23e14', 'a99042ef-e740-446a-8734-389c8589cc17', now())
ON CONFLICT (story_id, point_id) DO NOTHING;

-- Link 2: Story 2 → Point 2 (existing — story 079eb4e5 already linked to point 978f7a1e)
INSERT INTO story_points (story_id, point_id, author_id, created_at)
VALUES ('079eb4e5-14f3-4601-b531-29e7277b7ff9', '978f7a1e-5e80-41b7-aed5-35cfcd14a379', 'a99042ef-e740-446a-8734-389c8589cc17', now())
ON CONFLICT (story_id, point_id) DO NOTHING;

-- Link 3: Story 3 → Point 3 (existing — f2a073c6 → 86fb9e04)
INSERT INTO story_points (story_id, point_id, author_id, created_at)
VALUES ('f2a073c6-de12-480b-925a-9bd304ced82f', '86fb9e04-e04d-4399-9928-83fd8da9ab03', 'a99042ef-e740-446a-8734-389c8589cc17', now())
ON CONFLICT (story_id, point_id) DO NOTHING;

-- Link 4: Story 4 → Point 4 (existing — 425fac1f → a0096d98)
INSERT INTO story_points (story_id, point_id, author_id, created_at)
VALUES ('425fac1f-c7b7-4187-9a90-197170e79f2f', 'a0096d98-768d-46c3-832d-ba104a31282c', 'a99042ef-e740-446a-8734-389c8589cc17', now())
ON CONFLICT (story_id, point_id) DO NOTHING;

-- Link 5: Story 5 → Point 5 (NEW)
INSERT INTO story_points (story_id, point_id, author_id, created_at)
VALUES ('b5e50000-0000-4000-a000-000000000005', 'b5e50000-0000-4000-b000-000000000005', 'a99042ef-e740-446a-8734-389c8589cc17', now())
ON CONFLICT (story_id, point_id) DO NOTHING;

-- Link 6: Story 6 → Point 6 (existing — c4e438b5 → cbdfadce)
INSERT INTO story_points (story_id, point_id, author_id, created_at)
VALUES ('c4e438b5-b4c2-4cd8-95b7-88a97f3987b2', 'cbdfadce-10ca-4c79-b028-ecc1856aa7db', 'a99042ef-e740-446a-8734-389c8589cc17', now())
ON CONFLICT (story_id, point_id) DO NOTHING;

-- Link 7: Story 7 → Point 7 (NEW)
INSERT INTO story_points (story_id, point_id, author_id, created_at)
VALUES ('b5e70000-0000-4000-a000-000000000007', 'b5e70000-0000-4000-b000-000000000007', 'a99042ef-e740-446a-8734-389c8589cc17', now())
ON CONFLICT (story_id, point_id) DO NOTHING;

-- ============================================================================
-- E. POSITIONS for all 7 points (ON CONFLICT DO NOTHING for existing ones)
-- ============================================================================

-- Position for Point 1
INSERT INTO point_positions (id, point_id, user_id, position, created_at, updated_at)
VALUES (gen_random_uuid(), '6d253c2b-32b1-4a10-826c-4a4844b23e14', 'a99042ef-e740-446a-8734-389c8589cc17', 'strongly_agree', now(), now())
ON CONFLICT (point_id, user_id) DO NOTHING;

-- Position for Point 2
INSERT INTO point_positions (id, point_id, user_id, position, created_at, updated_at)
VALUES (gen_random_uuid(), '978f7a1e-5e80-41b7-aed5-35cfcd14a379', 'a99042ef-e740-446a-8734-389c8589cc17', 'strongly_agree', now(), now())
ON CONFLICT (point_id, user_id) DO NOTHING;

-- Position for Point 3
INSERT INTO point_positions (id, point_id, user_id, position, created_at, updated_at)
VALUES (gen_random_uuid(), '86fb9e04-e04d-4399-9928-83fd8da9ab03', 'a99042ef-e740-446a-8734-389c8589cc17', 'strongly_agree', now(), now())
ON CONFLICT (point_id, user_id) DO NOTHING;

-- Position for Point 4
INSERT INTO point_positions (id, point_id, user_id, position, created_at, updated_at)
VALUES (gen_random_uuid(), 'a0096d98-768d-46c3-832d-ba104a31282c', 'a99042ef-e740-446a-8734-389c8589cc17', 'strongly_agree', now(), now())
ON CONFLICT (point_id, user_id) DO NOTHING;

-- Position for Point 5
INSERT INTO point_positions (id, point_id, user_id, position, created_at, updated_at)
VALUES (gen_random_uuid(), 'b5e50000-0000-4000-b000-000000000005', 'a99042ef-e740-446a-8734-389c8589cc17', 'strongly_agree', now(), now())
ON CONFLICT (point_id, user_id) DO NOTHING;

-- Position for Point 6
INSERT INTO point_positions (id, point_id, user_id, position, created_at, updated_at)
VALUES (gen_random_uuid(), 'cbdfadce-10ca-4c79-b028-ecc1856aa7db', 'a99042ef-e740-446a-8734-389c8589cc17', 'strongly_agree', now(), now())
ON CONFLICT (point_id, user_id) DO NOTHING;

-- Position for Point 7
INSERT INTO point_positions (id, point_id, user_id, position, created_at, updated_at)
VALUES (gen_random_uuid(), 'b5e70000-0000-4000-b000-000000000007', 'a99042ef-e740-446a-8734-389c8589cc17', 'strongly_agree', now(), now())
ON CONFLICT (point_id, user_id) DO NOTHING;

-- ============================================================================
-- F. DELETE orphan points (CASCADE handles FK cleanup)
-- ============================================================================

DELETE FROM points WHERE id IN (
  '0d264445-370c-4fb0-a925-0e539c72bb43',  -- Duplicate of Point 1
  'bdea6ddd-3b97-4e3f-977f-40f2a7067852',  -- Old Point 3 variant (Pinker)
  '68def3b8-5e2d-48bb-b72f-6e5c83abe741',  -- Old Point 3 variant (no breaks)
  '6ea9ce0b-170a-4e7d-984e-c5ced39d7e45'   -- Story text copy-pasted as point
);

-- ============================================================================
-- TEARDOWN: Re-enable triggers
-- ============================================================================
SET session_replication_role = DEFAULT;

-- ============================================================================
-- VERIFICATION QUERIES (run these after migration to confirm)
-- ============================================================================
-- SELECT count(*) FROM stories WHERE author_id = 'a99042ef-e740-446a-8734-389c8589cc17';  -- expect 7
-- SELECT count(*) FROM points WHERE first_validator_id = 'a99042ef-e740-446a-8734-389c8589cc17';  -- expect 7
-- SELECT count(*) FROM story_points sp JOIN stories s ON s.id = sp.story_id WHERE s.author_id = 'a99042ef-e740-446a-8734-389c8589cc17';  -- expect 7
-- SELECT count(*) FROM point_positions WHERE user_id = 'a99042ef-e740-446a-8734-389c8589cc17';  -- expect 7
