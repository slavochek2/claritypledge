---
status: rejected
type: story
rank: 0.5
tags:
  - points
  - content-quality
  - sifter
  - ai-feedback
superseded_by: p561,p563,p564
created_date: 2026-03-18T00:00:00.000Z
flow: dev
locked_at: '2026-03-18T07:47:12.103Z'
---

# P544: Point & Story Quality Signals (Feedback, Not Gates)

**Blocked by:** P523 (story-first epic)
**Superseded by:** P563 (position provenance — engagement depth replaces AI quality scores) + P564 (point-story attribution — provenance replaces falsifiability scores as the quality signal)

**Supersession rationale (2026-03-21):** The story-first architecture (P523 V7) replaces AI-generated quality scores with emergent quality signals: how many stories a position-holder read, how many they assessed, author verification depth. Quality emerges from engagement depth, not from AI scoring falsifiability/counterfactual/hard-to-vary. The P544 insight — "feedback not gates" — survives in P563's approach: provenance is shown as information, not as a filter.

**What survives:** The data hygiene items (delete duplicate points) and the sifter skill updates are independent and can be done anytime.

---

## Problem Statement

The sifter-point skill has rigorous quality criteria (falsifiable, counterfactual, hard-to-vary, user voice) but they're internal-only — invisible to authors and readers. This creates two problems:

1. **Authors get no feedback** on how strong their point is before publishing
2. **Readers can't distinguish** a carefully falsifiable mechanism from a CTA or personal stance — all points look the same

The original approach (gate creation, enforce criteria, separate content types) was wrong. Gating contradicts the epistemology — Popper doesn't gate conjectures, he gates what counts as refutation. And separating "pedagogical" from "community" content is subjective and strips value from branded/teaching content that people should still be able to take positions on.

## Design Principle

**Quality criteria are feedback signals, not publication gates.** The AI generates scores and improvement suggestions. The author sees them. The author publishes anyway if they choose. Readers optionally see a simplified quality indicator. The data (positions, position shifts after stories) speaks for itself.

## Scope

### Data hygiene (immediate, pre-P523)
- [x] Delete Point 9 (76f003ef) — duplicate of Point 8 with `#partners` in text body

### Schema: persist quality scores on points
- [ ] Add columns to `points` table:
  - `falsifiability_score` (smallint, 0-100, nullable)
  - `counterfactual_score` (smallint, 0-100, nullable)
  - `hard_to_vary_score` (smallint, 0-100, nullable)
  - `voice_score` (smallint, 0-100, nullable)
  - `quality_summary` (text, nullable) — AI-generated one-line explanation of the scores
  - `improvement_suggestions` (text[], nullable) — AI-generated tips to strengthen the point
- [ ] Backfill existing 8 prod points with AI-generated scores

### Creation flow: AI quality feedback
- [ ] When a user creates/edits a point, run AI scoring and show:
  - The 4 scores as a visual indicator (see P545 for display)
  - The quality summary ("This is a personal stance, not a testable mechanism. That's fine — people can still agree or disagree.")
  - Improvement suggestions ("To make this more falsifiable, you could specify what observation would prove it wrong.")
- [ ] Author can publish at any score — feedback is advisory, never blocking

### Sifter skill updates
- [ ] Update `sifter-point.md`: show scores to user during extraction (currently hidden)
- [ ] Update `sifter-point.md`: replace "present 3 at once, ask for ratings" with "present 3 with scores and improvement tips, ask which to refine"
- [ ] Update `sifter-definitions.md`: reframe scoring section — criteria are feedback signals, not pass/fail gates
- [ ] Remove "structural gate" language that auto-disqualifies points containing "I" statements — stances are valid points

### Reader-facing (optional, post-creation)
- [ ] Display simplified quality indicator on point cards (see P545)
- [ ] Consider: show full scores on point detail page

## Acceptance Criteria

- Every point in prod has AI-generated quality scores (backfilled)
- Point creation flow shows scores + suggestions before publish
- No score threshold blocks publication
- Sifter skills updated to show scores during extraction
- Existing prod points with links, CTAs, stances, pedagogical sequences are NOT removed or rewritten — they're scored as-is

## Relationship to Story Performance

Quality scores are the input signal. The output signal is story performance: when someone reads a story connected to a point and their position on that point shifts, that measures the story's persuasive power. This connects to the Error Correction Rate metrics (see claude-conversations 2026-03-18 "Measuring error correction in chat history"):

```
Point quality (falsifiability score) × Position shift after story exposure = Story fitness
```

High-falsifiability points with measurable position shifts = the protocol working.
Low-falsifiability points with no position shifts = noise (but not blocked — just visible).

## Notes

This spec supersedes the original P544 framing ("audit and fix points against sifter criteria"). The insight: quality criteria should instrument, not gate. Every point is valid content that people can take positions on. The scores help authors improve and help the system measure what works.
