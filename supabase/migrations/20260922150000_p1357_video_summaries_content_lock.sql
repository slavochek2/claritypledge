-- P1357 adversarial review (H2, H3): a `checked` or `confirmed` status must describe the exact
-- content and transcript that were checked. Before this, nothing in the database tied them:
-- editing summary/moments on a confirmed row (service role, SQL editor) kept it public, unchecked.
--
-- 1. transcript_sha256: the hash of the caption file the writer read. The checker refuses when the
--    transcript it holds does not hash to this value, so it can never check a row against a
--    different transcript (another environment's, or a later re-draft's).
-- 2. Trigger: every UPDATE stamps updated_at, and any change to the published content or to the
--    transcript hash sends the row back to draft and clears its check and confirmation. Status-only
--    updates (draft → checked → confirmed) are unaffected.
--
-- client-safe: additive column + trigger; the page reads none of this.

ALTER TABLE public.video_summaries ADD COLUMN transcript_sha256 text
  CHECK (transcript_sha256 IS NULL OR transcript_sha256 ~ '^[0-9a-f]{64}$');

-- new function
CREATE OR REPLACE FUNCTION public.video_summaries_content_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF (NEW.title, NEW.channel, NEW.duration_seconds, NEW.tldr, NEW.summary, NEW.key_points, NEW.moments, NEW.transcript_sha256)
     IS DISTINCT FROM
     (OLD.title, OLD.channel, OLD.duration_seconds, OLD.tldr, OLD.summary, OLD.key_points, OLD.moments, OLD.transcript_sha256)
  THEN
    NEW.status := 'draft';
    NEW.checked_by := NULL;
    NEW.checked_at := NULL;
    NEW.confirmed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER video_summaries_content_lock
  BEFORE UPDATE ON public.video_summaries
  FOR EACH ROW EXECUTE FUNCTION public.video_summaries_content_lock();
