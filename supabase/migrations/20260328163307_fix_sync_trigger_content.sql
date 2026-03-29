-- Fix: trigger must also fire on content updates, because the BEFORE trigger
-- (trg_stories_extract_hashtags) modifies tags from content, but PostgreSQL's
-- UPDATE OF clause only checks the original SET list, not BEFORE-trigger modifications.
DROP TRIGGER IF EXISTS trg_sync_story_st_tags_to_points ON stories;
CREATE TRIGGER trg_sync_story_st_tags_to_points
  AFTER INSERT OR UPDATE OF tags, content ON stories
  FOR EACH ROW
  EXECUTE FUNCTION sync_story_st_tags_to_points();
