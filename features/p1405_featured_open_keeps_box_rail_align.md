---
status: week
type: story
rank: 24
workstream: growth
created_date: '2026-10-04'
tags: [feed, featured-story, polish]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: low
---

# P1405: Featured story keeps its box when open; side column lines up

## Problem

> Founder, 2026-10-04 (screenshot): "when i click on expand and hide ... before it was blue now it is like switching the style ... the previous container of the expansion disappeared" · groups column sits lower than the featured bar.

## Solution

- Open: the same blue box stays on top (no photo, title, Hide), the story card follows below it.
- Desktop column: the Groups heading aligns with the tab row so the first group card lines up with the featured bar.

## Acceptance Criteria

- [ ] Open keeps the blue box (no photo) with Hide; card below; one author photo
- [ ] Desktop: first group card top equals featured bar top
- [ ] 320 / 375 / desktop: no overflow
