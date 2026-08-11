---
status: week
type: task
rank: 1000970.0
workstream: letters
created_date: '2026-08-11'
tags: [align, letters, kdd, orchestration]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1051: The align agent — one confirmation in, one link out, and something that reads the number

## Problem

**Situation:** P1030's chain is four stages across four skills — detect what deserves attention,
deconstruct it as a problem, formulate it as a chapter, file it for review. Each is genuinely
specialised and the pipeline needs all four.

**Complication:** Running it costs the founder **five invocations and five decisions for one
number**: invoke detect, confirm subject/reader, pick a card, invoke the framing step, confirm the
frame, invoke decompose, pick a variant, invoke filing, confirm the author. He has said plainly he
would not run that, and neither would anyone.

The root cause is not the number of skills. **Almost every one of those gates is the agent handing
the founder a decision because the agent could not make it** — and they were labelled
`[FOUNDER DECISION]` when they are nothing of the kind. Worse, gating on them **destroys the
measurement**: the guesses are the thing being scored, so a number that only ever scores
founder-approved guesses measures approval, not comprehension.

**And nothing reads the number afterwards.** The founder rates the letter in the product and the
loop ends there. No stage says *what the gap was* — which is the outcome he named as the one worth
having: *"the agent gathers evidence so he can later tell me, that was a gap because of this and
this, and this is how I helped you."*

**Question:** Can the chain run from one confirmation to one link, with the intermediate choices
**recorded rather than asked**, and can a stage after the rating turn the number into a finding?

## Appetite

**Medium blast radius, no product code.** Skill files and a KDD hand-off only — no schema, no UI, no
migration. It sequences skills that already exist and adds one read-back stage.

**Reversible** by `git revert` on skill files.

**Decision density: low, and deliberately deferred.** The design is settled (below). What is not
settled is whether it is worth building at all — see the gate.

## The gate — do not build this before the first number exists

**Build only after one letter has been filed manually and rated, and the number turned out to be
worth having.** If the first reading says the chain produces nothing useful, this spec is dead and
nothing was spent on it.

This is not caution for its own sake: `.claude/rules/epistemic.md` gate 7 says an unexercised path
is unproven, and the align chain has **11 ledger lines and zero closed loops**. Automating a path
nobody has walked once is automating a guess.

## Solution

### Front half — KDD hands off, the align agent runs the rest

**`/kdd` ends by running the real `/align-detect`.** Not a trimmed variant — there is no principled
reason for one, and the difference that looked real is not:

- The blocking `SUBJECT / EXCLUDED / READER` gate is **auto-resolved in the KDD context**, because
  KDD determines all three: subject = the exchange, reader = the founder, corpus = the session just
  captured. It states its resolution in one line rather than asking. This is the same skill with a
  known invocation context, not a different skill.
- The corpus is already in KDD's context, so there is no extra read to save.
- Detection is one reasoning pass. Token cost is not the reason for a variant, and was never
  measured to be.

**It prints the top 3 and records the rest.** The cap is on the printed menu, not on detection —
same principle as `align-decompose` v2's "record everything, print little."

**The founder confirms one item. That single confirmation runs everything else**: framing
(`/problemify`'s frame stage — its A→B→obstacle bundle is *story material*, recorded as such in
`decisions.md` 2026-08-06), chapter construction, and filing. It stops exactly once more, at the
prod write.

### Back half — something reads the number

After the founder rates the letter, a stage queries `story_verifications` for his number and the
agent's sealed prediction, and reports:

- the gap between predicted and actual,
- **what the agent got wrong**, traced to the recorded intermediate choices (which item, which
  frame, which angle) — this is what the recording-instead-of-asking buys,
- whether this was an ordinary gap or something stronger, **scoped honestly** (see Non-Goals).

### The four stages stay four skills

Each is good at one job and hands output to the next. The founder's own framing, and correct: the
number of skills and the number of interruptions are independent variables, and only the second was
the problem. An earlier recommendation to merge them into one skill is **withdrawn and recorded here
so it is not re-proposed**.

## Risks / Non-Goals

### Risks

- **The single confirmation doubles as prod-write approval.** `[FOUNDER DECISION]` — recommended
  yes, on the grounds that one private letter to himself is not a surprise external effect.
  **MITIGATE:** the confirm prompt must say so in plain words, never slide it past him.
- **Compounded error becomes undiagnosable.** Bad item + bad frame + bad angle yields a low number
  that does not say which stage failed. **MITIGATE — this is exactly what the run file is for:**
  every intermediate choice is recorded, so the back half can attribute the miss. Auditable without
  being interactive.
- **Detect running on every KDD produces a menu the founder must dismiss even when he does not want
  one.** **MITIGATE:** three lines, no obligation, and "none of these" is a valid answer that costs
  one keystroke.

### Non-Goals

- **Do NOT change P1030.** Its UI half is built and unmerged; adding orchestration to a spec at
  `spec-review` delays the one thing missing, which is a number.
- **Do NOT merge the four skills.** See above — the recommendation was withdrawn.
- **Do NOT report an ordinary gap as the illusion of shared understanding.** The solo loop is
  structurally the least able to reach correlated error (`definitions.md` §Verification Threshold:
  the min-gate is *"structurally blind to convergent (correlated) error"*, and the illusion is
  *"correlated, not idiosyncratic"*). The back half reports **gaps**; claiming more is
  over-reporting.
- **Do NOT build any multiplayer or challenger surface.** Archived at P1050.
- **Do NOT wire detect into KDD before the manual run.** See the gate.

## Done-When

- [ ] `/kdd` ends by naming detected items — top 3 printed, all recorded, subject/reader resolved
      and stated rather than asked
- [ ] One founder confirmation carries the chain through framing, decomposition and filing
- [ ] The chain stops exactly once more, at the prod write, and the prompt says in plain words that
      confirming files a letter
- [ ] Every intermediate choice the agent made is in the run file, and none of them was asked
- [ ] After the founder rates, a stage reports the predicted-vs-actual gap and attributes the miss
      to a named stage
- [ ] Running the front half writes nothing to prod
- [ ] The whole path is exercised end to end once before it is trusted — including a deliberately
      wrong item, to see the back half attribute it correctly

## References

- [features/p1030_reverse_story_and_align_pipeline.md](p1030_reverse_story_and_align_pipeline.md)
  — the chain this orchestrates; unchanged by this spec
- [features/archive/2026-08/p1050_challenger_stories_agents_vs_humans.md](archive/2026-08/p1050_challenger_stories_agents_vs_humans.md)
  — archived; source of the correlated-error scoping in Non-Goals
- [decisions.md](../docs/decisions.md) 2026-08-06 [product] — `/problemify`'s A→B→obstacle bundle is
  story material, which is why it is the framing stage
- [definitions.md](../docs/definitions.md) §Verification Threshold — the structural blindness that
  bounds what the back half may claim
- `.claude/commands/slava/think/align-detect.md` ·
  `.claude/commands/slava/think/align-decompose.md` ·
  `.claude/commands/slava/think/align-create-letter.md` ·
  `~/.claude/commands/slava/think/problemify.md`
