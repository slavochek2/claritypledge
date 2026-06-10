---
status: rejected
type: story
rank: 0.3
tags:
  - points
  - falsifiability
  - popper
flow: quick-feature
created_date: 2026-03-31T00:00:00.000Z
---

# P618: Operationalize Point Falsifiability

## Problem

The story/point split exists because stories are untestable narratives and points are testable claims (Popperian core). But nothing in the platform currently distinguishes a well-formed falsifiable point from a vague claim. Points are just text that someone wrote under their story. There's no prompt, no quality signal, no enforcement, and no surfacing of falsifiability.

## Source

Claude.ai conversation: "Consolidating stories and points into single entity" (2026-03-31). The conversation started by questioning whether the story/point split is necessary, re-derived why it exists (falsifiability), then identified that falsifiability isn't operationalized.

## Open Questions

1. Does the platform need to enforce falsifiability (prompt: "what would change your mind?") or does it emerge naturally from the protocol (if nobody can take a clear position on your point, that's feedback it's not well-formed)?
2. Should there be a quality signal — points that have been verified/positioned-on by others vs ones that just sit there?
3. Is this a platform feature or a facilitation technique? (The facilitator could prompt for falsifiability during sessions without any code changes.)
4. Listener-extracted points as comprehension proof: instead of author creating points, listener proposes "here's what I understood as your key claims" — points emerge from the verification act itself. Is this a future evolution of point creation?

## Not P563

P563 (Position Provenance) is about engagement depth *on existing points*. This spec is about the *quality of the point itself* — is it falsifiable, well-formed, and positioned for productive disagreement?

## Acceptance Criteria

TBD — needs full PRD if prioritized. Quick-feature skeleton to hold the idea in backlog.
