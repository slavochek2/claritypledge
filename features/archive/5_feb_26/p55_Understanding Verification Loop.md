---
status: all-done
type: comment
tags: []
rank: 125405
created_date: 2026-01-11T00:00:00.000Z
---

> **Archived 2026-01-18:** Key concepts extracted to:
> - [hypotheses.md](../docs/hypotheses.md) — Four States of Agreement, A1-A7 assumptions
> - [lean-canvas.md](../docs/lean-canvas.md) — Layer 1-2-3 model, "calibration is per-idea"
>
> The core /live verification concept remains valid. Events-first strategy is documented in [DECISIONS.md](../docs/DECISIONS.md).

---

# P55: Understanding Verification Loop

**Status:** Archived (concepts extracted)
**Priority:** High (addresses cold-start problem)
**Est. Effort:** TBD (phased approach)
**Created:** 2026-01-11
**Revised:** 2026-01-11 (crystallized after strategy session)
**Origin:** Innovation strategy session — response to friend's skepticism about 1-on-1 cold start adoption

> **Note (2026-01-17):** The core /live verification concept remains valid. However, we've returned to "Vision A" (Events-first) rather than "Vision B" (ambient listener). Events are the growth engine — organizers bring users. The "ambient AI listening" concept is future scope, not MVP. See [DECISIONS.md](../docs/DECISIONS.md) and [hypotheses.md](../docs/hypotheses.md).

---

## Executive Summary

This feature represents a strategic pivot from "Vision A" (event-first, permission-based adoption) to "Vision B" (ambient listener with intelligent prompting).

**The Core Insight:** People won't remember to invoke verification tools. The app should be ambient — listening, surfacing ideas worth checking, and prompting participants to verify understanding.

**The Crystallized Simplification:**

The app is NOT about finding "cruxes" (beliefs that would change minds). It's about **understanding verification** — checking whether people actually understand each other's positions before assuming they agree or disagree.

**The Core Loop:**
```
Idea surfaces → Both stake positions → Verify understanding → Gap revealed (or not)
```

---

## The Problem We're Solving

### The Strategic Pivot

**Vision A (what we believed):**
```
Events create permission → Pairs form → Pairs use tool in future 1-on-1s
```

**The flaw:** This requires people to:
- Remember they have permission
- Recognize the moment to invoke the tool
- Choose to interrupt the conversation flow
- Actually open the app

Each step has friction. The chain breaks.

**Vision B (what we now believe):**
```
App runs during conversation → Ideas surface → Positions staked →
Understanding verified → Gaps revealed → Learning loop
```

**The shift:** The app is ambient. Users don't invoke — they respond to prompts.

### The Trigger Problem

From the strategy session:

> "Permission alone isn't enough. You also need a trigger."
>
> Without triggers, permission decays. People forget they have it.

Vision B solves this: **The AI becomes the trigger** (eventually). But MVP can work with manual idea seeding.

---

## Key Conceptual Distinction: Understanding vs. Crux

During the strategy session, we clarified a critical distinction:

### What Is a "Double Crux"?

A double crux is a belief that, if changed, would change BOTH parties' positions on a disagreement.

Example:
- Alice: "We should ship Friday"
- Bob: "We should ship next month"
- **Double crux:** "Is the code stable enough?" — if resolved, both might change position.

### What Is "Understanding Verification"?

Understanding verification checks: **Do you actually know what they believe?**

Most disagreements aren't about cruxes — they're about **false disagreement**:
- People THINK they disagree
- But they're using words differently, or making different assumptions
- They don't actually understand each other's position

### The Critical Insight

> **Understanding comes BEFORE crux. You can't find the crux if you don't understand the other person's position.**

```
LAYER 1: UNDERSTANDING
────────────────────────
Do you actually know what they believe?
(Most people fail here — illusion of transparency)

     ↓ if verified

LAYER 2: AGREEMENT CHECK
────────────────────────
Do you agree or disagree with what they ACTUALLY believe?
(Not what you assumed they believed)

     ↓ if genuine disagreement

LAYER 3: CRUX (optional, advanced)
─────────────────────────────────
What belief, if changed, would change both positions?
(Requires skill, may not exist, not our focus)
```

**This app operates at Layer 1 and 2. Layer 3 is a bonus, not the core.**

---

## The Four States of Agreement

The real value is in detecting **false states**:

| State | What It Means | Value of Detection |
|-------|---------------|-------------------|
| **False Disagreement** | Positions differ, but it's a misunderstanding | **HIGH** — verification resolves it |
| **False Agreement** | Positions match, but they mean different things | **HIGH** — verification reveals hidden gap |
| **True Disagreement** | Positions differ AND they understand each other | Medium — at least it's clear |
| **True Agreement** | Positions match AND they mean the same thing | Low — nothing to do |

