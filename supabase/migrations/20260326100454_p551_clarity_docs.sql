-- Migration: P551 — Clarity Docs
-- Created: 2026-03-26
-- Feature: P551 - Clarity Docs
-- Description: Creates clarity_docs table and doc_stories junction table with RLS,
--   cross-visibility constraint triggers, and updated_at auto-update trigger.

-- NOTE: Supabase Management API wraps each query in its own transaction.
-- BEGIN/COMMIT omitted to avoid double-wrapping.

-- ============================================================================
-- STEP 1: Create clarity_docs table
-- ============================================================================
CREATE TABLE IF NOT EXISTS clarity_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id),
  title TEXT NOT NULL DEFAULT 'Untitled Doc',
  visibility content_visibility NOT NULL DEFAULT 'private'::content_visibility,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT clarity_docs_title_length CHECK (length(title) > 0 AND length(title) <= 100)
);

-- ============================================================================
-- STEP 2: Create doc_stories junction table
-- ============================================================================
CREATE TABLE IF NOT EXISTS doc_stories (
  doc_id UUID NOT NULL REFERENCES clarity_docs(id) ON DELETE CASCADE,
  story_id UUID NOT NULL REFERENCES stories(id),
  position INTEGER NOT NULL,
  point_config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (doc_id, story_id)
);

-- ============================================================================
-- STEP 3: Create indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_clarity_docs_owner_id ON clarity_docs(owner_id);
CREATE INDEX IF NOT EXISTS idx_doc_stories_doc_position ON doc_stories(doc_id, position);

-- ============================================================================
-- STEP 4: Enable RLS on clarity_docs
-- ============================================================================
ALTER TABLE clarity_docs ENABLE ROW LEVEL SECURITY;

-- SELECT: public docs visible to all, private docs visible to owner
DROP POLICY IF EXISTS "Docs readable by visibility" ON clarity_docs;
CREATE POLICY "Docs readable by visibility"
  ON clarity_docs FOR SELECT USING (
    visibility = 'public'::content_visibility
    OR owner_id = auth.uid()
  );

-- INSERT: verified user + must own the row
DROP POLICY IF EXISTS "Verified users can create docs" ON clarity_docs;
CREATE POLICY "Verified users can create docs"
  ON clarity_docs FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND owner_id = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_verified = true)
  );

-- UPDATE: owner only
DROP POLICY IF EXISTS "Owners can update own docs" ON clarity_docs;
CREATE POLICY "Owners can update own docs"
  ON clarity_docs FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- DELETE: owner only
DROP POLICY IF EXISTS "Owners can delete own docs" ON clarity_docs;
CREATE POLICY "Owners can delete own docs"
  ON clarity_docs FOR DELETE USING (owner_id = auth.uid());

-- ============================================================================
-- STEP 5: Enable RLS on doc_stories
-- ============================================================================
ALTER TABLE doc_stories ENABLE ROW LEVEL SECURITY;

-- SELECT: scoped through doc visibility (public docs or owned docs)
DROP POLICY IF EXISTS "Doc stories visible when doc visible" ON doc_stories;
CREATE POLICY "Doc stories visible when doc visible"
  ON doc_stories FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clarity_docs
      WHERE clarity_docs.id = doc_stories.doc_id
        AND (clarity_docs.visibility = 'public'::content_visibility OR clarity_docs.owner_id = auth.uid())
    )
  );

-- INSERT: must own the doc AND must own the story
DROP POLICY IF EXISTS "Doc owners can link own stories" ON doc_stories;
CREATE POLICY "Doc owners can link own stories"
  ON doc_stories FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM clarity_docs
      WHERE clarity_docs.id = doc_id
        AND clarity_docs.owner_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = story_id
        AND stories.author_id = auth.uid()
    )
  );

-- UPDATE: must own the doc
DROP POLICY IF EXISTS "Doc owners can update doc stories" ON doc_stories;
CREATE POLICY "Doc owners can update doc stories"
  ON doc_stories FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM clarity_docs
      WHERE clarity_docs.id = doc_stories.doc_id
        AND clarity_docs.owner_id = auth.uid()
    )
  );

-- DELETE: must own the doc
DROP POLICY IF EXISTS "Doc owners can remove doc stories" ON doc_stories;
CREATE POLICY "Doc owners can remove doc stories"
  ON doc_stories FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM clarity_docs
      WHERE clarity_docs.id = doc_stories.doc_id
        AND clarity_docs.owner_id = auth.uid()
    )
  );

-- ============================================================================
-- STEP 6: Trigger — reject doc visibility change private→public if any
--         linked story is private
-- ============================================================================
CREATE OR REPLACE FUNCTION enforce_doc_visibility_upgrade_constraint()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only check when changing from private to public
  IF OLD.visibility = 'private'::content_visibility
     AND NEW.visibility = 'public'::content_visibility THEN
    IF EXISTS (
      SELECT 1 FROM doc_stories
      JOIN stories ON stories.id = doc_stories.story_id
      WHERE doc_stories.doc_id = NEW.id
        AND stories.visibility = 'private'::content_visibility
    ) THEN
      RAISE EXCEPTION 'Cannot make doc public: it contains private stories. Remove private stories first.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_doc_visibility_upgrade_constraint ON clarity_docs;
CREATE TRIGGER trg_doc_visibility_upgrade_constraint
  BEFORE UPDATE ON clarity_docs
  FOR EACH ROW EXECUTE FUNCTION enforce_doc_visibility_upgrade_constraint();

-- ============================================================================
-- STEP 7: Trigger — reject inserting a private story into a public doc
-- ============================================================================
CREATE OR REPLACE FUNCTION enforce_doc_story_visibility_constraint()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_doc_visibility content_visibility;
  v_story_visibility content_visibility;
BEGIN
  SELECT visibility INTO v_doc_visibility FROM clarity_docs WHERE id = NEW.doc_id;
  SELECT visibility INTO v_story_visibility FROM stories WHERE id = NEW.story_id;

  IF v_doc_visibility = 'public'::content_visibility
     AND v_story_visibility = 'private'::content_visibility THEN
    RAISE EXCEPTION 'Cannot link a private story to a public doc. Doc: %, Story: %',
      NEW.doc_id, NEW.story_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_doc_story_visibility_constraint ON doc_stories;
CREATE TRIGGER trg_doc_story_visibility_constraint
  BEFORE INSERT ON doc_stories
  FOR EACH ROW EXECUTE FUNCTION enforce_doc_story_visibility_constraint();

-- ============================================================================
-- STEP 8: updated_at auto-update trigger on clarity_docs
-- Reuses the existing update_updated_at() function from initial schema.
-- ============================================================================
DROP TRIGGER IF EXISTS trg_clarity_docs_updated_at ON clarity_docs;
CREATE TRIGGER trg_clarity_docs_updated_at
  BEFORE UPDATE ON clarity_docs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- End of migration
