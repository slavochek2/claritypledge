---
status: rejected
type: task
rank: 1000970.0
workstream: letters
created_date: '2026-08-11'
completed_at: '2026-08-12'
tags: [align, letters, kdd, orchestration]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1051: The align agent — one confirmation in, one link out, and something that reads the number

> **REJECTED 2026-08-12 — the gate below can never open.** This spec is gated on *"one letter has been
> filed manually and rated, and the number turned out to be worth having."* On 2026-08-12 the founder
> ran the chain to the point of filing, rejected five candidates across two corpora, and then rejected
> the **form**: a letter is an async instrument and an agent is never absent, so it has no job to do.
> No letter will be filed on this route, so the precondition is unreachable.
>
> **Kept unreverted and readable** because three things in it survive the route that died: the
> pre-committed pass criterion (and its `>= 8`-is-indeterminate refinement), the `/problemify`
> confirmation-gate contamination finding, and the two `§Open` inputs. If the two-agent human-to-human
> configuration is built, re-read those before re-deriving them.
>
> See [decisions.md](../docs/decisions.md) 2026-08-12 [product] *"A letter is an async instrument and
> an agent is never absent."*

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

### What "worth having" means — PRE-COMMITTED 2026-08-12, before the first run

The phrase shipped undefined, which made the gate undecidable: a criterion chosen after seeing the
number can rationalise either outcome. Fixed here, founder-selected, **before** `/align-decompose`
was invoked on the first corpus.

> **PASS** — the founder's rating is `< 8` **AND** the miss names something he had **not** already
> noticed in the transcript.
>
> **FAIL** — rating `>= 8`, **or** rating `< 8` where the miss is something he already knew the
> agent had wrong.

**A `>= 8` is a FAIL of this gate but NOT a finding that the agent understood him** — founder
correction, 2026-08-12, applied before the first run. A high score is compatible with two worlds the
letter cannot separate: **genuinely captured**, and **undetected correlated error** — the agent
predicts high, he believed going in that he had been understood, the paraphrase is fluent enough
that he recognises himself in it, and nothing generates friction. That second world is the illusion
the product is named for, and it would be the most interesting result the chain could produce.

**Nothing in P1030 can tell them apart.** The letter seals a prediction and collects a rating; it
has no third signal testing whether the paraphrase *predicts his reasoning on a new case*, which is
the only thing that would discriminate. So the honest label for the `>= 8` branch is
**indeterminate**, not "captured".

It stays a FAIL for **this gate** regardless, and the gate stays decidable: neither world licenses
building an orchestrator whose back half exists to report what the agent got wrong. If the number
comes back `>= 8`, record it as indeterminate and do not write it up as comprehension achieved.

This refines, and does not retract, [decisions.md](../docs/decisions.md) 2026-08-12 [product]. That
entry's content is *do not over-claim the illusion*; this is the same discipline pointed the other
way — **do not over-claim its absence either.** What the solo loop reliably delivers is still
**gaps**, which is the useful thing and does not need to be the illusion to be worth having.

**Why this criterion and not calibration or willingness-to-re-run.** It is the same measure
H-BuildRightThing-**Cause** uses at installs — *"record whether the gap that surfaced was one the
team did not already know about"* ([hypotheses.md](../docs/hypotheses.md)) — so the instrument is
tested on the founder under the identical rule it will later be judged by on a customer. A
calibration criterion (`|predicted − actual| >= 3`) measures whether the agent can model him, not
whether he learned anything; a well-calibrated agent surfacing nothing would score as a pass. A
would-you-run-it-again criterion is read after the result and is the unfalsifiability this block
exists to close.

**Note the asymmetry, deliberately:** a high rating is a FAIL of this gate while being a *good*
result for the agent. That is correct. This gate asks whether the **orchestrator** is worth
building, and an agent that already understands him has nothing for a read-back stage to report.

**Scope, per [decisions.md](../docs/decisions.md) 2026-08-12 [product]:** a PASS licenses building
P1051 and nothing more. It is evidence about **gaps**, not about the illusion of shared
understanding — the solo loop cannot reach correlated error.

**First run is measuring capture score, not position flip.** The `lead_count: 0` tension recorded
in that same entry is resolved for run #1 in favour of capture score: it is what P1030 built, what
both conditional UI strings assume, and what every Done-When checks. Flip stays open and needs its
own letter.