**The AI's eventual job is to predict FALSE states:**

> "You both said 'agree' but I think you mean different things. Want to check?"

---

## The Core Loop (Simplified)

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. IDEA SURFACES                                                   │
│     - Pre-seeded by user (before meeting)                           │
│     - Live-seeded by either participant (during meeting)            │
│     - AI-detected from transcript (future automation)               │
│                                                                     │
│  2. BOTH STAKE POSITIONS                                            │
│     "What's your position on this idea?"                            │
│     [Agree]  [Disagree]  [Not Sure]  [Skip]                        │
│                                                                     │
│  3. DIVERGENCE OR SUSPICION                                         │
│     Trigger verification if:                                        │
│     - Positions differ (apparent disagreement)                      │
│     - OR AI suspects false agreement (future)                       │
│     - OR user requests verification                                 │
│                                                                     │
│  4. VERIFY UNDERSTANDING                                            │
│     "Can you explain THEIR position on this?"                       │
│     → Other person rates accuracy (0-10)                            │
│     → Gap revealed or understanding confirmed                       │
│                                                                     │
│  5. OUTCOME                                                         │
│     - Gap found → "Ah, I misunderstood" (false disagreement fixed)  │
│     - No gap → "We genuinely disagree, and now we KNOW"            │
│     Both outcomes are valuable. Both clear the fog.                 │
│                                                                     │
│  6. FEEDBACK LOOP                                                   │
│     "Was this worth checking?" [Yes] [No]                          │
│     → Trains AI on what ideas matter                                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Idea Sources (MVP supports all three)

| Source | When | Friction | MVP? |
|--------|------|----------|------|
| **Pre-seeded** | Before meeting starts | Lowest (prepared) | Yes |
| **Live-seeded** | During meeting, by either participant | Low (intentional) | Yes |
| **AI-detected** | Extracted from transcript | Lowest (passive) | Later |

**For MVP:** Support pre-seeded and live-seeded. AI detection is the automation layer added after validating the core loop.

---

## What About Calibrated People?

> "What happens to people that are calibrated? Is this a one-time use app?"

**Calibration is per-idea, not per-relationship.**

You might be well-calibrated with your co-founder on product strategy. But on a NEW idea ("Should we pivot to enterprise?"), you're back to zero. You need to verify again.

The app is used **per idea**, not per person. Every new idea is a new calibration opportunity.

---

## Hierarchy of Assumptions

| # | Assumption | Risk Level | How to Test |
|---|------------|------------|-------------|
| **A1** | People will seed ideas (pre or live) | Low | Already doing this manually in workshops |
| **A2** | People will stake positions when prompted | Medium | Simple UI test — 3 buttons |
| **A3** | When positions differ, people will explain other's view | Medium | Will they type/speak explanation? |
| **A4** | Rating the explanation reveals useful gaps | Low | 0-10 slider is simple |
| **A5** | This feels valuable, not annoying | **Critical** | Feedback capture + observation |
| **A6** | AI can extract ideas worth staking | Medium | LLM prompt engineering |
| **A7** | AI can predict FALSE agreement/disagreement | Hard | Needs training data from A1-A5 |

**MVP validates A1 → A5 (the human loop).**

**A6 → A7 are automation/intelligence layers added after the loop is validated.**

---

## MVP Scope

### Phase 1: Core Loop (No AI Required)

- [ ] **Idea seeding UI** — User can add idea before or during meeting
- [ ] **Position staking UI** — Both participants see idea, tap agree/disagree/unsure/skip
- [ ] **Divergence detection** — System detects when positions differ
- [ ] **Verification prompt** — "Explain their position on this"
- [ ] **Explanation capture** — Text input (voice later)
- [ ] **Accuracy rating** — Original speaker rates 0-10
- [ ] **Feedback capture** — "Was this worth checking?" yes/no

### Phase 2: Async + Polish

- [ ] **Post-conversation prompts** — If not completed live, prompt async
- [ ] **Gap visualization** — "You got 7/10 — here's what you missed"
- [ ] **Notifications** — Remind to complete pending verifications

### Phase 3: AI Automation

- [ ] **Idea extraction from transcript** — LLM identifies stakeable claims
- [ ] **Smart prompting** — AI suggests when to verify (not just on divergence)
- [ ] **False state prediction** — "You both agreed, but I suspect you mean different things"

### Out of Scope (Future)

- Idea evolution tracking (ideas refine through verification)
- Topology visualization (who understands whom on what)
- Network-aware matching (P52)
- Fine-tuned models

---

## User Experience

### Seed an Idea (Pre or Live)

