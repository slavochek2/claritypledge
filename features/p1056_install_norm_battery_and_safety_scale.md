---
status: backlog
type: task
rank: 1000974.0
created_date: '2026-08-12'
tags: [measurement, norms, installs, instrument]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: heuristic
---

# P1056: Install Norm Battery + Psychological-Safety Scale (Tier 2)

**Split from [p1055](p1055_norm_measurement_instrument.md) on 2026-08-12** — that spec is now Tier 1 (free events) only, so it contains only what gets executed. This holds the deferred install half so it keeps a P-number and a rank instead of a paragraph nobody can schedule.

## Problem

**Situation:** An install is a paid engagement (€4,500, banded) sold on the promise that something changes in the team. Nothing currently shows a buyer that anything moved — not at renewal, not in a case study, not to a collaborator.

**Complication:** The instrument that would show it cannot be built against a real reference network yet. **Zero installs exist** ([goals.md](../docs/goals.md), [lean-canvas.md](../docs/lean-canvas.md) — *"zero events run, zero members"*, both dated 2026-08-10), and the rung above the install has not been sold either. A battery designed against an imagined team measures the designer, not the team.

**Question:** What gets asked at T0 and T2 of an install, such that (a) the buyer sees a before/after they'd renew on, and (b) the rows pool with the Tier 1 event data rather than forming a second incompatible dataset?

### What this is honestly for

**The commercial motive is the live one.** The before/after number is the renewal argument for the €295/mo rung and the case-study material.

**The research motive is real but bounded, and must not be overstated.** This serves [hypotheses.md](../docs/hypotheses.md) H-NormRaisesSafety — but that hypothesis's own entry says it is *"Deferred, not close to testable: needs temporal separation + a control arm, **which a commercial engagement cannot supply**."* An install supplies temporal separation and no control arm. **So this spec produces evidence about a client, not a test of the hypothesis.** Writing it up as the latter is the failure mode this section exists to block.

## Appetite

**Blast radius: medium.** Not code. Changes what happens at the start and end of every paid install, and produces the numbers that go in front of a buyer at renewal.

**Reversibility: high for the protocol** (stop asking), **low for the data** — a T0 not captured cannot be captured retroactively, and install #1's T0 is gone the moment the engagement starts without it.

**Decision density: low, and deliberately not resolved now.** Item wording is inherited from P1055, not invented here. The open decisions are about who the reference network is for a real buyer, which requires a real buyer.

## Approach

Tier 1 (P1055) in full, plus two additions, run at **T0** (before any install work) and **T2** (at the milestone).

### 1. The full norm battery against the buyer's real reference network

P1055's items are scoped to the room; here they are scoped to the team the buyer actually works in — reference network **(B)** in [hypotheses.md](../docs/hypotheses.md) (*"their colleagues"* — the network the intervention targets, and the commercially interesting one). The battery adds, beyond the Tier 1 four:

- Empirical expectation and normative expectation against the **named team**, not a self-anchored stem
- Sanction expectation
- Personal normative belief, using the **identical predicate wording** as the normative-expectation item

### 2. Edmondson's 7-item psychological-safety scale — installs only, run whole

Run **complete**. A subset of a validated scale is not that scale, and reporting a 3-item excerpt as "Edmondson" is a claim the instrument cannot back. Installs only: an event has no team, no T2 and no control, so the number cannot mean anything there.

### Blocking precondition

**Do not build this until one install is sold.** Not a scheduling preference — the battery's reference network is *a specific team the buyer names*, and there is no way to write those items against a team that doesn't exist. Until then this spec's correct state is `backlog`.

## Risks / Non-Goals

### Risks

