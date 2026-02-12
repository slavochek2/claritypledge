---
status: future
priority: p3
summary: "Test whether Points closest to truth exhibit asymmetric conversion after verified understanding"
tests: [H-Core]
answers: []
---

# M6: Asymmetric Conversion (North Star)

**Build:** Position tracking, conversion analytics, large-scale verification data

**Done when:** Statistically significant asymmetry in conversion rates between Points

**Kill signal:** Symmetric conversion everywhere (positions = values, not facts)

**Requires:** All prior milestones validated + enough data for statistical power

## Hypothesis: Asymmetric Conversion reveals truth

**What we're testing:** Does the Point closest to truth exhibit asymmetric conversion — opponents move toward it after verified understanding, but holders don't move away?

This is the foundational claim of [Communicative Critical Rationalism](../philosophy.md). If false, the entire epistemological framework needs revision.

### The Two Components

Asymmetric conversion requires BOTH:

| Metric | Definition | Measures |
|--------|------------|----------|
| **Retention** | Holders stay after understanding opposing Stories | Conviction stability |
| **Conversion** | Opponents flip toward after understanding supporting Stories | Persuasive power |

**Asymmetry Score** = Conversion Rate − (1 − Retention Rate)

A truly "strong" Point has high retention AND high conversion — it holds believers and wins converts.

### The Four States of Agreement

The real value is in detecting **false states** — H-Core measures conversion patterns across these states:

| State | What It Means | Value of Detection |
|-------|---------------|-------------------|
| **False Disagreement** | Positions differ, but it's a misunderstanding | **HIGH** — verification resolves it |
| **False Agreement** | Positions match, but they mean different things | **HIGH** — verification reveals hidden gap |
| **True Disagreement** | Positions differ AND they understand each other | Medium — at least it's clear |
| **True Agreement** | Positions match AND they mean the same thing | Low — nothing to do |

Asymmetric conversion (H-Core) applies to **True Disagreements** — cases where understanding is verified but positions genuinely differ.

**How to test:**
- Collect position data (-3 to +3) on Points before/after /live sessions
- Filter for verified understanding (≥8/10)
- Compare conversion rates: Does Point A convert opponents more than Point B, controlling for personal baseline?
- Check: Do Points that experts consider "true" show higher asymmetric conversion?

**Success criteria:**
- Statistically significant asymmetry in conversion rates between Points
- Symmetric conversion correlates with value-disagreements (not fact-disagreements)
- Points with high asymmetric conversion are judged as "closer to truth" by domain experts

**Status:** This is the ultimate goal. Cannot test until M1-M5 validated (need enough data from working verification network). Requires: Stories, Points, Positions, Verified Understanding, Conversion Tracking.
