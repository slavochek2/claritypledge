---
status: rejected
type: story
rank: 3.75
tags:
  - points
  - stories
  - ux
  - quality-signals
blocked_by: p544
superseded_by: p563
created_date: 2026-03-18T00:00:00.000Z
flow: quick-feature
---

# P550: Visual Quality Indicators for Points & Stories

**Status: Superseded by P563 (Position Provenance)**

**Supersession rationale (2026-03-21):** The story-first architecture replaces AI quality scores with engagement depth as the visual signal. Instead of "falsifiability: 80" on a point card, the card shows "4 verified · 6 unverified" — how many position-holders deeply engaged (read stories, assessed comprehension, got author confirmation). Same card space, better signal: quality emerges from how people engage, not from an AI score.

---

## Problem

All points and stories look identical in the feed. A carefully falsifiable mechanism and a personal CTA have the same visual weight. Authors and readers have no signal about claim strength.

## Proposal

Show a lightweight visual indicator of point/story quality on cards and detail pages.

### For Points — "How testable is this claim?"

Display based on the 4 sifter scores (falsifiable, counterfactual, hard-to-vary, voice):
- **Composite score** shown as a subtle badge or meter on the point card
- Hover/tap reveals: "Falsifiability: 80 | Counterfactual: 70 | Hard-to-vary: 85 | Voice: 90"
- Optional: AI-generated one-liner ("This is a testable mechanism about communication gaps")

### For Stories — "How strong is this narrative?"

Stories need their own quality dimensions (TBD — likely: specificity, emotional grounding, arc completeness, connection to point).
- Visual indicator on story card showing narrative strength
- Helps readers know: is this a polished account or a rough draft?

### Display Options (to explore in UX)
- A) Small colored dot (green/yellow/red) — simplest
- B) Score number (e.g., "85") — most transparent
- C) Descriptive label ("Strong mechanism" / "Personal stance" / "Teaching sequence") — most informative
- D) Progress ring or bar — visual but takes space

## Acceptance Criteria

- Point cards show a quality indicator derived from AI scores
- Story cards show a quality indicator (criteria TBD)
- Indicators are informational — no "this point is weak" stigma
- Author sees full breakdown; readers see simplified version

## Open Questions

- What are the story quality dimensions? (Sifter-story has polish criteria but no scores)
- Should the indicator be visible by default or on hover/tap?
- Does showing scores discourage publishing low-score points? (Tension with "feedback not gate" principle)

## Notes

Skeleton spec — needs /create-prd + /ux before implementation. The quality indicator should feel like a "nutrition label" for claims, not a judgment.
