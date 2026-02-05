# Hypotheses

Ordered by validation sequence. Numbers now follow logical order.

**Status legend:** ✅ Validated | 🔄 Current Focus | ⏳ Blocked (needs prior validation) | 🎯 North Star

---

# Evidence Base (Validated Assumptions)

These are research-backed facts we're building on — not hypotheses to test.

## The Problem (Pain)

| Claim | Evidence | Source |
|-------|----------|--------|
| Miscommunication costs money | $1.2 trillion/year US; $12,506/employee/year (~21% of salary) | Grammarly & Harris Poll 2024 |
| People are poorly calibrated | Baseline accuracy r=.178-.24 (predictions barely match reality) | Yang et al. 2023 meta-analysis (N=15,889) |
| Speakers can't detect the gap | Listeners' minds wander 24% of time; speakers think they're heard when they're not | Collins et al. 2022 (Harvard/UCLA) |
| Current tools don't measure understanding | Gong: talk ratios. 360: 1 checkbox of 30. All: no speaker verification | P110 competitive analysis |

## The Mechanism (Solution Works)

| Claim | Evidence | Source |
|-------|----------|--------|
| Calibration is trainable | Interventions show g=0.46-0.72 effect sizes | Meta-analyses (Yang et al., situation-model studies) |
| Teach-back/explain-back works | 45-60% fewer hospital readmissions | Healthcare RCTs (systematic review) |
| Feedback loops improve accuracy | Accurate calibration → strategic correction → better learning | Thiede et al. 2003; AI calibration RCT 2025 |

## The Outcomes (Why It Matters)

| Claim | Evidence | Source |
|-------|----------|--------|
| Listening → work outcomes | r=.39 overall (medium-strong effect) | Kluger et al. 2023 meta-analysis (N=400K) |
| Listening → sales | r=.47 (strong effect) | Kluger et al. 2023 |
| Listening → reduced burnout | r=.28 | Kluger et al. 2023 |
| Psychological safety → performance | 43% of team performance variance; +17% vs -19% on targets | Google Project Aristotle |
| Feeling heard → engagement | 40% engagement increase | Gallup 2024 |

## What We Uniquely Do

| Claim | Evidence | Source |
|-------|----------|--------|
| No commercial tool measures conversational understanding calibration | All tools measure speaker behavior or self-report; none verify listener understanding via speaker | P110 research |
| Explain-back is core active listening technique | Teach-back = explain-back; proven mechanism in healthcare and education | Literature review |
| We measure + create feedback loop | Listener confidence vs speaker verification = calibration gap revealed | Our product |

## ROI Framework

```
Cost of miscommunication:     $12,506/employee/year
10-person team:               $125,060/year
Even 10% improvement:         $12,506 saved
Tool cost:                    $6,000/year ($500/month)
Minimum ROI:                  2x
```

**Caveat:** $12,506 figure is survey-based (Grammarly), not measured. Directionally correct, precision uncertain.

## Evidence Gaps (What We Can't Claim Yet)

| Claim We'd Like to Make | Why We Can't Yet |
|-------------------------|------------------|
| Our tool improves business outcomes | Healthcare proves mechanism; workplace outcomes need our own data |
| Conversational calibration → general metacognition | Transfer not tested |
| Specific ROI from our tool | Need case studies |

**Full research:** [P104](../features/done/p104_calibration_outcomes_research.md) (listening outcomes) | [P110](../features/research/p110_results.md) (calibration outcomes)

---

# Open Questions

Questions we need to answer through experimentation. Updated 2026-02-03.

## OQ-1: What exactly do people pay for?

**The tension:** Events are donation-based. Revenue goal is software subscription. But subscription for what?

