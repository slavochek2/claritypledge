---
status: backlog
type: story
rank: 125469.0
workstream: C1
created_date: '2026-02-24'
tags: [live, psychological-safety, onboarding, mediation]
---

# P421: Pre-Session Psychological Safety Check

## Problem

Calibration requires cognitive access. When one or both parties enter a /live session emotionally flooded, the session produces noise, not signal — or breaks trust. There is currently no mechanism to detect or address this before the session starts.

## Solution

Before a /live session begins, both participants rate how calm and safe they feel (0–10). If either scores below a threshold (~8), the app offers a guided 1-min grounding exercise (breathing, eyes closed) and re-checks. If still below threshold, recommends postponing. Could evolve into mini-mediation guidance with explicit commitments (no interrupting, withhold premature judgment, etc.).

## Technical Notes

_Implementation details, architecture decisions._

## Open Questions

- Can people accurately self-report when flooded? (Self-assessment may fail exactly when needed most — consider proxy signals: time since last conflict mention, language tone in chat)
- Should both parties see each other's scores, or only a combined "ready / not ready" signal?
- What's the right threshold? 8 mirrors the /live verification threshold — worth keeping consistent.
- Commitment ritual (explicit pre-session pledges) — separate UI step or part of the same check?

## Acceptance Criteria

- [ ] Both participants rate calm + safety (0–10) before session starts
- [ ] If either < threshold, guided grounding exercise is offered
- [ ] After exercise, re-check scores
- [ ] If still below threshold, session recommends postponing with no penalty
- [ ] If both ≥ threshold, session proceeds normally
- [ ] Optional: brief commitment ritual (don't interrupt, withhold judgment)

## Testing

_How to verify this works._
