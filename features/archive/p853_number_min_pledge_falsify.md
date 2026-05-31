---
status: rejected
type: comment
rank: 0.011
created_date: '2026-05-27'
tags:
  - pledge
  - partner-agreement
  - falsify
  - calibration
delivery_stage: create-spec
pipeline_ran:
  - create-spec
locked_at: '2026-05-27T08:22:14.535Z'
---

# P853: Number+Min Pledge — falsify the lighter commitment mechanic

> **Superseded (2026-05-31):** the measurement/falsify design is **absorbed into P857** (Clarity Agreement + versioning — pairs are the test population, where the min is coherent bilaterally). The cheapest-disproof and the funnel + calibration-slope metrics now live there. Retained as the rationale record; `status`/`locked_at` left as-is. See decisions.md 2026-05-31 [product] + [content/strategy].

## Problem

**Situation:** The Clarity Partner Agreement (definitions.md) currently commits members to *paraphrase-on-request, or explain why they refuse*. The full Pledge is already positioned as a ~1% graduation credential (p605), not an entry point.

**Complication:** Field signal suggests the paraphrase mandate is heavy — a member verbally accepted a "mini pledge" but possibly out of politeness (the unverified-yes problem, which is itself the failure mode the protocol exists to fix). A lighter mechanic is proposed: members commit to giving a comprehension **number (0–10) when asked**, accept **min(both numbers)** as the recursive-understanding estimate (the Min Principle, a9/a27), and paraphrase becomes **voluntary** ("feel free to ask me to paraphrase") rather than mandated.

**Question:** Does the lighter number-first mechanic produce **more total paraphrases across the population** than the paraphrase mandate — or fewer? The objective is **virality / propagation of the verification norm**, NOT per-person measurement accuracy or coverage of the overconfident. This is empirical, not resolvable by argument.

## Appetite

High blast radius — touches the Clarity Partner Agreement text, /live (min display + naming), and the pledge tier model (definitions.md, p605). Medium reversibility (text + UI, feature-flaggable; not a data migration). High decision density — this is a core-model bet with at least one unresolved founder decision (keep vs collapse pledge tiers).

## Approach

Run `/slava:think:falsify` on the two competing hypotheses below **after the Chiang Mai event** (do not pre-empt the experiment by shipping). Use any signal the event surfaces (especially the live-verification demo and the "who would you do this with" propagation count) as input, but treat the event as awareness R&D, not as a test of this mechanic.

**Two hypotheses to falsify:**

- **(a) Number-as-noise.** A self-reported comprehension number is exactly the unreliable signal the protocol exists to replace (r=0.178; the self-concealing illusion, Lau 2022). `min(8,7)=7` is fiction if the 8 comes from a chronic over-rater. Crucially: the **badge certifies concept-comprehension, NOT calibration** — they are orthogonal. "Confidence in one's own listening calibration" is the same illusion one level up; only a measured paraphrase track record calibrates a number.
- **(b) Number-as-low-reactance-trigger.** A low number (or felt uncertainty) voluntarily triggers a paraphrase; self-initiated verification beats a mandate; removing coercion raises genuine compliance (and avoids the polite-yes artifact).

**Objective correction (2026-05-27):** the metric is `total paraphrases ≈ adoption × trigger rate × (low-min → paraphrase conversion)`. The mandate maxes none; the mini-pledge plausibly maxes all three (more people can take it, easier to trigger, and a low min prompts "how do we get this up fast?" → paraphrase). Coverage of the overconfident is NOT the objective.

**Narrowed coverage point:** the *chronic* overconfident self-select out of BOTH mechanics, so they don't differentiate. Only the *situationally* overconfident among pledge-takers escape the voluntary trigger (feel sure → give a "9" → no prompt) where the mandate's partner could still force a check. Narrow gap — and partly closed by the badge-primer below.

**Badge-as-primer (strengthens (b)):** the badge doesn't calibrate, but it certifies the holder *knows* their confidence is unreliable, *knows* paraphrase is the test, and CP already ships the tool. So a badged mini-pledger holds the number as provisional and knows the counter-move — raising trigger→paraphrase conversion.

**Reframe to test:** number ≠ a lighter *entry*; its validity depends on paraphrase having calibrated it. So **number = maintenance mode after calibration; paraphrase = entry mode** — sequential, not alternatives. A two-phase agreement (paraphrase to bootstrap calibration → numbers for cheap ongoing checks) may dominate either pure mechanic.

**Cheapest disproof (run first, tiny N):** when the min comes back low, do people actually paraphrase to raise it, or shrug and move on? If a low min produces complacency rather than verification, hypothesis (b) is dead. Observable in a handful of sessions (needs P854's min-display).

**Fuller evaluation:** measure adoption (% offered who accept), trigger rate (% conversations exchanging a number), and conversion (% low-min moments → paraphrase) for a mandate-cohort vs a mini-cohort (sequential cohorts now; randomized signup text once N allows).

## Risks / Non-Goals

### Risks
- **Shipping the unreliable signal as the primary act.** If (a) holds, a number-first agreement institutionalizes the exact failure mode CP exists to fix. Mitigation: falsify before any text/UI change.
- **Naming drift.** "Recursive understanding number" on a /live slider canonizes a self-report as if it were a measurement. Mitigation: decide naming only after the falsify pass.

### Non-Goals
- Do NOT change the Clarity Partner Agreement text, /live, or definitions.md as part of this spec.
- Do NOT ship the min-display or number-pledge before the Chiang Mai event (May 29 / Jun 1).
- Do NOT decide keep-vs-collapse of the pledge tiers here — that is a downstream founder decision the falsify informs.
- Do NOT treat the Min Principle's theoretical grounding (a9/a27) as validation of the product mechanic — distinct claims.

## Research Questions

1. Does a voluntary "feel free to ask me to paraphrase" produce more or fewer actual paraphrase events than the mandate, per member-month?
2. Does the number-as-trigger reliably fire for over-raters, or only for the already-humble? (the coverage-gap question)
3. Can the badge be extended to certify *calibration* (track record), not just concept-comprehension — and is that a precondition for a meaningful number?
4. Does a two-phase model (paraphrase-entry → number-maintenance) outperform either pure mechanic?
5. Keep the full pledge as ~1% graduation (p605), or collapse to a single mini→full tier? `[FOUNDER DECISION]`

## Time Box

Falsify pass post-event. Decision (ship / revise / drop) before any product change to the agreement or /live.

## Deliverable

A decision doc (or decisions.md entry) recording: which hypothesis survived falsification, the resolved two-phase vs single-mechanic question, the pledge-tier founder decision, and a go/no-go on each of the three coupled product changes (agreement text, /live min-display, pledge-tier model).

## Related

- p605 (pledge as graduation, ~1%) · p603 (practice community) · p685 (badge propagation) · **p854 (min-display instrument)** · **p855 (pledge v4 upgrade — the implementation this falsify measures)**
- definitions.md — Clarity Partner Agreement · a9 / a27 — recursive floor / Min Principle
- Context: `pp/docs/business/chiang-mai-clarity-workshop/EVENT-STRATEGY.md` (POST-EVENT section)
