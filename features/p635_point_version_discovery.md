---
status: backlog
type: story
rank: 25
tags:
  - versioning
  - ux
  - points
prepped_date: '2026-04-03'
created_date: 2026-04-04
---

# P635: Point Version Discovery

## Problem Statement

Points can have multiple versions (v1, v2) but users have no way to discover or navigate between them. Version tags (v1, v2) are visible as pills but not actionable — clicking `#v1` filters the feed by v1, which shows ALL v1 points across all st-groups, not "the other version of THIS point."

## Intention

When a user reads a point, they should be able to see that other versions exist and navigate to them. This supports the "tightened through falsification" narrative — showing how a point evolved.

## Business Requirements

- Users can see which version of a point they're viewing
- Users can navigate to other versions of the same point (forward and backward)
- Version indicator is visible but not intrusive
- Works for points with 1 version (no indicator needed) and 2+ versions

## Open Questions for /ux

- Where does the version indicator go? (badge on card? subtitle? separate section?)
- How does navigation work? (inline switcher? links? carousel?)
- What does "v1 → v2" mean to a user who doesn't know our versioning model?
- Should we show what changed between versions?
