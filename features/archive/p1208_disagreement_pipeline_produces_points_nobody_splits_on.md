---
status: rejected
type: task
rank: 1000059
workstream: infrastructure
created_date: '2026-09-01'
tags: [disagreement, pipeline, points, friction]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1208: The pipeline shipped five points and the founder agreed with all of them


> ## REJECTED 2026-09-01 — SUPERSEDED BY [P1210](../p1210_disagreement_pipeline_objective_and_point_unit.md)
>
> **Closed by founder decision, not implemented.** Rewritten rather than revised: two adversarial rounds
> corrected sentences in this document while its four-workstream frame — the part that was wrong —
> survived both, because a revision only edits what someone points at. The successor states the
> pipeline's objective for the first time, changes the unit of a point to a contradiction sentence plus
> the two people on its ends, and lets cast size follow the point target.
>
> **Kept for its evidence and its dead ends**, both carried into P1210's Problem and
> *Alternatives Considered*. **Do not implement anything below.**
>
> **Known defect in this file:** it pairs named real people with agent-derived position values in a
> public repo, which `positions.md` Step 4d and `prepare.md` Stage 5 both forbid. Recorded as P1210
> Open Question 3.

> ## STATUS: NOT READY TO IMPLEMENT — two adversarial rounds, second verdict REJECT
>
> **Round 1 (9 findings, 2 CRITICAL) — applied.** Round 2 on the revised spec: **REJECT FOR
> IMPLEMENTATION**, on grounds that are corrections to *this document's claims*, not to the pipeline:
>
> - **The cast-spans-fork check passes the run it was written to catch** (LeCun and Bengio do span
>   the open-weights fork), while the Done-When demanded it fail. **The identical error the split gate
>   made earlier in this same spec** — an algorithm specified, a verdict demanded that it does not
>   produce, twice in one document by the same author.
> - **"H2 refuted" overclaimed.** One `close`/`close` pair on one statement with two positioned
>   arguers refutes *"nothing here is contested"*, not *"this topic is contested"*.
> - The proposed check **overlaps existing Phase 3 obligations** rather than being wholly absent.
> - Round-1 fixes did not land at every site, and the document still bundles two independent changes.
>
> **Both rounds' corrections are applied above.** What remains is not editing — it is the design work
> the review says is undone: specifying the cast-spans-fork rule with controls, and splitting the
> friction catalogue out. **Take this to a fresh session**; it was written at the end of a long one,
> and the recurring defect in it is the one that long sessions produce.

## Problem

**Situation:** `ai-power-remedies` run B completed end-to-end and filed to test — 4 stories, 5 points,
14 positions. The founder then did the one thing the product exists for: he answered the points.

**Complication:** He agreed with everything. The measurement says he was right to:

```
P1  n=2  Bengio 0 · Harari +2                       ** NO OPPOSITION **
P2  n=4  LeCun +3 · Bengio +2 · Andreessen +2 · Harari +1   ** UNANIMOUS AGREE **
P3  n=3  LeCun +2 · Bengio −2 · Andreessen +2       2 v 1
P4  n=3  LeCun +2 · Bengio −1 · Andreessen +3       2 v 1
P5  n=2  LeCun +3 · Bengio −3                       1 v 1
```

**Only one arguer ever disagrees with anything.** Remove Bengio and there is no disagreement anywhere
in the run. Two of five points have no opposition at all, and P2 — the point four experts agree on
unanimously — was predicted at **20% room agreement**.

**Question:** A pipeline whose stated purpose is producing points that split a room shipped points
that do not split the four people it selected *for being divergent*. Where did that happen, and what
gate would have caught it?

> Founder framing, verbatim: *"if our disagreement pipeline produces points at the end where the
> people that we selected don't split, then I think also we either selected them badly, they are not
> really divergent... we want to use these points and stories to split the audience but if we created
> something where we think the audience will split but we didn't give them opposing views, why would
> we think they would split? Split on what?"*

> *"I myself tested it. I went through the points and I clicked everywhere agree... it required me a
> bit more thinking, but then I just agreed. So it's not really polarizing and that means our
> pipeline doesn't do the job."*

