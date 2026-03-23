-- P576: Stop unlinking stories when position is removed.
-- Stories are now independent of positions (P560).
-- P574 renders positionless stories in "Perspectives without position" section.
DROP TRIGGER IF EXISTS trg_cascade_position_removal ON point_positions;
DROP FUNCTION IF EXISTS cascade_position_removal_to_story_points();
