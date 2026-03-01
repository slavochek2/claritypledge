# Definitions

Core concepts of the Clarity Pledge platform. This is the product's conceptual foundation.

**Last Updated:** 2026-02-03

---

## False Agreement

> **One-liner:** False Agreement is the state where two people believe they have aligned, but haven't verified it.

**The mechanism:** Both parties walk away from a conversation with miscalibrated confidence that understanding occurred. The gap is invisible until it becomes a conflict. By the time it surfaces, it's expensive — in co-founder relationships, this pattern is the root cause of most splits, not strategic disagreement.

**Distinction from disagreement:** False agreement is more dangerous than open disagreement. Two people who disagree openly can negotiate. Two people in false agreement act on misaligned assumptions until the gap surfaces — typically in high-stakes moments.

**Why it matters for ClarityPledge:** The explain-back protocol is specifically designed to surface false agreement before it becomes costly. A /live session replaces "I think we're aligned" with "I can demonstrate we're aligned."

*See also: [theory-of-change.md](theory-of-change.md) — "Making the Invisible Visible"*

---

## Story (The Scaling Mechanism)

> **One-liner:** A Story is how you scale your inner world — it lets others understand you without you being present for every conversation.

**Evolution (2026-02-02):** Stories aren't just narratives. They're the mechanism for scaling understanding.

```
WITHOUT Stories:
Author explains → Listener verifies → Author must be present every time

WITH Stories:
Author creates story once → Story verifies many listeners → Author only reviews edge cases
```

**What a Story contains:**
- **Text:** The narrative (lived experience, reasoning, context)
- **Author:** Who created it
- **Visibility:** Private / Shared / Public
- **Points (optional):** Falsifiable claims extracted from the story (added later if needed)

**Story lifecycle:**
1. **Creation:** Author explains (manual or AI-assisted via Sifter)
2. **Verification:** Others verify understanding via /live (human) or AI
3. **Evolution:** Story improves through captured corrections
4. **Scaling:** Eventually, AI verifies on author's behalf

**Why Stories solve the cold start problem:**
- Current /live: "Verify understanding of... what?" (no trigger)
- With Stories: "Verify understanding of THIS story" (clear purpose)

**Key insight (2026-02-02):** The value isn't the story itself — it's knowing WHO understood it, HOW WELL, and WHERE they diverged. The story is infrastructure for scaled verification.

**Dual-purpose framing (2026-02-12):**
```
HUMAN USE CASE:
Stories scale understanding across people
→ "Now my team understands my reasoning without me explaining 1-on-1"

AI USE CASE:
Stories are calibrated training data for personal AI agents
→ "My digital twin learned from my verified understanding, not just my words"
```

**Why both matter:**
- Coaches need Stories to solve communication breakdown (immediate pain)
- AI labs need Stories to train aligned agents (strategic value)
- Same infrastructure serves both markets

### Story Versions

Stories have **immutable versions**. When a story is created, version 1 is auto-created via database trigger. When content changes, a new version is created. Verifications reference the specific `version_id` that was verified.

**Why this matters:** Authors can edit stories after verification. Verifiers and authors can always "view what was verified" — the exact content at the time of verification, not the current draft.

```
stories ─── story_versions (1:N, auto-created by trigger)
                  │
                  └── story_verifications (references version_id)
```

### Story Modes

Users interact with Stories in two modes:

| Mode | Role | Action | Value |
|------|------|--------|-------|
| **Listener Mode** | Author | Create stories, share your inner world | Get understood at scale |
| **Tester Mode** | Verifier | Verify understanding of others' stories | Prove you understood |

**Reciprocity flow:** Unskilled listeners often want to be heard first before they open to understanding others. Story creation (Listener Mode) invites them in through their own desire to be understood.

### Verification Protocol

How understanding is verified (human or AI):

1. **Meaningful explain-back** — Verifier explains what they understood (not parroting words)
2. **Examples and hypotheticals** — "If X happened, would you...?" (tests deep understanding)
3. **Probe reasoning** — Why do they agree/disagree? (surface vs. deep)
4. **Detect understanding depth** — Can they apply it to new situations?

