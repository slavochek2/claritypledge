---
status: idea
title: "Is It Research or Is It Positioning? Four Tests I Ran on My Own Framing"
rank: 1
tags:
  - rigor
  - ai-safety
  - research-agenda
  - epistemics
created_at: 2026-08-10T00:00:00.000Z
source_conversation: 2026-08-10 Framing projects as AI safety research
---

# Is It Research, or Is It Positioning?

> Working title — `[FOUNDER DECISION: title]`. Alternatives: "Four Tests for Whether Your Framing Is Doing Any Work" · "I Asked Whether My Project Was AI Safety Research. Here Is What Survived."

## Arc

**ARC-1 (Tested and Tightened)** — a claim stated boldly ("this is AI safety research"), each link tested under pressure, the weak links exposed, and a tightened version offered with the vulnerability named.

## The opening question, asked honestly

For months the project has carried a line: *alignment between humans is a prerequisite for alignment between humans and AI.* The decision behind it was explicit and recorded — **the framing is the distribution unlock, not the product.** That is legitimate marketing.

It stops being legitimate the moment the word *research* is attached, because research implies falsifiable claims and an N — and the empirical base here is one company's history plus about thirty sessions the author ran himself.

So: is any version of this real research, or is all of it positioning wearing a lab coat?

## The four tests

These generalize past this project, which is why they are the article rather than the answer.

1. **The load-bearing test.** Delete the framing from every document. Does anything you *build* change — the curriculum, the measurements, the design? If nothing changes, it is a label.
2. **The falsifiability test.** Write down now, in one sentence, the result that would make you stop claiming this. If you cannot, it is not research.
3. **The substitution test.** Replace the framing with a boring adjacent one ("organizational effectiveness"). If every sentence still reads fine, the interesting word is decoration.
4. **The peer test.** Post the narrow claim — not the protocol, not the product — to the community that would know. They will tell you within 48 hours, for free, whether it is a contribution or a rebrand.

**Test 4 is the one the author had been avoiding**, and it is the only one with an external judge. That admission is the spine of the piece.

## What failed

**The slogan fails tests 2 and 3.** "Alignment between humans is a prerequisite for alignment between humans and AI" is either trivially true (all coordination needs some comprehension) or false where it matters. The strongest objection uses the project's own tools: **racing labs understand each other fine.** Their problem is conflicting incentives under competitive pressure, not unverified mutual comprehension. Keep it as a tagline if you want; it cannot be a research claim.

**A second failure, and this one is a Popper problem in the author's own story.** In one telling, AI *accelerates divergence* → polarization. In another, authoritarianism *relies on homogeneity* → everyone querying the same model. Those are opposite states, and a theory explaining both explains nothing. There is a coherent version — homogeneity inside blocs, divergence across them, with verification skill being what lets you cross a bloc boundary — but it has to be committed to in writing, with a prediction that rules something out. Otherwise it reads as *whatever happens, lack of clarity caused it.*

**A third failure, and it is the instrument turned around.** Verification does not protect against a manipulator who is *willing to be paraphrased*. A sophisticated persuader passes every comprehension check honestly, and the successful paraphrase round manufactures exactly the rapport that makes the next claim land. Cults run on deep mutual comprehension. If the protocol has any anti-manipulation property it is not comprehension — it is the guess-exchange forcing you to state your own prior before hearing theirs, which is **anchoring resistance**, a different mechanism and a much narrower claim. That narrower one is defensible.

**A fourth, from the empirical literature.** The assumption that revealed gaps lead to convergence has a mirror twin the project has never named: exposure to a genuinely understood opposing position frequently *increases* polarization. Verified comprehension producing hardening — *"now I actually understand you, and I like you less."* If the study design can produce that result and the author would report it, it is research. If the design can only produce flips, it is a demonstration.

## What survived, and it is narrower and better

**Value claim.** Not "improves coordination." For interest conflicts, verification dissolves nothing — it makes the conflict **legible faster**. You stop burning two years on a partnership built on a false agreement. *Cheaper discovery of irreducible disagreement* survives the authoritarianism objection precisely because it does not need convergence.

**The AI-native claim, if there is one.** Not "people are more overconfident about model output" — that is an empirical bet the author disputed and neither party can settle by intuition; it is a two-hour experiment and either answer is a result. The version that has a specific shape: **the user overrides or accepts a model's recommendation on an illusion of shared understanding, and neither side holds the other's honest self-estimate, so nobody knows the joint minimum.** Almost every AI safety plan ends with "and a human checks it." That check is only a safety mechanism if the person understood what they were checking. Stated plainly: *we test whether human review of AI output is real or theatre.*

**The circularity that has to close before any of it counts.** If the detector of an illusion of shared understanding is the *model's own* comprehension estimate, the instrument is built on the one party whose self-report there is least reason to trust. The flag cannot be validated by the model saying so. It has to predict something external — does a flagged point get corrected more often on review? Does the user's edit distance correlate with the flag? Does a flagged point predict later divergence? Without that, it measures the model's confidence about its confidence.

**And the immune-response warning.** Pledgers open organizations, recruit members, members pledge, leads sign partner agreements, and the author measures conversion and onward conversion. Structurally that is a franchise with a conversion funnel, and the audience most likely to evaluate the claim has an unusually strong reaction to that shape. Intent does not travel. Two mitigations worth stating publicly: **the protocol must be usable with zero affiliation**, and **R₀ gets published honestly, including failures.** (The project already recorded the recruitment-architecture hazard once, from a different angle — see a58. This is the second independent instance, from the audience the recognition path depends on.)

## The closing turn

The four tests cost the project its headline claim and returned two smaller ones it can actually defend. The general lesson is the same one the product sells: **a framing that survives every possible outcome is not a claim about the world — it is a claim about how you would like to be read.**

## Guards

- **Do not restate the field taxonomy as fact.** The source conversation cited a global research-priorities document and mapped the project onto specific sections of it. Those citations are agent-supplied and **unverified** — see below. The article can make its argument without them; if they stay, they get read in primary first.
- **Do not claim a category.** The honest register throughout is "here is where this might sit and here is who is already there," not "this is AI safety."
- **Do not let the piece become a pitch.** The moment it argues the product is important, it has failed its own test 3.

## Sources — and what is NOT verified

**Flagged as agent claims, not findings** (per `.claude/rules/epistemic.md` gate 9 — a subagent's or model's claim is not evidence until a command confirms it):

- The existence, date, authorship, pillar structure and section numbering of the global AI-safety research-priorities document cited in the source conversation. **Verify against the primary document before any of it appears in a draft or a proposal.** The conversation first used a single national institute's internal org chart as if it defined the field, was corrected, and then produced a second taxonomy — the second one has not been checked either.
- The claim that a specific benchmark for measuring model influence on users' views is "in review."
- The characterisation of what the field does and does not currently fund.

Verifiable independently and safe to cite: Bail (exposure to opposing views increasing polarization) · Aumann 1976 · the project's own recorded April framing decision (`docs/decisions.md`).

## Relationship to other articles

- **a38** (illusion of understanding and the AI race) — holds the coordination-failure framing this article partly retires. **Read a38 before drafting; the racing-labs objection here directly undercuts its thesis, and the two must not ship contradicting each other.**
- **a26** (what's tested, what's hypothetical) — same honesty posture applied to the project's claims. a26 owns the claim inventory; a68 owns the four tests as a portable method.
- **a58** (the design that made me load-bearing) — owns the recruitment-architecture hazard. a68 adds the second instance and the two mitigations; enrich a58 rather than re-arguing it.
- **a55 / a65** — same family: the author publishing his own pruning.
