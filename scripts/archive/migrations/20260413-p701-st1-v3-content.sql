-- P701: Insert ST1 v3 point + founder position + story link
--
-- PREREQ: ST1 v2 (a24d8d29) has endorsers → INSERT new v3, don't touch v1/v2.
-- Follows pattern from 20260413-p701-points-content.sql.

SET session_replication_role = replica;

BEGIN;

-- Insert ST1 v3
DO $$
DECLARE
  new_point_id UUID;
  founder_id UUID := 'a99042ef-e740-446a-8734-389c8589cc17';
  st1_story_id UUID := '883d89f5-4449-46b2-a663-f4f2c7204c22';
BEGIN
  INSERT INTO points (id, first_validator_id, statement, visibility, system_tags, tags, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    founder_id,
    E'When someone says "you don''t understand me," they could mean at least three different things. They might mean I don''t feel what they feel. They might mean I don''t agree with them. Or they might mean they don''t know whether I actually know what they mean. These are three separate requests. Satisfying one doesn''t necessarily satisfy the others. The word "understand" never tells me which kind of understanding is being asked for.',
    'public',
    ARRAY['st1', 'understanding', 'v3'],
    ARRAY[]::text[],
    now(),
    now()
  )
  RETURNING id INTO new_point_id;

  -- Founder position: strongly_agree
  INSERT INTO point_positions (user_id, point_id, position, created_at, updated_at)
  VALUES (founder_id, new_point_id, 'strongly_agree', now(), now())
  ON CONFLICT (user_id, point_id) DO NOTHING;

  -- Link to ST1 story
  INSERT INTO story_points (story_id, point_id, author_id, created_at)
  VALUES (st1_story_id, new_point_id, founder_id, now());
END $$;

COMMIT;

SET session_replication_role = DEFAULT;
