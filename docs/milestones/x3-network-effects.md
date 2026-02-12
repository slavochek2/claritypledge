---
status: future
priority: p3
summary: "Test whether verification history creates reputation/trust enabling organic network growth"
tests: [H6, H7, H-Safety]
answers: []
blocked_until: Month 12+ (requires established user base >100 users)
---

# X3: Network Effects (Cascade & Reputation)

**Build:** Verified Listener Score, certification badges, network graph tracking, calibration history visibility

**Done when:** (1) Verified Listener Score correlates with trust, (2) organic verification growth visible (not event-driven), (3) history predicts psychological safety

**Kill signal:** No correlation between history and trust; no organic growth; verification only happens when prompted by events

**Requires:** Established user base (>100 users) with sufficient verification data for network effects to materialize

---

## Hypothesis: Verification History Creates Network Effects

**What we're testing:** Does verification history become a portable credential that creates trust, drives organic growth, and enables network effects?

This milestone combines three related hypotheses about network-level phenomena:

### H6: Certifications create reputation

Do people trust "verified listeners" more? Does a track record of verified understanding become a credential that matters?

**Observable:** Verified Listener Score correlates with trust; people mention verification history when recommending others

### H7: Cascade propagates

Do verified pairs create more verified pairs? Does the network grow organically once seeded?

**Observable:** After A verifies B, B verifies C; network graph shows organic growth (not just event-driven)

### H-Safety: Calibration history creates psychological safety

Does visible calibration history (ears count, calibration score) create psychological safety for future conversation partners, even before the conversation begins?

**Observable:** Users report feeling safer with high-history partners; people with higher scores get more verification requests

---

## How to Test

### Reputation (H6)

**Build:**
- Profile shows "N people verified I understand them"
- Verified Listener Score algorithm (quality-weighted)
- Profile badges for verification milestones

**Track:**
- Do people with higher scores get more verification requests?
- Does score correlate with trust in hiring/voting/collaboration contexts?

**Survey:**
- "Would you trust this person more based on their verification history?"
- "Did you choose to verify with someone based on their score?"

### Cascade (H7)

**Build:**
- Network effect tracking
- Verification graph visualization
- Growth rate measurement

**Track:**
- After A verifies B, does B verify C (within 7 days)?
- Verification growth rate: event-driven vs organic
- √N theory test: Do we need fewer verifications than expected to achieve "everyone knows someone who verified"?

**Measure:**
- Organic verification ratio (non-event / total)
- Network propagation rate
- Time to next verification post-event

### Safety (H-Safety)

**Build:**
- Calibration history visibility on profiles
- Trust signal UI (badges, score prominence)

**Track:**
- Do people with visible history get more verification requests?
- Does history correlate with perceived safety?

**Survey:**
- "Did seeing their calibration score make you feel safer?"
- "Would you be more willing to be vulnerable with someone with high verification history?"

---

## Success Criteria

**Quantitative:**
- Verified Listener Score correlates with trust (r > 0.5)
- Organic verification growth >30% (not event-driven)
- After A verifies B, >30% of B verify C within 7 days
- People with higher scores get 2x more verification requests

**Qualitative:**
- People mention verification history when recommending others
- "Joining a Clarity Pledge meeting" creates pre-existing psychological safety
- Network graph shows cascade pattern (not hub-and-spoke)

---

## The Mechanism

At scale, calibration history becomes a **portable trust signal**:

```
Person has 50 verified listens with low gap
    ↓
Others see this history before talking to them
    ↓
"This person has proven they try to understand"
    ↓
I feel safer being vulnerable with them
    ↓
The metric becomes a TRUST SIGNAL
```

If validated:
- Psychological safety must be built in each new conversation → **FALSE**
- Calibration history creates portable trust → **TRUE**
- The protocol becomes more valuable over time
- Retention improves (history IS the product)

---

## Critical Dependencies

**Why this requires scale (>100 users, Month 12+):**

1. **Network effects need networks:** Can't test cascade with <30 active pairs
2. **Statistical power:** Correlation studies need sample size for significance
3. **Organic growth window:** Need time for non-event verification to emerge
4. **Trust signal validity:** Reputation needs established norms/culture

This is why X3 is blocked until Month 12+ and both R-track and C-track validated.

---

## Why These Hypotheses Are Grouped

All three test network-level phenomena that require:
- Established user base (>100 users)
- Time for organic behavior to emerge (3+ months post-launch)
- Same infrastructure (profiles, scores, badges, history visibility)
- Same measurement approach (correlation studies, network analysis)

They cannot be tested sequentially in 3-6 month increments because network effects materialize slowly. Testing them together at 12+ months is more efficient.

---

## Connection to Theory of Change

The cascade mechanism (H7) is detailed in [theory-of-change.md](../theory-of-change.md).

**√N theory:** If verified pairs introduce others at a constant rate, we need ~√N "super-spreaders" to saturate a network of size N. This is testable if network effects exist.

If X3 validates, it proves the protocol can scale via network effects without linear growth in facilitation effort.

---

## Note on M12 Redundancy

This milestone consolidates what was previously M10, M11, and M12:
- M10: Certifications (H6)
- M11: Cascade (H7)
- M12: Safety History (H-Safety)

M12 was fully redundant with M7/M8/M10 — all tested "history creates trust" in slightly different framings. By consolidating into X3, we test the same mechanisms more efficiently.
