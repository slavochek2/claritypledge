# The Story / Point / Position Model

> **Charter:** this file is the single home for the **story/point/position model** — the definitional frame, the axes, point types, edge cases, and the current operational model. Dated *decisions* about it (why, alternatives, falsifiers) live in [decisions.md](decisions.md); the glossary ([definitions.md](definitions.md)) and the sifter/`/align` skills carry a one-line pointer here, never their own copy.

**Who reads this:** any skill or agent that reasons about stories and points — `/align`, `/slava:content:sifter-story`, `/slava:content:sifter-point`, and any future consumer. They need the *whole* thing (definition **plus** the edge cases and the reasoning that fixes the boundaries), which is why it lives here as one document rather than as a stripped glossary entry.

**Epistemic status is marked per section.** The **definitional frame** (what a Story / Point / Position *is*) is stable. The **operational model** (§"Operational model") is the current best hypothesis and is labeled **UNTESTED** — it will change as evidence arrives. Do not treat the operational parts as settled.

---

## The one-sentence frame

A **Point** is something you take a *position* on (agree / disagree). A **Story** is something you can only *comprehend* (understand, or fail to). A **Position** is a Story welded to a Point — a claim held *by* a person *for* their reasons. You **verify comprehension** of the story behind a position; you **stake a position** on the point. These are two different loops, and confusing them is the failure the whole product exists to fix.

---

## Core definitions (stable)

### Story
First-person, experiential, indexed to a life. It is the *why* behind a position — lived reasoning, context, feeling. A Story can only be **understood**; it is not something to agree or disagree with. "Does this capture MY experience?" is its only test, and only its author can answer.

A Story contains: the **text** (the narrative), an **author**, a **visibility** (private / public), and any **extracted Points** (falsifiable claims pulled from it, author-approved). Points are always extracted *from* stories — never authored standalone.

### Point
Impersonal (or a declared personal standard) and **falsifiable** — a claim the world could contradict. A Point affords a *position*: out of a room of people, some will agree and some will bristle. Its test is "Is this true / does this hold?", answerable in principle by anyone, not only its author.

### Position
A Point **welded to** a Story — the claim *and* the lived reasoning that a specific person holds it for. Decomposing a fused statement means splitting it into its purest Point (the person stripped out) and its purest Story (the claim stripped out), re-linked through the Position. A Position is where comprehension and agreement meet: you can fully comprehend someone's story, reproduce their position accurately, and *still* disagree with the point.

### What "verify" means here
You do **not** verify a Point — a Point is just a claim; you take a position on it. You verify **comprehension of the Story behind someone's Position**. In practice: a two-sided estimate (reader self-assesses 0–10, author counter-assesses 0–10); the **gap** surfaces miscalibration. The operative rule elsewhere in the product is the **min-gate** — understanding counts as verified only when `min(reader_estimate, author_estimate)` clears the bar (≥8/10) — because the reader cannot self-certify comprehension the author doesn't confirm.

---

## When the model applies — the counterparty condition (UNTESTED)

The story/point apparatus is a **two-party comprehension act**: a story exists to be *understood by someone*, and the min-gate is a two-sided rating. So it earns its cost only when there is a **counterparty whose comprehension matters** — a partner, a peer, a hire, a customer, or a *future* recipient the corpus is being built for. That someone is not incidental; it is in the definition ("verify understanding of the story behind **someone's** position").

Corollary for the alignment tools (`/align` especially): a high-stakes **decision with a counterparty to align with** is in scope; a high-stakes **state you are only waiting on** (an external process, a settled-and-handed-off matter) usually has **no** align-target — and with no counterparty, filing a story + point + min-rating is effort that plain analysis (an agent, unaided) would do more cheaply. Detect such cases, but route them to plain analysis rather than forcing the comprehension loop. *Falsifier: if founders get durable value from filing stories/points on decisions with genuinely no counterparty (now or future), the counterparty condition is too strict.*

## The two axes (stable framing; scoring is operational)

Story-ness and Point-ness are **two independent axes, not two poles of one scale.** A single utterance can be:

- **high Point-ness, low Story-ness** — a neutral falsifiable claim → take a position, little to comprehend.
- **high Story-ness, low Point-ness** — a raw experience-avowal → comprehend, nothing to agree with.
- **high on both** — a *fused position statement* → **decompose** (see edge cases), don't slide along one axis.
- **low on both** — ignore.

