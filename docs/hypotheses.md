# Hypotheses

Ordered by validation sequence. Numbers now follow logical order.

**Status legend:** ✅ Validated | 🔄 Current Focus | ⏳ Blocked (needs prior validation) | 🎯 North Star

---

# Validated

## H1: /live reduces Understanding Gap ✅

**What we're testing:** When two people use the explain-back protocol, does the gap between "how well I think I communicated" and "how well I actually communicated" decrease?

**How to test:** The product validates itself — gaps close visibly in real-time during /live sessions.

**Success criteria:** Users report feeling more understood after /live than before.

**Status:** **VALIDATED** — /live works. People use it, gaps close.

**Critical learning (2026-01-27):** H1 validated means the tool WORKS in-session. But "works" ≠ "sticky." Users praise /live, report liking it, but don't return. They ask "on what? when?" The tool lacks a trigger. See [2026-01-27 decision](decisions.md) about Cold Start Problem.

---

# Current Focus

**How we measure behavior change (2026-01-27):** Workshop attendance doesn't prove behavior changed. Ongoing use does. Success = teams keep using /live in their own meetings, calibration improves over time.

---

## H-Foundation: Calibration Drives Outcomes 🔄

**What we're testing:** Does verified understanding (calibration) actually cause better business outcomes?

**Why this matters:** We validated that /live reveals miscalibration (H1). But we've been ASSUMING that closing the gap matters. If calibration doesn't connect to outcomes people care about, the entire product thesis is wrong.

**Claims to validate:**

| Outcome | Question |
|---------|----------|
| Sales | Does listening skill drive conversion? Is it #1 or #10? |
| Retention | Do employees stay because they feel understood? |
| Collaboration | Does mutual understanding improve team performance? |
| Innovation | Does understanding customers lead to better products? |
| Wellbeing | Does feeling heard improve job satisfaction? |

**How to test:**
- Literature review (research on active listening outcomes)
- Competitive landscape (how is this measured today?)
- Counter-evidence search (why might this NOT matter?)

**Sub-questions:**
- H-Found-1: Is there causal evidence or just correlation?
- H-Found-2: What are the effect sizes? (significant but tiny = not meaningful)
- H-Found-3: Does MEASURING add value, or just the conversation?

**Status:** **SUPPORTED (Mixed-to-Strong)** — Research complete. See [p104_calibration_outcomes_research.md](../features/done/p104_calibration_outcomes_research.md).

**Findings (2026-01-28):**
- Meta-analysis: r=.39 for perceived listening → work outcomes (N=400K observations)
- Strongest links: sales (r=.38-.50), wellbeing (r=.28 burnout reduction)
- Weakest link: innovation (speculative)
- Healthcare teach-back: 60% readmission reduction (experimental)
- Caveat: 75% of research is self-report; correlational not causal

**Implications:** Proceed with confidence. Don't oversell causal claims. Measurement itself is our moat — no one else measures actual understanding.

---

## H-Biz: Coaches as First Paying Customer 🔄

**What we're testing:** Will coaches pay for a diagnostic tool that proves client miscalibration?

**The insight (2026-01-28):** The tool reveals a blindspot people don't know they have. The person who's blind won't pay — but the person who SEES the blindspot (the coach) will pay.

**Specific hypothesis:**
> Executive/leadership/communication coaches will pay $50-100/month for a tool that objectively measures their clients' understanding calibration gap, because it proves the blindspot that clients otherwise dismiss — and tracks improvement over time.

**How to test:**
- Find 10-15 coaches on LinkedIn
- Have 5 discovery conversations
- Ask about pain, trust, retention, willingness to pay
- If positive signal → pilot with real coach + client

**Sub-hypotheses to validate:**

*Tier 1: Pain (must validate)*
- H-Biz-1: Coaches have clients with understanding miscalibration
- H-Biz-2: This is a problem coaches want to solve
- H-Biz-3: No tool measures understanding calibration (measurement was impossible)

*Tier 2: Usage (validates distribution)*
- H-Biz-4: Clients would trust a tool the coach uses
- H-Biz-5: Coaches would use ongoing (not just once)
- H-Biz-6: Coach is open to own measurement (not just clients)

