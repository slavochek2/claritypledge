# Definitions

> **Charter:** doc-routing rules live in [CHARTER.md](CHARTER.md) — one fact, one home; pointers everywhere else.

Core concepts of the Clarity Pledge platform. This is the product's conceptual foundation.

**Last Updated:** 2026-05-18

---

## Common Knowledge (Pinker)

> **One-liner:** Common knowledge is when both people know X, both know the other knows X, and both know the other knows they know — recursively.

**Formal definition (Steven Pinker, David Lewis, Michael Chwe):** A fact is common knowledge between two people when it is known to both, each knows the other knows, and each knows the other knows they know. This recursive structure is what distinguishes verified understanding from private belief.

**Why it matters for ClarityPledge:** Verified cognitive understanding produces *recursive cognitive understanding* — the state where each party knows the other knows what was meant. Without the explain-back protocol, what each person "understood" remains a private guess — recursive only in assumption, not in fact. A belief that hasn't reached recursive cognitive understanding can't be properly challenged, because neither party can confirm they're discussing the same thing. This is the logical foundation for why verification is a prerequisite for belief correction, not just a nice-to-have.

**The calibration problem:** People carry an implicit self-assessment of how well they understand others. Without verification, there is no error signal — the self-assessment defaults to "I understood." The ratio of perceived understanding to actual understanding stays unchallenged. The explain-back protocol is the only mechanism that provides this error signal in ordinary conversation.

**Relationship to stories/points:** Point st5 encodes this as a personal admission ("my estimates are unreliable" bundled with the illusion-of-understanding and Popper proportionality framing since P701, 2026-04-13). The calibration display on profiles is the quantitative version — measured gap between self-assessed and speaker-verified understanding.

*See also: [philosophy.md](philosophy.md), [theory-of-change.md](theory-of-change.md)*

---

## False Agreement

> **One-liner:** False Agreement is the state where two people believe they have aligned, but haven't verified it.

**The mechanism:** Both parties walk away from a conversation with miscalibrated confidence that understanding occurred. The gap is invisible until it becomes a conflict. By the time it surfaces, it's expensive — in co-founder relationships, this pattern is the root cause of most splits, not strategic disagreement.

**Distinction from disagreement:** False agreement is more dangerous than open disagreement. Two people who disagree openly can negotiate. Two people in false agreement act on misaligned assumptions until the gap surfaces — typically in high-stakes moments.

**Why it matters for ClarityPledge:** The explain-back protocol is specifically designed to surface false agreement before it becomes costly. A /live session replaces "I think we're aligned" with "I can demonstrate we're aligned."

**The anxiety mechanism (2026-04-02):** False agreement produces a quiet, chronic anxiety — two contradictory beliefs ("we understand each other" + "something feels off") with no way to check which is true. The contradiction stays pre-verbal because neither belief is articulated clearly enough to compare. The explain-back protocol forces articulation, which makes the contradiction visible. Contradictions you can't see produce anxiety; contradictions you CAN see become choices. This is consistent with approach-avoidance conflict research (Lewin/Miller), self-concept clarity findings (Campbell), and ACT's values clarification mechanism.

**The "carving" frame:** The protocol doesn't *remove* false agreements — it increases the resolution of what each person actually believes until contradictions become visible and separable. Every belief has something true in it. The work is excavation, not demolition. Participants carve out what's actually true from the tangle of what they assumed.

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
- **Visibility:** Private / Public (immutable after creation; "shared" cut in 2026-03-24 decision)
- **Extracted Points:** Falsifiable claims extracted from the story (AI-guided, author-approved)

**Relationship to Points (2026-03-19):** Stories are the primary entity. Points are always extracted from stories — never created standalone. Stories enter the comprehension protocol (understanding verified). Points enter the position protocol (agree/disagree). These are fundamentally different calibration loops: understanding someone's story ≠ agreeing with their point. The hypothesis "comprehension precedes calibration" — verified understanding of a story predictably moves positions on related points — is ClarityPledge's thesis applied at the content-type level. See H-StoryFirst.

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

