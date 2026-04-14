-- P701: New point versions — ST1 v3 + ST5 v2 (after tag swap)
--
-- PREREQ: Run 20260413100000_p701_st_swap.sql FIRST.
--         After tag swap, old-st2 is now st5, old-st3 is now st2.
--
-- Strategy (follows P629 pattern):
--   - Check if others have positions on the point → if yes, INSERT new version + tag old as deprecated
--   - If only founder → UPDATE in place
--
-- ST1 v3: always INSERT (v2 has endorser per plan)
-- ST5 v2: check first (see query below)
--
-- IMPORTANT: Fill in <founder-id> before running.
--   Get it with: SELECT id FROM profiles WHERE email = 'slava@inguro.com';

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK: Who has positions on ST5 v1 (was old-st2, now st5 after swap)?
-- Run this SELECT first. If rows besides founder → INSERT below. If only founder → UPDATE in place.
-- ─────────────────────────────────────────────────────────────────────────────

-- SELECT pp.user_id, p.name FROM point_positions pp
--   JOIN profiles p ON pp.user_id = p.id
--   WHERE pp.point_id = 'b8e371b7-52bc-4229-80a1-841c64aa03cd';

-- ─────────────────────────────────────────────────────────────────────────────
-- ST1 v3: INSERT (always — v2 has endorser)
-- Tag old v2 as deprecated first.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Tag ST1 v2 as deprecated (it has endorsers — INSERT new version, keep old)
UPDATE points SET
  tags = array_append(tags, 'deprecated'),
  updated_at = now()
WHERE id = '6d253c2b-32b1-4a10-826c-4a4844b23e14';  -- ST1 v2 (current latest)

-- Insert ST1 v3
INSERT INTO points (id, author_id, statement, visibility, system_tags, tags, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '<founder-id>',
  E'When someone says "you don''t understand me," they could mean at least three different things. They might mean I don''t feel what they feel. They might mean I don''t agree with them. Or they might mean they don''t know whether I actually know what they mean. These are three separate requests. Satisfying one doesn''t necessarily satisfy the others. The word "understand" never tells me which kind of understanding is being asked for.',
  'public',
  ARRAY['st1', 'understanding', 'v3'],
  ARRAY[]::text[],
  now(),
  now()
);

-- After inserting, link to existing ST1 stories via story_points and add founder position.
-- Get the new point UUID: SELECT id FROM points WHERE 'v3' = ANY(system_tags) AND 'st1' = ANY(system_tags);
-- Then:
--   INSERT INTO story_points (story_id, point_id, author_id, created_at)
--     SELECT story_id, '<new-point-uuid>', '<founder-id>', now()
--     FROM story_points WHERE point_id = '6d253c2b-32b1-4a10-826c-4a4844b23e14';
--
--   INSERT INTO point_positions (user_id, point_id, position, created_at, updated_at)
--     VALUES ('<founder-id>', '<new-point-uuid>', 'strongly_agree', now(), now())
--     ON CONFLICT (user_id, point_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- ST5 v2: INSERT (new version after tag swap — was old-st2, now carries st5 tag)
-- Tag old v1 (b8e371b7) as deprecated IF others have positions on it.
-- If only founder has positions → UPDATE in place instead (skip INSERT below).
-- ─────────────────────────────────────────────────────────────────────────────

-- [OPTION A: others have positions — INSERT new v2 + deprecate v1]

-- Tag ST5 v1 as deprecated
UPDATE points SET
  tags = array_append(tags, 'deprecated'),
  updated_at = now()
WHERE id = 'b8e371b7-52bc-4229-80a1-841c64aa03cd';  -- ST5 v1 (was old-st2)

-- Insert ST5 v2
INSERT INTO points (id, author_id, statement, visibility, system_tags, tags, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '<founder-id>',
  E'Without verifying cognitive understanding, I have no way to know whether my estimate of how well I understood someone is accurate or not. It remains a guess — possibly a good one, possibly not. Once I know a method for verifying cognitive understanding exists, choosing not to use it is a choice to stay uncertain. My certainty in my own beliefs should be proportional to my effort to verify my cognitive understanding of others'' strongest counterarguments. Without that effort, I cannot distinguish justified certainty from the feeling of certainty.',
  'public',
  ARRAY['st5', 'understanding', 'v2'],
  ARRAY[]::text[],
  now(),
  now()
);

-- [OPTION B: only founder has positions — UPDATE in place]
-- UPDATE points SET
--   statement = E'Without verifying cognitive understanding, ...',
--   system_tags = ARRAY['st5', 'understanding', 'v2'],
--   updated_at = now()
-- WHERE id = 'b8e371b7-52bc-4229-80a1-841c64aa03cd';

-- After inserting ST5 v2, link to stories and add founder position (same pattern as ST1 v3 above).

COMMIT;
