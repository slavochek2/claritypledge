---
status: idea
title: "The Min Principle — A Formal Foundation for Verified Understanding"
rank: 1
tags:
  - min-principle
  - rate-asymmetry
  - calibration
  - verification
  - common-knowledge
  - lesswrong
created_at: 2026-05-29T00:00:00.000Z
---

# The Min Principle — A Formal Foundation for Verified Understanding

> **Merge note (2026-05-31):** Per the novelty audit (decisions.md 2026-05-31 [content/strategy]), a29's formal/min content is being **folded into a9** as one repositioned article (synthesis + instrument + data, not discovery). This spec is **superseded-by-merge** — retained for its formal material (the two-origins diagnosis: min ← recursion's weakest-link, authority ← referent-absence; the min decision rule; the bounded-confidence framing), which the merged a9 absorbs. Do not draft a29 standalone.
>
> **Fold-in executed (2026-06-01):** The Min Principle now lives in a9's §"The recursive floor" as a narrative anchor — a weakest-link bound (Fagin, Halpern & Moses) with three faces: Aumann-precondition, Popper-gate, and calibration-bounded confidence. This spec is now a formal-derivation reference only; reopening it as a standalone post requires re-opening the merge decision.

Spin-off from a9 (The Illusion of Recursive Understanding). Where a9 is the *naming post* (phenomenon-first, personal-rupture spine), this is the *formal post* (LW-credibility-first, theorem-structure spine). Cross-linked from a9.

## Strategic Intent

**Serves:** H-Essays-BuildRecognition (LW credibility), co-builder signal flare for coordination theorists, AI safety researchers, formal epistemologists.
**Sequence:** Write AFTER a9 ships and receives LW reception. The formal claims are stronger once the naming post has been stress-tested by the community.
**Audience:** LessWrong, rationalist community, formal epistemology, coordination theory.

## Thesis

The Min Principle: justified confidence in recursive understanding is upper-bounded by the minimum of the paired verified comprehension estimates, weighted by each party's calibration track record.

Three sub-theorems, each provable in epistemic logic:

1. **Aumann-precondition theorem.** Aumann's agreement theorem assumes common knowledge of posteriors. Common knowledge of posteriors presupposes verified mutual comprehension. Verified mutual comprehension requires a speaker-confirmed paraphrase protocol. Therefore: Aumann's result is an existence proof for the missing instrument, not a description of a naturally-occurring state.

2. **Popper-with-comprehension-gate.** Corroboration of a belief via counterargument is bounded above by the listener's verified comprehension of that counterargument. Running Popper's falsification procedure against an unverified reconstruction of the counterargument produces a local maximum, not a global one. The gate is: speaker-confirmed paraphrase before the test runs.

3. **Bounded-confidence theorem.** Let V(B, c) = the upper bound on justified confidence in a shared belief B, given calibration track record c. V(B, c) < 1 whenever c is estimated (not verified) and < calibration ceiling whenever c is below perfect. The bound is computable from paraphrase-verification data across sessions.

## Source Material

All from a9 enrichments (2026-05-22, 2026-05-26):

- **Min Principle / recursive floor** — a9 2026-05-22 enrichment, point 1. Founder marker: "is my a9 article about precondition?" — suggests this may be the article's central formal contribution.
- **Recursive pluralistic ignorance** — stronger than standard PI because the corrective mechanism (paraphrase) is blocked by another instance of the same illusion. Novel extension of Bicchieri's framework. From a9 2026-05-22, point 2; overlaps a9 2026-05-26, point 2.
- **Norm-flip formalization** — Nowak-Sigmund indirect reciprocity + Bicchieri normative expectations + Centola threshold cascade. ~25% critical mass empirically; paraphrase-expectation may shift the threshold itself (testable). Tied to H-NormFlip in hypotheses.md. Founder marker: "this is our plan!!" From a9 2026-05-22, point 3.
- **Invisible/misunderstanding norm-class 2×2** — Observability axis (visible/invisible compliance) × failure-mode axis (defection/misunderstanding). Classical norm theory lives in visible+defection; CP's leverage is invisible+misunderstanding. The verification artifact converts the invisible/misunderstanding class into visible/defection. a9 2026-05-26, point 1. a-spec note: "LW-friendliest single-table statement of CP's contribution."
- **Self-sealing illusion (recursive pluralistic ignorance)** — "I'll be judged for misunderstanding" is itself an unverified recursive belief; nobody actually judges but everyone believes others do, blocking the paraphrase that would falsify it. From a9 2026-05-26, point 2. Also logged in lean-canvas §Problem.
- **Learning-mode endogenous to norm** — the expectation "will I be asked to paraphrase?" flips processing from fast/confirmation-biased to slow/Bayesian. CP changes the parameter governing how all norms in the cluster respond to evidence, not just the adopter count. From a9 2026-05-26, point 3. Ties to H-NormFlip.
- **The mini-Flip — naming the number is the Flip applied to itself** — the act of naming a 0–10 comprehension estimate (and taking the bilateral min) is itself a small Flip: a second-order verification of the *comprehension claim* about content, where the full Flip verifies the *content* ("did you mean X?"). The full Flip verifies first-order; the mini-Flip verifies "how much do you think you understood?" — answered publicly, which makes it a commitment act, not just a measurement. From "Understanding meaning and validity through shared knowledge" (2026-05-26). Founder marker: `[/cp ...naming the number is itself a small Flip — yes this is mini flip — worth an article?]`. Connects the formal min material to live specs P855 (pledge v4 number-first) and P851 (min letter experiment).

