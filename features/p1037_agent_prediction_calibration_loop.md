---
status: backlog
type: story
rank: 1000961.0
workstream: letters
created_date: '2026-08-10'
tags: [calibration, agent, align, prediction, measurement]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: heuristic
---

# P1037: The agent's prediction learns from its own history

**Follow-up to [P1030](p1030_reverse_story_and_align_pipeline.md).** Related but distinct from
[P1015](p1015_agent_listening_calibration_twin_first.md) — see §Relationship.

---

## Problem

**Situation:** P1030 makes the align agent commit a sealed prediction before each reverse-story
letter — *"I believe the experience owner will rate my capture of his meaning at N/10."* The
experience owner then rates it. Every run therefore produces a **pair**: what the agent thought,
and what was true.

**Complication:** The agent never reads the previous pairs. Each run guesses fresh, from nothing.
A system whose entire thesis is that **unverified confidence is the defect** currently has an agent
that cannot tell whether it habitually over-rates itself by three points, and no mechanism by which
it could find out. P1030 writes the data and stops there.

**Question:** Does an agent that has seen its own guess-vs-actual history predict better than one
guessing cold — and if it does, is the improvement real calibration or just regression toward the
observed mean?

## Appetite

**Low blast radius.** Reads existing rows and changes one number in one skill. No schema change is
obviously required — `letter_predictions` already holds the guess and `story_verifications` the
actual; whether a durable per-agent record is needed is an open question, not a premise.

**Fully reversible** — the feature is a paragraph of instruction plus a query. Remove both.

**High decision density, and that is the real cost.** How much history to show, whether to show the
gaps or a summary statistic, and whether to correct the guess mechanically or leave the adjustment
to judgement, are all unresolved and all change what the number means.

## Approach

Before committing its prediction, the agent retrieves its own prior (prediction, actual) pairs and
reasons over them explicitly — stating the historical pattern, then its guess, then whether the
pattern moved it and by how much.

Deliberately **not** an automatic correction. A mechanical adjustment (subtract the mean gap)
converts a judgement into arithmetic and would make the number look calibrated while measuring
nothing about comprehension. The point is a **visible** reckoning with a track record.

Open at spec time, to be resolved before build:

- Whether the history is per-agent, per-corpus, or per-experience-owner.
- Whether a run the founder edited (P1030 marks these `contaminated`) enters the history at all. It
  should probably not.
- Whether re-run guesses within a single decompose (`7 → 5 → 6`) count as one data point or three.
  They are not independent, so probably one.

## Relationship to P1015 and P1030

Three different measurements of the same construct — how well an agent understands the founder —
and the distinction is what keeps them from being one spec:

| | Measures | Source |
|---|---|---|
| **P1015** (parked) | corrections that arrive **unasked** during ordinary work | passive |
| **P1030** (active) | a paraphrase the founder **scores on request** | active, per-run |
| **P1037** (this) | whether the agent **knows** how good its paraphrases are | meta, across runs |

P1030 asks *did you understand me.* P1037 asks *did you know whether you understood me* — which is
the question the whole product is about, pointed at the agent instead of at a person.

**Hard precondition: this is meaningless with one data point,** and near-meaningless with three. It
stays in the backlog until P1030 has produced enough runs that a pattern could exist and could be
wrong. Do not build it to be ready.

## Risks / Non-Goals

### Risks

- **Regression to the mean impersonating calibration.** An agent shown "you average 3 points high"
  will guess lower and appear better, having learned an intercept rather than anything about the
  story in front of it. **MITIGATE:** the falsifier below is designed to separate these — hold out
  runs and check whether accuracy improves *per-story* rather than only on average.
- **Contaminating P1030's own measure.** If the agent's prediction becomes a function of history
  rather than of its reading, P1030's gap stops measuring comprehension. **MITIGATE:** the
  reckoning is stated separately from the guess, so both are visible and P1030's number can still
  be read against the cold guess.
- **Too few runs, forever.** A reverse-story letter costs a real read from the one person who can
  score it. This may never accumulate a usable N. **ACCEPT** — if so, that is a finding about the
  measurement's cost, not a failure of this spec.

### Non-Goals

- **Do NOT build this before P1030 has produced several real scores.** The precondition is the
  point, not a formality.
- **Do NOT apply a mechanical correction** to the prediction. Visible reasoning, never arithmetic.
- **Do NOT add a schema column** until the existing rows are proven insufficient — `letter_predictions`
  and `story_verifications` already hold both halves of every pair.
- **Do NOT extend this to human senders.** This is the agent grading itself; a feature that told
  users "you usually over-rate yourself" is a different product decision entirely.
- **Do NOT include contaminated runs** (P1030's marker for a founder-edited paraphrase) in the
  history without deciding that question explicitly first.

## Done-When

- [ ] The align agent states its prior (prediction, actual) pairs before committing a new prediction
- [ ] The stated history matches what the database actually holds — verified by query, not asserted
- [ ] The reckoning and the guess are separately visible, so the cold guess is still recoverable
- [ ] Contaminated and re-run guesses are handled per the rule decided at build time, and the rule
      is written into the skill
- [ ] A falsifier is recorded: **hold out runs and check whether per-story accuracy improves, not
      just mean accuracy.** If only the mean improves, the agent learned an intercept and this
      spec's claim is refuted
