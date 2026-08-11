---
status: today
type: comment
rank: 1000970.0
workstream: letters
created_date: '2026-08-11'
tags: [align, letters, verification, hypotheses]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: heuristic
---

# P1050: Challenger stories — do external readers beat the in-context agent, and why

## Problem

**Situation:** P1030 builds a two-party loop — one agent paraphrases the founder's reasoning as a
reverse story, the founder scores how well it captured his meaning. Nothing beyond that pair
exists.

**Complication:** The construct the product is named for is **correlated error**.
[definitions.md](../docs/definitions.md) §Verification Threshold states it plainly: the min-gate is
*"structurally blind to convergent (correlated) error — both parties at 8, both wrong, the min is 8,
the gate opens, and the illusion survives intact"*, and the illusion of recursive understanding is
*"correlated, not idiosyncratic."* An agent that shared the founder's whole session **is inside the
correlation.** So the configuration P1030 builds is the one structurally least able to reach the
thing it is named after — it reveals ordinary gaps, which is worth doing, but should not be reported
as finding the illusion.

**Question:** Does a reader who is *outside* the pair surface gaps the pair cannot — and if so, is
the active ingredient **missing shared context** or **standing to claim an intended meaning**? These
predict different things and are separable by one experiment.

## Appetite

**Zero blast radius — nothing is built here.** This spec exists to hold two candidate bets and the
open questions that would have to be resolved before either could be tested, so the P1030 critical
path is not carrying them.

Fully reversible: it is a document. Decision density is high and deliberately unresolved — every
open question below is genuinely open.

## Approach

Record both bets with falsifiers, record what would have to be true to run either, and stop. **Do
not design the multiplayer feature here.** The bets graduate to
[hypotheses.md](../docs/hypotheses.md) via `/slava:maintain:docs-strategy-update` at the moment a run
is actually designed — not before, so the hypotheses file does not accumulate bets nothing is
positioned to test (CHARTER rule 4: a bet carries its own falsifier and priority, and belongs there
once it is one).

### Candidate bet 1 — H-CorrelatedBlindSpot

> A reader who does **not** share the context surfaces comprehension gaps that a shared-context pair
> structurally cannot, because the illusion is correlated error and correlated error cannot be broken
> from inside the correlation.

**Predicts:** a context-blind agent challenger outperforms the in-session agent on the founder's
capture rating.

**Falsifier:** across the first N chapters, context-blind challengers score no higher than the
in-session agent ⟹ shared context is not the active variable.

### Candidate bet 2 — H-StandingToClaimMeaning

> Humans outperform agents as challengers **not** because of context but because a human can
> credibly claim an intended meaning of their own. An agent has no persistent identity to own one —
> behind it sits a body of training material, so *whose* intended meaning is undefined — and a
> challenge from something that cannot hold a meaning is not taken as seriously.
>
> Founder-originated, 2026-08-11. **UNTESTED, n=0.**

**Predicts:** **no** agent challenger does well, regardless of how much context it has or lacks.
Human challengers beat every agent configuration.

**Falsifier:** a context-blind agent challenger performs comparably to human challengers ⟹ the
deficit is context, not standing, and bet 1 holds instead.

### The discriminating experiment

The two bets differ on exactly one cell: **the context-blind agent.** Bet 1 says it improves; bet 2
says it does not. Running that one arm separates them. Neither bet needs its own study.

### Scope note — this does not bite on P1030

Bet 2 concerns the **challenger** role, where the reader states their own story and position. In
P1030 the agent is the **listener**, claiming comprehension of the founder's meaning and claiming no
meaning of its own. Standing is required to be challenged, not to paraphrase. P1030's premise
survives bet 2 intact.

## Risks / Non-Goals

### Risks

- **Confounded position movement.** If the founder reads N challenger stories and his position
  moves, no design here says which story moved it. **MITIGATE (when built):** capture the position
  after each story, not once at the end.
- **The metric must be pinned before any data.** P1015's own rule — *a measure invented after seeing
  the data is not a measure* — applies. **MITIGATE:** the comparison metric is the founder's 0–10
  capture rating, which already has a UI and is directly comparable across authors. Fixed here,
  before any challenger exists.
- **Blind-vs-informed is a fork, not a setting.** Challengers arriving after the founder has already
  corrected the agent's story see an easier task. Blind challengers make the comparison fair;
  informed challengers write better stories. **ACCEPT that only one can be true per run** — and
  declare which before the run, not after.
- **It reintroduces the frozen premise.** `decisions.md` 2026-07-14 [product] froze alignment tooling
  because it *"cannot be dogfooded solo."* P1030's unfreeze works by manufacturing the counterparty
  with an agent. Human challengers put the original dependency back — real people who will do this.
  **ACCEPT, and it is why this is parked:** it is a different bet with a different blocker, not
  phase two of P1030.

### Non-Goals

- **Do NOT build any multiplayer surface.** No invite flow, no challenger role, no UI.
- **Do NOT add these to `hypotheses.md` yet.** They graduate when a run is designed (see Approach).
- **Do NOT widen P1030.** It stays single-founder, single-agent, private letters.
- **Do NOT resolve the open questions below by reasoning.** They are open because no data exists.

## Research Questions

1. **Does the schema already support it?** `story_points` is a many-to-many junction, so several
   competing stories can link to one point without a migration. Verify against the migration rather
   than this sentence before relying on it.
2. **Blind or informed challengers** — which does run one use, and what is given up either way?
3. **What does a challenger actually receive?** The fact point and anti-point only, or the founder's
   story too? The second makes it a critique; the first makes it an independent attempt. They are
   different experiments.
4. **How does a challenger ask a question?** The founder described challengers asking him questions
   and then writing. There is no async question channel between a reader and a story author today.
5. **Is the comparison per-chapter or per-challenger?** One story each on one chapter, or a
   challenger who works several?
6. **How many chapters before the comparison means anything?** No estimate exists; a number invented
   now would be the measure-after-the-data failure in a different costume.

## Deliverable

This document, plus — when a run is designed — two entries in `hypotheses.md` filed through
`/slava:maintain:docs-strategy-update`.

## Done-When

- [ ] Both bets are recorded with falsifiers that name the observation, not a feeling
- [ ] The discriminating experiment (context-blind agent) is stated as one arm, not two studies
- [ ] The comparison metric is fixed in writing before any challenger data exists
- [ ] P1030 carries no scope change as a result of this spec — verified by diff
- [ ] Nothing was added to `hypotheses.md` by this spec

## References

- [features/p1030_reverse_story_and_align_pipeline.md](p1030_reverse_story_and_align_pipeline.md) —
  the two-party loop this sits outside of
- [definitions.md](../docs/definitions.md) §Verification Threshold — the structural blindness to
  correlated error that motivates bet 1
- [decisions.md](../docs/decisions.md) 2026-07-14 [product] — the alignment build freeze and its
  stated premise
- [features/p1015_agent_listening_calibration_twin_first.md](p1015_agent_listening_calibration_twin_first.md)
  — parked; source of the measure-before-the-data rule
- [story-point-model.md](../docs/story-point-model.md) — story/point axes, the anti-point's routing
  table
