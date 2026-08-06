# The Story / Point Model

> **Charter:** this file is the single home for the **story/point model** — the definitional frame, the axes, the unit of analysis, point types, edge cases, and the current operational model. Dated *decisions* about it (why, alternatives, falsifiers) live in [decisions.md](decisions.md); the glossary ([definitions.md](definitions.md)) and the sifter/`/align` skills carry a one-line pointer here, never their own copy.

**Who reads this:** any skill or agent that reasons about stories and points — `/align`, `/slava:content:sifter-story`, `/slava:content:sifter-point`, and any future consumer. They need the *whole* thing (definition **plus** the edge cases and the reasoning that fixes the boundaries), which is why it lives here as one document rather than as a stripped glossary entry.

**Which consumers actually read it, and where they deliberately diverge:** [story-point-model-consumers.md](story-point-model-consumers.md) (maintenance sidecar — you do not need it to *apply* the model).

**Epistemic status is marked per section.** The **definitional frame** (what a Story / Point *is*) is stable. The **operational model** (§"Operational model") is the current best hypothesis and is labeled **UNTESTED** — it will change as evidence arrives. Do not treat the operational parts as settled.

---

## The one-sentence frame

A **Point** is something you take a *position* on (agree / disagree). A **Story** is something you can only *comprehend* (understand, or fail to). Comprehension and agreement are **separate loops over the same linked pair** — you can fully comprehend someone's story, restate the claim they hold accurately, and *still* disagree with it. Confusing the two loops is the failure the whole product exists to fix.

### Vocabulary note — "position"

Capital-P **Position** means exactly one thing in this project: the **−3 … +3 scale value** a person stakes on a Point (`point_positions.position`; `POSITION_LABELS` in `src/app/types/index.ts`). It is **not** an entity, and it is not a Point-plus-Story composite.

Lowercase "someone's position" in prose is ordinary English shorthand for *the claim they hold plus the why behind it*. That is a manner of speaking, not a third entity in the model. When a statement carries both a claim and its why, the model's word for that is **fused** — see the two axes below.

---

## Unit of analysis (stable)

The axes score a **unit**, and the unit is:

> **One conversational move**, in context, at the granularity at which **a response is owed at all**.

Not a sentence (a sentence fragment scores as a false positive) and not a whole speaking turn (a turn usually bundles several moves). The unit is deliberately blind to *which kind* of response is owed — that is the axes' output, not the unit's input. Deciding the unit by the kind of response would require the score in order to find the thing being scored.

**Two passes, in this order:**

1. **Score the received unit.** A fused move — one that owes both a position on a claim and an estimate of comprehension — is still **one** unit, and it scores high on both axes.
2. **A both-axes-high score is the decompose trigger.** Decomposition then yields the **scored atoms**: one purest Point, one purest Story.

Unit of analysis is what you *receive*; scored atom is what survives decomposition. Do not decompose before scoring — a high-Point/low-Story move needs no split, and splitting it manufactures a phantom story atom for a neutral claim.

---

## Core definitions (stable)

### Story
First-person, experiential, indexed to a life. It is the *why* behind a claim — lived reasoning, context, feeling. A Story can only be **understood**; it is not something to agree or disagree with. "Does this capture MY experience?" is its only test, and only its author can answer.

A Story contains: the **text** (the narrative), an **author**, a **visibility** (product-level: private / public — the `shared` value still permitted by the DB CHECK constraint was cut by the 2026-03-24 decision; see [definitions.md](definitions.md) §Story), and any **linked Points** (falsifiable claims drawn from it, author-approved).

**Recount vs reveal.** First-person and experiential are **necessary, not sufficient**. A narrative that only recounts *what happened* — sequence of events, no why — is **low on story-ness** despite being first-person, because story-ness comes from the why being present. The why is the only thing a reader can fail to grasp; a bare chronology offers nothing to comprehend beyond the facts it states. (This narrows the story-ness definition below: "first-person and experiential" is the entry condition, "the why is present" is what raises the score.)

### Point
Impersonal (or a declared personal standard) and **falsifiable** — a claim the world could contradict. A Point affords a *position*: out of a room of people, some will agree and some will bristle. Its test is "Is this true / does this hold?", answerable in principle by anyone, not only its author.