**What follows is a set of COMPETING HYPOTHESES, not a diagnosis.** *(Downgraded 2026-09-01 after
adversarial review. The first draft asserted "the topic is sound, the cast failed" from P5's +3/−3 and
P3's −2/+2 — and that inference does not hold. Those statements were **invented by `prepare`**, whose
Stage 4 explicitly constructs claims so that each source's quotes commit them to opposite ends. An
apparent split can therefore be construction-induced. P3 is the clear case: LeCun never addresses its
regulation comparison at all, and Bengio opposes it on safety grounds rather than on concentration.
The first draft quoted `positions.md`'s "an agent-derived split is a HYPOTHESIS, never a finding" and
then committed exactly that error two paragraphs later.)*

| Hypothesis | What it would mean |
|---|---|
| **H1 — contested topic, collapsed cast** | Repair the cast and re-run. The original draft's assumption |
| **H2 — narrowly contested topic made to look broadly contested** | **NARROWED, not refuted, 2026-09-01.** P5's `close`/`close` opposition kills the universal form (*"nothing is contested"*); the weaker form — contested on one axis, converged on the rest — survives and fits the data better than H1 alone |
| **H3 — contested topic, defective statements** | The points are wrong, not the people |
| **H4 — position-assignment artifacts** | The measurement is wrong |

### Discriminating evidence run 2026-09-01 — H2's UNIVERSAL form is refuted; H2 itself is not

**On P5, LeCun is `strongly_agree [close]` and Bengio is `strongly_disagree [close]`.** Both carry the
`close` label, which `positions.md` defines as *"the speaker argued this directly; the generalization
barely moves."* That is the strongest evidence class the pipeline produces, at maximum magnitude, in
direct opposition. **A `close` position is not an agent's inference — it is the speaker's own
argument**, so P5's split cannot be dismissed as construction-induced the way P3's can (P3 is
`derived` on both agreeing sides, and LeCun never addresses its regulation comparison at all).

**Consequence, stated narrowly — the first version of this paragraph overclaimed and was corrected
the same day.** What P5 establishes: **at least one** genuine, directly-argued opposition exists
between **two** of the four arguers, on **one** constructed statement. That refutes the *strongest
universal* form of H2 — *"nothing here is contested"*. It does **not** establish that the topic is
broadly contested, and it cannot: P5 has only **two positioned arguers**, and one opposed pair on one
statement is compatible with a topic that is contested on a narrow axis and converged everywhere else
— which would still produce exactly the run we got.

**H2 survives in its weaker and more plausible form:** *the topic is contested on the open-weights
axis and near-converged on the others, and point construction made the converged axes look
contested.* That is fully consistent with P1/P2 having no opposition at all.

**Still live: H1 (collapsed cast) and H3 (defective statements)**, and they are not exclusive. The
run produced one real opposition and four points that mostly failed to find one — consistent with a
real fork whose poles were half-missing (position 3 unfilled, two arguers voting alike) *and* with
statements that failed to locate the fork they were built for.

**Still unrun, and still the only thing that settles it: room responses.**

### The early-rejection check ALREADY EXISTS, and it is not where this failed

*(Recorded because the natural fix — "make the pipeline reject converging topics at the start" — is
already built, and re-adding it would leave the actual gap untouched.)*

`select` **Phase 0** establishes contestedness **before any search runs**. It returns `CONTESTED` or
`CONSENSUS`, and a `CONSENSUS` verdict **STOPS the run with no search performed and no run file
written**. It refuses to return `CONTESTED` unless an actual contradiction sentence can be written
for at least one pair. It has fired correctly on this very subject area: the original *"does AI
concentrate or distribute power"* topic measured as **CONSENSUS** and had to be reframed to remedies
(`p1171`).

`select` **Phase 3** then tests whether the *selected sources* carry the fork Phase 0 found — the
skill states the distinction explicitly: *"a topic can be genuinely contested and still yield four
videos that all argue the same thing."*