```
┌────────────────────────────────────────────────────────────────┐
│  Add an idea to check understanding                            │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ "Remote work is more productive for knowledge workers"  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  [Add Idea]                                                    │
│                                                                │
│  ─────────────────────────────────────────────────────────────│
│  Ideas in this session:                                        │
│  • "We should ship by Friday" — positions: ✓ vs ✗ (divergent) │
│  • "Users want feature X" — positions: ? vs ? (pending)       │
└────────────────────────────────────────────────────────────────┘
```

### Stake Position

```
┌────────────────────────────────────────────────────────────────┐
│  💡 New idea to check                                          │
│                                                                │
│  "Remote work is more productive for knowledge workers"        │
│   — added by Slava                                             │
│                                                                │
│  What's your position?                                         │
│                                                                │
│  [Agree]   [Disagree]   [Not Sure]   [Skip]                   │
└────────────────────────────────────────────────────────────────┘
```

### Positions Diverge

```
┌────────────────────────────────────────────────────────────────┐
│  ⚡ You and Slava have different positions                     │
│                                                                │
│  "Remote work is more productive for knowledge workers"        │
│                                                                │
│  Slava: Agree                                                  │
│  You: Disagree                                                 │
│                                                                │
│  Before debating — do you understand WHY Slava believes this?  │
│                                                                │
│  [Explain Slava's View]   [Skip for Now]                      │
└────────────────────────────────────────────────────────────────┘
```

### Explain Their Position

```
┌────────────────────────────────────────────────────────────────┐
│  Explain why Slava believes:                                   │
│  "Remote work is more productive for knowledge workers"        │
│                                                                │
│  In your own words, what's their reasoning?                    │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ He thinks removing commute and office distractions       │  │
│  │ allows for deeper focus and more output.                 │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  [Submit]                                                      │
└────────────────────────────────────────────────────────────────┘
```

### Speaker Rates Accuracy

```
┌────────────────────────────────────────────────────────────────┐
│  Partner explained your position:                              │
│                                                                │
│  "He thinks removing commute and office distractions           │
│  allows for deeper focus and more output."                     │
│                                                                │
│  How well did they capture your view?                          │
│                                                                │
│  [0]─────────────[5]─────────────[10]                         │
│   Missed it              Got it perfectly                      │
│                                                                │
│  Optional: What did they miss?                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ They missed that async communication is the key point,  │  │
│  │ not just fewer distractions.                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  [Submit Rating]                                               │
└────────────────────────────────────────────────────────────────┘
```

### Gap Revealed

```
┌────────────────────────────────────────────────────────────────┐
│  Understanding Gap Found                                       │
│                                                                │
│  Your explanation: 6/10                                        │
│                                                                │
│  Slava's feedback:                                             │
│  "They missed that async communication is the key point,       │
│  not just fewer distractions."                                 │
│                                                                │
│  ───────────────────────────────────────────────────────────── │
│                                                                │
│  This is valuable! You now understand their ACTUAL position.   │
│  Your disagreement might look different now.                   │
│                                                                │
│  [Got It]   [Discuss Further]                                  │
└────────────────────────────────────────────────────────────────┘
```

### Feedback

```
┌────────────────────────────────────────────────────────────────┐
│  Was checking this idea worth it?                              │
│                                                                │
│  [Yes, helpful]   [No, waste of time]                         │
│                                                                │
│  Your feedback helps us improve.                               │
└────────────────────────────────────────────────────────────────┘
```

---

## Technical Implementation

### Data Model

```sql
-- Rename from 'cruxes' to 'ideas' (clearer terminology)
ideas (
  id uuid primary key,
  session_id uuid references sessions,
  content text,              -- The idea/claim
  source_user_id uuid,       -- Who added it
  source_type text,          -- 'pre_seeded' | 'live_seeded' | 'ai_extracted'
  created_at timestamp
)

positions (
  id uuid primary key,
  idea_id uuid references ideas,
  user_id uuid references profiles,
  position text,             -- 'agree' | 'disagree' | 'unsure' | 'skip'
  created_at timestamp
)

verifications (
  id uuid primary key,
  idea_id uuid references ideas,
  explainer_id uuid,         -- Who explained
  target_id uuid,            -- Whose position was explained
  explanation text,          -- The explain-back attempt
  accuracy_rating int,       -- 0-10 from target
  target_feedback text,      -- What was missed (optional)
  worth_checking boolean,    -- Feedback: was this useful?
  created_at timestamp
)
```

### MVP Implementation Path

1. **Add idea seeding to /live** — Text input, store in `ideas` table
2. **Add position staking UI** — Show ideas, collect positions
3. **Detect divergence** — Query positions, trigger verification flow
4. **Verification flow** — Explain-back UI, rating UI
5. **Feedback capture** — "Worth checking?" after each verification

---

## Validation Strategy