### How Stories and Points relate — **linked, not parent-child**

Every point *has* a why behind it — the reasoning some person holds it for. That why may or may not be recorded.

What does **not** follow, and was wrongly stated here until 2026-08-06:

- **Points are not required to have a stored parent story.** The `points` table carries no story FK; `story_points` is an optional many-to-many junction (`supabase/migrations/20260204_stories_points_calibration.sql`). A standalone point is a valid product object. (`decisions.md` 2026-03-26 [product] rejected P564 on exactly this ground: "Points are first-class entities. Stories enrich them but aren't required.")
- **Elicitation is not required to run story-first.** `/align` runs **point-first** by design — the staked claim is what's visible, and the why is recovered afterwards. The sifters run story-first. Both are legitimate.

**Which elicitation direction yields better points is UNTESTED.** *Falsifier: run both directions on the same source material and compare the resulting points against the agreement test and the stranger test; if point-first consistently produces thinner or less falsifiable points, story-first should become the default and this note should say so.*

### Anti-point (pointer)

The anti-point already lives in three homes that have **diverged on four axes** — tabulated at `decisions.md` 2026-07-29 [process], filed as a known defect and deliberately not fixed. **Do not restate it here or anywhere else**; that entry's ruling is that any new mention must be a pointer, otherwise the split manufactures a fourth home. Route to the home that actually holds what you need:

| What you need | Where it is |
|---|---|
| Interpretation-flip escape route, wording constraints, adversarial seal test | [definitions.md](definitions.md) §"Position Flip vs Interpretation Flip" (canonical) |
| Construction recipe, derivation direction, optimization target | `decisions.md` 2026-06-02 [product] "Inverse Clarity Letter" · `.claude/commands/slava/content/create-letter-from-transcript.md` |
| Which home diverges from which, and how | `decisions.md` 2026-07-29 [process] |

`definitions.md` does **not** carry the construction recipe — do not go looking for it there and do not reconstruct it when you fail to find it.

What is model-layer and belongs here: an anti-point's **function is to expose an inconsistency**. Someone who agrees with the point *and* agrees with the anti-point holds a contradiction — and the story is what resolves it. That is why the pair is constructed together rather than the anti-point being generated as an afterthought.

### What "verify" means here
You do **not** verify a Point — a Point is just a claim; you take a position on it. You verify **comprehension of the Story behind the claim**. In practice: a two-sided estimate (reader self-assesses 0–10, author counter-assesses 0–10); the **gap** surfaces miscalibration. The operative rule elsewhere in the product is the **min-gate** — understanding counts as verified only when `min(reader_estimate, author_estimate)` clears the bar (≥8/10) — because the reader cannot self-certify comprehension the author doesn't confirm.

---

## When the model applies — the counterparty condition (UNTESTED)

The story/point apparatus is a **two-party comprehension act**: a story exists to be *understood by someone*, and the min-gate is a two-sided rating. So it earns its cost only when there is a **counterparty whose comprehension matters** — a partner, a peer, a hire, a customer, or a *future* recipient the corpus is being built for. That someone is not incidental; it is in the definition ("verify understanding of the story behind **someone's** claim").