**So both checks exist, and both passed.** Phase 0 was right (P5 proves the fork is real). Phase 3
returned a clean verdict on a cast where one pole was empty and two arguers voted alike.

**The missing check is neither of those. It is: does the ASSEMBLED CAST still span the fork Phase 0
found?** Phase 0 validates the topic. Phase 3 asks whether sources argue their claimed positions.
Nothing asks whether the surviving set still has a voice at each end of the specific contradiction
sentence Phase 0 wrote down. On this run it did not — and the contradiction sentence Phase 0 wrote
is sitting in the run file, unused after selection.

**What would discriminate the remaining hypotheses:**

1. Reconstruct alternative points from the same cast, blinded to the existing points.
2. Apply the existing points to a repaired cast.
3. **Obtain actual room responses** — the pipeline's own standard: *only a room's answers are evidence*.
4. Independently rate whether each inference chain supports its comparative wording, P3 especially.
5. Compare topic-level stance evidence gathered **before** any synthesized point exists.

**Workstream B's cast remedy must not be implemented as though it were the root-cause fix.** It is the
remedy for H1 only.

What is NOT in doubt: two of five voices were absent from the measurement.

1. **Position 3 (halt development) went UNFILLED.** It was the only voice opposing *both* camps.
2. **LeCun and Andreessen collapsed** — same sign on every point where both hold a position.
3. Four arguers became roughly two-and-a-half voices, all but one leaning the same way.

**Both defects are already detected by checks added on 2026-08-31 (P1202) — and both checks run too
late to prevent anything.** The same-vote collapse check and the room-vs-arguer gap print live in
`positions`, which runs *after* `prepare` has built and sealed the points. They report a diagnosis
onto a finished artifact.

**The structural hole:** `prepare` builds each point *so that* the arguers land at opposite ends —
but that is the extractor's **guess**, made before any quote is selected. `positions` then measures
the real positions against real quotes and may **flip** them. Nothing re-checks whether the points
still split after the flip. The pipeline validates its central claim against a hypothesis and never
against the measurement.

`positions.md` states the epistemics correctly and then nothing acts on them: *"An agent-derived split
is a HYPOTHESIS, never a finding — and this is the most important sentence in this file."*

## Founder ruling, 2026-09-01: this run is NOT publishable

> *"I guess this run overall is not publishable. We cannot go ahead with this content."*

**Binding.** The four stories and five points filed to the **test** database stay there as the
evidence this spec rests on (Non-Goals forbids deleting them). **Nothing from `ai-power-remedies`
run B goes to prod**, and no event uses it. Two of five points have no opposition among the arguers,
so the artifact does not do the job the pipeline exists to do, whatever else is true about the topic.

**This is a decision about the artifact, not yet about the topic** — see Open Question 2, which the
P5 evidence now reframes: the fork is real, so retiring AI safety would discard a working topic.

## Appetite

**Blast radius: high** — this is the pipeline's reason to exist. Every future run inherits it, and a
run that ships non-splitting points wastes the event it was prepared for.
**Reversibility: high** for the skill edits; the filed test rows are disposable.
**Decision density: medium** — two real founder calls (below), the rest is mechanical.

## Invariants

- **A point that no arguer opposes is not a point.** Whatever gate is built, its verdict must be
  computed from **measured positions**, never from the extractor's intent at construction time.
- **The sealed prediction must not be silently invalidated.** The seal is the only scoreable artifact
  in a run. Any mechanism that changes the point set after sealing must either re-seal under a fresh
  founder approval or record explicitly that this run is unscoreable — never quietly proceed.
- **Removing friction must not remove a gate that guards an irreversible act.** Creating public
  identities and writing to prod stay gated. Everything else is negotiable.

## Solution

Four workstreams. A and B are the defect; C and D are what this session cost.

### A. Verify the split against measured positions, before anything is filed

**A DIAGNOSTIC SIGNAL, not a binary gate** — corrected 2026-09-01; the first draft specified a gate
and adversarial review broke it three ways.

