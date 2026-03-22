---
status: all-done
type: story
rank: 0.25
tags:
  - epic-story-first
  - stories
  - points
flow: dev
created_date: 2026-03-21T00:00:00.000Z
completed_at: '2026-03-22'
---

# P560: Story Filing on Any Point (No Position Required)

**Epic:** story-first (P523 vision)
**Priority:** 1 of 6 — must ship before next workshop

## Problem

Currently, "Add your story" CTA on point detail only appears when the user has already taken a position (`userPosition !== null` check, point-detail-page.tsx line 520). This blocks:
- Filing a story to explain reasoning before committing to a position
- False premise responses (user disagrees with framing, not truth value)
- Workshop participants who want to share perspective without the pressure of positioning first

## Solution

Remove the position requirement. "Add your story →" CTA appears on all points for all verified users, regardless of position state. Story links to the point whether or not the user has a position. Position is optional inside the story creation flow.

## Acceptance Criteria

- [ ] "Add your story →" CTA visible on point detail for all verified users (position not required)
- [ ] Create-story page with `?pointId=X` links story to point regardless of `hasPosition`
- [ ] User can optionally take a position alongside their story (existing flow preserved)
- [ ] User can file story WITHOUT position (false premise path — story remembers "no position" state)
- [ ] Existing behavior preserved: users who already have position still see CTA and can add story

## Scope

~1-2 hours. Changes:
- `point-detail-page.tsx`: remove `userPosition !== null` from `showCta` condition
- `create-story-page.tsx`: remove `hasPosition` check from linking logic (line 172)
- CTA text: keep existing "Add your story →" (no copy change)

## Out of Scope
- Comprehension assessment (P561)
- Point extraction from stories (P564)
- Minimum story length (P564)