Corollary for the alignment tools (`/align` especially) — but note the **two-layer refinement** (decisions.md 2026-07-14 [product] "scope refinement"): **(1) detection + decomposition** (surface the decision, make point/story/anti-point legible) has **standalone solo value** as a self-awareness log — no counterparty required; **(2) comprehension verification** (the min-gate, two-sided rating) is what genuinely **needs a counterparty** (a self-rating can't self-certify). So a high-stakes **state you are only waiting on** with no align-target still isn't a *verification* case — but it can still be run solo for layer 1. What the counterparty condition strictly gates is layer 2, not the whole tool. *Falsifier: if solo layer-1 runs yield no durable value, the standalone-solo claim is overclaimed and the tool is counterparty-only after all.*

## The two axes (stable framing; scoring is operational)

**Scope.** The axes index what a move *asserts* — content offered for a response. They do not index what the move *does* (asking, ordering, resigning). That is why the fourth cell below is a routing exit, not a verdict.

Story-ness and Point-ness are **two independent axes, not two poles of one scale.** A single move can be:

- **high Point-ness, low Story-ness** — a neutral falsifiable claim → take a position, little to comprehend.
- **high Story-ness, low Point-ness** — a raw experience-avowal → comprehend, nothing to agree with.
- **high on both** — a *fused* move → **decompose** (see edge cases), don't slide along one axis.
- **low on both** — **not a verdict; an exit.** Either **phatic** ("Hi.") → ignore, **or** a **control move** — a question, a request, a declaration ("I resign") → **route it, do not score it**, and decompose its content separately if it carries a decision. An agent that reads this cell as "ignore" will silently drop the highest-stakes utterance in the room.

Then:

- **Point-ness** = the degree to which the right response is *taking a position*. Its underlying properties are **impersonality** (the truth is independent of who's speaking) and **falsifiability** (there is a shared arbiter that could adjudicate the claim — see the two senses of "arbiter" below).
- **Story-ness** = the degree to which the right response is *estimating comprehension*. It is first-person, experiential, and **resists falsification** — there is no external arbiter for "what it was like to be me." First-person alone does not raise it; see **recount vs reveal**.

**Why high-on-both exists at all.** It is a **bundling artifact**, not a paradoxical midpoint on a single scale. A move scoring high on both contains one of each, welded — which is exactly why the operation is *decompose* and not *pick a side*.

---

## Point types (stable)

A Point comes in two falsifiable forms — **do not silently convert one into the other**:

| Type | Voice | It claims… | Falsified by… |
|------|-------|-----------|---------------|
| **Mechanism** | Third-person / impersonal | how something works for anyone ("When you paraphrase, you reveal gaps you didn't know you had — translation forces implicit assumptions explicit") | evidence that the mechanism doesn't hold |
| **Stance** | First-person standard ("I do / won't / require…") | the narrator's own criterion or rule ("I treat every agreement as a test: can you explain back what you're signing?") | observing whether the person actually holds the line |

A Mechanism point in first-person weakens to opinion; a Stance point in third-person loses its authority. Both are falsifiable, both are valid.

### The agreement test (what disqualifies a "point")
A real Point divides people. Two failure modes:
- **Everyone agrees** ("Communication matters") → not a point, a truism. Nothing to stake.
- **Only the author can agree** ("I felt betrayed") → still a Story, not a point.

### Exception — the **fact point**

The letter pipeline ships one deliberately (`.claude/commands/slava/content/create-letter-from-transcript.md`): a neutral, third-person, event-level record of what happened between named parties, staked at `+3`.

It is legitimate **because it is checkable against a shared record** — not because it is unarguable. Its function is establishing common ground.

**How it squares with the definition of a Point.** It satisfies the *falsifiability* criterion (contestable against a record) but not the *divides-people* criterion at §Point. The `+3` therefore records **assent to the record**, not a stake in a dispute — which is why a fact point stakes nothing even while occupying a `position` value.

**The agreement test still disqualifies every general claim everyone nods at**, and the exception does not widen in the other direction either. Both conditions must hold:

1. The other party could contest it **by pointing at what actually happened**. If there is nothing to point at, it is a truism — "Communication matters" fails here and stays disqualified.
2. It contains **no evaluative characterization of either party** — neutral, third-person, event-level. "He repeatedly failed to respond to the equity question" satisfies (1) and fails (2): it is an accusation, not common ground, and must not enter the pipeline as a fact point.

A fact point is also a pure recount, so its story-ness is ~zero by design.

---

## Comprehension vocabulary (stable)

The word "understand" hides three different things. Keeping them separate is the whole point of the comprehension axis.

- **Cognitive understanding** — knowing *how* someone arrived at their claim: their reasoning, experiences, and feelings *as data*. **Testable** — ask them to confirm your paraphrase. This is what the protocol verifies.
- **Emotional understanding** — *feeling* what someone feels. Not requestable on command, no verification procedure. Either happens or it doesn't. Not what the protocol measures.
- **Agreement** — accepting that someone is *right*. Compatible with cognitive understanding: a person can reproduce your reasoning accurately and still disagree.
- **"Understand" as a false-unity word** — one word covering all three above. When someone says "you don't understand me," they could mean any of them; without specifying which, neither party knows what's missing. Story-ness lives on the **cognitive-understanding** axis; Point-ness lives on the **agreement** axis; emotional understanding is out of scope.

---

## Edge cases that fix the boundaries

These are the cases that *define* the model by showing where the lines actually fall. The reasoning matters as much as the verdict.

- **"God exists."** Debatable and ownerless — yet **not falsifiable** (no shared arbiter could settle it). Verdict: Point-ness is **not** the same as objectivity. What makes something a Point is *falsifiability + affording a position*, not "being about the objective world." An ownerless, debatable, unfalsifiable claim sits lower on Point-ness than it first appears. (Same family as moral-landscape claims: feels like a fact-question, lacks the arbiter.)

- **"I felt betrayed when the round closed."** Pure Story-ness, ~zero Point-ness. Verdict: **comprehend, do not agree.** Responding with a position ("you shouldn't have felt that") is a category error — there is nothing to falsify in an experience-avowal.

- **"We each thought 'aligned' meant something different, the company died, and that's a law."** High on **both** axes — a lived experience *and* a universal claim, welded. Verdict: the **decompose trigger.** Split into the Story (what happened to me) and the Point (the general law), verify comprehension of the first, take a position on the second. Sliding it toward one axis (treating it as *only* a feeling, or *only* a claim) loses half of it.

- **"2+2=4" vs. a framework-embedded claim.** Both can be high Point-ness (falsifiable, positionable), yet they differ sharply in **context-depth** — how much surrounding structure you must already share to even evaluate them. See §"Considered and excluded" — context-depth was evaluated as a third axis and **rejected**.

- **"Communication matters."** Fails the **agreement test** — everyone nods. Verdict: not a Point at all, regardless of how true it sounds. A claim nobody will contest carries no position to stake.

- **"I resign."** A declaration. Nobody agrees or disagrees that you resigned — it is true by being said, so it fails the agreement test; and it offers nothing experiential, so it is not a Story. It lands **low on both**, and it is the highest-stakes utterance in the room. Verdict: **control move — route it, do not score it.** The *decision behind it* decomposes normally (Point: "this partnership can't be fixed"; Story: the six months behind that), but the status change itself is not payload the axes index.

---

## Worked examples

**1. Recount vs reveal — same events, different story-ness.**

> *(low)* "We had fourteen co-founder conversations over three months, then split."

Chronology only. Nothing to comprehend beyond the facts; a reader who repeats it back has demonstrated nothing.

> *(high)* "By the fourteenth conversation I stopped bringing up equity, because each time he'd agree in the room and re-open it a week later — and I'd started to read that as him not actually deciding, which is when I knew we were done."

Same events, but the *why* is present: the inference drawn, and the shift it produced. That is what a paraphrase can fail to capture, and therefore what the min-gate measures.

**2. Decomposition — one fused move into two scored atoms.**

> *Received (one unit of analysis):* "We each thought 'aligned' meant something different, the company died, and that's a law."

Decomposes into:

- **Story atom:** "We each thought 'aligned' meant something different, and the company died." — first-person, indexed to a life, comprehend it.
- **Point atom:** "Unverified shared vocabulary predictably kills co-founder partnerships." — impersonal, falsifiable, divides people. Take a position.

Neither atom is the original move; both are linked to it.

**3. Deliberately kept fused — `/problemify`.**

`/problemify`'s Point A → Point B → obstacle frame is a **third handling**, alongside decompose and route: *keep the weld and use it as a frame.* The whole A→B→obstacle structure is the **story**; the points it makes available for a position are things like "this is the right problem to solve," "he actually has it," "it is solvable." The skill does not decompose because the frame's usefulness *is* the weld — splitting it would leave three disconnected claims and lose the trajectory. Legitimate; recorded in the consumers register.

---

## Operational model (CURRENT BEST — UNTESTED)

> Everything in this section is a working hypothesis, recorded per the record-under-uncertainty discipline. It is **not** settled. Dated origin + falsifiers: [decisions.md](decisions.md) 2026-07-13 [product] "point/story working model", 2026-07-14 [process] "story/point model gets a dedicated home", and **2026-08-06 [product]** (which supersedes both on "Position", on story↔point parenthood, and on exhaustiveness).

- **Degrees, not exclusive types.** A move *scores* on both axes rather than being classified Point XOR Story. This is why the `/align` loop **decomposes** (recover the staked claim + recover the why) and never **classifies** — misclassification is off its path, but decomposition can still fail (a too-thin or wrong recovered story *is* the rubber-stamp the loop exists to catch).

- **Point-ness ≈ shared-arbiter availability.** What raises Point-ness is the availability of a *shared arbiter* that could adjudicate the claim — and that is raised by **arbiter-building context, not raw volume**. Centuries of accumulated commentary that add no arbiter leave an unfalsifiable claim low on Point-ness. Zero-Point-ness is an asymptote (the raw first-person quale), rarely reached. (This unifies with "falsifiability": an arbiter is precisely what a falsification test appeals to.)

- **Story-ness is a property of the utterance-in-context, not the proposition.** The same sentence is low Story-ness as a neutral fact and high Story-ness from someone with lived stakes in it. You cannot read Story-ness off the words alone.

- **Popper turned inward.** Comprehension is the precondition that falsification quietly assumes: high-stakes agree/disagree is illegitimate *before* the story behind the claim is understood. The protocol adds the comprehension step Popper's model presupposes.

- **Overshoot is a falsification device, not amplification.** Deliberately paraphrasing a claim *too far* is a **test**: the user's "no, that's too far" correction is the signal that locates the real boundary. It guards against channel-capture (the AI persuading rather than comprehending) — the correction, not the agreement, is the information.

- **"Arbiter" — two senses, kept separate.** (a) *Shared-arbiter availability* = the epistemic sense above, part of the model. (b) *Letter-routing arbiter* = a product-topology role (the author/founder as initial recipient of a letter, later real stakeholders) — **not** a story/point axis. Do not fold (b) into the model.

### Considered and excluded

- **Context-depth as a third axis (TENTATIVE — do not build on it).** Comprehension cost may scale with the size of the dependency-neighbourhood a claim sits in (roughly, graph in-degree). It is **not** being built, for one reason: it plausibly **collapses into "predicted comprehension gap,"** which the two-sided 0–10 estimate already measures directly. Adding an axis that duplicates an existing measurement buys nothing and costs every consumer a third score to produce. Revisit only if 0–10 gap data turns out to be systematically wrong in a way that tracks dependency depth.

- **A third *category* beyond Story and Point.** Also excluded. What motivated the question was real — bare directives and declarations fit neither — but those differ from Points and Stories in **what the move does**, not in a degree of anything. The right handling is routing (the `low on both` exit above), not scoring. A third category would require every consumer to process a payload type the product does not act on.

### One reuse caveat for skills
`sifter-story`'s **point-supporting mode** (Mode 2) is *generative-persuasive* — it builds a story that **supports** a given point. It must **never** be reused to recover a user's *why* in `/align`: it would manufacture a justification and launder it as the user's reasoning, re-introducing the exact rubber-stamp the alignment loop exists to prevent. Why-recovery must be rigorous first-person elicitation (Mode-1 shape), never Mode 2.

---

## How consumers use this

- **`/align`** — its form-contract points here: the recovered story must be a Mode-1 first-person narrative; the point a falsifiable mechanism/stance claim; plus the anti-point (the near-miss reasonable inverse). It **decomposes**, never classifies.
- **`/slava:content:sifter-story`** — Story creation (Mode 1 default). Reads its story-vs-point distinction from here; keeps its own *process* (NVC elicitation, session-file format, 0–10 rating loop).
- **`/slava:content:sifter-point`** — Point extraction. Reads the mechanism-vs-stance distinction and the agreement test from here; keeps its own extraction *process* (polarizing filter, stranger test).

**Definitions and acceptance criteria travel by reference; *procedure* does not** (`decisions.md` 2026-08-05 [process], 2026-08-06 [process]). Elicitation from a live human, a recording, a chat archive, and a brain dump are genuinely different procedures — each consumer inlines its own. Composite skills build their elements jointly under mutual constraints rather than calling sub-skills.

Full consumer list — including the ones that do **not** read this file, and the ones that hold *copies* of model claims: [story-point-model-consumers.md](story-point-model-consumers.md).

## History

Dated decisions, alternatives rejected, and falsifiers: [decisions.md](decisions.md) — search "point/story working model" (2026-07-13), "story/point model gets a dedicated home" (2026-07-14), and the 2026-08-06 [product] entry (Position disambiguation, linked-not-parent, exhaustiveness).