## Clarity Partner Agreement

> **One-liner:** A bilateral commitment between two people with an existing relationship to practice calibrated communication — asking for paraphrase, and excusing yourself when you can't.

> **v-next decided (2026-05-31), pending P857 — not yet shipped:** the verified-understanding upgrade reframes this commitment as an honest *number* plus a *tested-by-explain-back* algorithm (the lower of the two honest numbers is what counts as verified). The text below still describes the **current, pre-v4** agreement. Do NOT rewrite this definition until P857 ships the versioned upgrade. See decisions.md 2026-05-31 [product].

**What it is:** A written agreement between two people who already have high-stakes ongoing interactions (co-founders, partners, couples). Each person commits to: (1) ask the other for a paraphrase when understanding matters, and (2) excuse themselves honestly when they can't paraphrase accurately. The agreement creates a shared norm — neither party is surprised when the other says "can you explain back what I just said?"

**What it is NOT:**
- Not a stranger-to-stranger networking tool. Field-tested (2026-03-29): agreements only work when both parties have existing relationship stakes. A stranger correctly asked "what's the value? We don't know each other."
- Not the Pledge. The agreement is bilateral and private (between two specific people). The Pledge is a public identity claim. The agreement is practice; the pledge is (aspirational) identity.
- Not a product feature (yet). Currently a facilitated artifact — Slava helps pairs create them. Product support (P581 letters as the async vehicle) is in development.

**Why it's the primary conversion action (2026-03-29):** The natural end-of-funnel for workshops, letters, and events. Participants experience a gap reveal → want to prevent this in their real relationship → Partner Agreement is the concrete next step. The Pledge is too abstract and carries social display risk ("what will people think?"). Positions on points are too lightweight. The agreement sits in the sweet spot: concrete, bilateral, private, actionable.

**Acquisition path:** Clarity Letter (P581, async gap reveal) → Partner Agreement (bilateral practice contract) → Practice (~10 partners, real asks/excuses) → Support group (P603) → Pledge (future: earned credential after demonstrated habit, P605).

**First agreement:** First co-founder pair (2026-03-22) — every 2 days, 15 min explain-back right. Usage not yet observed.

*See also: [decisions.md](decisions.md) — "Partner Agreement as primary conversion", [theory-of-change.md](theory-of-change.md), P603 (practice community), P605 (pledge as graduation)*

---

## Clarity Organization

> **One-liner:** A Clarity Organization is a team operating with verified mutual comprehension on foundational points, a shared canvas open to falsification, and a practice of surfacing disagreement before it festers.

**What it is:** A team — co-founders, working groups, eventually entire companies and institutions — where members have (a) verified mutual comprehension on the foundational stories and points the organization operates on, (b) signed individual Clarity Pledges, (c) maintained a shared Clarity Canvas open to internal and external challenge, and (d) installed a culture where disagreement is surfaced and resolved through the protocol rather than absorbed silently. Recurring alignment infrastructure, not a one-shot workshop outcome.

**What it is NOT:**
- Not a team that "agrees a lot." Internal disagreement is expected and welcome — the difference is that disagreements surface through the protocol instead of festering into hidden contracts.
- Not a one-event credential. A team isn't a Clarity Organization because they attended a workshop together. The status is sustained by ongoing verified comprehension cycles.
- Not the Clarity Practice Community. The Practice Community is the cross-organizational support network ([lean-canvas.md](lean-canvas.md) L217); a Clarity Organization is one specific team operating internally on the protocol.

**Relationship to other artifacts:**
- **Clarity Partner Agreements** (dyad-level) compose the relational fabric within the organization.
- **A shared Clarity Canvas** is the public artifact open to falsification.
- **Individual Pledges** signal each member's public identity commitment.
- **Full badging (9-of-9)** is the credential gate for recognized membership on the CP platform (per [lean-canvas.md](lean-canvas.md) L252).