**Define opposition mechanically, because the first draft left it undefined and self-contradictory:**
a point shows opposition when **at least one measured position is positive AND at least one is
negative**. Neutral (`0`) is the absence of a stance, not a side. `NO CHAIN` does not count toward `n`.

*(The first draft said "all arguers same sign ⟹ FAILS" while its own Done-When demanded P1 fail. P1 is
`0` and `+2` — **different signs** under the pipeline's `−/0/+` model, so the specified algorithm
passed the very point the spec was written about.)*

**Emit per point:** `n`, the signed values, whether opposition is present, the predicted-room figure,
and the gap between them. **Do not auto-drop and do not stop the pipeline.**

**Three reasons it must not gate yet:**

- **It would reject P2, which the pipeline currently calls its most valuable output.** `positions.md`
  and this run both record expert-unanimity against predicted room dissent as the *best* kind of point
  — a room cannot pre-sort itself by tribe on it. **The founder agreeing with P2 is not proof P2 is
  bad; the room is the test, and the room has not answered.** A gate here would delete the pipeline's
  own stated best case.
- **It passes bad points.** Two arguers at `+1/−1`, one of them a weak `stretch`, reads as opposition
  while the room agrees overwhelmingly.
- **It is unstable at small `n`.** Three of five points here had fewer than four positioned arguers.
  At `n=2` one weak flip is a 50/50 "split". Reporting `n` labels the misclassification; it does not
  prevent it.

**Promote it to a gate only after room responses exist** to calibrate against — the one measurement
that would tell us whether arguer split predicts room split at all.

### B. Move cast-integrity checks BEFORE point construction

The same-vote collapse check and the unfilled-position spectrum re-check both exist and both run in
`positions` — after `prepare` has already built points against the collapsed cast.

- ~~Run a provisional same-vote check in `prepare` using its own `±n` values~~ — **WITHDRAWN.** That
  check is **endogenous**: `prepare` writes the statements, decides which arguers get inference chains,
  infers the signs, and rebuilds on failure. It grades its own answer and can pass itself by revising
  its conjectures rather than by improving the cast. `positions.md` already states that an earlier
  same-**position** check is a *different property*, not a weaker version of the same one.
  **Instead: gate upstream on independently extracted topic-level stance evidence** — what each
  candidate is on record as arguing, gathered before any point exists — or emit the provisional values
  explicitly non-gating.
- **Unfilled positions: this is a POLICY REVERSAL, not a missing check.** *(Corrected — the first draft
  said the spectrum re-check runs too late, in `positions`. False: it runs in `select` before Gate 2,
  and Gate 2 already presents the lost axes and requires founder approval of the narrowed set.)* The
  machinery works and the founder approved the narrowed cast. The question is whether an unfilled
  position should **block** rather than **inform** — a founder decision, recorded as Open Question 4.

### B1. The missing check: does the assembled cast still span the fork?

**This is the gap, and it is not "reject converging topics earlier" — that already exists.**

Phase 0 writes down a **contradiction sentence**: the specific proposition one advocate asserts and
another denies. That sentence is the evidence the topic is contested, it is recorded in the run file,
and **nothing reads it again after selection.**

**[UNSPECIFIED — do not implement until this is decided.]** *(Adversarial review, 2026-09-01: as
written this check **passes the very run it was designed to catch.** The surviving cast still contains
LeCun and Bengio, who genuinely span the open-weights contradiction — so under an existential reading
("does someone hold each side?") this run PASSES, while the Done-When demanded it FAIL. **That is the
identical error the split gate made earlier in this same spec** — an algorithm specified, then a
verdict demanded that the algorithm does not produce. Twice in one document.)*

**What must be decided before this is buildable:** must the cast span **every** admission-bearing
contradiction, a **named required subset**, or clear a **coverage threshold**? Each gives a different
verdict on this run, and the review constructed cases where the existential reading passes a collapsed
cast and the universal reading fails a good one. **Add per-contradiction output and controls before
prescribing any verdict.**

**Also note the overlap:** this is not wholly absent from the pipeline — `select` Phase 3 already
carries obligations in this area. Establish what Phase 3 does and does not cover before adding a
second check beside it.

