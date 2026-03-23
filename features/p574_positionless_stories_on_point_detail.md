---
status: in-progress
type: story
rank: 1
tags:
  - epic-story-first
  - stories
  - points
flow: dev
created_date: 2026-03-23T00:00:00.000Z
---

# P574: Show Positionless Stories on Point Detail

**Epic:** story-first (P523 vision)
**Depends on:** P560 (story filing without position)

## Problem

P560 allows filing stories without taking a position. But the point detail page renders stories only inside position holder cards. A user who files a story without a position has no holder card, so their story is invisible on the point detail page.

## Solution

Add a section on the point detail page for stories filed without a position. Render them below the position groups — same story card style, just not grouped under a position.

## Acceptance Criteria

- [ ] Stories linked to a point where the author has no position appear in a separate section below position holders
- [ ] Section only renders when such stories exist (no empty state)
- [ ] Story cards look identical to position-grouped stories (same expand/collapse, same styling)
- [ ] "Add your story →" CTA for positionless users links to this section context

## Scope

~1 file: `point-detail-page.tsx` — filter stories by whether author has a position, render remainder in a new section.

## Out of Scope
- Reordering position groups
- New DB queries (stories are already fetched via `getStoriesForPoints`)
