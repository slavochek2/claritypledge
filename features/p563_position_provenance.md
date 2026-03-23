---
status: blocked
type: story
rank: 0.188
tags:
  - epic-story-first
  - entanglement
  - provenance
flow: dev
created_date: 2026-03-21T00:00:00.000Z
locked_at: '2026-03-22T12:56:44.583Z'
---

# P563: Position Provenance — Engagement Depth Visibility

**Epic:** story-first (P523 vision)
**Priority:** 4 of 6 — entanglement transparency
**Depends on:** P561 (comprehension assessments exist to query)

## Problem

Positions on points have no context. A position of "+2 Agree" looks identical whether the person read 3 stories and verified understanding with the author, or just clicked agree without reading anything. The entanglement between a position-holder and the point's origin is invisible.

## Solution

Show engagement depth on each position: how many stories the person read, how many they assessed, their assessment scores. A gradient from "drive-by" to "deeply engaged." This IS the entanglement signal — emerging from the protocol, not from labels.

## Acceptance Criteria

- [ ] Position cards show engagement depth indicator
- [ ] Depth levels (gradient, not binary):
  - Position only (no stories read, no assessments) → minimal indicator
  - Read 1+ stories (viewed story detail) → slightly richer
  - Assessed 1+ stories (slid the slider) → shows assessment count
  - Author confirmed (counter-assessed with small gap) → "verified" badge
- [ ] Point card shows aggregate: "4 verified · 6 unverified" or similar
- [ ] Clicking a position shows which stories the person engaged with
- [ ] Works on mobile

## Open Questions

- How to track "read a story" vs "assessed a story"? Reading is implicit (page visit), assessing is explicit (slider). Track both or only explicit?
- Visual design of the gradient — needs /ux exploration

## Out of Scope
- Calibration reputation (cross-point/cross-story aggregate) — future
- Notifications