**Options being considered:**
- Pay for coaching/training (services, doesn't scale)
- Pay for membership/pledge status (identity + community)
- Pay for team calibration dashboard (B2B SaaS)
- Pay per high-stakes decision (occasional high-value use)

**How we'll answer:** Run events, observe what value people articulate, test WTP at different framings.

---

## OQ-2: What are the KPIs?

**The tension:** Without clear KPIs, can't know if succeeding or failing.

**Proposed KPIs:**
- Repeat usage: % of users who do second /live session within 30 days
- Calibration improvement: Do gaps shrink over time?
- WTP signal: % who say yes to paying at various price points

**How we'll answer:** Define and track from first event onward.

---

## OQ-3: How do we validate retention?

**The tension:** If tool builds culture and culture self-sustains, tool becomes unnecessary.

**Possible retention mechanisms:**
- Data/history is irreplaceable (like Strava for running)
- New contexts require re-calibration (new team members, new projects)
- Tool is the venue, not just the skill (like Clubhouse)

**How we'll answer:** Track month 2+ usage without active invitation.

---

## OQ-4: Online-only or also in-person?

**The tension:** Andy tested — tool breaks flow in physical meetings.

**Options:**
- Accept online-only constraint, target remote-first
- Async mode: verify understanding AFTER meeting, not during
- Meeting bookends: use before/after meetings, not during

**How we'll answer:** Experiment with different modes in events.

---

## OQ-5: What proves TOOL adds value vs YOU?

**The tension:** When you facilitate, magic happens. Is it you or the tool?

**How to test:**
- Have someone else run event with your tool
- Create self-serve path, track if strangers get value without you

**Critical:** If value = you, this is a coaching business, not SaaS.

---

## OQ-6: What's the internal trigger?

**The tension:** External triggers work (invitations). Internal triggers don't exist.

**Possible triggers:**
- Post-frustration: "I wish I'd verified" → prevent next time
- Scheduled ritual: Weekly clarity check (calendar-based)
- Integrated: End of meeting prompt in Slack/Teams

**Update (2026-02-02):** Stories may solve this. "I have a story to share" or "Someone shared a story with me" are clearer triggers than "let's verify understanding of... something."

**How we'll answer:** Observe when people spontaneously want to use tool. Test with Stories: do they create triggers?

---

## OQ-7: Do we need Points for verification? (NEW)

**The tension:** Points add structure to verification ("did you understand THIS claim?") but also add complexity.

**Decision (2026-02-02):** Start with holistic verification (no points). Add points only if holistic proves too vague.

**Holistic verification:**
- Listener explains back the story
- Speaker rates 0-10: "Did they get it?"
- No specific claims to verify against

**With points:**
- Story has extracted claims (falsifiable, hard-to-vary)
- Verification tests each claim specifically
- Position tracking before/after understanding

**How we'll answer:** Run Phase 4a (holistic human verification). If speakers can't judge understanding without structure, add points in Phase 4b.

---

## OQ-8: Does "Clarity Pledge" brand fit "Scale Your Inner World"?

**The tension:** Original brand emphasized verification/calibration ("pledge" = commitment to verify understanding). New value prop emphasizes scaling/reach ("scale your inner world"). Are these compatible?

**Arguments for keeping the brand:**
- The pledge IS how scaling happens (commitment to verify)
- "Clarity" fits both — clarity about understanding, clarity at scale
- Brand equity already built

**Arguments for reconsidering:**
- "Pledge" sounds commitment-heavy, not empowering
- "Scale your inner world" sounds expansive; "Clarity Pledge" sounds restrictive
- May attract different audiences

**How we'll answer:** Observe how new value prop lands with users. Do they understand the connection? Does the brand feel limiting?

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

**Stories-first (2026-02-02):** Building human verification loop for Stories before adding AI. See [decisions.md](decisions.md) "2026-02-02" entry for 6-phase sequence.

**How we measure success:** Can humans verify story understanding holistically? Does Stories solve the cold start problem ("on what?")?

---

## H-Stories: Stories solve the cold start problem 🔄

**What we're testing:** Do Stories provide the trigger that /live lacks? When /live has a specific story to verify, does it feel purposeful?

**The problem:** /live works but users ask "on what? when?" — no trigger.

**The hypothesis:** Stories provide the "what." "Verify understanding of THIS story" is a clearer purpose than "verify understanding of... something."

**How to test:**
- Build stories on profiles (Phase 1-2)
- Connect /live to stories (Phase 3)
- Observe: Do users engage more? Does it feel purposeful?

**Success criteria:**
- Users select stories to verify (don't ask "on what?")
- Verification sessions feel focused
- Story authors see value in knowing who understood

**Status:** **CURRENT FOCUS** — Building Phase 1-3.

---

## H-Foundation: Calibration Drives Outcomes ✅

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

## H-Biz: Be Your Own Coach First 🔄

**What we're testing:** Can calibrated communication events create value that leads to software subscriptions?

**Key pivot (2026-02-03):** Stopped trying to sell to/through coaches. Instead: BE the coach yourself, run events, learn what works, build case studies.

**Why this pivot:**
- Coaches don't buy much software
- $75/month from coaches isn't meaningful business
- Selling TO coaches requires convincing them to convince their clients (double sales problem)
- Being the coach yourself = fastest learning, direct feedback, build playbook first

**The model:**
```
You (as coach/trainer) → Run events (donation-based) → Participants get value →
  → Prove tool works → Subscription revenue from participants/teams/businesses
```

**What we're validating:**

| Hypothesis | How to Test |
|------------|-------------|
| H-Biz-1: Events create measurable value | Participants report value, come back, calibration improves |
| H-Biz-2: Tool adds value beyond facilitation | Someone else runs event with tool, still works |
| H-Biz-3: People will pay for software | WTP signal from participants after experiencing value |
| H-Biz-4: Retention exists | Users return in month 2+ without being invited |

**Success criteria:**
- Run 5+ events as coach yourself
- >30% repeat attendance (retention signal)
- Someone else successfully runs event with tool (tool vs you test)
- Clear WTP signal at some price point

**Status:** **CURRENT FOCUS** — Run events, validate tool value, find path to subscription revenue.

**Blog audience insight:** The build-in-public blog targets "calibrated listeners" -- people who already practice verification and are frustrated others don't. They need validation and vocabulary, not education. This is the founder's natural audience: practitioners who resonate with the mission. The blog builds reputation with this group; some will become event participants, early adopters, or amplifiers.

**Full plan:** [p105_sales_playbook.md](../features/p105_sales_playbook.md)

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

## H-AI: AI can verify understanding accurately ⏳

**What we're testing:** Can AI assess whether someone understood a story accurately enough that authors trust it? This is the bottleneck for scaling.

**Why this matters:** If AI can't verify accurately, authors must be present for every verification → no scaling → limited product value. If AI CAN verify, Stories become autonomous agents that scale the author's reach.

**The verification protocol AI must execute:**
1. Meaningful explain-back (not parroting)
2. Test with examples and hypotheticals
3. Probe reasoning behind agreement/disagreement
4. Detect surface vs. deep understanding

**How to test:**
1. Run /live sessions where human rates understanding
2. Have AI rate same explanation
3. Compare AI score vs human score
4. Pass criteria: >80% within 2 points of human rating

**Success criteria:**
- AI scores correlate >0.8 with human scores
- Authors trust AI scores (don't override constantly)
- Authors accept AI-verified understanding as "real"

**Status:** **BLOCKED** — Requires Stories infrastructure (Phase 1-3 of roadmap). Test after human verification loop validated.

**Added (2026-02-02):** This is the critical technical hypothesis. Everything else in the Stories vision depends on this being true.

---

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