### Before Building: Wizard of Oz Test

1. Run 3-5 real conversations using current /live
2. **Manually** pause and introduce ideas: "Here's something to check: [X]"
3. **Manually** ask each person their position
4. **Manually** ask the disagree-er to explain the other's view
5. **Manually** ask the speaker to rate accuracy
6. Observe: Does the loop complete? Do they find it valuable?

**Decision point:** If <30% complete the loop → Revisit approach

### MVP Metrics

| Metric | Target | What It Tests |
|--------|--------|---------------|
| Ideas seeded per session | ≥1 | A1: Will people seed ideas? |
| Position stake rate | >80% | A2: Will they stake positions? |
| Verification start rate | >50% when divergent | A3: Will they try to explain? |
| Verification complete rate | >70% of started | A4: Will they finish? |
| "Worth it" positive rate | >50% | A5: Does it feel valuable? |

---

## Why This Works

### Compared to Vision A (Events First)

| Friction Point | Vision A | Vision B |
|----------------|----------|----------|
| "When do I invoke the tool?" | User decides | Ideas are already there, just stake |
| "What do we verify?" | User must think of it | Ideas are seeded/suggested |
| "Is this awkward?" | Requires prior ritual | Lightweight — just tap a button |
| "Do I have to do it now?" | Synchronous ritual | Can complete async |

### The Ambient Future

Once MVP validates the loop, AI automation removes even the seeding step:
- AI extracts ideas from conversation
- AI predicts false agreement/disagreement
- Users just respond to prompts

But that's Phase 3. **MVP proves the loop works with human-seeded ideas first.**

---

## Open Questions

1. **Timing:** Stake positions during conversation or after?
   - Risk: During = interrupts flow
   - Risk: After = people forget/don't care

2. **Bidirectional:** Should BOTH parties explain each other's view, or just one?
   - More complete = both
   - Less friction = just the one who disagrees

3. **Skip threshold:** How many skips before we stop prompting on an idea?
   - Need to learn from data

4. **Multi-party:** How does this work with 3+ people?
   - All stake independently?
   - Pair off for verification?

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-11 | Pivot from Vision A to Vision B | Friend's skepticism revealed trigger problem |
| 2026-01-11 | Understanding before crux | Crux requires understanding first; crux is Layer 3, understanding is Layer 1-2 |
| 2026-01-11 | MVP = human seeding, not AI | Validate the loop before automating it |
| 2026-01-11 | Focus on FALSE states | False agreement/disagreement is where value lives |
| 2026-01-11 | Same mechanism everywhere | Events and 1-on-1s use identical flow |
| 2026-01-11 | Rename "crux" → "idea" | Clearer terminology, less jargon |

---

## Appendix A: The Thinking Process

This spec emerged from a strategy session that went through several iterations:

### Iteration 1: Event-First (Vision A)
**Belief:** Events create permission, pairs continue in 1-on-1s.
**Problem identified:** People won't remember to use the tool in cold contexts.

### Iteration 2: Ambient AI Listener (Vision B)
**Belief:** AI listens, detects cruxes, prompts verification.
**Problem identified:** "Crux" is the wrong concept — it assumes understanding already exists.

### Iteration 3: Understanding Verification (Crystallized)
**Insight:** Understanding comes before crux. The app should verify understanding, not find cruxes.
**Insight:** False agreement/disagreement is where the value is.
**Insight:** MVP doesn't need AI — human seeding validates the core loop.

### What We Preserved from Theory of Change

- Understanding gaps are invisible and costly ✓
- Verification creates certified understanding ✓
- Network topology enables common knowledge (future) ✓
- √N scaling through verified bridges (future) ✓

Vision B is a better **delivery mechanism** for the same core theory.

---

## Appendix B: Relationship to Existing Features

| Feature | Relationship to P55 |
|---------|---------------------|
| /live transcription (worktree 4) | Input for future AI extraction |
| Check/Prove flow | P55 replaces this with idea-centric verification |
| P41 AI Coaching | Could evolve to suggest ideas worth checking |
| P52 Network Matching | Needs position data that P55 generates |
| Clarity Pledge | Opt-in signal; pledgers more likely to use P55 |

---

## Related Documents

- [v0 Theory of Change](../docs/visions/v0_theory-of-change.md) — Core theory this implements
- [P52: Network-Aware Matching](./p52_network_aware_matching.md) — Future evolution (needs P55 data)
- [P41: AI Coaching Teaser](./p41_coaching_teaser.md) — Parallel demand validation
- [The Clarity Tax (manifesto)](../../../src/app/content/full-article.md) — Understanding Gap concept
- [R54: Live Page Refactor](../../done/3_2_jan26/r54_clarity_live_page_refactor.md) — Technical foundation
