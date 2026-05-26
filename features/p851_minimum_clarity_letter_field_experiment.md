---
status: today
type: story
rank: 0.019
created_date: '2026-05-26'
tags: [letter, norm-flip, measurement, experiment]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P851: Minimum Clarity Letter v0 — Instrumented Field Experiment

## Problem

**Situation:** The public Clarity Letter (existing infrastructure, refined in p842) carries the full instrument — stories, points, anti-points, comprehension gate. H-NormFlip and H-LetterAsProduct both need data: does the comprehension-verification norm actually propagate, and at what rejection rate?

**Complication:** The full letter is heavy. There is no minimal, instrumented variant designed to (a) propagate virally with the lowest possible ask and (b) capture the specific signals that test the norm-flip hypothesis. The norm-flip thesis ("once paraphrase-on-request is *expected*, the cascade threshold drops below the ~25% Bicchieri/Centola critical mass") currently rests on theory, not field data.

**Question:** What is the smallest letter that both spreads the recursive-understanding norm AND generates the empirical signal that the norm is being adopted — a measurement instrument disguised as a viral letter?

## Appetite

Medium blast radius — a new minimal letter variant + analytics on top of existing letter infrastructure; does not change the full letter flow. Reversible (it's an additive variant + event tracking; remove the variant and the tracking). Medium decision density — the letter copy (antipoint/story/point wording) and the belief-capture prompts are `[FOUNDER DECISION]` items; the instrumentation is mechanical.

## Solution

A minimal public Clarity Letter structured as the smallest norm-flip unit:

- **Antipoint (the antinorm):** "Asking someone to paraphrase you is rude / slow / makes you look incompetent."
- **Story:** the definition of recursive understanding + the falsifying observation — *typically nobody actually judges you for asking; everyone only believes others do, which is why the belief never gets tested.*
- **Point (the norm):** "Before continuing, paraphrase what you understood."
- **Pre-belief capture:** neutral, non-normative phrasing — *"Before this letter, what would you have expected if someone asked you to paraphrase what they said?"* (Kuang & Bicchieri 2024: avoid "should/right/appropriate" — triggers reactance.)
- **Post-belief capture:** *"After doing the paraphrase, what changed?"* The pre/post pair is the data point.

Instrument it to measure four quantities:
1. **Send rate** — fraction of receivers who forward it onward (propagation coefficient).
2. **Paraphrase-completion rate** — fraction of receivers who return a paraphrase (compliance signal).
3. **Rejection rate** — split into *explicit refusal* vs *silent non-response* (distinct signals; do not conflate).
4. **Pre/post belief diff** — captured in reasons-text; the longitudinal evidence the illusion dissolves under the intervention.

When completion is high and rejection is low, future iterations of the letter can carry an honest dynamic nudge ("N% of people who received this paraphrased within 24h" — Bicchieri trajectory framing, not a false static claim).

Builds on the existing public letter system and p842's flow — this is a minimal, instrumented *variant*, not a parallel rebuild.

## Risks / Non-Goals

### Risks
- **Severe selection bias at small N.** Early receivers are filtered by being in the sender's network. Mitigation: state this explicitly in any reported result — it strengthens credibility and matches Bicchieri's minimalist-claims advice. Do not over-claim causation ("the letter caused comprehension") — the defensible claim is "evidence that the illusion is false."
- **Conflating received / read / responded.** Mitigation: instrument all three stages distinctly; a silent non-response is not a rejection.
- **Normative-language reactance.** Mitigation: belief-capture prompts use neutral phrasing, never "should/right/appropriate."

### Non-Goals
- Do NOT rebuild the full Clarity Letter flow — this is a minimal variant on existing infrastructure (defer to p842 for the full flow).
- Do NOT add the /live session requirement to v0 — v0 tests letter-level propagation and belief shift; the /live paraphrase-verification step is a separate downstream measurement.
- Do NOT ship without pre-registering the predictions (send/completion/rejection thresholds) before data collection begins — pre-registration is what makes this credible to Penn-adjacent norm researchers.
- Do NOT write the antipoint/story/point copy or belief-capture wording without founder sign-off — these are `[FOUNDER DECISION]`.

## Done-When

- [ ] A minimal Clarity Letter variant is publishable with antipoint / story / point / pre-capture / post-capture structure (copy approved by founder)
- [ ] Send/forward events tracked (propagation coefficient computable)
- [ ] Paraphrase-completion tracked, distinct from rejection
- [ ] Rejection tracked with explicit-refusal vs silent-non-response distinguished
- [ ] Pre/post belief reasons-text captured and retrievable as paired data points
- [ ] Predictions pre-registered (written down before any data lands)
- [ ] Selection-bias caveat present anywhere results are surfaced

## Acceptance Criteria

- [ ] A receiver can complete the minimal letter (read → paraphrase → pre/post reflection) without the full letter flow
- [ ] The four signals (send, completion, rejection-split, belief-diff) are queryable after launch
- [ ] Founder can read paired pre/post belief texts to assess whether the illusion dissolved

## Open Questions (Founder Decisions)

- `[FOUNDER DECISION]` Final copy for antipoint, story, point.
- `[FOUNDER DECISION]` Exact pre/post belief-capture prompts.
- `[FOUNDER DECISION]` Pre-registered thresholds (what completion/rejection numbers would confirm vs transform H-NormFlip).

## Related

- Tests **H-NormFlip** and **H-LetterAsProduct** (see `docs/hypotheses.md`) — the instrument is logged there under H-NormFlip's 2026-05-26 test mechanism.
- Builds on existing public Clarity Letter infrastructure + **p842** (letter full-flow redesign).
- Source: 2026-05-19 Bicchieri conversation (norm strength/stability, learning modes, five-stage norm creation).