**Holistic rating (Phase 4a):** Speaker rates 0-10 "did they get it?" — no specific claims to verify against.

**Structured rating (Phase 4b, if needed):** Story has extracted Points; verification tests each claim specifically.

### Aggregated Feedback (What Authors See)

Authors see verification results across all listeners:

| Insight | What It Shows |
|---------|---------------|
| **WHO understood** | List of verifiers with scores |
| **HOW WELL** | Distribution of understanding ratings |
| **WHERE gaps** | Common misunderstandings, corrections given |
| **Evolution** | How story improved through corrections |

---

## Types of Understanding

The word "understand" covers three incompatible requests. Without naming which one is meant, conversations fail silently.

| Type | Definition | Verifiable? |
|------|-----------|-------------|
| **Cognitive understanding** | Knowing how someone arrived at their position — their reasoning, experiences, and feelings as data | Yes — ask them to confirm your paraphrase |
| **Emotional understanding** | Feeling what someone feels. Resonance, not just knowledge | No — no procedure to confirm it |
| **Agreement** | Accepting that someone is right | Yes — they either hold the same position or don't |

**The false-unity word problem:** All three are called "understanding" in everyday speech. Satisfying one while missing another produces a silent failure — it looks like dishonesty or poor memory. It isn't. It's a word doing too much work.

**Why this matters for the platform:** ClarityPledge verifies cognitive understanding (can you reproduce the story accurately?). It does not and cannot verify emotional understanding. Agreement is tracked separately via Points. Conflating them is the root cause of most "we talked but nothing changed" conversations.

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

**Points are immutable shared objects.** Once a Point exists and others have staked positions on it, it cannot be edited — changing it would invalidate everyone else's positions. Points have no single owner: the first position-staker extracts the Point, but it belongs to the shared discourse.

To "correct" a Point: file a new Story → extract a corrected Point → stake a fresh position. The old Point stays in the discourse; other positions on it remain valid.

---

## Stories as AI Training Data

### The Problem Stories Solve for AI

Current AI training faces a calibration gap:

| Training Source | Problem | Result |
|-----------------|---------|--------|
| **Scraped text** | Unknown intent — what did the author MEAN? | Agents learn surface patterns, not verified understanding |
| **Self-report surveys** | Social desirability bias, no verification | Agents learn what people SAY, not what they actually value |
| **Behavioral data** | No reasoning context — WHY did they act? | Agents predict actions but can't explain reasoning |

**What Stories provide:** Verified understanding — the human confirmed "Yes, you understood what I meant" at ≥8/10.

### Mirror Agent (In-Product, `/chat`)

> **Definition:** The user's personal AI reflection agent in `/chat`. It helps the user articulate a story by mirroring their meaning back in structured form — it reflects, it doesn't lead.

**Key properties:**
- Not a product persona — no fixed name, no brand identity
- User can name it after their first story is filed (stored in private user settings, not visible to others)
- Acts as a personal mirror, not a judge or coach — its job is accurate reflection, not improvement
- Uses NVC scaffolding internally to structure the story; this scaffolding is invisible to the user

**Distinction from Digital Twin:** The mirror agent is the story-filing interface (active now, in `/chat`). The digital twin is the long-term outcome — an AI trained on verified stories to represent you when you're absent. The mirror agent helps build the corpus that eventually trains the twin.

---

### Digital Twin (Mirror Agent)

> **Definition:** An AI agent trained on YOUR verified Stories — capable of representing your reasoning, values, and decision-making patterns in conversations where you're not present.

**How it's created:**
1. You create Stories (your lived experiences, reasoning, context)
2. AI verifies understanding (explains back, you rate ≥8/10)
3. Twin is fine-tuned on verified Stories (not raw text)
4. Twin's outputs are validated by YOU ("Did it capture my view?")

**What makes it "calibrated":**
- Trained only on understanding YOU confirmed as accurate
- Can trace reasoning back to specific Stories
- Continuously validated through your feedback loop

**Use cases:**
- **Personal assistants** — "Schedule meetings consistent with my priorities" (learned from Stories about what you value)
- **Negotiation agents** — "Represent my position in discussions" (learned from Stories explaining your reasoning)
- **Decision support** — "What would I do in this scenario?" (generalizes from verified Stories)

