---
status: blocked
type: story
rank: 0.411
tags:
  - epic-story-first
  - points
  - stories
  - orphan-prevention
flow: dev
created_date: 2026-03-21T00:00:00.000Z
locked_at: '2026-03-25T13:46:30.969Z'
---

# P564: Point-to-Story Attribution — Prevent Orphan Points

**Epic:** story-first (P523 vision)
**Priority:** 5 of 6 — story-first at data level
**Depends on:** P560 (story filing works without position)

## Problem

Points can exist without any linked story (orphans). Someone can create a story, add a point, delete the story — the point survives with zero context. When others position on an orphan point, they have no access to the reasoning that produced it. A claim without epistemology — exactly what ClarityPledge exists to fix.

## Solution

- New points can only be created through "Extract a point" on story detail (existing AddPointForm flow)
- Remove standalone point creation path
- Minimum story length: 50 characters
- Legacy orphan points (existing points with zero stories) get a "legacy" visual indicator
- Story-to-point link tracks direction: "authored from" vs "responded to" (add `link_type` to story_points)

## Acceptance Criteria

- [ ] Points can only be created from story detail page ("Extract a point" button)
- [ ] No standalone point creation path exists (feed/profile create dropdown removed or modified)
- [ ] Minimum story length: 50 characters (UI validation + DB constraint)
- [ ] Legacy points (zero rows in story_points) display with "legacy" badge
- [ ] `story_points` table gets `link_type` column: 'authored' (point extracted from this story) vs 'responded' (story filed in response to this point)
- [ ] When a story is deleted, if the point has other linked stories, point survives. If it becomes orphaned, it gets the legacy badge.
- [ ] Existing stories + points + positions unaffected (backward compatible)

## Out of Scope
- AI-assisted point extraction (P565)
- Preventing deletion of last-linked story (allow it, point becomes legacy)