*Tier 3: Spread & Revenue (validates business model)*
- H-Biz-7: **Spread signal** — clients would want this for their teams
- H-Biz-8: **Business WTP** — would client's company pay $500/team/month?
- H-Biz-9: **Coach WTP** — would coaches pay $50-100/month? (or are they distributors?)
- H-Biz-10: Provides differentiation vs other coaches

**Pricing model question:** Are coaches **customers** (they pay) or **distributors** (free for them, businesses pay)? Validation will answer this.

**Success criteria:**
- 5 conversations completed
- 3+ confirm pain (Tier 1)
- Clear signal on spread (H-Biz-7) — this determines pricing model
- If spread signal: validate business WTP (H-Biz-8)
- If no spread signal: validate coach WTP (H-Biz-9)

**Status:** **CURRENT FOCUS** — Validating in conversations before building more.

**Full plan:** [p105_coach_validation.md](../features/p105_coach_validation.md)

---

## H2: Calibration revelation motivates action ⏸️

**What we're testing:** When users see their calibration gap (how well they THINK they communicate vs how well they ACTUALLY do), does this motivate them to:
1. Improve their own communication
2. Help others calibrate
3. Seek verification

**How to test:**
- Show calibration metrics at event (per person)
- Track: Do users with visible gaps seek more /live sessions?
- Survey: "Did seeing your gap surprise you? Motivate you?"

**Success criteria:**
- Users report "I didn't realize I was this miscalibrated"
- Verification rate higher for users who saw their gap
- **Ongoing use:** They use /live in their own meetings after workshop

**Status:** **PAUSED** — Blocked until coach hypothesis validates. Will test with coach's clients first (smaller scale) before events.

---

## H3: Social FOMO drives adoption ⏸️

**What we're testing:** When non-participants see others with calibration scores (ears 👂) and verification history, does social FOMO motivate them to participate?

This is distinct from H2 (self-revelation) — H3 is about seeing *others'* calibration creating desire to join.

**How to test:**
- Show calibration on event participant list (ears count)
- Show verification pairs ("Alice verified with Bob")
- Track: Do unverified attendees seek verification after seeing others' scores?
- Survey: "Did seeing others' calibration make you want to participate?"

**Status:** **PAUSED** — Requires events with multiple participants. Blocked until coach hypothesis validates and we have enough users for group dynamics.

**Success criteria:**
- Non-verified attendees request verification after seeing leaderboard
- Users mention "I saw [person] had high ears, wanted that too"

---

## H4: Visibility changes group behavior ⏸️

**What we're testing:** When a group can SEE who verified understanding with whom (on which topics), does their behavior change? Do they seek verification? Do they trust verified listeners more?

**How to test:** Run 30-person event with:
- Topics provided by organizer (not user-created Stories for MVP)
- /live verification between attendees
- Calibration visible on event page
- Observe: Do people seek verification? Does visibility change behavior?

**Success criteria:**
- >50% of attendees do at least one /live verification
- >60% report "worth it" post-event
- Qualitative: Room rewards "I was wrong" over "I won"

**Status:** **PAUSED** — Blocked until coach hypothesis validates. Requires enough users for group dynamics.

**Critical observation (2026-01-27):** Cannot test H4 until we solve the cold start problem. Users need content (topics) or organizer-provided prompts to verify understanding ABOUT. The "what" must exist before visibility can change behavior around it. Event organizers provide this trigger — individuals don't have it intrinsically.

---

## H-Safety: Calibration History Creates Psychological Safety ⏳

**What we're testing:** Does visible calibration history (ears count, calibration score) create psychological safety for future conversation partners, even before the conversation begins?

**The mechanism:**
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

**At scale:**
- Joining a "Clarity Pledge meeting" = pre-existing psychological safety
- Everyone is registered, everyone has committed to verification
- The platform membership itself signals safety

**Why this matters:** Currently, psychological safety must be built in each new conversation. If calibration history creates portable trust, the protocol becomes more valuable over time — and retention improves.

**How to test:**
- Survey: "Did seeing their calibration score make you feel safer?"
- Compare: Conversations with visible history vs. no history
- Track: Do people with higher scores get more verification requests?

**Status:** **BLOCKED** — Requires enough calibration data to be meaningful. Test after H-Biz validates and users accumulate history.