**The original intent, kept because the gap is real even though the check is not yet specified:**
before Gate 2 closes, assert the surviving set still has a voice on BOTH sides of Phase 0's own
contradiction sentence. Not "are these people different" — the specific fork the topic was admitted
on. A set that cannot answer both halves of its own founding contradiction has lost the disagreement
it was assembled to carry, whatever its position statements say.

On this run: position 3 (halt) was unfilled and two arguers voted alike, so the cast could not span
its own fork — while Phase 3 returned a clean verdict, because it asks a different question (*does
each source argue the position it was admitted for?*).

**Cheap, mechanical, and it uses an artifact the pipeline already produces and then discards.**

### B2. The founder's proposal: a `prepare` ↔ `positions` loop

> Founder, verbatim: *"prepare and positions should be interlinked. It's a guess and then positions
> does it and then it goes back and prepare improves it until we get it polarized... positions also
> can explain back to prepare what is missing, for example, to strongly agree."*

**The instinct is right — one-shot construction against an unmeasured guess is the defect this spec
exists for. But the loop as stated is a machine for manufacturing disagreement, and that is the one
failure the pipeline is built to refuse.**

`positions.md`: *"Given any two people who differ on anything, such a statement can be constructed;
producing one is evidence about the generator's search, not about whether the disagreement exists or
matters. Nothing in this procedure can distinguish a disagreement **found** from one **engineered**."*

A loop that iterates *until polarized* optimises for **apparent** split. It will converge — that is
the problem. It converges on whatever wording makes the quotes readable as opposed, which is
indistinguishable from success and is exactly what the run would look like if the topic were
consensus.

**The distinction is the direction of fit and the stopping condition:**

| | Optimises | Stops when | Verdict |
|---|---|---|---|
| **Fit the statement to produce a split** | apparent disagreement | the split is maximised | **Manufacturing. Refuse** |
| **Fit the statement to what the sources actually say** | fidelity | the statement faithfully renders the sources — *including when that yields no split* | Defensible |

**"No split" must be a reachable terminal state of the loop, reported as a finding.** A loop that
cannot output *"these people do not disagree about this"* is not a measurement.

**A second contamination risk, and the reason the feedback must be descriptive:** if the per-arguer
position agents are told *"say what would make this person agree more strongly"*, they are being
recruited into engineering the split, and the isolation that makes their verdicts worth anything is
gone. Feedback must describe the source — *"this transcript addresses X but never Y; the strongest
claim it supports is Z"* — never prescribe the statement.

**Token cost is not the constraint.** `positions` already runs one agent per arguer reading only that
speaker's material; the descriptive feedback is a by-product of work already done.

**What the loop DOES dissolve:** if points are revised after positions are measured, the prediction
must be sealed **after** convergence rather than before. That removes the tension in Open Question 1
by construction — see the two-artifact model there.

### C. Stories must not carry timestamps in their prose

> Founder, verbatim: *"we have timestamps, and then why are we writing in the story timestamps as
> well? ...especially if those timestamps are not clickable. So I think when we are writing, story
> writing skills should know that, that he should not write timestamps, because timestamps are added
> below in supporting evidence."*

The quote block inside `content` renders as plain prose with dead `— 14:36` markers, while
`StoryVideoQuotes` renders the same quotes below with working jump links. The in-text timestamps are
decoration that looks like a control.

**Related and unresolved:** `docs/process-learnings.md` already carries the finding that the whole
quote block is duplicated on the detail page, costing 478–899 characters of a 1,500-character budget.
**Fold that into this work** — the timestamp question and the duplication question have one answer.

### D. Remove the friction this session measured — SCOPE CUT, and two items DELETED

The session cost roughly **twenty founder turns**, most of them a version of *"proceed"*. The
catalogue is kept as evidence; **the fixes are NOT part of this spec.**

*(Cut 2026-09-01 on review. These nine items touch identity provisioning, publish authorization,
input collection, blocker discovery, agent autonomy, delivery channel and verification discipline.
They share no acceptance oracle with the point-splitting defect, and bundling them lets the central
remedy ship alongside weakened safeguards. **File separately, after enumerating each gate's
dependents.**)*

