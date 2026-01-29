# Definitions

Core concepts of the Clarity Pledge platform. This is the product's conceptual foundation.

**Last Updated:** 2026-01-27

---

## Stories vs Points

| Type | Nature | User Action | Verification |
|------|--------|-------------|--------------|
| **Story** | Lived experience, the "why" behind a position | Can only be understood | /live explain-back (≥8/10 = verified) |
| **Point** | Logical claim, something debatable | Position on -3 to +3 scale | Position staking |

**The relationship (bidirectional):**
```
POINT: "Remote work is more productive"
   ↕
   │ bidirectional linking
   ↕
STORY: "I burned out commuting 2 hours daily"
   ↑
   │ leads to
   ↓
POSITION: "+2 (Agree) on this Point"
```

- **Point → Story:** A Point can link to Stories that support or oppose it
- **Story → Point:** A Story can link to Points it explains your position on

**Key insight:** You don't verify Points (they're just claims). You verify understanding of the **Story behind someone's Position** on a Point.

---

## Position Scale (7-point Likert)

| Score | Meaning |
|-------|---------|
| -3 | Strongly disagree |
| -2 | Disagree |
| -1 | Slightly disagree |
| 0 | Unsure / No opinion |
| +1 | Slightly agree |
| +2 | Agree |
| +3 | Strongly agree |

---

## Verification Threshold

**≥8/10 = Verified Understanding**

When both parties rate understanding ≥8/10 in a /live session, the understanding is "verified."

| Score | Status | Display |
|-------|--------|---------|
| 10/10 | Perfect | Green badge |
| 8-9/10 | Verified | Green badge |
| <8/10 | In Progress | Amber/gray |

---

## Understanding Calibration (Core Construct)

**What we measure — precisely:**

```
Listening (behavior) → Understanding (outcome) → Confidence (metacognition) → Gap to reality (calibration)
                                                        ↑                              ↑
                                                   WE MEASURE THIS              AND THIS
```

**The measurement:**
- **Listener rates:** "How well do I think I understood?" (confidence/self-estimate)
- **Speaker rates:** "How well did they actually understand?" (verification)
- **Gap:** Speaker's rating − Listener's confidence = **Understanding Calibration**

**Key distinction:** We measure **understanding** (an outcome), not **listening** (a behavior). Listening is what you do; understanding is what results. We measure whether you *know* how well you understood — metacognitive accuracy.

**Academic terms for this construct:**
| Term | Definition | Source |
|------|------------|--------|
| **Metacomprehension accuracy** | Correlation between predicted and actual comprehension | Yang et al. (2023) meta-analysis: r=0.24 |
| **Illusion of knowing** | Belief that comprehension happened when it failed | Glenberg, Wilkinson & Epstein (1982) |
| **Illusion of explanatory depth** | Thinking you understand causal systems better than you do | Sloman & Fernbach (2017) |
| **Listening fidelity** | Congruence between listener's and speaker's cognitions | Powers & Lowry (1984) |

**Why "understanding" not "listening":**
- "Listening" is the entry-point word people use ("they don't listen")
- But we measure the *outcome* (did understanding happen?) not the *behavior* (did they pay attention?)
- More precise: "understanding calibration" or "metacomprehension accuracy"

**Teach-back = Explain-back:**
The mechanism we use (listener plays back understanding, speaker verifies) is called "teach-back" in healthcare literature. We call it "explain-back." Same mechanism, proven effective (60% reduction in hospital readmissions).

---

## Calibration Badge (Public Reputation)

Users earn a public "Calibrated" badge when:
- **≥10 clarity sessions completed** AND
- **avgGap within ±0.5** (self-assessment matches reality)

This badge appears next to their name across the platform, rewarding epistemic humility while preserving privacy (exact calibration numbers stay private on their dashboard).

---

## The User Flow (Integrated)

```
1. BRAIN DUMP
   User talks/types messy thoughts
        ↓
2. AI SIFTS
   Story (blue) vs Point (yellow)
        ↓
3. HARDENER
   AI sharpens Point into falsifiable claim
        ↓
4. MIRROR TEST
   AI plays back understanding, user confirms
        ↓
5. STAKE POSITION
   User agrees/disagrees on Points
        ↓
6. FIND DISAGREER
   See who has opposite position
        ↓
7. VERIFY STORY
   /live explain-back on their Story
        ↓
8. INFORMED DISAGREEMENT
   Still disagree, but understand WHY
```

---

## The Four States of Agreement

The real value is in detecting **false states**:

| State | What It Means | Value of Detection |
|-------|---------------|-------------------|
| **False Disagreement** | Positions differ, but it's a misunderstanding | **HIGH** — verification resolves it |
| **False Agreement** | Positions match, but they mean different things | **HIGH** — verification reveals hidden gap |
| **True Disagreement** | Positions differ AND they understand each other | Medium — at least it's clear |
| **True Agreement** | Positions match AND they mean the same thing | Low — nothing to do |

---

## Story Visibility Model

| Level | Who sees | Use case |
|-------|----------|----------|
| **Private** | Only author | Drafts |
| **Shared** | Event participants | Event feed |
| **Public** | Everyone | Global feed, profile |

---

## Related Documents

- [lean-canvas.md](lean-canvas.md) — Business model and customer segments
- [hypotheses.md](hypotheses.md) — What we're testing (H1-H7, H-Core)
- [philosophy.md](philosophy.md) — Epistemological foundations