**Connection to retention:** This hypothesis, if validated, explains why ongoing use creates value — the history IS the product.

---

# Blocked (need prior validation)

## H5: Status flip happens ⏳

**What we're testing:** Will social status shift from "confident assertion wins" to "verified understanding wins"? Will the room reward someone who says "I was wrong" more than someone who "won" the argument?

**How to test:** Post-event observation and surveys. Track who gets approached, respected, followed.

**Success criteria:** Qualitative shift in group dynamics. People seek out verified listeners.

**Status:** **BLOCKED** — Cannot test until H4 validated (need visible verification first).

---

## H6: Certifications create reputation ⏳

**What we're testing:** Do people trust "verified listeners" more? Does a track record of verified understanding become a credential that matters?

**How to test:**
- Profile shows "N people verified I understand them"
- Track: Do people with higher scores get more verification requests?
- Survey: Would you trust this person more in a hiring/voting/collaboration context?

**Success criteria:**
- Verified Listener Score correlates with trust
- People mention verification history when recommending others

**Status:** **BLOCKED** — Cannot test until H4/H5 validated (need visible verification and status shift first).

---

## H7: Cascade propagates ⏳

**What we're testing:** Do verified pairs create more verified pairs? Does the network grow organically once seeded?

**How to test:**
- Track: After A verifies B, does B verify C?
- Measure: Verification graph growth rate
- √N theory: Do we need fewer verifications than expected to achieve "everyone knows someone who verified"?

**Success criteria:**
- Organic verification growth (not just event-driven)
- Network effect visible in data

**Status:** **BLOCKED** — Cannot test until H4-H6 validated (need working verification loop at scale).

---

# North Star

## H-Core: Asymmetric Conversion reveals truth 🎯

**What we're testing:** Does the Point closest to truth exhibit asymmetric conversion — opponents move toward it after verified understanding, but holders don't move away?

This is the foundational claim of [Communicative Critical Rationalism](philosophy.md). If false, the entire epistemological framework needs revision.

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

**Status:** **NORTH STAR** — The ultimate goal. Cannot test until H4-H7 validated (need enough data from working verification network). Requires: Stories, Points, Positions, Verified Understanding, Conversion Tracking.

---

# Assumption Hierarchy (MVP Validation Order)

These assumptions must be validated in order. A1-A5 are validated by MVP (human loop). A6-A7 are automation layers.

| # | Assumption | Maps to | Risk | How to Test |
|---|------------|---------|------|-------------|
| **A1** | People will seed ideas (Stories/Points) | H4 | Low | Already doing this manually in workshops |
| **A2** | People will stake positions when prompted | H4 | Medium | Simple UI test — 3 buttons |
| **A3** | When positions differ, people will explain other's view | H1 | Medium | Will they type/speak explanation? |
| **A4** | Rating the explanation reveals useful gaps | H1 | Low | 0-10 slider is simple |
| **A5** | This feels valuable, not annoying | H2 | **Critical** | Feedback capture + observation |
| **A6** | AI can extract ideas worth staking | — | Medium | LLM prompt engineering (deferred) |
| **A7** | AI can predict FALSE agreement/disagreement | H-Core | Hard | Needs training data from A1-A5 |

**MVP validates A1 → A5 (the human loop).** A6 → A7 are automation/intelligence layers added after the loop is validated.

**Key learning (2026-01-27):** A1 is validated manually (workshops). But individual users don't spontaneously seed ideas — they need a trigger. Event organizers provide this trigger by giving topics.

---

# Naming History

For reference, hypothesis numbers changed on 2026-01-27:

| New | Old | Reason |
|-----|-----|--------|
| H1 | H1 | Unchanged |
| H2 | H0 | Calibration motivation |
| H3 | H0b | Social FOMO |
| H4 | H2 | Visibility changes behavior |
| H5 | H3 | Status flip |
| H6 | H4 | Certifications |
| H7 | H5 | Cascade |
| H-Core | H-Core | Unchanged |

---

## Related Documents

- [lean-canvas.md](lean-canvas.md) — Product overview and business model
- [theory-of-change.md](theory-of-change.md) — Cascade mechanism, √N
- [decisions.md](decisions.md) — Why we're testing in this order
