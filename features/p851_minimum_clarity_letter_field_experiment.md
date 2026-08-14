---
status: backlog
type: story
rank: 37
created_date: '2026-05-26'
tags:
  - letter
  - norm-flip
  - measurement
  - experiment
delivery_stage: create-spec
pipeline_ran:
  - create-spec
---

# P851: Minimum Clarity Letter v0 — Instrumented Field Experiment

## Problem

**Situation:** The public Clarity Letter (existing infrastructure, refined in p842) carries the full instrument — stories, points, anti-points, comprehension gate. H-NormFlip and H-LetterAsProduct both need data: does the comprehension-verification norm actually propagate, and at what rejection rate?

**Complication:** The full letter is heavy. There is no minimal, instrumented variant designed to (a) propagate virally with the lowest possible ask and (b) capture the specific signals that test the norm-flip hypothesis. The norm-flip thesis ("once paraphrase-on-request is *expected*, the cascade threshold drops below the ~25% Bicchieri/Centola critical mass") currently rests on theory, not field data.

**Question:** What is the smallest letter that both spreads the recursive-understanding norm AND generates the empirical signal that the norm is being adopted — a measurement instrument disguised as a viral letter?

## Appetite

Medium blast radius — a new minimal letter variant + analytics on top of existing letter infrastructure; does not change the full letter flow. Reversible (it's an additive variant + event tracking; remove the variant and the tracking). Medium decision density — the letter copy (antipoint/story/point wording) and the belief-capture prompts are `[FOUNDER DECISION]` items; the instrumentation is mechanical.

## Solution

### Variant scope (v0 = warm-propagation, commitment-focused)

The 9-story full letter (p842) covers five distinct cruxes — terminology (cognitive understanding specifically), information asymmetry + speaker authority, min principle (recursively verified understanding ≤ min of estimates), calibration cost, and norm flip. Different readers shift on different cruxes; the 9-story serves the spread. For **warm propagation** (sender's existing network), the commitment ask carries alone: legitimacy comes from the relationship, the act generates the data, belief updates with the receiver's own evidence.

v0 = 1-story warm-propagation variant assembled from existing letter assets — no new copy at the letter level:

- **Antipoint:** `st7-a` — *"Being asked to paraphrase is an accusation — it says the other person believes you are stupid or weren't really paying attention. If someone trusted that you were listening, they wouldn't need you to prove it."* Receiver-perspective antinorm; upstream of the sender's hesitancy.
- **Story:** `st3` (with its existing image) — *"The speaker knows what they meant to communicate. The listener doesn't. The only way to verify cognitive understanding is for the listener to explain back what they think the speaker meant, and for the speaker to confirm or correct. Because the speaker's confirmation is the strongest available signal that cognitive understanding has occurred."* Debunks the antipoint via mechanism: paraphrase is the verification operation, not an accusation. The reader is asked to verify cognitive understanding *of what verified cognitive understanding is* — the mechanism story is itself the test.
- **Commitment:** `st8` — *"...a written commitment to verify cognitive understanding gives both people the same standard to hold each other accountable to ... [clarity partnership agreement](https://claritypledge.com/partner-template) ..."* Concrete commitment artifact, not just one-time paraphrase.
- **Click-through:** "Why this matters" → p842 full letter, for receivers who want the full argument.

Reading chain: receiver sees antinorm (`st7-a`) → debunked by mechanism (`st3`) → reaches commitment to a clarity partnership agreement (`st8`).

### Belief capture (unprimed-before constraint, per p852)

- **Pre-belief:** *"Before reading this letter, what would you have expected if someone asked you to paraphrase what they said? One sentence."* Rendered **before** `st7-a` appears on the page — else the measurement is primed. Neutral phrasing per Kuang & Bicchieri 2024: avoid "should/right/appropriate" (triggers reactance).
- **Post-belief:** *"After paraphrasing for someone (or trying to), what changed in what you expected? One sentence."*

The pre/post pair is the per-receiver data point.

### Instrumentation (mechanical)

Four signals:
1. **Send rate** — fraction of receivers who forward (propagation coefficient).
2. **Paraphrase-completion rate** — fraction who return a paraphrase (compliance signal).
3. **Rejection rate** — split *explicit refusal* vs *silent non-response* (distinct signals; do not conflate).
4. **Pre/post belief diff** — paired reasons-text, retrievable per receiver.

When completion is high and rejection is low, later iterations can carry honest dynamic nudges ("N% of people who received this signed within 24h" — Bicchieri trajectory framing, not a false static claim).

Builds on existing public letter system + p842's full-flow. 3-story and cold-receiver variants (1-story-cold with min-principle anchor; 3-story with terminology + min principle + flip) are separate future specs.

## Risks / Non-Goals

### Risks
- **Warm-network selection bias is structural, not noise.** `MITIGATE` Early receivers are filtered by sender's network — disclose explicitly in any reported result. Do not extrapolate to cold propagation. Do not over-claim causation ("letter caused comprehension"); defensible claim is "evidence that the illusion is false."
- **Conflating received / read / responded.** `MITIGATE` Instrument all three stages distinctly; silent non-response is not a rejection.
- **Normative-language reactance.** `MITIGATE` Belief-capture prompts use neutral phrasing — never "should/right/appropriate." Pre-belief renders before `st7-a` (unprimed-before, per p852).
- **Commitment-only does not test standalone argument strength.** `ACCEPT` for warm v0 — receivers act because they trust the sender, not because the argument convinced them in isolation. Cold-receiver variant (separate spec) tests argument standalone; this v0 deliberately doesn't.

### Non-Goals
- Do NOT rebuild the full Clarity Letter flow — this is a minimal variant on existing infrastructure (defer to p842 for the full flow).
- Do NOT add the /live session requirement to v0 — v0 tests letter-level propagation and belief shift; the /live paraphrase-verification step is a separate downstream measurement.
- Do NOT ship without pre-registering the predictions (send/completion/rejection thresholds) before data collection begins — pre-registration is what makes this credible to Penn-adjacent norm researchers.
- Do NOT write NEW antipoint/story/point copy — v0 reuses existing `st7-a` / `st3` / `st8` content from the production letter. Only the belief-capture wording is `[FOUNDER DECISION]`.
- Do NOT build the 3-story or cold-receiver variants in v0 — separate future specs.

## Done-When

- [ ] A 1-story warm-propagation Clarity Letter variant is publishable, assembling `st7-a` antipoint + `st3` story (with existing image) + `st8` commitment + pre/post belief capture
- [ ] Pre-belief prompt renders BEFORE the receiver sees `st7-a` content (unprimed-before constraint, per p852)
- [ ] Click-through from 1-story variant to p842 full letter exists ("Why this matters")
- [ ] Send/forward events tracked (propagation coefficient computable)
- [ ] Paraphrase-completion tracked, distinct from rejection
- [ ] Rejection tracked with explicit-refusal vs silent-non-response distinguished
- [ ] Pre/post belief reasons-text captured and retrievable as paired data points
- [ ] Predictions pre-registered (written down before any data lands)
- [ ] Selection-bias caveat present anywhere results are surfaced

## Acceptance Criteria

- [ ] A receiver can complete the minimal letter end-to-end: pre-belief → see antipoint (`st7-a`) → read story (`st3` with image) → reach commitment (`st8` → clarity partnership agreement) → post-belief — without needing the full p842 flow
- [ ] The four signals (send, completion, rejection-split, belief-diff) are queryable after launch
- [ ] Founder can read paired pre/post belief texts to assess whether the illusion dissolved

## Open Questions (Founder Decisions)

- **RESOLVED** — Final copy for antipoint, story, point: v0 reuses `st7-a` (antipoint) + `st3` (story with existing image) + `st8` (commitment / clarity partnership agreement). No new copy at letter level.
- `[FOUNDER DECISION]` Exact pre/post belief-capture prompts — drafts proposed in Solution, pending approval.
- `[FOUNDER DECISION]` Pre-registered thresholds — needed before data collection. Suggested frame: "≥X% paraphrase-completion AND ≤Y% explicit rejection on warm sends confirms H-NormFlip directionally; below either means H-NormFlip needs refinement, not abandonment." Numbers needed.

## Related

- Tests **H-NormFlip** and **H-LetterAsProduct** (see `docs/hypotheses.md`) — the instrument is logged there under H-NormFlip's 2026-05-26 test mechanism.
- Builds on existing public Clarity Letter infrastructure + **p842** (letter full-flow redesign).
- Source: 2026-05-19 Bicchieri conversation (norm strength/stability, learning modes, five-stage norm creation).