This is not caution for its own sake: `.claude/rules/epistemic.md` gate 7 says an unexercised path
is unproven, and the align chain has **11 ledger lines and zero closed loops**. Automating a path
nobody has walked once is automating a guess.

## Open — two inputs this spec needs and does not have (recorded 2026-08-12, `UNTESTED`)

Surfaced in a separate conversation, **both legs verified against this repo before recording** — not
forwarded as an agent's claim (`.claude/rules/epistemic.md` gate 9).

**1. The front half has no trigger condition — it fires on *every* KDD.** Verified: the Solution
below says *"`/kdd` ends by running the real `/align-detect`"* with no selectivity, and the Risks
section names the consequence it can then only cosmetically mitigate (*"produces a menu the founder
must dismiss even when he does not want one… MITIGATE: three lines, no obligation"*). A cap on the
printed menu is not a trigger.

**Candidate trigger:** not "problem solving" and not stake, but **tasks whose success depends on
something private to the user that is not in the prompt** — *irreducible private information*. It is
selective in the right direction: where the agent has everything it needs, there is no gap to find,
and the menu is noise by construction.

**2. Severity has no detectability axis.** Verified: `/align-detect`'s card carries `stake`, `rung`,
`worst-case`, `holds-if` and `precedent`, and ranks on stake × low-rung. Nothing scores **whether the
miss would be visible from the artifact alone.**

> **Fourth criterion:** *can you detect the miss from the artifact alone?* Code fails loudly; a memo
> reads fine either way. A silent-miss item at equal stake should outrank a loud one.

**It would have re-ranked the first real run.** In `exchange-2026-08-10`, card 1 (the 10-hour cost
basis) is a **loud** miss — the overrun shows up on the calendar — and it ranks first on money. Card 3
(*convinced* operationalised as *opted-in*) is a **silent** miss: event #1 reads fine against the
pre-registered prediction either way, and the wrong conclusion is drawn with no error surfaced. Under
the current rank card 3 sits below card 1.

**Why this is not applied yet.** Both are changes to `/align-detect`'s rubric, and the gate above
still binds: the chain has zero closed loops. Applying a re-ranking rule before any card has produced
a rated letter tunes the instrument against no signal. Apply after the first number, together with
whatever else the read-back stage learns.

**Falsifier:** if the first few runs show loud and silent misses produce comparably useful letters,
the detectability axis is a distinction without a ranking consequence and should not be added.

**3. `/problemify` in the chain contaminates the measurement unless its confirmation gate is
suppressed — and this spec does not say to suppress it.** Found 2026-08-12 while sequencing a live
run; verified against both skill files.

The Solution below routes the single confirmation through *"framing (`/problemify`'s frame stage)"*.
But `/problemify` v5.0.0 writes Point A and Point B **in the founder's own first-person words** and
then **STOPs for him to confirm or correct**, with the explicit rule *"Never write B for the user. B
is theirs."* The A→B→obstacle bundle is **story material** ([story-point-model.md](../docs/story-point-model.md)
§"Deliberately kept fused"). So a frame he corrected becomes the material the agent then hands back
for him to score — which is `align-decompose`'s own contamination rule (*"A run where the founder
edited the text is CONTAMINATED for measurement purposes… do not report the resulting number as a
comprehension score"*), arriving through a sub-skill instead of through a direct edit.

**The fix is one sentence this spec is missing:** when invoked inside this chain, `/problemify` runs
**frame stage only, unconfirmed** — the frame is the agent's reconstruction, recorded to the run file,
never shown for correction. Stage 2 (the five-why) never runs, so the confirmation gate's stated
purpose (*"a five-why on the wrong obstacle is worse than no five-why"*) is not being bypassed —
there is no five-why to protect.

**Open question this raises, not resolved:** whether the frame stage earns its place at all.
`align-decompose` already reads the record in full and generates **three competing whys**; one
A→B→obstacle is less than that, not more. Decide when the chain is actually built — and note the
`/problemify` step was **skipped** in the first manual run for exactly this reason.

**Source:** a 2026-08-06 conversation on explicit user understanding (private export; not quoted
here). `H-StandingToClaimMeaning` and P1052 came out of the same thread.

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
