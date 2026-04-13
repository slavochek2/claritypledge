---
status: week
type: story
rank: 1000700.0
tags: [letters, results, one-to-many, aggregate]
created_date: '2026-04-12'
---

# P700: Letter Results Aggregate Overview (One-to-Many)

> **Depends on:** [P699](p699_letter_results_story_walk.md) (individual story walk)

## Problem

When a sender uses one-to-many mode, the results page needs to show aggregate data across all receivers — average ratings, position count distributions, completion progress — rather than one individual's responses. P699 builds the individual story walk; this spec adds the aggregate variant for the sent tab.

## Appetite

Scoped after P699 ships. Reuses the story walk layout with aggregate data components replacing individual badges.

## Solution

TBD — design after P699 ships and we see the individual walk in production.

## Risks / Non-Goals

### Non-Goals
- Do NOT build until P699 is shipped and validated

## Done-When

- [ ] Sender can view aggregate results for a one-to-many letter
- [ ] Per-story view shows average rating, response count, position distributions
- [ ] Sent tab button label distinguishes aggregate from individual results
