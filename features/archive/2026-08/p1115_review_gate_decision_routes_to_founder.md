---
status: rejected
type: task
rank: 47.0
created_date: '2026-08-19'
tags: [process, gates, review, operator-load]
delivery_stage: create-spec
pipeline_ran: [create-spec]
superseded_by: p1116
rejected: '2026-08-19'
rejection_reason: >-
  Absorbed, and its central build measured wrong. Both halves already have owners:
  the legibility half is P1116 Solution group 2, which lists the trigger "do we need
  adversarial review" verbatim and is in dev; the gate-coverage half is P1040 (open
  since 2026-08-10, rank 13). The remaining half — a blocking review gate — was
  falsified by a hand-classified sample of the same transcripts: of 25 asks whose
  answer was readable, 12 (48%) were "no review needed", 9 (36%) "yes, run one",
  4 (16%) "already ran". A blanket gate would have been wrong roughly half the time.
  The 366 headline is inflated ~32% by false positives (the word "review" in unrelated
  sentences); the real rate is ~3/active-day. Two points survived and moved to P1116.
driver: anomaly
---

# P1115: The "do we need a review?" decision routes to the founder ~366 times a quarter

## Problem

**Situation:** Across 1,615 Claude Code transcripts from 2026-05-15 to 2026-08-13, the
founder raised the pre-ship review decision **366 times on 70 of 82 active days** — 262
times as a question to the agent ("do we need adversarial review or code review before we
ship?") and 104 times as an instruction ("create a plan, then run adversarial review on
it"). The outcome never varied: a review was either run or confirmed already run.

**Complication:** A gate already exists and covers only a slice of this. `ship-gates.sh`
gate 2.7 requires a `type:"code"` entry in the shared `.finish-reviewed` artifact before
`/ship` proceeds. It does **not** cover: adversarial review (the gate matches `type:"code"`
only), plans and specs (never reach `/ship`), or doc-, skill- and private-repo work (never
enters the ship path). So most of the 366 fall outside any gate — and inside the covered
slice the founder still asks, because nothing surfaces at decision time that the gate
exists and will block.

**Question:** What rule decides when a review must run, when it may be skipped, and how is
that decision made visible at the moment the founder would otherwise ask?

## Appetite

Medium blast radius — changes what blocks shipping, and a rule that fires on everything
would add a review step to trivial work. Fully reversible (the gate is one script, the rule
is one file). Decision density is **high**: the skip policy is a founder decision, not a
technical one.

## Solution / Approach

Two parts, in order:

1. **Coverage.** Extend the review requirement past the ship path to the artifact classes
   the 366 actually cover — plans, specs, and non-code changes — and past `type:"code"` to
   adversarial review where the founder's own pattern shows he wants it.
2. **Legibility.** Make the answer visible without being asked. Where a review is already
   recorded, say so unprompted; where one is required and missing, say that instead of
   waiting to be asked.

The skip policy itself is `[FOUNDER DECISION: which change classes may ship with no review
at all?]` — the transcripts show what was asked, never what could safely have been skipped.

## Risks / Non-Goals

### Risks
- **A gate that fires on everything is worse than none** — it trains the founder to bypass
  it. Mitigation: the skip policy is decided before the gate is written, not after.
- **A gate that silently never fires looks identical to one that works.** Mitigation:
  exercise the failure path and paste the non-zero exit code before this ships. This is the
  repo's standing rule on gate artifacts and it is the single most likely way this work
  produces a false sense of safety.
- **The 366 count rests on regex classification** of transcript text — approximate, not
  exact. It is strong enough to justify the work and not precise enough to tune a threshold
  against.

### Non-Goals
- Do NOT rebuild code-review gating that gate 2.7 already provides — extend it.
- Do NOT auto-run reviews without recording that they ran; an unrecorded review cannot
  satisfy a gate and re-creates the asking.
- Do NOT widen this into general agent-orchestration work. That is a separate question.
- Do NOT change what `/finish` reviews or how it reviews it.

### Alternatives Considered
- **A rule in the always-on instruction layer instead of a gate.** Rejected: that layer is
  at its line budget and measured as contradictory in places (P1113). Prose that agents may
  or may not apply is what the current state already is.
- **Leave it.** Genuinely viable on throughput grounds — measurement showed being in the
  loop costs ~4 uncovered minutes per active day. Rejected because the cost here is founder
  attention on 85% of working days, not elapsed time.

### Rollback Strategy
Remove the added gate block from the script and revert the rule file. No data migration, no
state to unwind.

## Done-When

- [ ] A written skip policy exists naming which change classes require which review, and
      which require none
- [ ] The gate fails with a non-zero exit code on a staged violation, and that exit code is
      recorded in the spec or its KDD
- [ ] The gate passes on a change that legitimately needs no review — verified, not assumed
- [ ] Review status is stated to the founder without being asked, on both the covered and
      previously-uncovered paths
- [ ] A week of sessions after landing shows the question being asked materially less than
      the measured 4.5×/active-day baseline