**Key difference from generic AI:** A digital twin trained on YOUR verified understanding is auditable. You can ask "Why did you recommend X?" and it can reference the Story it learned from.

### Personal AI Calibration

> **Definition:** The process of training an AI agent on verified human understanding (Stories) rather than unverified signals (emails, chats, documents).

**The calibration loop:**
```
1. HUMAN creates Story
   ↓
2. AI verifies understanding (≥8/10)
   ↓
3. AI fine-tunes on verified Story
   ↓
4. AI generates response
   ↓
5. HUMAN validates: "Did you represent me accurately?"
   ↓
6. Gap detected → correction → new training data
```

**Why this matters for AI alignment:**
- **Unverified training:** AI learns from messy signals → value drift is invisible until failure
- **Verified training:** AI learns from confirmed understanding → alignment is measurable at each step

**The measurement:**
- **AI confidence:** "How certain am I that I understood correctly?" (0-10)
- **Human verification:** "How well did the AI represent my view?" (0-10)
- **Calibration gap:** Human rating − AI confidence

**The goal:** An AI agent that KNOWS when it doesn't understand you (well-calibrated uncertainty) and can flag "I need more context" rather than acting on misaligned assumptions.

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

> **One-liner:** Knowing how well you understood — do you know when you "got it" vs. missed something?

### Conceptual Hierarchy

```
Metacognition (knowing what you know)
  └── Calibration (accuracy of knowing what you know)
        └── Conversational calibration (in dialogue)
              └── Understanding calibration (did I understand what they meant?)
```

**We measure:** Understanding calibration in conversations — the most specific level.

**Terminology for different audiences:**

| Audience | Term to Use | Why |
|----------|-------------|-----|
| Coaches | "Listening calibration" or "calibrated listening" | Their entry-point word |
| Science/Research | "Metacomprehension accuracy in dialogue" | Matches literature |
| Internal/Precise | "Understanding calibration" | Our technical term |

### What We Measure — Precisely

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

## Ears Count

> **One-liner:** How many people you've successfully understood — your listener track record.

**Ears count** increments when a listener achieves ≥8/10 in a verification session. It represents successful understanding attempts, not total sessions.

- Maintained by database trigger (incremental, O(1))
- Displayed on user profiles as a reputation signal
- Distinct from `verification_session_count` (total sessions, regardless of outcome)

