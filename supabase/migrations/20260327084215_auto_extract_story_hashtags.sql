-- P592: Auto-extract hashtags from story content into tags column.
-- Safety net: even if client omits tags on update, DB keeps them in sync.

CREATE OR REPLACE FUNCTION extract_hashtags_from_content()
RETURNS trigger AS $$
BEGIN
  NEW.tags := ARRAY(
    SELECT DISTINCT lower(m[1])
    FROM regexp_matches(NEW.content, '#(\w+)', 'g') AS m
    ORDER BY lower(m[1])
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fire only when content changes (not on banner/image/visibility updates)
DROP TRIGGER IF EXISTS trg_stories_extract_hashtags ON stories;
CREATE TRIGGER trg_stories_extract_hashtags
  BEFORE INSERT OR UPDATE OF content ON stories
  FOR EACH ROW
  EXECUTE FUNCTION extract_hashtags_from_content();
