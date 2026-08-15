---
status: draft
type: story
workstream: C2
tags: []
rank: 125361.0
created_date: 2026-01-11
---
# P125: Network-Aware Matching

**Status:** Vision (Phase 2/3)
**Priority:** Deferred — requires H2 validation + topology data
**Created:** 2026-01-11
**Depends On:** P41 (coaching infrastructure), Topology Visualization (Level 4)

---

## Goal

AI-powered matching that suggests which people should talk about which ideas to maximize common knowledge creation for the group.

**The Core Question:** Given a group's current understanding topology, which conversation would most accelerate coordination?

---

## The Problem It Solves

In a group of 30 people discussing 5 ideas:
- 4,350 possible verification pairs exist (30 × 29 × 5)
- We can't verify them all
- Random pairing is inefficient
- A skilled facilitator intuits which pairs matter — but this doesn't scale

**The gap:** No system currently computes which understanding gaps, if closed, would unlock the most coordination value.

---

## The Mechanism

### Gap Value Scoring

For any unverified (Person A, Person B, Idea X) triple, compute:

```
Gap_Value =
  Position_Divergence(A, B, X) ×      // Do they disagree?
  Centrality(A) × Centrality(B) ×     // Are they well-connected?
  (1 - Verification_Coverage(X)) ×    // Is this idea under-verified?
  Downstream_Dependency(X)            // Does coordination block on this?
```

### Factors Explained

| Factor | What It Measures | Why It Matters |
|--------|------------------|----------------|
| **Position Divergence** | Agree vs Disagree on the idea | Cross-disagreement verification is the highest-value signal |
| **Centrality** | How connected is each person in the network | Hub verification propagates trust widely |
| **Verification Coverage** | % of group already verified on this idea | Under-verified ideas have hidden risk |
| **Downstream Dependency** | Do other decisions block on this idea? | Bottleneck ideas deserve priority |

### Output

The system surfaces:
1. **Suggested pairing:** "Talk to Maria about Idea #3"
2. **Why it matters:** "You disagree, neither has verified, and the sprint decision depends on it"
3. **Expected impact:** "This would give the team 80% coverage on the blocking idea"

---

## User Experience (Conceptual)

### In AI Coaching (P41 Evolution)

After a session, instead of just personal feedback:

```
┌────────────────────────────────────────────┐
│  Your Next High-Impact Conversation        │
│                                            │
│  💬 Talk to: David Chen                    │
│  📌 About: "We should ship MVP by Friday"  │
│                                            │
│  Why this matters:                         │
│  • You disagree (you: ✓, David: ✗)         │
│  • Neither has verified understanding      │
│  • 3 team decisions block on this          │
│                                            │
│  [Start Session with David]                │
│                                            │
│  Impact: Would give team 80% alignment     │
│  on the blocking decision                  │
└────────────────────────────────────────────┘
```

### In Group Facilitation (Future)

Facilitator dashboard shows:

```
┌─────────────────────────────────────────────────────────┐
│  IDEA: "We should ship by Friday"                       │
│                                                         │
│  COVERAGE: 23% verified                                 │
│                                                         │
│   AGREE          DISAGREE        DON'T KNOW            │
│   ┌───┐          ┌───┐           ┌───┐                 │
│   │ A │──────────│ B │           │ E │                 │
│   └───┘ verified └───┘           └───┘                 │
│   ┌───┐                                                │
│   │ C │── ? ────│ D │  ← SUGGESTED NEXT                │
│   └───┘          └───┘    Gap_Value: 0.87              │
│                                                        │
│  [Pair C + D on this idea]                             │
└─────────────────────────────────────────────────────────┘
```

---

## Prerequisites

This feature requires:

| Prerequisite | Status | Why Needed |
|--------------|--------|------------|
| Ideas in /live | Priority 1 | Need to know WHAT is being verified |
| Position marking | Priority 1 | Need agree/disagree data |
| Session history | Exists | Who verified whom on what |
| Group/event context | Not built | Who's in the same coordination context |
| Centrality scoring | Not built | Network position data |
| H4 validation | Current focus | Must prove visibility changes behavior first |

---

## Why This Is Deferred

From [v0 Theory of Change](../docs/visions/v0_theory-of-change.md):

> "Build AFTER running group events with manual (whiteboard) topology. Only invest in UI after validating H2 manually."

The routing intelligence is valuable, but:
1. We don't have the data inputs yet (ideas, positions, group context)
2. H4 (visibility changes behavior) is unvalidated
3. A skilled facilitator can do this manually for now

**When to build:** After H2 validates and we have 100+ sessions with idea/position data.

---

## Relationship to P41

P41 (AI Coaching Teaser) is currently framed as personal feedback. This feature reframes it:

| P41 Current | P52 Evolution |
|-------------|---------------|
| "See your insights" | "See which gap YOUR verification would close" |
| Personal skill feedback | Network-aware matching |
| Individual focus | System coordination focus |

P41 can ship as the teaser. P52 is what the coaching **becomes** once we have topology data.

---

## Success Metrics (Future)

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Gap closure rate | Higher with suggestions | A/B: suggested pairs vs random pairs |
| Time to group alignment | Faster | Sessions needed to reach X% coverage |
| Cross-disagreement rate | Higher | % of verifications that cross position lines |
| User trust in suggestions | >70% follow-through | % who take suggested pairing |

---

## Related Documents

- [v0 Theory of Change, Section 3.1](../docs/visions/v0_theory-of-change.md#31-routing-intelligence-which-gaps-matter-most) — The conceptual foundation
- [P41: AI Coaching Teaser](./p41_coaching_teaser.md) — Current demand validation
- [v1 Meme Platform Vision](../../docs/visions/v1_vision-meme-platform.md) — Cross-disagreement as signal
- [v2 Tournament Theory](../docs/visions/v2.%20tournament%20_%20theory.md) — √N bridges, routing concept

---

## Open Questions

1. **Privacy:** Should Gap_Value be visible to users, or just used internally for suggestions?
2. **Opt-in:** Can someone decline a suggested pairing without social cost?
3. **Gaming:** Could people artificially inflate their centrality?
4. **Cold start:** How do we bootstrap with sparse verification data?
5. **Cross-group:** Can routing work across groups that share members?
