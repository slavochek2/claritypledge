---
status: qa
type: story
rank: 26
workstream: growth
created_date: '2026-10-04'
tags: [feed, offline]
disclosure: public
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: low
---

# P1407: Home page groups and events work offline

## Problem

> Founder, 2026-10-04: "will the main page be part of offline experience ... saved properly to show events etc?" (yes make offline saving possible)

Feed stories/points are saved for offline; the home page's groups and next events are fetched live only, so offline they vanish.

## Solution

Read the home groups + next events through the same offline cache as the feed (last seen copy). Events that have started are dropped when shown, so a stale saved copy never shows a past event as next.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Saved event list goes stale | MITIGATE | Future-only filter applied at render, not only at fetch |

- Do NOT change the offline strip or pack behaviour.

## Acceptance Criteria

- [x] Home groups + next events come from the offline cache when the network is down
- [x] An event whose time has passed never shows, even from a saved copy
