---
status: backlog
type: story
rank: 500.0
tags: [points, links, evolution]
created_date: 2026-03-16
---

# P532: Point Link Types (child, answer, opposed, etc.)

## Concept

P523 ships with a single unlabeled `inspired_by_point_id` link. If users create linked points and the relationships are clearly varied (some are refinements, some are counterpoints, some are answers), add a `relationship_type` enum column.

## When to revisit

After P523 ships and 10+ "inspired by" links exist. Look at the actual relationships — do they cluster into types? Or is one unlabeled link sufficient?

## Prerequisite

- P523 shipped and used
