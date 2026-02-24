-- Migration: P424 — Visibility Model Rethink
-- Created: 2026-02-24
-- Feature: P424 - Visibility Model Rethink
-- Description: Implements three-branch RLS policy (public / shared / private),
--              updates DB column default from 'public' to 'private'.

-- ============================================================
-- 1. Update stories column default to 'private'
-- ============================================================
ALTER TABLE stories ALTER COLUMN visibility SET DEFAULT 'private';

-- ============================================================
-- 2. Replace the deferred "Stories readable by visibility" policy
--    with the full three-branch policy.
-- ============================================================
DROP POLICY IF EXISTS "Stories readable by visibility" ON stories;

CREATE POLICY "Stories readable by visibility"
  ON stories FOR SELECT USING (
    -- Public: anyone can read
    visibility = 'public'

    -- Author can always read their own story
    OR author_id = auth.uid()

    -- Shared: readable by users who co-registered for any event with the author
    -- Co-registration = reader and author both have an event_rsvps record on the same event_id,
    -- OR the author is the host of an event the reader registered for.
    OR (
      visibility = 'shared'
      AND auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM event_rsvps reader_rsvp
        WHERE reader_rsvp.profile_id = auth.uid()
          AND EXISTS (
            SELECT 1 FROM event_rsvps author_rsvp
            WHERE author_rsvp.event_id = reader_rsvp.event_id
              AND author_rsvp.profile_id = stories.author_id
            UNION ALL
            SELECT 1 FROM events hosted
            WHERE hosted.id = reader_rsvp.event_id
              AND hosted.host_id = stories.author_id
          )
      )
    )
  );