**Why it matters for ClarityPledge:** The Clarity Organization is the *outcome unit* of the platform. ClarityPledge is the instrument; clarity organizations are what get built using it. Long-term framing: clarity organizations multiply — startups, then companies, then institutions, eventually civic structures.

**Positioning use (2026-05):** Workshop offers may use the framing "Make your company a clarity organization." The Clarity Process applied to your lean canvas is the entry point; the sustained practice is the destination.

*See also: [lean-canvas.md](lean-canvas.md) — "Long-term org model: Clarity Practice Community" (L217), "Clarity Organization membership" (L252); [operational-stack.md](operational-stack.md) — full badging output (L35); [theory-of-change.md](theory-of-change.md) — Clarity Practice Community (L72)*

---

## Clarity Canvas

> **One-liner:** A Clarity Canvas is a Clarity Doc rendered as a structured grid — Lean Canvas + 3 missing boxes, where each box contains challengeable stories and points.

**What it is:** A canvas-view of a Clarity Doc, not a new entity. Each canvas section (Problem, Solution, Channels, etc.) maps to stories tagged by section. Points extracted from those stories are the challengeable assumptions — visitors take positions to agree or disagree. The 3 boxes Lean Canvas doesn't have: **Disagreement Filing** (where positions diverge), **Ikigai Fit** (founder-idea alignment), and **Positive Externalities** (who else benefits beyond the customer).

**What it is NOT:** A static business model diagram. The canvas is alive — stories accumulate, positions shift, gaps surface. It's also not the user-facing product entry point. The canvas shows a *founder's business model* for transparency and challenge; the product (/live, Letters) gives *users* their own comprehension gap experience. These serve different audiences at different moments.

**Relationship to Docs and Letters:** A Clarity Canvas IS a Clarity Doc (tagged as `canvas`), rendered differently. A Clarity Letter can snapshot the canvas for comprehension assessment — "do you understand my assumptions before you challenge them?"

**URL:** TBD — likely `/canvas/:docId` or a canvas-view toggle on `/d/:docId`

*See also: [P611 spec](../features/p611_clarity_canvas_renderer.md), [decisions.md](decisions.md) — "Clarity Canvas = canvas-view of a clarity doc"*

---

## Clarity Doc

> **One-liner:** A Clarity Doc is a curated collection of stories — the compose/edit surface for Clarity Letters.

**What it is:** An author-owned collection of stories, organized sequentially. Each doc has a visibility (`public` or `private`) that constrains which stories it can contain. Stories accumulate in a doc over time — session by session, theme by theme.

**What it is NOT:** A shared document. No co-ownership, no co-editing. Each person owns their own doc with their own stories. The gap map emerges from letter exchanges between docs, not from editing one doc together.

**Relationship to Letters:** A doc is where content lives and grows. A Clarity Letter is a snapshot of a doc — "send this collection as a reading experience with assessment." One doc can produce many letters to different receivers. Editing happens in the doc; delivery happens through letters.

**URL:** `/d/:docId`

*See also: P551 spec, [decisions.md](decisions.md) — "Clarity Doc → Clarity Letter unified architecture"*

---

## Clarity Letter

> **One-liner:** A Clarity Letter is an immutable snapshot of a Clarity Doc, delivered as a reading experience with comprehension assessment.