## Enrichment (2026-06-01)
Source: claude-conversations-to-cp — "Understanding meaning and validity through shared knowledge" (2026-05-26)
Applied to: a-spec body (status: idea, pre-draft phase) — added the mini-Flip (second-order verification) framing to Source Material.

## Proposed Structure

1. **Hook** — Aumann's theorem as diagnostic: if rational agents persistently disagree, the precondition is not satisfied. Name the precondition.
2. **The Min Principle** — formal statement, intuition pump via the recursive floor (already in a9, can be cited).
3. **Three sub-theorems** — each with: statement, informal proof sketch, practical consequence.
4. **The 2×2** — invisible/misunderstanding table. Strongest single-table summary of CP's contribution.
5. **Recursive pluralistic ignorance** — why the corrective is self-blocked. The self-sealing illusion.
6. **Norm-flip** — formal sketch + testable prediction (~25% threshold, H-NormFlip).
7. **Close** — the instrument that makes the precondition satisfiable.

## Unresolved

- Proof formalism: epistemic logic (Hintikka / Fagin-Halpern style) vs. informal argument. LW convention favors readable informal proofs with formal appendix. Decide at draft time.
- Calibration track record data: the bounded-confidence theorem requires empirical V(B,c) estimates. These don't exist yet. Either (a) derive the bound theoretically, or (b) note as an open empirical question. Likely (b) for first draft.

## Progress

- [ ] Draft written (/prepare-blog)
- [ ] Tightened (/tighten)
- [ ] Story gate passed (/story-gate)
- [ ] Ghost draft (/draft-blog)
- [ ] Interactive embeds added (/enhance-blog)
- [ ] Published (/ship-blog)

## Enrichment (2026-06-15)
Source: "Understanding mutual comprehension across different perspectives" (2026-06-13)
Applied to: a-spec body (formal-derivation reference; a29 folded into a9)

Verifier-asymmetry refinement of the Min Principle. The challenge: "can I know I understand them at 9 if they understand me at 2?" Distinguish **depth-1** (the other party as judge of my paraphrase) from **depth-2** (mutual verification). The verifier collapses only when the low estimate reflects a *low-resolution comprehender* (poor across the board) rather than the *difficulty of the idea* — a low-resolution judge cannot reliably certify my paraphrase, so their low score toward me signals weak comprehension skill, not just hard content. Two competence scores therefore diverge: shallow-task competence ("did you capture my meaning?") vs deep-task competence ("do you grasp my framework"). The unfalsifiable-self-report problem: a felt "9" with no functioning verifier is exactly the illusion of understanding the framework warns against — without external confirmation it is an unfalsifiable self-report. Refines the verification *conditions*; does not contradict the joint-bounded-by-minimum result.

## Enrichment (2026-06-26)
Source: "conversation-513" (Min as community backbone) + "Honest comprehension over false agreement" (2026-06-20)
Applied to: a-spec body

Two additions, and a pointer:
- **Min is a constitutional/procedural device, not a telos.** As a backbone for a community it faces a heckler's-veto problem at scale: joint comprehension in a group of N collapses to the *lowest self-reporter*, which either paralyses the group or incentivises excluding low-raters — the opposite of "coming together." Resolution: the telos is the *value underneath* (see the gap honestly rather than pretend it's closed); the Min is the procedure that serves it. Distinguish Ostrom-style governance *rules* from philosophical *foundations* — Min is a strong constitutional rule, a weak telos.
- **The Min as a live real-time Hold trigger.** In an emotionally destabilised exchange, the principle functioned as a real-time *Hold*, not just a theory: an interlocutor refused to "superagree" because their own self-comprehension was 3 — so the joint minimum *was* 3, full stop. Evidence that the rule operates as a felt brake in the moment, not only as post-hoc scoring.
- **Pointer:** the conjunctive-vs-additive premise the Min rests on (≤min, not =average) is now its own article — **a39 ("Why Joint Comprehension Is Bounded by the Minimum, Not the Average")**. a29 *uses* the bound; a39 *argues for* it. Cross-link; don't re-derive.