**Related:** Calibration averages (`listener_calibration_avg`, `speaker_calibration_avg`) are computed on-read, not stored. See [architecture.md](technical/architecture.md#calibration-computation).

---

## Calibration Badge (Public Reputation)

Users earn a public "Calibrated" badge when:
- **≥10 clarity sessions completed** AND
- **avgGap within ±0.5** (self-assessment matches reality)

This badge appears next to their name across the platform, rewarding epistemic humility while preserving privacy (exact calibration numbers stay private on their dashboard).

---

## The User Flow (Phased)

**Current (Phases 1-4a):** Manual, human-to-human verification

```
1. CREATE STORY
   Author writes story (manual text)
        ↓
2. SHARE
   Story visible on profile or shared to event
        ↓
3. SELECT FOR VERIFICATION
   Verifier picks a story to verify
        ↓
4. /LIVE EXPLAIN-BACK
   Verifier explains understanding to author
        ↓
5. HOLISTIC RATING
   Author rates 0-10: "Did they get it?"
        ↓
6. CERTIFICATION
   ≥8/10 = verified understanding
```

**Future (Phases 5-6):** AI-assisted creation and verification

```
1. BRAIN DUMP
   User talks/types messy thoughts
        ↓
2. AI SIFTS
   Extract Story + (optionally) Points
        ↓
3. AUTHOR APPROVES
   Author confirms AI captured their meaning
        ↓
4. AI VERIFICATION (at scale)
   AI verifies listener understanding
        ↓
5. AUTHOR REVIEWS EDGE CASES
   Only flags when uncertain
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

## User Types

Three distinct user types exist, determined by `is_verified` and `has_pledged` on the `profiles` table:

| Type | How created | Public profile | Can create content |
|------|------------|---------------|-------------------|
| **Verified Pledger** | `/sign-pledge` → magic link | ✅ `/p/username` | ✅ |
| **Verified Non-Pledger** | `/signup` → magic link | ✅ `/p/username` | ✅ |
| **Unverified Guest** | `/live` invite → enters email | ❌ no slug | ❌ |

**Unverified Guest** — someone who joined a `/live` session via invite link without having an account. They have anonymous Supabase auth, `is_verified: false`, `slug: null`. They can participate in live sessions but cannot create stories, points, or persistent positions. Their conversion path: magic link email sent on join → they click → become a verified user.

See [authentication.md](technical/authentication.md#guest--unverified-users) for the full technical flow.

---

## Story Visibility Model

| Level | Who sees | Where it appears |
|-------|----------|-----------------|
| **Private** | Author only (explicit per-user grant UI is a future spec) | Only author's own views |
| **Shared** | Author + anyone who has registered for the same event as the author — past or future signups (co-registration, not just attendance) | Point pages, profiles — via RLS. NOT in the global feed. |
| **Public** | Anyone, logged in or not | Global feed, profiles, point pages |

**Key "Shared" detail:** Scope is event co-registration, not event attendance. If the author and reader both registered for the same event at any point in time (including future RSVPs), the story is readable. Audience expands as new people sign up — authors should be aware the audience grows over time.

**Default:** `private` (changed from `public` in P424 — safer for new users and workshop participants).

**Global feed rule:** Only `public` stories appear in the discovery feed. Shared stories surface only on specific point pages and profiles, where RLS evaluates co-registration.

---

## Strategic Planning Concepts

### Workstream

> **One-liner:** A work stream containing related hypotheses, experiments, builds, and key results — like an album of related strategic work.

**Definition:** A Workstream is a thematically coherent collection of work testing a cluster of related hypotheses. Workstreams have timelines (0-24+ months), resource requirements, and priority levels.

**Five workstream categories:**

| Workstream | Focus | Time Horizon | Resource Needs |
|-------|-------|--------------|----------------|
| **C (Coaching)** | Workshop revenue, skill building | 0-6 months | Facilitation skills |
| **R (Recognition)** | Thought leadership, positioning | 3-12 months | Writing, technical depth |
| **E (Enhancement)** | Product improvements requiring validation | 3-9 months | Engineering, existing users |
| **X (Exploratory)** | Ideas requiring scale to test | 12-24 months | User base at scale (10K+) |
| **V (Vision)** | Far-future ideas requiring new capabilities | 24+ months | ML/AI, transcription, advanced tech |

**What a Workstream contains:**
- **tests:** Hypotheses being tested (e.g., `[h-stories]`)
- **builds:** Features being shipped (e.g., `[p126, p305]`)
- **measures:** Key Results being tracked (e.g., `[kr-story-usage]`)
- **answers:** Open questions being resolved

**Key distinction:** Workstreams are **work streams**, not achievements. See Milestone for observable achievements.

### Milestone

> **One-liner:** An observable achievement — something planned to happen or already achieved.

**Definition:** A Milestone is a specific event or achievement with a target date. Milestones can be planned (future) or achieved (past). The `status` field tracks whether it's planned, achieved, or missed.

**Examples:**
- "First essay published" (status: achieved, date: 2026-02-10)
- "First workshop delivered" (status: planned, date: 2026-02-28)
- "€5K monthly revenue achieved" (status: planned, date: TBD)

**What a Milestone contains:**
- **date:** When it happened or is planned (YYYY-MM-DD)
- **status:** planned / achieved / missed
- **workstream:** Which workstream it belongs to (C/R/E/X/V)
- **type:** launch / checkpoint / achievement
- **related_key_results:** Which key results this milestone represents

**Key distinction:** Milestones are **observable events** with dates and status, not ongoing goals. See Key Result for forward-looking measurable goals.

### Hypothesis

> **One-liner:** A testable belief about what will work — what we think is true and why.

**Definition:** A Hypothesis is a specific claim about how the world works, backed by rationale and evidence, that can be tested through experiments.

**What a Hypothesis contains:**
- **Statement:** The claim (e.g., "Stories solve the cold start problem")
- **Rationale:** Why we believe this
- **Assumptions:** What must be true for this to hold
- **Evidence:** Research or prior data supporting the hypothesis
- **Success criteria:** How we'll know if validated
- **Failure criteria:** Kill signals (when to abandon)

**Frontmatter fields:**
- **status:** active / validated / invalidated / paused
- **workstream:** Which workstream tests this (C/R/E/X/V)
- **tested_by:** Experiments testing this hypothesis
- **supports:** Key Results this hypothesis aims to achieve

**Key distinction:** Hypotheses are **beliefs to test**, not features to build. See Workstream for what gets built.

### Experiment

> **One-liner:** How we test a hypothesis — the protocol, measurements, and timeline.

**Definition:** An Experiment is a structured test with a protocol, sample size, measurements, and timeline designed to validate or invalidate a hypothesis.

**What an Experiment contains:**
- **Protocol:** How we test (step-by-step method)
- **Sample size:** How many participants
- **Measurements:** What we track (quantitative + qualitative)
- **Timeline:** Start date, end date, analysis period
- **Assumptions:** Experimental-level assumptions (e.g., "20 users sufficient to spot patterns")
- **Success threshold:** When to proceed
- **Kill threshold:** When to abandon

**Frontmatter fields:**
- **status:** planned / running / completed / aborted
- **tests:** Which hypotheses this experiment tests
- **measures:** Which key results this experiment tracks
- **start_date, end_date:** Timeline

**Key distinction:** Experiments are **how we test**, hypotheses are **what we believe**. See Hypothesis and Key Result.

### Key Result

> **One-liner:** What we're measuring — the SMART goal with target values and kill thresholds.

**Definition:** A Key Result is a measurable goal with specific success and failure criteria. Key Results are forward-looking (goals to achieve), tracking progress toward strategic outcomes.

**What a Key Result contains:**
- **SMART definition:** Specific, Measurable, Achievable, Relevant, Time-bound
- **Measurement method:** How we collect data
- **Target value:** What success looks like
- **Kill threshold:** When to abandon
- **Related key results:** Connected goals

**Frontmatter fields:**
- **status:** active / achieved / missed / deprecated
- **type:** leading (early signal) / lagging (final result)
- **workstream:** Which workstream this key result belongs to
- **measured_by:** Which experiments measure this

**Key distinction:** Key Results are **ongoing measurable goals**, milestones are **date-stamped events**. See Milestone.

### Distinction Table

| Concept | Nature | Tense | Example |
|---------|--------|-------|---------|
| **Workstream** | Work stream | Ongoing | C1: Stories + Live + Events |
| **Hypothesis** | Testable belief | Present | "Stories solve cold start problem" |
| **Experiment** | Testing protocol | Present/Future | "20-user pilot over 4 weeks" |
| **Key Result** | Measurable goal | Ongoing | "≥50% story creation rate" |
| **Milestone** | Observable achievement | Past/Future | "First essay published (achieved: 2026-02-10)" |

**Key relationships:**
- Workstreams **test** Hypotheses
- Hypotheses are **tested by** Experiments
- Experiments **measure** Key Results
- Key Results are **tracked by** Milestones (when date-specific)
- Workstreams **build** Features (from `/features/`)

**File locations:**
- Active workstreams: `/docs/milestones/` (c1, c2, r1, etc.)
- Future tracks: `/docs/workstreams/` (e1, x1, etc.)
- Hypotheses: `/docs/hypotheses.md` (all active bets in one file)
- Experiments + Key Results: tracked inline within each workstream file
- Achievements: `/docs/achievements/` (date-stamped events)

---

## Related Documents

- [lean-canvas.md](lean-canvas.md) — Business model and customer segments
- [milestones/](milestones/) — Active workstreams (c1, c2, r1, etc.)
- [workstreams/](workstreams/) — Future tracks (e1, x1, etc.)
- [hypotheses.md](hypotheses.md) — All active bets and their status
- [achievements/](achievements/) — Date-stamped achievements
- [philosophy.md](philosophy.md) — Epistemological foundations
