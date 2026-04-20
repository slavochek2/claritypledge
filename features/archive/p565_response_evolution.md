---
status: rejected
type: story
rank: 2.364
tags:
  - epic-story-first
  - stories
  - points
  - evolution
flow: dev
created_date: 2026-03-21T00:00:00.000Z
locked_at: '2026-04-20T09:48:47.828Z'
---

# P565: Response Evolution — Stories Bridging Points

**Epic:** story-first (P523 vision)
**Priority:** 6 of 6 — discourse evolution mechanism
**Depends on:** P560 (story filing on points), P564 (link_type in story_points)

## Problem

When someone responds to a point, their response exists in isolation. There's no visible connection between the original point, the response story, and any new points extracted from that story. The discourse doesn't evolve — it accumulates.

## Solution

When responding to a point via story:
1. Story links to original point (link_type: 'responded')
2. User can extract new points from their story (link_type: 'authored')
3. Story bridges original + extracted points — both visible on story detail
4. Positions on both points visible, story explains the relationship
5. Position changes update naturally — story can be modified, new points extracted

## Acceptance Criteria

- [ ] Response stories show "In response to: [original point]" header with link
- [ ] Story detail shows all linked points (both 'authored' and 'responded') with position counts
- [ ] User can extract new points from response stories (same "Extract a point" as P564)
- [ ] Point detail shows response stories below positions (ordered by date)
- [ ] Response stories show the author's position on the original point (if taken)
- [ ] Evolution chain navigable: Point A → Bob's story (responds to A, extracts B) → Point B → Carol's story (responds to B, extracts C) → ...
- [ ] Users can update their positions anytime — story provides context for why

## Out of Scope
- AI-suggested connections between points
- Point clustering / convergence detection
- Tree visualization of evolution chains