| # | Friction | Disposition |
|---|---|---|
| 1 | Four identity-creation gates on the test database | ~~Batch on test~~ **DELETED — the premise was false.** Provisioning is *"effectively permanent"* in **both** environments; the test control creates a real, effectively undeletable account; test content is `visibility='public'` and anonymously readable. **Environment is not a privacy or permanence boundary here** — this spec asserted it was, contradicting the contracts it cited. One batch confirmation removes the per-subject look at canonical identity, display name, operator and portrait — and a four-account disclosure can be approved with one account attached to the wrong person. Consolidating *disclosures* is fine; the affirmative must bind the subject |
| 2 | The publish gate stopped after the founder had said publish three times | ~~Standing affirmative~~ **DELETED.** The gate sits *after* the destination, identities, SQL and hash exist. Earlier approval cannot bind an artifact that did not yet exist and had never been shown. **This is the correct behaviour, and the friction is real** — the fix is upstream (item 3), not a bypass |
| 3 | Tag and filing identity asked in separate turns | File separately. Pre-flight must collect **every** missing input in one block |
| 4 | Blockers surfaced serially rather than all at once | File separately. Same fix as 3 |
| 5 | *"Publish to test and review it"* offered three times — there is no test website | Fixed in P1202 |
| 6 | Five quotes blocked the run for days while a full transcript sat cached on disk | File separately. A blocker must name the artifact that would clear it, and that artifact must be looked for before the blocker is reported |
| 7 | Agent's own decisions escalated to the founder | File separately |
| 8 | Story text delivered in tool output twice, which the founder cannot reliably see | File separately |
| 9 | Three review rounds, each finding a fix already reported as complete | File separately |

**The through-line for 5, 6 and 9 is one habit: reporting a conclusion without running the command
that would test it.** That is the item worth a spec of its own; the rest are its symptoms.

## Alternatives Considered

| Option | Verdict |
|---|---|
| **Scrap AI safety, pick another topic** | **Rejected.** The topic is contested — P5 is a clean +3/−3 and P3 a real −2/+2. Scrapping it would discard a working topic and hide the actual defect, which is casting. The next topic would fail the same way |
| Loosen what counts as polarizing so the existing points pass | Rejected. That is fitting the measure to the result. The founder clicked agree on all five; no threshold change alters that |
| Re-run `prepare` on the existing four arguers | Rejected on its own: with LeCun/Andreessen collapsed and position 3 empty, the same cast yields the same non-split. **Fix the cast first** |
| Build a "polarization score" and rank points by it | Rejected. P1190 already establishes that ranking points by split-hardness is the wrong optimisation target — a point must *matter*, not merely divide. A binary "does anyone oppose this" gate is the missing check; a score is a second wrong target |
| Drop the sealed-prediction discipline so points can be revised freely after positions | Rejected. The seal is the only thing that makes a run scoreable. The tension is real and belongs in Open Question 1, not in a unilateral removal |

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The split signal misclassifies at small n | ACCEPT | It is a **diagnostic, not a gate** — nothing is dropped on it, so a misclassification costs a line of output. *(The first draft called it a gate that FAILS a point and then said "do not auto-drop" in this row; it claimed both.)* |
| Promoting the signal to a gate later, before room data exists, re-introduces every defect above | MITIGATE | The promotion condition is written into Workstream A: room responses first |
| A `prepare`↔`positions` loop converges on manufactured disagreement | MITIGATE | The loop's stopping condition is fidelity to sources, never maximised split; "no split" must be a reachable terminal state; feedback describes the source, never prescribes the statement (Workstream B2) |
| Friction removal deletes a gate guarding an irreversible act | MITIGATE | Workstream D is now catalogue-only; D1 and D2 are deleted outright. Nothing in this spec relaxes a confirmation around creating identities or writing data |
| Fixing the story quote block touches a shipped publish precondition | DEFER | Needs the founder's call on whether the label alone stays in the text; recorded in `process-learnings.md` |

