# Hypotheses

Ordered list of assumptions we're testing. Each must be validated before the next becomes meaningful.

**Status legend:** ✅ Validated | 🔄 Current Focus | ⏳ Blocked (needs prior validation)

---

# Core Theory Hypothesis

## H-Core: Asymmetric Conversion reveals truth ⏳

**What we're testing:** Does the Point closest to truth exhibit asymmetric conversion — opponents move toward it after verified understanding, but holders don't move away?

This is the foundational claim of [Communicative Critical Rationalism](visions/v7_communicative_critical_rationalism.md). If false, the entire epistemological framework needs revision.

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

**Status:** **BLOCKED** — Cannot test until H2-H5 validated (need enough data from working verification network).

---

# Product Hypotheses

## H1: /live reduces Understanding Gap ✅

**What we're testing:** When two people use the explain-back protocol, does the gap between "how well I think I communicated" and "how well I actually communicated" decrease?

**How to test:** The product validates itself — gaps close visibly in real-time during /live sessions.

**Success criteria:** Users report feeling more understood after /live than before.

**Status:** **VALIDATED** — /live works. People use it, gaps close.

---

## H2: Visibility changes group behavior 🔄

**What we're testing:** When a group can SEE who verified understanding with whom (on which Stories/Points), does their behavior change? Do they seek verification? Do they trust verified listeners more?

**How to test:** Run 30-person event with:
- Stories + Points visible
- /live verification between attendees
- Profile shows "X verified understanding of my Story"
- Observe: Do people seek verification? Do they check profiles?

**Success criteria:**
- >50% of attendees do at least one /live verification
- >60% report "worth it" post-event
- Qualitative: Room rewards "I was wrong" over "I won"

**Status:** **CURRENT FOCUS** — Building Events + Stories/Points + /live integration to test this.

---

## H3: Status flip happens ⏳

**What we're testing:** Will social status shift from "confident assertion wins" to "verified understanding wins"? Will the room reward someone who says "I was wrong" more than someone who "won" the argument?

**How to test:** Post-event observation and surveys. Track who gets approached, respected, followed.

**Success criteria:** Qualitative shift in group dynamics. People seek out verified listeners.

**Status:** **BLOCKED** — Cannot test until H2 validated (need visible verification first).

---

## H4: Certifications create reputation ⏳

**What we're testing:** Do people trust "verified listeners" more? Does a track record of verified understanding become a credential that matters?

**How to test:**
- Profile shows "N people verified I understand them"
- Track: Do people with higher scores get more verification requests?
- Survey: Would you trust this person more in a hiring/voting/collaboration context?

**Success criteria:**
- Verified Listener Score correlates with trust
- People mention verification history when recommending others

**Status:** **BLOCKED** — Cannot test until H2/H3 validated (need visible verification and status shift first).

---

## H5: Cascade propagates ⏳

**What we're testing:** Do verified pairs create more verified pairs? Does the network grow organically once seeded?

**How to test:**
- Track: After A verifies B, does B verify C?
- Measure: Verification graph growth rate
- √N theory: Do we need fewer verifications than expected to achieve "everyone knows someone who verified"?

**Success criteria:**
- Organic verification growth (not just event-driven)
- Network effect visible in data

**Status:** **BLOCKED** — Cannot test until H2-H4 validated (need working verification loop at scale).

---

## H0: Calibration revelation motivates action 🔄

**What we're testing:** When users see their calibration gap (how well they THINK they communicate vs how well they ACTUALLY do), does this motivate them to:
1. Improve their own communication
2. Help others calibrate
3. Seek verification

**How to test:**
- Show calibration metrics on profile
- Track: Do users with visible gaps return for more /live sessions?
- Survey: "Did seeing your gap surprise you? Motivate you?"

**Success criteria:**
- Users report "I didn't realize I was this miscalibrated"
- Return rate higher for users who saw their gap

**Status:** **CURRENT FOCUS** — Building calibration banner as part of profile.

---

# Assumption Hierarchy (MVP Validation Order)

These assumptions must be validated in order. A1-A5 are validated by MVP (human loop). A6-A7 are automation layers.

| # | Assumption | Maps to | Risk | How to Test |
|---|------------|---------|------|-------------|
| **A1** | People will seed ideas (Stories/Points) | H2 | Low | Already doing this manually in workshops |
| **A2** | People will stake positions when prompted | H2 | Medium | Simple UI test — 3 buttons |
| **A3** | When positions differ, people will explain other's view | H1 | Medium | Will they type/speak explanation? |
| **A4** | Rating the explanation reveals useful gaps | H1 | Low | 0-10 slider is simple |
| **A5** | This feels valuable, not annoying | H0 | **Critical** | Feedback capture + observation |
| **A6** | AI can extract ideas worth staking | — | Medium | LLM prompt engineering (Phase 3) |
| **A7** | AI can predict FALSE agreement/disagreement | H-Core | Hard | Needs training data from A1-A5 |

**MVP validates A1 → A5 (the human loop).** A6 → A7 are automation/intelligence layers added after the loop is validated.

---

## Related Documents

- [lean-canvas.md](lean-canvas.md) — Product overview and business model
- [v0_theory-of-change.md](visions/v0_theory-of-change.md) — Full validation strategy and cascade theory
- [decisions.md](decisions.md) — Why we're testing in this order
- [p69_product_vision_consolidation.md](../features/p69_product_vision_consolidation.md) — Documentation consolidation