- **Point-ness** = the degree to which the right response is *taking a position*. Its underlying properties are **impersonality** (the truth is independent of who's speaking) and **falsifiability** (there is a shared arbiter that could adjudicate the claim — see the two senses of "arbiter" below).
- **Story-ness** = the degree to which the right response is *estimating comprehension*. It is first-person, experiential, and **resists falsification** — there is no external arbiter for "what it was like to be me."

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

---

## Comprehension vocabulary (stable)

The word "understand" hides three different things. Keeping them separate is the whole point of the comprehension axis.

- **Cognitive understanding** — knowing *how* someone arrived at their position: their reasoning, experiences, and feelings *as data*. **Testable** — ask them to confirm your paraphrase. This is what the protocol verifies.
- **Emotional understanding** — *feeling* what someone feels. Not requestable on command, no verification procedure. Either happens or it doesn't. Not what the protocol measures.
- **Agreement** — accepting that someone is *right*. Compatible with cognitive understanding: a person can reproduce your position accurately and still disagree.
- **"Understand" as a false-unity word** — one word covering all three above. When someone says "you don't understand me," they could mean any of them; without specifying which, neither party knows what's missing. Story-ness lives on the **cognitive-understanding** axis; Point-ness lives on the **agreement** axis; emotional understanding is out of scope.

---

## Edge cases that fix the boundaries

These are the cases that *define* the model by showing where the lines actually fall. The reasoning matters as much as the verdict.

- **"God exists."** Debatable and ownerless — yet **not falsifiable** (no shared arbiter could settle it). Verdict: Point-ness is **not** the same as objectivity. What makes something a Point is *falsifiability + affording a position*, not "being about the objective world." An ownerless, debatable, unfalsifiable claim sits lower on Point-ness than it first appears. (Same family as moral-landscape claims: feels like a fact-question, lacks the arbiter.)

- **"I felt betrayed when the round closed."** Pure Story-ness, ~zero Point-ness. Verdict: **comprehend, do not agree.** Responding with a position ("you shouldn't have felt that") is a category error — there is nothing to falsify in an experience-avowal.

- **"We each thought 'aligned' meant something different, the company died, and that's a law."** High on **both** axes — a lived experience *and* a universal claim, welded. Verdict: the **decompose trigger.** Split into the Story (what happened to me) and the Point (the general law), verify comprehension of the first, take a position on the second. Sliding it toward one axis (treating it as *only* a feeling, or *only* a claim) loses half of it.

- **"2+2=4" vs. a framework-embedded claim.** Both can be high Point-ness (falsifiable, positionable), yet they differ sharply in **context-depth** — how much surrounding structure you must already share to even evaluate them. This is the observation that motivates the tentative third axis below.

- **"Communication matters."** Fails the **agreement test** — everyone nods. Verdict: not a Point at all, regardless of how true it sounds. A claim nobody will contest carries no position to stake.

---

## Operational model (CURRENT BEST — UNTESTED)

> Everything in this section is a working hypothesis, recorded per the record-under-uncertainty discipline. It is **not** settled. Dated origin + falsifiers: [decisions.md](decisions.md) 2026-07-13 [product] "point/story working model" and 2026-07-14 [process] "story/point model gets a dedicated home."

- **Degrees, not exclusive types.** An utterance *scores* on both axes rather than being classified Point XOR Story. This is why the `/align` loop **decomposes** (recover the staked claim + recover the why) and never **classifies** — misclassification is off its path, but decomposition can still fail (a too-thin or wrong recovered story *is* the rubber-stamp the loop exists to catch).

- **Point-ness ≈ shared-arbiter availability.** What raises Point-ness is the availability of a *shared arbiter* that could adjudicate the claim — and that is raised by **arbiter-building context, not raw volume**. Centuries of accumulated commentary that add no arbiter leave an unfalsifiable claim low on Point-ness. Zero-Point-ness is an asymptote (the raw first-person quale), rarely reached. (This unifies with "falsifiability": an arbiter is precisely what a falsification test appeals to.)

- **Story-ness is a property of the utterance-in-context, not the proposition.** The same sentence is low Story-ness as a neutral fact and high Story-ness from someone with lived stakes in it. You cannot read Story-ness off the words alone.

- **Popper turned inward.** Comprehension is the precondition that falsification quietly assumes: high-stakes agree/disagree is illegitimate *before* the story behind the position is understood. The protocol adds the comprehension step Popper's model presupposes.

- **Overshoot is a falsification device, not amplification.** Deliberately paraphrasing a position *too far* is a **test**: the user's "no, that's too far" correction is the signal that locates the real boundary. It guards against channel-capture (the AI persuading rather than comprehending) — the correction, not the agreement, is the information.

- **Context-depth (TENTATIVE third axis).** Comprehension cost may scale with the size of the dependency-neighbourhood a claim sits in (roughly, graph in-degree). Flagged because it may collapse into "predicted comprehension gap" — which the 0–10 estimate already measures. Do not build on it yet.

- **"Arbiter" — two senses, kept separate.** (a) *Shared-arbiter availability* = the epistemic sense above, part of the model. (b) *Letter-routing arbiter* = a product-topology role (the author/founder as initial recipient of a letter, later real stakeholders) — **not** a story/point axis. Do not fold (b) into the model.

### One reuse caveat for skills
`sifter-story`'s **point-supporting mode** (Mode 2) is *generative-persuasive* — it builds a story that **supports** a given point. It must **never** be reused to recover a user's *why* in `/align`: it would manufacture a justification and launder it as the user's reasoning, re-introducing the exact rubber-stamp the alignment loop exists to prevent. Why-recovery must be rigorous first-person elicitation (Mode-1 shape), never Mode 2.

---

## How consumers use this

- **`/align`** — its form-contract points here: the recovered story must be a Mode-1 first-person narrative; the point a falsifiable mechanism/stance claim; plus the anti-point (the near-miss reasonable inverse). It **decomposes**, never classifies.
- **`/slava:content:sifter-story`** — Story creation (Mode 1 default). Reads its story-vs-point distinction from here; keeps its own *process* (NVC elicitation, session-file format, 0–10 rating loop).
- **`/slava:content:sifter-point`** — Point extraction. Reads the mechanism-vs-stance distinction and the agreement test from here; keeps its own extraction *process* (polarizing filter, stranger test).

## History

Dated decisions, alternatives rejected, and falsifiers: [decisions.md](decisions.md) — search "point/story working model" (2026-07-13) and "story/point model gets a dedicated home" (2026-07-14).