**Non-Goals**

- Do NOT change what makes a point *load-bearing* — that is P1190's question and it is a different one.
- Do NOT re-run `select` or `prepare` for `ai-power-remedies` until Open Question 2 is answered.
- Do NOT delete or edit the filed test rows; they are the evidence this spec rests on.
- Do NOT weaken the prod publish gate, the identity-disclosure step, or any audio verification.
- Do NOT add a numeric polarization score.

## Done-When

- [ ] The split signal reports, per point, `n` · signed values · opposition present (≥1 positive AND ≥1 negative) · predicted-room figure · the gap — verified by re-running it against `ai-power-remedies` run B, where it must report **no opposition on P1 and P2** and opposition on P3, P4, P5
- [ ] The signal changes nothing: no point is dropped, no run stops. Verified by a run where a point shows no opposition and still files
- [ ] The four competing hypotheses are recorded and at least one discriminating comparison from the Problem section is run, with its result written down — **before** any cast remedy is implemented
- [ ] `prepare` emits its provisional values explicitly labelled non-gating, or an independent topic-level stance check exists that `prepare` does not author
- [ ] Story prose contains no timestamps; the supporting-evidence block is the only place they appear, verified on a regenerated story
- [ ] The cast-spans-fork rule is **specified** — every contradiction / a named subset / a coverage threshold — with per-contradiction output and both controls (a case it must pass, a case it must fail). **Do NOT prescribe this run's verdict in advance**; the first draft demanded FAIL on a run its own algorithm passes
- [ ] What `select` Phase 3 already covers in this area is established in writing before a second check is added beside it
- [ ] Open Questions 1–4 each have a recorded founder answer
- [ ] Workstream D is filed as its own spec, or closed with a written reason

## Open Questions

1. **How do revised points coexist with a sealed prediction?** *(Rewritten 2026-09-01 — the first
   draft's three options were not exhaustive and (a)/(c) were not distinct. (c) is also impossible as
   stated: a position is a position **on a point**, so there is nothing to measure before points
   exist; it really means adding a pre-construction stance artifact.)*
   **A two-artifact model dissolves the tension rather than trading against it:**
   1. The original prediction block and hash stay **immutable** — the construction/calibration artifact.
   2. Measured-position eligibility is recorded as a **second immutable block**.
   3. A **separately sealed publication version** carries only the eligible points.
   4. Construction accuracy scores against artifact 1; audience responses against artifact 2.
   No seal is rewritten, no failed point is silently changed, and the room sees an explicitly versioned
   set. **[FOUNDER DECISION: adopt the two-artifact model, or keep one-shot sealing and accept that a
   revised run is unscoreable?]**
2. **Re-run `ai-power-remedies` with a repaired cast, or retire the topic?** **The run itself is
   already ruled not publishable (above); this is only about the topic.** The P5 `close`/`close`
   opposition means the fork is real, so retiring AI safety discards a working topic — but H3
   (defective statements) is still live, so a re-run needs new points as well as a repaired cast. A re-run needs a genuine fifth voice for the halt position and
   a replacement for whichever of LeCun/Andreessen is dropped. **[FOUNDER DECISION]**
4. **Should an unfilled carried position BLOCK point construction, or continue to inform at Gate 2?**
   The machinery already exists and works; the founder approved the narrowed cast on this run. Making
   it block is a policy reversal. **[FOUNDER DECISION]**
5. Is a 2-arguer point ever worth filing? Three of the five points here had fewer than four arguers
   holding a position, which is what made "no opposition" reachable. Untested.

## Related

- `p1202` — the session that produced this run; added the same-vote and gap checks that detect this defect too late. All 13 Done-When items complete.
- `p1190` — whether a point is load-bearing. Adjacent and NOT the same question: a point can matter and not split, or split and not matter.
- `p1171` — `select` Phase 0 contestedness + N-arguer spectrum (backlog). Establishes the topic is contested; says nothing about whether the selected cast preserves that.
- `docs/process-learnings.md` — the story quote block renders twice on the detail page; folded into workstream C.