**What it is:** A sealed reading experience. The sender curates stories in a doc, then sends them as a letter with per-story predictions ("How well will they understand this?"). The receiver reads stories one at a time, rates their understanding (sealed-bid — neither sees the other's number until both commit), and engages with extracted points. The gap between prediction and self-rating IS the product — it reveals miscalibration.

**Key properties:**
- **Immutable:** Content is frozen at send time via `story_versions`. The doc can keep changing; the letter preserves what was sent.
- **Sealed-bid:** Author prediction and receiver rating are committed independently — no anchoring.
- **Assessment is screening, not verification.** Both parties guessing high does NOT confirm understanding. A large gap means /live is probably needed. Frame as triage, never as proof. Verification happens in /live through paraphrase.

**The hell-yes moment:** On the understanding × agreement grid, a dot moves — from false consensus to genuine disagreement, or from noise to consensus — and both parties can SEE the arrow. That arrow is proof that a false belief was corrected through understanding, not persuasion.

*See also: P581 spec, [decisions.md](decisions.md) — "Clarity Doc → Clarity Letter unified architecture"*

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

## When the Protocol Applies

The protocol is the verification step. The question is not "is it useful here?" — it's "when can you skip it?"

**You can skip verification when:**
- (a) Your **listening calibration** is high *and* domain-validated — you have track record showing your reconstructions match what speakers meant, in this domain.
- (b) The **cost of misunderstanding is low** — being wrong is cheap (small talk, low-stakes coordination).

**Otherwise, skipping = assuming the illusion of recursive understanding isn't present without evidence.** That assumption is itself the failure mode the protocol names.

**Apparent non-uses that actually require verification (or proven calibration) to diagnose:**
- *Agreement problem* ("we just disagree") — only diagnosable cleanly after verifying you meant the same thing.
- *Knowledge gap* ("they just don't know X") — same. Mis-diagnosing illusion as knowledge gap leads to "explain more" instead of paraphrase.
- *Economic / contextual constraints* — these block action, not comprehension; verify first, then act on the constraint.

The calibration-gym frame ([lean-canvas.md](lean-canvas.md#unique-value-proposition)) is what earns the right to skip in specific domains. Without that track record, the four "non-use" categories collapse back into the protocol's scope — you can't be certain the illusion isn't present without either verifying or having validated calibration.

---

## Stories vs Points

| Type | Nature | User Action | Verification |
|------|--------|-------------|--------------|
| **Story** | Lived experience, the "why" behind a position | Can only be understood | /live explain-back (≥8/10 = verified) |
| **Point** | Logical claim, something debatable | Position on -3 to +3 scale | Position staking |

**The relationship (story-first, 2026-03-19):**
```
STORY: "I burned out commuting 2 hours daily"
   ↓ extraction (AI-guided, author-approved)
POINT: "Remote work is more productive"
   ↓ engagement
POSITION: "+2 (Agree) on this Point"
   ↓ optional comprehension assessment
ASSESSMENT: Reader self-assesses 7/10, Author counter-assesses 4/10
   → gap = 3 → possible miscalibration surfaced
```

- **Story → Point:** Points are extracted from stories. Every point has a parent story (traceable, not displayed on card).
- **Point → Story (response):** When responding to a point, users file a story (their reasoning), which may produce new extracted points.
- **Story → Story:** Stories connect through shared points. No direct story-to-story link needed.

**Key insight:** You don't verify Points (they're just claims). You verify understanding of the **Story behind someone's Position** on a Point. Stories enter the comprehension protocol. Points enter the position protocol. These are fundamentally different calibration loops.

**Comprehension Assessment (optional, 2026-03-19):**
A two-sided estimate of how well someone understood a story. Reader self-assesses (0-10), author counter-assesses (0-10). The gap surfaces potential miscalibration asynchronously — same "holy shit" moment as a facilitated session, without Slava present. Assessment happens from story/point cards, not only in /live. Optional: users can take positions without assessing, but unassessed positions are visibly "thin." See H-StoryFirst.

**Points become immutable once others engage.** The author can freely edit a Point's statement while they are the only position-holder. Once an external user stakes a position, the Point locks — changing it would invalidate their position. At that point, the Point belongs to the shared discourse, not the author.

To "correct" a locked Point: file a new Story → extract a corrected Point → stake a fresh position. The old Point stays in the discourse; other positions on it remain valid.

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

## Position Flip vs Interpretation Flip

> **One-liner:** A position flip is a genuine belief change after understanding; an interpretation flip is reinterpreting the statement to avoid changing your position.

**Position flip (desired):** Person agrees with an anti-point → reads the paired story → changes position to disagree. The false belief was genuinely held and genuinely abandoned through understanding. This is the mechanism ClarityPledge exists to produce.

**Interpretation flip (escape route):** Person reads the story → reinterprets the anti-point's wording to be compatible with the story → keeps their "agree" position while claiming they "already knew that." The belief survives by shapeshifting. The person hasn't changed — they've performed comprehension without position change.

**Design implication for anti-points:** Anti-points must be worded so precisely that interpretation flip has no room. Hedge words ("probably", "well enough"), secondary claims that distract from the core false belief, and use of ClarityPledge's own terminology (which the anti-point holder wouldn't use) all create escape routes. The anti-point should be in the natural language of someone who holds the belief, not in the language of someone who has already understood the counter-point.

**Quality test:** For each anti-point, run an adversarial simulation — devil's advocate tries to agree with the anti-point even after reading the story (interpretation flip). If the devil can sustain agreement through honest reinterpretation, the anti-point is too loose.

*See also: Anti-points v2 decision in [decisions.md](decisions.md)*

---

## Verification Outcome States

When understanding is verified (via /live paraphrase or Clarity Letter assessment), three outcomes are possible:

| State | What happened | How it shows on grid | How it shows in stories |
|-------|---------------|---------------------|----------------------|
| **Flip** | Understanding increased AND position changed. The prior position was based on misunderstanding. | Dot moves up (understanding ↑) AND left/right (agreement shifts) | Story explains what changed: "I thought you meant X, now I see you meant Y — I agree" |
| **Fork** | Understanding increased BUT position holds because both interpretations are valid. | Dot moves up only (understanding ↑, agreement stays) | Story reveals two frames: "Under your reading I'd agree, under mine I still disagree" |
| **Verified agreement/disagreement** | Understanding increased, position holds. Genuine alignment or genuine conflict confirmed. | Dot moves up only (understanding ↑, agreement stays) | Story confirms comprehension: "I understand what you mean. I still disagree because Z" |

**Key insight:** Fork and verified disagreement look identical on the grid (dot moves up, position holds). The distinction lives in the story content, not the grid. The grid triages (WHERE are the gaps?). Stories diagnose (WHAT kind of gap?). The facilitator names the pattern.

**The "clarity flip" is one outcome of verification, not the primary one.** Verification produces all three states. The product's value is the verification process itself — surfacing what's actually going on.

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

## Problem-Statement Clarity (When Clarity Is Achieved)

> **One-liner:** A problem statement has *enough* clarity when its author has verified understanding of the strongest counterarguments to it and it survived — where "enough" scales with the stakes.

**What it is:** Clarity of a problem statement is **tested-ness, not certainty.** It is never "having the right answer" (unreachable — fallibilism). Its author reaches it by exposing the problem statement to competent disagreement and the strongest available counterarguments, verifying understanding of them, and finding it still holds. The bar is **proportional to stakes**: the larger the downside/upside of getting the problem statement wrong, the stronger the counterarguments that must be met before clarity counts as achieved.

**Why it matters for ClarityPledge:** This is the stopping rule the practice trains — it tells a builder *when to stop seeking clarity and act* (counterargument strength met is proportional to stakes) and *when they haven't earned clarity yet* (intuition/agreement is not evidence). Distinct from the **Verification Threshold** (two-party comprehension score in a /live session): that measures whether one person understood another's story; this measures whether a person's own problem statement has survived challenge. The rarity of people who actually meet this bar — most have only themselves and an agreeable AI, no competent disagreers — is what makes competent challenge scarce. *(Any GTM/wedge framing of that scarcity lives in the strategy docs, not here — see [lean-canvas.md](lean-canvas.md) §Problem and [hypotheses.md](hypotheses.md) H-FounderWince.)*

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
| **Metacomprehension accuracy** | Correlation between predicted and actual comprehension (reading texts, not conversation) | Yang et al. (2023) meta-analysis: r=0.178 (non-intervention baseline; Prinz et al. 2020 reported r=0.24 mixing intervention/non-intervention) |
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

> **One-liner:** A badge is evidence of calibrated alignment — proof it happened, not a promise to try.

**What it is:** A Calibration Badge is auto-certified from /live free-mode sessions. It accumulates one clarity point at a time, out of 9 total. A point is certified when:
1. A certifier speaks on a story linked to a point tagged `#understanding`
2. Both the certifier and the story author rate the session **10/10**
3. The listener has filed `agree` or `strongly_agree` on that point

**Incremental structure:** The badge builds point-by-point. Profile displays the current count (e.g., 7/9). A full badge = all 9 clarity points verified. Partial progress is visible and meaningful — each certified point is independently earned.

**Fundamental distinction from the Clarity Pledge:**
- **Pledge** = a public commitment ("I intend to practice calibrated communication")
- **Badge** = evidence of alignment ("This was verified — it actually happened")

The badge cannot be committed to; it can only be earned. It replaces the old metric-based threshold (≥10 sessions + avgGap) which was never built and measured effort, not alignment.

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

## Founder (ICP)

**The individual founder as the single-person-funnel unit** — one person, reachable and convertible on their own, **with or without a co-founder** (partner-existence is a *parameter* of the unit, not a qualifier). Distinct from the **co-founder pair** treated as a unit (two people as one coordinating entity, which needs two-sided coordination to reach and convert). The distinction is *individual-unit vs pair-unit*, **not** *solo vs partnered*: a founder who has a co-founder still counts as the individual-founder ICP, because the behavior in question — whether you reveal the gaps in your own understanding — is intrapersonal and holds regardless of the partner (the community, not the co-founder, is the stress-test).

**Why it matters for ClarityPledge:** names the acquisition unit so "founder" cannot silently re-blur into the co-founder-pair target. *Which* unit is the current GTM focus is a strategy-doc question (see [lean-canvas.md](lean-canvas.md) §Customer Segments and [hypotheses.md](hypotheses.md) H-FounderWince), not a definitional one — this entry carries no market-status claim.

---

## Story Visibility Model

| Level | Who sees | Where it appears |
|-------|----------|-----------------|
| **Private** | Author only; visible within Clarity Docs and Clarity Letters where the story is included | Only in doc/letter context — never on profile, feed, or search |
| **Public** | Anyone, logged in or not | Global feed, profiles, point pages |

**"Shared" visibility was cut (2026-03-24).** It was imprecise (all event co-participants across all events), untested, and letters deliver scoped sharing better. Existing `shared` stories migrate to `public`. See [decisions.md](decisions.md) — "Privacy simplification."

**Visibility is immutable after creation.** Cannot change after creation — eliminates cascading edge cases. Want to "unpublish"? Delete the story. Want to "publish" private? Create a new public copy. No UI for visibility change.

**Stories must match doc visibility.** Private doc = only private stories. Public doc = only public stories. Stories created inside a private doc get `visibility: 'private'` automatically.

**Default:** `private` (changed from `public` in P424 — safer for new users and workshop participants).

**Global feed rule:** Only `public` stories appear in the discovery feed.

---

## Strategic Planning Concepts

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
| **Hypothesis** | Testable belief | Present | "Stories solve cold start problem" |
| **Experiment** | Testing protocol | Present/Future | "20-user pilot over 4 weeks" |
| **Key Result** | Measurable goal | Ongoing | "≥50% story creation rate" |

**Key relationships:**
- Hypotheses are **tested by** Experiments
- Experiments **measure** Key Results
- Features (from `/features/`) implement experiments

**File locations:**
- Hypotheses: `/docs/hypotheses.md` (single source of truth for all active bets)
- Achievements: `/docs/achievements/` (date-stamped events)

---

## Related Documents

- [lean-canvas.md](lean-canvas.md) — Business strategy, customer segments, coaching price ladder
- [hypotheses.md](hypotheses.md) — All active bets and their status
- [achievements/](achievements/) — Date-stamped achievements
- [philosophy.md](philosophy.md) — Epistemological foundations