- **MITIGATE — A pre/post rise gets written up as evidence for H-NormRaisesSafety.** There is no control arm, so any T0→T2 movement is confounded with attention, expectancy, selection, and the engagement itself. Mitigation: the non-goal below, plus every report of the number carries the no-control caveat inline, not in a footnote.
- **MITIGATE — Item wording drifts from P1055 and the datasets stop pooling.** Mitigation: the behaviour definition and the predicate wording are *copied* from P1055's card, never re-derived. Same constraint binds [p851](p851_minimum_clarity_letter_field_experiment.md) if it revives — three instruments that don't share wording produce three n=small datasets instead of one.
- **ACCEPT — n will be tiny for a long time.** Install #1 is n=1 team. This is a case-study instrument before it is anything else, and that is the honest framing at this scale.
- **MITIGATE — T0 gets skipped because the engagement is already underway.** The first install will be exciting and the measurement will feel like friction. Mitigation: T0 capture is a precondition of the install starting, listed in the install's own checklist rather than this spec.

### Non-Goals

- **Do NOT report this as a test of H-NormRaisesSafety.** No control arm exists. Report it as client evidence.
- **Do NOT run a subset of Edmondson's scale** — here or anywhere.
- **Do NOT run Edmondson's scale at free events.** That constraint lives in P1055 and is repeated here only because this is the spec that owns the scale.
- **Do NOT invent item wording.** Inherit from P1055's card; where this spec departs, label the item as ours.
- **Do NOT build this before an install is sold.** See the blocking precondition.
- **Do NOT add app/UI work.** Paper, form, or facilitator script. Any `/meet` or product integration is a separate spec.
- **Do NOT build Tier 3** (conditionality vignettes, per-contact expectation mapping, generation-2 fidelity).

### Alternatives Considered

- **Keep Tier 2 inside P1055.** Rejected 2026-08-12 (founder): P1055 becomes what gets executed at event #1; an unbuildable half sitting in an executable spec makes its Done-When unsatisfiable and its status unreadable on the kanban.
- **Use only Edmondson's scale and skip the norm battery.** Rejected: it contains no empirical expectation, no normative expectation and no conditionality — it is predominantly sanction/consequence expectation, so it cannot detect a norm. Inherited from P1055.
- **Design the battery now, against a hypothetical team.** Rejected: the reference network is the one thing that cannot be assumed. [hypotheses.md](../docs/hypotheses.md) is explicit — *"Do not ask about hypothetical or anticipated groups; a group whose behavior has never been observed has no empirical expectations to report."*

## Done-When

- [ ] One install exists and its T0 capture ran **before** any install work began
- [ ] The battery's behaviour definition and predicate wording are byte-identical to P1055's card (checked by reading them side by side)
- [ ] Edmondson's 7 items are present in full, unmodified, and labelled as his
- [ ] Reference-network items name the buyer's actual team, elicited from the buyer, not assumed
- [ ] T2 capture ran at the milestone, with the same items in the same order
- [ ] A before/after row exists that a buyer can read without explanation
- [ ] Every write-up of the psychological-safety delta states, in the same paragraph, that there is no control arm

## Research Questions

1. Do the buyer's team-scoped empirical and normative expectations diverge at T0 — i.e. is pluralistic ignorance present in a real team, not just a room?
2. Does the T0→T2 delta on gap-admission expectations move at all, and in which of the two expectation types first?
3. Does the psychological-safety score move alongside it? *(Descriptive only — no control arm, so directionality is not attributable.)*
4. Do the install rows pool with the Tier 1 event rows, or does the reference-network change break comparability in practice as well as in principle?

## Deliverable

A T0/T2 capture sheet with one row per install, plus the inherited P1055 facilitator card scoped to the buyer's team. Not an app, not a report.

## References

**Parent:** [p1055](p1055_norm_measurement_instrument.md) — Tier 1, free events. This spec is unbuildable without its card.
**Adjacent, not superseded:** [p851](p851_minimum_clarity_letter_field_experiment.md) — the instrumented letter variant. Must share item wording or neither dataset pools.
**Not related despite the name:** [p421](drafts/p421_presession_safety_check.md) — an in-product pre-session check, a feature rather than an instrument.
**Hypotheses:** [hypotheses.md](../docs/hypotheses.md) H-NormRaisesSafety (bounded, see Problem) · H-NormFlip · H-Community-Retention.
**Sources:** indexed at `.private/research/INDEX.md`.
