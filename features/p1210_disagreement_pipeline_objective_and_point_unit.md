---
status: week
type: task
rank: 1000060
workstream: infrastructure
created_date: '2026-09-01'
tags: [disagreement, pipeline, points, event]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1210: The Disagreement Pipeline has no stated objective, and its unit of work is the wrong size

**Supersedes [p1208](archive/p1208_disagreement_pipeline_produces_points_nobody_splits_on.md)**, rejected
rather than revised (founder decision 2026-09-01 — see *Alternatives Considered*). P1208's evidence and
rejected options are carried forward here; its four-workstream frame is not.

## Run This

> ## ⛔ DO NOT RUN — CONTRACT REJECTED 2026-09-03, adversarial review
>
> **The `/goal` line below is suspended.** An independent reviewer found the contract carries the
> exact defect that rejected P1208 twice: **8 of 16 MECHANICAL rows demand a verdict on future
> agent behaviour**, which no test file can produce. The pipeline is six markdown files with zero
> executables — a test can assert prose *contains* a rule, never that an agent *obeys* it.
>
> **The anti-vacuity machinery is itself vacuous, and this is measured:** `## Verification
> Contract` fact #1 concludes that whole-file rows close the exit-0 hole. They do not.
> `it.skip` / `it.todo` reach the identical all-skipped state — measured 2026-09-03, **exit 0** —
> and neither CHECK 1 nor CHECK 2 reads it. All 16 rows can be green with zero assertions executed.
>
> Also confirmed: the "every row carries paired controls" sentence is false for roughly half the
> lines; DW-11 was already satisfied before the loop started; DW-12 is an all-empty probe with no
> known-bad control; DW-4+5 lets the loop author the fixture, the checker and the expected numbers.
>
> **Running this line would burn 30 turns against unsatisfiable rows.** The contract is repaired
> before it is re-pinned. The worktree `feature/p1210-objective-and-point-unit` stays claimed; the
> Solution (§§1–11) is NOT rejected — it survived three rounds and is unchanged.

Type this from anywhere in the repo — the main checkout is fine. Nothing to `cd` into, nothing to
rebase; the worktree is already claimed for this spec and already carries the pinned contract.

    /goal "Work in the worktree on branch feature/p1210-objective-and-point-unit. Then: ./scripts/goal-gate.sh p1210 exits 0, output pasted. Stop after 30 turns."

`/goal` is native Claude Code, not a repo skill — the founder types it; no agent can invoke it for
them. The condition names an exit code on purpose: the loop's evaluator reads the transcript and
runs nothing, so the only trustworthy condition is one naming an artifact the agent cannot author.

**Why the worktree clause is not decoration.** `goal-gate.sh` CHECK 3 hard-refuses to run on the
shared main checkout — *"refusing to soft-reset outside a worktree — main's index and HEAD are
shared"* — so a loop started there cannot reach exit 0 no matter what it builds. Naming the branch
rather than a slot keeps this line correct if the work is ever moved.

**What the loop is walking into, so it does not have to discover it from red gates.** Four artifacts
below `features/verification/p1210/` and `features/uat/p1210.md` already exist as seeds and are
deliberately unsatisfied: the scorecard's rows carry no results, and `feedback.md` carries zeroes.
Filling them is work, not housekeeping — CHECK 4 and CHECK 6 read them.

**Honest limit of the finish line.** The loop still stops on the agent's *paste* of the exit code;
nothing here changes that. What the gate buys is that forgery and decay are caught at the merge
boundary by CI. Expect a walk-back that is usually-but-not-always green.

## Problem

**Situation:** `ai-power-remedies` run B completed end-to-end and filed to test — 4 arguers, 5 points,
14 positions. The founder answered every point and agreed with all five. Two of the five had no
opposition among the arguers at all.

**Complication:** Nothing in the pipeline states what a good run is. `docs/points-process.md` describes
the transformation (*"turns public video into a published disagreement a room can take positions on"*)
but names no objective, so each stage optimised for the nearest proxy it could see — and `prepare`'s
nearest proxy was **apparent polarization**.

**Question:** What is the pipeline maximising, and what unit of work does that objective imply?

> Founder framing, verbatim: *"if our disagreement pipeline produces points at the end where the people
> that we selected don't split, then I think also we either selected them badly, they are not really
> divergent... we want to use these points and stories to split the audience but if we created something
> where we think the audience will split but we didn't give them opposing views, why would we think they
> would split? Split on what?"*

> *"do you know what we're optimizing for maybe you tell me what we're optimizing for because then we
> can reflect on all the skills in our pipeline and see where degradation happens"*

### The objective, derived from the event contract

**Corrected 2026-09-01 after adversarial review — the first version claimed a derivation it did not
have.** It read the objective off a run-of-show whose step 7 re-stakes the **comprehension dimensions**,
not the topical points; no per-point stake existed anywhere, and `p1161` already records that the link
from a topical argument to a dimension is *"not established anywhere"*. The objective was therefore a
**proposed change to the event presented as a derivation** — the same algorithm-vs-verdict defect that
got P1208 rejected.

**Fixed at the source.** `docs/events/clarity-practice-event.md` §*Where the pipeline's points enter*
now states the contract explicitly (written 2026-09-01, founder decisions): points **planned at 5–7 and
filed at whatever the topic yields**, ~3 run on the night, **one at a time, each with its own stake and
re-stake**, a one-sentence stakeable statement read aloud, stories pre-read, and ~3 min of framing per
point in each side's own terms from published quotes. **This spec restates none of that section.**

> **The pipeline's objective: hand the host, per point, two positions framable from published quotes in
> the time the contract allows, on something the room does not already agree about, such that the
> per-point re-stake can move.**

**Provenance of that sentence, stated precisely.** Its first half — *two positions, framable, from
quotes, per point, in the contract's time* — **is** entailed by the event contract. Its second half —
*something the room does not already agree about*, and *such that the re-stake can move* — is **this
spec's own bet about what makes the contract's shape work**, not an entailment. The contract asks for
two framable positions; it does not require the room to divide or to move. **Both halves are stated as
the objective because a pipeline needs a target; only the first is derived.** §1 copies this paragraph
into the contract doc along with the objective, so the provenance travels with it.

**Ten** necessary conditions follow — **not six; the first version omitted three whose failure still
kills an event, mis-assigned the first, and then miscounted the result.** *(Corrected 2026-09-01: the
table has ten rows — 1a, 1b, 2–9 — and called itself nine, which lets an implementation satisfy the
count while omitting a row.)* Each is owned by a named stage, which is what makes degradation
locatable rather than felt:

| # | Condition | Owner | Knowable pre-event? |
|---|---|---|---|
| 1a | Someone is **on record** holding each side | `select` Phase 0 | Yes — a contradiction sentence exists, **as a hypothesis** |
| 1b | The **selected sources** actually assert and deny it | `positions` (quote-grounded) | Yes, but only after quotes exist — see below |
| 2 | Both sides are cast, with material | `select` Gates 1–2 | Yes |
| 3 | Each side's why is renderable from quotes | `positions` + `story-draft` | Yes |
| 4 | Taking a position costs the room something | `prepare` 4b-iii | Yes — already gated |
| 5 | **The sharpened statement still matches the evidence** | `prepare` 4c | Yes |
| 6 | **The point is relevant and comprehensible to the named room** | `prepare` (room is a required input) | Yes |
| 7 | **The point fits the evening's speaking and re-staking time** | `select`/`prepare` against the contract | **YES, since 2026-09-03** — the per-point budget was decided (RD-4: 36 min total, 12 per point) and written into `docs/events/clarity-practice-event.md`. A point that cannot be staked, framed and argued inside 12 min does not fit. **This cell read NOT YET for two hours after the decision** — see decisions.md 2026-09-01 on restatement sweeps |
| 8 | The room splits on the first stake | the event | **No** |
| 9 | Something moves on the re-stake | the event | **No** |

**What the event contract does and does NOT supply — stated because the first version blurred it.**
The contract fixes the *shape*: per-point staking, ~3 min framing from published quotes, per-point
re-stake, ~3 points a night. **It does not by itself require** that the room divide on the first stake,
that anything move, that the point be relevant to this room, that it cost anyone anything, or that a
why be renderable from quotes. **Conditions 3–9 are therefore this spec's OWN claims about what makes
the contract's shape produce a working evening — argued, not derived — and they are falsifiable by the
first event.** Only 1a, 1b and 2 are entailed by the contract plus the pipeline's existing gates.

**Why 1 split into 1a/1b.** Phase 0 proves that named advocates are *on record* disagreeing. It does not
prove the *selected videos* carry it — `select` keeps Phase 3 for exactly this reason and says so:
*"a topic can be genuinely contested and still yield four videos that all argue the same thing."* Final
proof arrives only once quotes are chosen and a position can flip. **Treating 1a as settling 1 is what
let this run cast a pair whose sources did not oppose each other.**

**Conditions 5–7 were missing, and their absence is not cosmetic:** a room can split on a misrepresented,
irrelevant or unrunnable point and still produce movement. All the original six could hold while the
evening fails what it exists to demonstrate.

### What the run measures, against that objective

Phase 0 wrote **three** contradiction sentences to carry the `CONTESTED` verdict — recorded verbatim in
the run file's `phase_0_note`: (a) open weights, LeCun asserts / Bengio denies; (b) halting frontier
development, Yudkowsky asserts / Andreessen denies; (c) continuing under governance, Bengio asserts /
Yudkowsky denies.

**Position 3 (Yudkowsky, halt) went unfilled. Two of the three sentences lost a pole before any point
was written, and nothing re-checked.** Verified: `grep -in "contradiction\|phase_0\|fork"` across
`prepare.md`, `positions.md`, `story-draft.md` and `publish.md` returns **zero matches in all four**.
`select` proves the disagreement, writes it down, and no later stage ever reads it.

The five points map onto the three sentences as follows. **This table was rebuilt 2026-09-01: the first
version claimed a clean 5-of-5 ordering at the SENTENCE level, and got there by loosening its own rule
for two rows.** Under the rule as written — a point traces to a written contradiction sentence — **only
P3 traces.** Stated honestly (position values omitted — see *Invariants*; the run file holds them):

| Point | Traces to a sentence? | Pair it is built between | That pair has a written contradiction? | Opposition measured |
|---|---|---|---|---|
| P3 | **Yes — sentence (a)**, plus a comparison to regulation | LeCun ↔ Bengio | yes, (a) | real; one side directly argued |
| | *(P3 has a largest-difference tie; the rule's tie-break is stated below and must be re-applied at implementation — this row records the analyst's reading, not the rule's output)* | | | |
| P5 | **No** — a different proposition | LeCun ↔ Bengio | yes, (a) | strongest in the run; **both** sides directly argued |
| P4 | **No** | Andreessen ↔ Bengio | **no** — (b) paired Andreessen with the **uncast** arguer | weak: one directly argued vs one inferred |
| P1 | **No** | Harari ↔ Bengio | **no** — flagged in the run file as likely same-side | **none** |
| P2 | **No** | canonical pair derived by the rule below (4 positioned arguers, all same sign) | **no** | **none** — every arguer agreed; the derived pair is same-sign, which is the finding |

**What this supports, stated at the strength the data carries.** The sentence-level claim is **refuted**:
4 of 5 points do not trace to a sentence, and one of those is the strongest split in the run. What holds is
weaker and must not be restated as a law: **in this one run, the three points whose pair carried a
written contradiction showed more opposition than the two whose pair did not.** *(Corrected 2026-09-01
— an earlier version said "every… every… 5 of 5 at the pair level" and then "the predictor is the
pair", which is the same causal overreach at a different altitude.)* n=5, one run, one author, and the
pairs were assigned **retrospectively by the spec author** — see the canonical-pair rule below. This is
a reason to LOOK at the pair before construction. It is **not** a predictor, not calibrated, and
nothing in this spec may cite it as one.

**This correction changes the remedy** — see §2. Whatever signal exists sits at the pair, not the
sentence, so binding a point to a pre-written sentence would have rejected P5, the best point in the run.

**Canonical pair, defined — because the run-B regression cannot otherwise be scored.** Run B stores
several arguer positions per point, never a construction pair, so "the pair this point was built
between" was an analyst judgement. **Rule, applied uniformly and stated before the check runs:** a
legacy point's canonical pair is the two positioned arguers with the largest absolute difference in
signed position; ties break toward the pair with the stronger inference-strength labels, and **a tie surviving both
steps is scored `AMBIGUOUS-PAIR` and reported — never resolved by picking one**; a point with fewer
than two positioned arguers is scored `UNPAIRABLE`. **A pair is always DERIVED where two positioned
arguers exist — including when they agree; "no opposed pair" is a RESULT, not an absence of a pair.**
**If applying this rule to run B contradicts the table above, the TABLE is wrong** — the table is the
analyst's reading and the rule is the oracle.

**Control that rules out the obvious rival account:** the sole dissenting arguer held a position on all
five points, so "only one arguer ever disagrees" does not explain it — on P1 that arguer was neutral and
on P2 they agreed. The **axis** tracked the outcome in this run; cast alone did not. Tracked, not predicted — see the correction above.

**The mechanism, stated plainly:** `prepare` is free to synthesize a point on any axis. Phase 0's
expensive contestedness evidence constrains nothing downstream. Two of five points were invented on
axes nobody was ever shown to disagree about, and those are exactly the two that could not be
disagreed with.

**Founder ruling (carried from P1208, still binding):** *"I guess this run overall is not publishable.
We cannot go ahead with this content."* Nothing from run B goes to prod; the filed test rows stay as
the evidence this spec rests on.

## Appetite

**Blast radius: high** — this is the pipeline's reason to exist, and every future run inherits it.
**Reversibility: high** — skill-file edits plus one docs edit; the filed test rows are disposable.
**Decision density: medium** — the founder made every call in the 2026-09-01 session, and **four**
questions remain open (seal model, the public-redaction call on the predecessor, two-arguer policy, and
the event's per-point time budget). *(Corrected 2026-09-01: this said "low… two questions" while the
document carried four.)* The seal question and the time budget block the AI-safety re-run; the other
two do not.

## Invariants

- **A point is built between a PAIR that carries a written contradiction, and its own axis must show
  quote-grounded assert-and-deny before it is filed.** A person with no contradiction against anyone
  already cast carries no point and is not cast. *(Corrected 2026-09-01, same day it was written: the
  first form made the pre-written sentence the point's permanent identity, which adversarial review
  showed would reject the strongest point in the reference run and admit points whose sources never
  argue them. The correction narrows what the pre-written sentence licenses; it does not remove the
  requirement.)*
- **A point statement must be stakeable from the statement alone, read aloud in one sentence.** The
  story explains *why* someone holds a position; it must never be required to understand *what* the
  position is. (Founder decision 2026-09-01 — this is what prevents a two-tier room.)
- **"These people do not disagree about this" must remain a reachable terminal state** of any
  measure-then-revise loop. A loop that cannot output it is not a measurement.
- **A public file must never pair a named real person with an agent-derived position value.**
  `positions.md` Step 4d and `prepare.md` Stage 5 both forbid stating what a named person *"would
  answer, or would vote"*; the run file in `.private/` holds the specifics. **P1208 violated this and
  is public — see Open Question 3.**
- **Removing friction must never remove a gate that guards an irreversible act.** Identity creation and
  prod writes stay gated.

## Solution

Eleven numbered changes (§§1–11). Each is a founder decision made on 2026-09-01 unless marked otherwise.

### 1. State the objective

Write the objective and the ten-condition table above into `docs/points-process.md`, which is the
canonical contract and currently the file that has no target in it. Every stage file points there; none
restates it.

### 2. A point is built between a PAIR that carries a verified contradiction

**Rewritten 2026-09-01 after adversarial review.** The first version made a point a
`(contradiction sentence, A, B)` triple with the sentence as permanent identity. Review broke it twice
and both breaks are confirmed: it **rejects a good point** (P5, the strongest split in the run, traces
to no sentence and would be refused), and it **admits a bad one** (a sentence written from public
reputation whose selected sources never assert or deny it — the triple exists syntactically while the
evidence does not). The unit below fixes both.

**A point is admissible when all three hold:**

1. **The pair carries a written contradiction.** Some sentence exists that this person asserts and that
   person denies. This is the pre-construction filter and it is what the run-B data actually supports.
2. **The point's own axis is evidenced.** Either it *is* the pair's contradiction sentence, or it is a
   **transcript-discovered** proposition that passes the same test — one asserts, the other denies, from
   their own material. Discovery is normal extraction, not an exception: `select` Phase 0 never reads a
   video, `prepare` reads everything, and a rule that forbids the second from finding anything the first
   missed throws away the pipeline's only deep read.
3. **SOURCE-FIDELITY confirms it before filing** — see the predicate table below. Condition 1b. A
   pre-written sentence is a **hypothesis**; `positions` is where the sources either carry the
   assert-and-deny or they do not. **Predicted-opposition is reported here, never used to admit or
   refuse.**

**Phase 0's sentences are hypotheses carried forward, never permanent point identifiers.** What changes
versus today is only that they are *carried forward at all* — currently they are written, sealed, and
never read again by any stage (verified: zero occurrences across all four downstream skills).

**THREE DIFFERENT THINGS ARE CALLED "OPPOSITION" AND THEY HAVE DIFFERENT CONSEQUENCES.** *(Added
2026-09-01 — adversarial review found §2 and §11 prescribing opposite verdicts on the same input:
one said a point without quote-grounded opposition cannot be filed, the other said no mechanism drops
a point until room data exists. Both were right about different predicates. Named separately here, and
no other section may use the bare word "opposition".)*

| Predicate | What it asserts | Owner | Consequence — and it is not negotiable per row |
|---|---|---|---|
| **SOURCE-FIDELITY** — *does this axis exist in the material?* | One arguer's own quotes assert the proposition; the other's own quotes deny it | `positions`, from verified quotes | **BLOCKING.** No assert-and-deny in the sources ⟹ the point is not filed. This is a claim about what two people said, not about who is right, so it needs no room data |
| **PREDICTED-OPPOSITION** — *do the agent-derived signed positions land on opposite ends?* | An agent's Likert reading of each arguer | `positions` Step 4 | **NEVER AUTO-BLOCKING.** Precisely: **it may never cause the pipeline to drop a point or stop a run on its own verdict**, and it may not be promoted to an automatic gate until a room has answered. **It MAY halt for the founder** — the same-vote check does exactly that, and that is not a contradiction: a founder-facing halt hands a human the decision, whereas an auto-block takes it. *(Disambiguated 2026-09-01: an earlier wording said "NEVER BLOCKING", which read as forbidding the same-vote halt that §9 deliberately keeps.)* |
| **OBSERVED-ROOM** — *did the room actually divide?* | The first stake at the event | the event | Not available pre-event. The only thing that could ever calibrate the row above |

**So §11's "not a gate until room data" binds PREDICTED-OPPOSITION only.** Source-fidelity blocks, and
always did — it is the same standard `prepare`'s kill rule already applies (*"if no real camp holds the
counter-position, the point is not polarizing — it is contrarian phrasing"*).

**Deleted: the claim that collapse becomes "structurally impossible."** It was false as written. The
pair rule prevents exactly one shape — a point joining a pair for whom no sentence was written. It does
**not** prevent two arguers who each entered through a contradiction with a third person from voting
alike across the set. **The measured same-vote check therefore stays a founder-facing decision gate, and
§9's automation of it is withdrawn.**

**Redundancy check, narrowed to what it can actually do.** Two points whose contradiction sentences are
the same proposition are one point. Exact-string identity does not test this — two paraphrases pass — so
the check is a **judgment with a fixture**: known-good (two genuinely distinct axes), known-bad (one
proposition twice verbatim), near-miss (one proposition reworded). Without the near-miss control the
check is a formatter. This replaces `prepare` 4b-ii's position-pattern proxy, whose threshold needs
rework regardless now that positions are per-pair.

### 3. Points drive cast size — with cast-level controls, and no maximizing target

**The "two positions" constraint is per POINT, not per run.** The host frames two, the room stakes, they
argue, next point. Nothing requires the same two people across every point.

- **Plan for 5–7 ranked points; file what the topic honestly yields, overridable on invocation.**
  **The planning figure is not a floor** — a run yielding 3 files 3 and reports `<filed> of <planned>`.
  The event contract was corrected the same day to match; if the two ever disagree, the event contract
  governs how many are RUN and this spec governs how many are FILED. **7 is a
  planning figure, NOT an optimization target — corrected 2026-09-01.** As a target it licenses growing
  the cast until a number is met, which is how a set gets padded with weak axes. If the topic's honest
  yield is 3, file 3 and report `<filed> of <planned>`.
- **Start from the sharpest pair**, mine every contradiction between them, and **add a person only when
  short and only if they bring a new contradiction against someone already cast.**
- **Cast-level controls, because per-pair edges are not enough.** Review constructed the failure the
  edge rule misses: a **star cast** — one person contradicting everyone, nobody else opposing anyone —
  where every point is locally valid, the advertised pair carries a minority of the set, and one weak
  source collapses the inventory. So **report** the cast as a whole — and only one of the three has a verdict, stated
  honestly rather than implied: **per-person concentration** — one arguer carrying **more than half**
  the filed points is a FINDING presented to the founder (not an auto-drop). **Distinct verified axes**
  and **pair coverage** are **printed values with no threshold**, because no denominator or axis-identity
  rule exists yet and inventing one here would be a number nothing supports. *(Corrected 2026-09-01:
  the earlier text said "report and gate" on all three while defining a verdict for none — printing
  arbitrary values would have satisfied it.)*
- **Marketing headline stays a pair** — whichever two carry the most points.

Prior ruling honoured: a person arguing a position already cast *"buys a name, not an axis"*
(`decisions.md` 2026-08-28); under §2 they also buy no point.

### 4. One gate for cast and points together; downstream sharpens only

Today Gate 2 approves *people*; points are invented afterwards, unconstrained. That is the unbounded
slip the founder named: *"what we don't want is a continuous slip."*

`select` proposes candidate **points** alongside the cast — the raw material already exists, since
Phase 0 writes contradiction sentences and currently discards them. The founder approves the pair.
After that gate, downstream may **sharpen** wording and **drop** a point the evidence kills; it may
**not add a new axis**. A genuinely new fork found while reading transcripts returns to the founder as a
small re-approval, never ships silently.

Phase 0's output already folds into the existing Gate 1 (`decisions.md` 2026-08-27), so this extends a
gate rather than adding one.

### 5. Transcript-first counterpart hypothesis

Selection already reasons out **people** before looking for videos — the skill states *"Do not search
YouTube for topics — search matches words, not stances"* — and already accepts a founder-seeded person
with only the counterpart proposed. **What does not exist is the conditional form.**

Today the counterpart is filled against an independently-written position list. Change it to: **fix
person one's video and read its transcript first, then hypothesize the counterpart from what that
person actually said** — naming 2–3 candidates and the contradiction sentence each would produce —
**then** look for their videos.

Why it matters, measured on this run: two arguers were admitted on reputation and their actual
transcripts were weaker. One had no inference chain at all on 3 of 5 points because the video did not
cover the ground; the judge flagged the other's material as *"largely reported-belief."* Hypothesizing
against the transcript builds the contradiction sentence against the thing that will actually be quoted.
Cost is one transcript fetched earlier than today — a fetch the run needs regardless.

### 6. Difference is a tiebreaker, never a gate

Every candidate pair must have a written contradiction sentence between **those two people**. That is
the requirement. When more than one pair qualifies, prefer the pair that is least alike and have the
agent **name the axis in one line, chosen for the topic** — no fixed taxonomy.

**Why no fixed axes** (this is why the check is not built): a proposed profession/institution/country/
register check was tested against the pair that actually collapsed on this run and **passed them on all
four axes** — a researcher and an investor, different institutions, different countries, different
registers, voting identically. Demographic difference is a proxy for divergence; the contradiction
sentence is the measurement. The tiebreaker survives for a non-epistemic reason the founder named:
an unlike pair is easier to promote.

The standing Institutional Bias Alert already fires here and did fire on this run (*"a set of five
establishment voices reads as comprehensive while being uniformly institutional"*) with nothing acting
on it. Under §3 it has *some* teeth — an added arguer must bring a new contradiction. **It does not follow
that a homogeneous cast produces none** *(corrected 2026-09-01; the earlier claim was asserted without
support and is false: two people from the same institution can flatly contradict each other, and on
this very run the only real contradiction was between two AI researchers).* The alert stays a reported
finding, not a gate.

### 7. One story per person per point

The story unit is wrong, and length is the symptom rather than the cause. One story currently carries
every point its author holds a position on: the longest in this run is 1,496 characters across **four**
unrelated arguments, stitched with *"the same shift repeats"* and *"on safety the object moves again"*,
compressed to fit until sentences stop being English (*"the brake a regulatory mechanism already built
in"*).

**Change the unit: one story per (person, point) — three or four sentences explaining why that person
holds that position, then that point's quote.** **No schema change is required** — `story_points` is a
many-to-many junction and its unique constraint (`20260301120000_story_points_author_unique.sql`) already
forbids two stories by one author on one point, so the emitting shape is permitted today.
*(Narrowed 2026-09-01: an earlier draft said the database "already assumes this shape." It does not —
nothing prevents one story linking to several points, and nothing requires every (person, point) pair to
have a story. The schema PERMITS the convention; it does not enforce it, and the enforcement lives in the
drafting stage.)*

**No character ceiling** until several runs have been seen. The 1,500 ceiling is what forced the
compression; a per-point story is short by construction.

Rejected alternatives (founder's own three options, 2026-09-01): *keep as is* — leaves the digest;
*cut the summary to 1–3 sentences* — a shorter digest, same scattering; *quotes only* — removes the
why, which is the only thing a quote structurally cannot carry.

### 8. Event run-of-show

`docs/events/clarity-practice-event.md` §Run-of-show is the single home (verified: the Forum file is the
offline *configuration* of the same shape and is not superseded; the salon is a different event; the
facilitator guide is the live-session craft, a different layer).

- **Stories are pre-read, not read in the room.** Agent profile links go in the event description; the
  Stories tab shows each arguer's position on the point. This preserves the existing decision that cut
  in-room story reading for time (`p1161` deviation 1).
- **In the room: the host reads the point statement, everyone stakes.** No one sits out for not having
  prepared — that is what the stakeable-statement invariant buys.
- **Stake per point, not all up front.** The re-stake only means something if it brackets one specific
  argument; staking everything first yields one aggregate number attributable to nothing.
- **Optional:** where a story is genuinely one sentence, the host may read it. Per point, host's call.

### 9. Get the founder out of the loop — four approvals that are already answered

From a retrospective over both complete runs (2026-09-01). Founder: *"some things are kind of approved
unnecessarily... if there is a decision that can be just part of the skill, let's reflect and possibly
improve."* **Nothing here weakens a gate around identity creation, publishing, a database write, or
quote/speaker verification** — those are listed as MUST STAY and are untouched.

- **~~The same-vote flag stops offering a three-way choice.~~ WITHDRAWN 2026-09-01.** It was approved,
  then withdrawn the same day: it was written as depending on §2's claim that collapse becomes
  structurally impossible, and **that claim is false** — two arguers who each entered through a
  contradiction with a third person can still vote alike across the set. Automating the choice away
  would remove the only check that catches that shape. **The three-way gate stays.** The one part kept:
  the option "re-cast" is described accurately as meaning fresh Gates 1–2 and a fresh seal — i.e. a new
  run — rather than offered as a choice inside this one. *(This is the cost of the §2 correction, and it
  is recorded rather than quietly dropped.)*
- **`prepare` stops re-asking the audience floor.** It asks *"under a few thousand views... ask whether
  to continue"* for sources that already cleared `select`'s numeric floor (`>= 50 comments and
  >= 2,000 views, or explicit founder override recorded in the run file`) at Gate 2. Re-assert against
  the recorded number; ask only below it. Both runs.
- **The event tag and the filing identity move into `publish` Stage 0.** That block exists to end serial
  asking and prints eight items — neither of the two inputs that actually need a human. (P1208 D3/D4,
  never filed.)
- **The story fan-out approval moves into the orchestrator's single input block.** The halt stays — the
  3+-subagent rule is not this pipeline's to delete — but it stops being a mid-stage interruption whose
  answer (*"we have to do it good or we don't do it"*) sits 20 lines below it in the same file.

### 10. Cache and blocker discipline — the defect that cost days in BOTH runs

Both complete runs terminated at a verification blocker. In run B the artifact that would have cleared
it had been on disk for three days, and the founder was offered a paid top-up and a human-listening
session, both needless.

**Root cause is three compounding defects, measured 2026-09-01 — not "nobody listed the folder":**

1. **The pipeline inspects a directory instead of asking the tool.** `positions.md` says
   `ls ~/.local/share/yt-store/<video-id>/`. There are **four** stores (`yt-store`, `audio-store`,
   `diarize-store`, `agent-store`) and the file that unblocked run B was in `diarize-store`, which
   appears **once** in the entire pipeline, in an unrelated section. The store's own README states the
   designed interface: *"do not consult this directory before diarizing: the reuse check lives inside
   the tool."* The pipeline invented its own inspection, on the wrong store, bypassing the reuse check.
2. **The ledger and the bytes diverge silently.** A SQLite ledger at
   `~/.local/share/agent-store/index.db` is what decides whether work has been done. Reconciled against
   disk: **19 diarize artifacts exist, 14 are in the ledger, 5 are orphans** across 4 of 7 sources —
   and the LeCun source that blocked run B has **1 file on disk and 0 ledger rows**. The store README
   predicted exactly this (*"a file here that the ledger does not know about is inert — the five
   transcripts rescued by hand"*); the count matches to the file. Hand-placed bytes bypass the ledger
   write, and nothing detects the divergence.
3. **The rule that prevents this exists and was never installed.** *"A blocker must name the artifact
   that would clear it, and that artifact must be looked for before the blocker is reported"* —
   `docs/decisions.md`, and **0 occurrences** across all six pipeline skill files plus
   `docs/points-process.md` (verified by grep).

**Changes, pipeline side (this spec):**
- Any cache or freshness check **runs the owning tool and reads its HIT/MISS**, never `ls` on a store.
- **No blocker may be reported without naming the artifact that would clear it and showing that it was
  looked for.** **Corrected 2026-09-01 — the first version said "by ledger query", which is circular:**
  a ledger query cannot find an artifact whose defining property is having no ledger row, so the rule as
  written reproduced the exact miss it was added to prevent. **The search must walk the store BYTES and
  diff them against the ledger** — which is literally how the five orphans were found. Normal cache
  reuse (ask the tool) and orphan detection (walk and diff) are two different operations and the blocker
  check needs both.
- The four stores are named once in `docs/points-process.md`; no skill restates the paths.

**Outside this spec, flagged not fixed:** the ledger/bytes reconciliation itself is global tooling
(`~/.agents/bin`, `~/.local/share`), not repo code. A reconcile-and-report command is the fix; it needs
its own note. **Corrected scope 2026-09-01:** the earlier claim that this spec is independent of that
command was wrong — its own acceptance test (stage a cached blocker, confirm the run does not stop)
cannot pass while the tool trusts a ledger that is missing the artifact. So: rule 1 (ask the tool) is
independent and correct regardless; **rule 2's walk-and-diff is the in-pipeline substitute** that makes
the acceptance test passable without the external command. The external reconciliation remains the
better long-term fix and is a **named follow-up, not a hidden prerequisite**.

### 11. Restored from P1208 — the controls the rewrite dropped

**Regression is the specific risk of rewriting rather than revising, and adversarial review found four
instances of it. Restored here, with the reason each existed.**

- **An independent topic-level stance artifact.** `prepare` writes the statements, chooses who gets an
  inference chain, infers the signs, and rebuilds on failure — it grades its own construction, which is
  why P1208 withdrew a same-vote check placed inside it as *endogenous*. **Stance evidence must be
  gathered independently of `prepare`**: what each candidate is on record as arguing, collected before
  any point exists. §5's transcript-first counterpart pass is where it belongs, and it is not optional.
- **Pass AND fail controls before any verdict is prescribed.** Every check this spec adds ships with a
  case it must pass and a case it must fail, run through the identical code path, results printed
  beside the real ones (`positions.md` Step 2a already states this for its own harnesses). **No Done-When
  in this spec may hardcode an expected verdict on run B that the specified rule does not produce** —
  that is the defect P1208 was rejected for and this spec committed twice before review.
- **The two-artifact seal model.** P1208 resolved the revised-points-versus-sealed-prediction tension
  and the rewrite demoted it to an open question while making a fresh run the acceptance test — i.e. it
  left the seal undefined at exactly the moment a run depends on it. Restored as the **default**: the
  original prediction block and hash stay immutable (the construction artifact); measured-position
  eligibility is a second immutable block; a separately sealed publication version carries the eligible
  points; construction accuracy scores against the first, audience responses against the second. Open
  Question 2 now asks only whether to *keep* it, not whether to invent it.
- **PREDICTED-OPPOSITION is not a gate until room responses exist** — the agent-derived signed
  positions, and nothing else. P1208 established this and the first rewrite eroded it. **Scoped
  2026-09-01 against the predicate table in §2:** source-fidelity (do the sources assert and deny?)
  **does** block, and always did; predicted-opposition never blocks and may not be promoted to an
  automatic gate until a room has answered. The two were conflated under one word, which is how this
  document ended up prescribing opposite verdicts for the same input.


## Alternatives Considered

| Option | Verdict |
|---|---|
| **Revise P1208 rather than replace it** | **Rejected, founder decision 2026-09-01.** Two adversarial rounds fixed sentences and left the four-workstream frame — the thing that was wrong — untouched, because a revision only edits what someone points at. ~40% of that document became archaeology about its own errors, so a reader cannot separate a live claim from a retracted one. **General principle, recorded but deliberately NOT encoded as a rule at n=1: rewrite when the frame changed, revise when only facts changed.** Carrying the rejected alternatives forward is the mitigation for the one real cost |
| Gate on *"a point no arguer opposes is not a point"* | **Rejected, and NOT re-proposed here** (`decisions.md` 2026-09-01). It rejects the pipeline's own stated best case, passes weak `stretch`-driven splits, and is unstable at small `n`. §2 is a different mechanism: it binds construction to a pre-written contradiction rather than judging the measured result |
| A `prepare`↔`positions` loop that iterates until polarized | **Rejected as stated** — it optimises for *apparent* split, will converge, and convergence is indistinguishable from success. Resolved instead by constraining the **repair**: an unopposed point may be dropped or returned to the founder, **never reworded until it splits** |
| Fix the cast at two arguers | **Superseded by §3.** Correct that the host frames two positions; wrong that this binds the run. Founder: *"if it's true that between two people you get only two, three meaningful disagreement points, maybe this is the reason why it makes sense to take more pairs"* |
| Fixed heterogeneity axes (profession / institution / country / register) | **Rejected** — tested against the pair that collapsed on this run and passed them on all four. See §6 |
| Enumerate all positions and have the host name them from stage | **Rejected, founder.** A report instinct, not a GTM one: *"nobody will read that... this is not a comprehensive report of all the positions."* Enumeration stays internal and unfiled — its only job is picking the sharpest pair |
| Keep the cross-camp-split pattern as a reason to cast 3+ | **Rejected.** Seen once, and `positions.md` attaches no quality claim to it. Not worth extra arguers |
| Scrap AI safety and pick another topic | **Rejected.** The fork is real — one contradiction sentence produced the strongest, directly-argued opposition in the run. Scrapping discards a working topic and hides the casting defect |
| Loosen what counts as polarizing so the existing points pass | **Rejected.** Fitting the measure to the result |
| A numeric polarization score | **Rejected.** P1190 establishes that ranking by split-hardness is the wrong target — a point must *matter*, not merely divide |

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| **Source supply caps the cast.** *"Every recent AI source with audience reach is a two-way podcast"* — Gate 0 filled **1 of 5** positions on this very topic (`decisions.md` 2026-08-28) | **MITIGATE** | This is the main threat to §3: growing the cast assumes findable sources. Diarization (Step 2c) was added for exactly this and relieves it. **When supply blocks the target, file fewer points — never relax Gate 0 and never pad with an off-axis point** |
| The targeted second-pass mining produces near-duplicate contradiction sentences | MITIGATE | §2's distinct-sentence rule is the check; two points on one sentence are one point |
| Each added arguer costs provisioning, stories and per-quote verification, never amortised | ACCEPT | It is why the founder rejected ten arguers on 2026-08-27, and why §3 adds a person only against a named new contradiction |
| A point framed between two arguers the room has not met needs an in-room introduction | ACCEPT | ~30s per point; the headline pair carries most of them |
| Per-point stories are too thin to comprehend | ACCEPT | Reversible in one stage edit; a room member positions on one point at a time |
| The objective's conditions **8 and 9** (room divides; something moves) are unmeasurable until an event runs — ~~and condition 7 is unevaluable until the event's time budget is decided~~ **condition 7 is evaluable as of RD-4** | ACCEPT | Conditions 8 and 9 stay unmeasured rather than proxied. **Do not substitute arguer split for room split** |
| A cast finding discovered *after* Gate 2 has no gate to land on — this run's post-seal correction named the collapse before points were built and the run proceeded | MITIGATE | Add a re-approval path: a post-seal cast finding halts before `prepare` runs |
| The diarize ledger is blind to 5 of 19 cached artifacts, including the one that blocked run B | MITIGATE | §10 rule 2 (look across all four stores before blocking) holds regardless. The reconciliation fix is global tooling and is explicitly NOT a dependency of this spec |
| ~~Automating the same-vote choice removes a founder decision point~~ | **VOID** | **The automation was WITHDRAWN — §9.** Its premise (that §2 makes collapse structurally impossible) is false and deleted. This row is kept struck rather than removed so the reversal is visible; the same-vote gate stays founder-facing |
| A mechanical unfilled-position check reads the wrong field | MITIGATE | `positions_unfilled: []` in run B contradicts the `status: UNFILLED` in its own arguer list — **derive from the cast entries, never from that field**, and assert the two agree |

**Non-Goals**

- Do NOT change what makes a point *load-bearing* — that is P1190's question and it is a different one.
- Do NOT add a numeric polarization score.
- Do NOT repair run B in place. The AI safety re-run (Open Question 1) is a FRESH run under §§2–7 — new cast, new points, new seals. Run B's rows are evidence, not a starting point.
- Do NOT delete or edit the filed test rows; they are the evidence this spec rests on.
- Do NOT weaken the prod publish gate, the identity-disclosure step, or any audio verification.
- Do NOT relax Gate 0, the recency floor or the audience floor to reach the point target.
- Do NOT change the database schema — §7 needs none.

## Done-When

- [ ] `docs/points-process.md` states the objective and the **ten**-condition table (1a, 1b, 2–9 — checked by row identity, not by count), each condition mapped to a named stage output that a run actually emits — verified by pointing at that output for every row (1a, 1b, 2–9), not by confirming the prose was copied
- [ ] Every point names its pair, the pair's contradiction sentence, and its own axis with the assert/deny evidence for that axis. **Both controls:** a point whose axis has quote-grounded assert AND deny must FILE; one missing either side must be REFUSED. Both verdicts printed
- [ ] Redundancy check runs its three-fixture control set — two distinct axes (must pass), one proposition twice verbatim (must fail), one proposition reworded (must fail) — with all three verdicts printed. A near-miss that passes means the check is a formatter and its results carry no weight
- [ ] Re-running the new checks against run B reproduces the corrected table in Problem: **2 of 3 sentences unspanned**; **4 of 5 points trace to no sentence** (P4 and P5 included, not only P1 and P2); and **P1, P2 and P4 sit on pairs carrying no written contradiction**. **The expected verdict is whatever the specified rule produces — if the run disagrees with this line, the LINE is wrong until the rule is shown to be**
- [ ] The unfilled-position count is derived from the cast entries and asserts agreement with `positions_unfilled` — verified on run B, where the two disagree and the assert must fire
- [ ] `select` proposes candidate points alongside the cast and both are approved at one gate. **Both controls:** a downstream attempt to introduce a **new axis** must stop and return to the founder; a downstream **sharpening of an approved axis's wording** must pass unimpeded. A run that refuses both is a gate nobody can use
- [ ] The counterpart is hypothesized from person one's **transcript**, with 2–3 candidates and the contradiction sentence each would produce, all printed **before** any counterpart video search runs. **Control:** an attempt to search for counterpart videos before that transcript is read must be refused, and the refusal printed
- [ ] A run short of its point target adds an arguer only with a named new contradiction sentence, and reports `<points filed> of <target>` when it stops short
- [ ] `story-draft` emits one story per (person, point); no character ceiling. "Addresses one point" is checked by a stated criterion — the story makes no claim requiring a different point's statement to be understood — applied by a checker that is not the writer, with a known-bad two-point story in the batch
- [ ] Story prose contains no timestamps; the supporting-evidence block is the only place they appear
- [ ] `docs/events/clarity-practice-event.md` §Run-of-show carries the pre-read model, per-point staking, and the stakeable-statement rule
- [ ] No cache or freshness check in any pipeline file uses `ls` on a store; each runs the owning tool and reads its verdict — verified by grep returning zero `ls ~/.local/share` in the six skill files
- [ ] A blocker cannot be reported without naming the clearing artifact and showing the search across all four stores — verified by staging a blocker whose artifact is cached and confirming the run does NOT stop
- [ ] The same-vote three-way gate is **still present** (its automation was withdrawn — §9); the only change is that "re-cast" is described as meaning a new run. Verified against run B's flagged pair
- [ ] `prepare` asks about audience size only below the run file's recorded floor — verified with a source above and a source below it
- [ ] The event tag and filing identity are collected in `publish` Stage 0; the story fan-out approval is collected in the orchestrator's input block — verified by a run that reaches publish with no mid-stage input turn
- [ ] Cast-level controls are reported every run — distinct verified axes, per-person concentration, pair coverage. **Both controls:** a constructed star cast (one arguer carrying >half) must be FLAGGED; a balanced cast must NOT be, and its printed values must differ from the star cast's. Identical output on both means the control is a formatter
- [ ] **Both controls on the blocker check:** a staged ledger-ORPHAN (bytes present, zero ledger rows — the exact shape that blocked run B) must be FOUND and the run must not stop; a genuinely absent artifact must still produce a blocker. A check that never blocks is not a check
- [ ] The two-artifact seal model is **implemented**. If the founder decides to drop it (Open Question 2), that decision is recorded AND this line is struck in the same edit — it may not be satisfied by an unanswered question. **The AI safety re-run may not start until the seal model is implemented or explicitly struck**
- [ ] Every new refusal added by this spec is run against the pipeline's own documented happy path and passes it (`epistemic.md` gate 7c), and has been seen to FAIL on a staged bad input (gate 7). **This line does not substitute for the per-check controls above** — each names its own fixtures, and a generic sweep at the end is what let earlier versions ship checks whose false-positive rate was never measured

## Open Questions

1. ~~**Re-run `ai-power-remedies` with a repaired cast, or retire the topic?**~~ **ANSWERED
   2026-09-01: re-run the AI safety topic under the new pipeline, via
   `/slava:disagreement:run-pipeline`.** The fork is real, so the topic is kept; the re-run is a fresh
   run under §§2–7 (new cast selection, new points bound to contradiction sentences), not a repair of
   run B. Run B stays not-publishable and stays filed as evidence. **This run is the acceptance test
   for this spec** — the Done-When checks against run B are the regression half; this is the forward half.
2. ~~**Keep the two-artifact seal model, or accept that a revised run is unscoreable?**~~ **ANSWERED
   2026-09-01: KEEP.** §11's model stands as the default and §4's earlier point approval makes it
   cheaper than when P1208 proposed it. **DW-19 is therefore a live contract row, not a strike** — the
   loop implements the seal model, and the AI safety re-run unblocks when it lands.
3. ~~**P1208 is public and pairs named real people with agent-derived position values.**~~
   **ANSWERED 2026-09-01: REDACTED, and the redaction is done** — every arguer in
   `features/archive/p1208_*.md` is now `A1`–`A5`, with the mapping held only in the gitignored run
   file. **Whole-file, not matrix-only:** anonymizing the `+3 / −3` table alone leaves the mapping
   recoverable from the prose beside it, which is false assurance rather than redaction. Names
   survive in this spec and in `decisions.md` where the claim is a quote-grounded public position or
   a source metric — the invariant forbids the pipeline's own derived position *value*, not the
   person's own argument.
4. Is a 2-arguer point ever worth filing? Three of five points in this run had fewer than four arguers
   holding a position. Untested.

## Related

- [p1208](archive/p1208_disagreement_pipeline_produces_points_nobody_splits_on.md) — **superseded by this spec.** Its two adversarial rounds and their corrections are the source of several findings above
- `p1202` — added the same-vote and room-vs-arguer checks that detect this defect too late. All 13 Done-When complete
- `p1190` — whether a point is load-bearing. Adjacent, not the same question: a point can matter and not split, or split and not matter
- `p1171` — `select` Phase 0 contestedness + the N-arguer spectrum. Establishes the topic is contested; says nothing about whether the cast preserves it
- [p1161](done/p1161_first_physical_event_chiang_mai.md) — event #1; §Run-of-show and the deviation that cut in-room story reading
- `docs/events/clarity-practice-event.md` — the run-of-show, edited by §8
- `docs/points-process.md` — the canonical contract, edited by §1
- `docs/process-learnings.md` — the story quote block renders twice on the detail page; folded into §7

## Resolved Decisions

Answered by the founder on 2026-09-01 during `/goalify`. Append-only; `## Problem`, `## Solution`,
`## Appetite` and `## Risks / Non-Goals` are untouched.

| # | Question | Answer | Consequence |
|---|---|---|---|
| RD-1 | Keep the two-artifact seal model, or drop it? (Open Question 2) | **KEEP** | DW-19 is a live contract row. The AI safety re-run stays blocked until the seal model lands |
| RD-2 | The archived P1208 pairs named people with derived position values (Open Question 3) | **REDACT** | Done in this same commit — arguers are `A1`–`A5`, whole-file. Not a loop task |
| RD-3 | How is reviewer independence held for a spec that renders nothing? | **Mechanical gate, blind prose review at `/ship`** | Zero COMPARABLE rows. VC-17 carries the review; it is HUMAN-ONLY and the gate does not decide it |
| RD-4 | The event's per-point budget for block 6 | **36 min total, 12 per point over 3 points** | Written into the event doc in this same commit. Objective condition 7 becomes evaluable |

**RD-3 is the one with a cost, so state it plainly.** `goal-gate.sh` CHECK 5 hard-fails a reviewer
round that judged zero screenshots (*"an empty round is not a round"*), so a COMPARABLE row on a
prose spec is unsatisfiable without fabricating images. Classifying every checkable row MECHANICAL
keeps the gate honest, but it means **the gate enforces no independent reader of the skill prose.**
That property is held at `/ship` by a reviewer given the changed skill files and this spec's
controls — never the diff, never the rationale — and it is recorded outside the gate so the loop
cannot self-certify it.

## Verification Contract

Seventeen rows: **16 MECHANICAL, 1 HUMAN-ONLY (5.8%)**, zero COMPARABLE. Under goalify's 25%
refusal threshold, which `goal-gate.sh` CHECK 1 recomputes rather than trusting this sentence.

**Four parser and runner facts this table is built on, each measured this session — not inherited.**

1. **`vitest -t` on a filter that matches nothing exits 0.** Measured: `npx vitest run src/tests
   --reporter=dot -t "zzz-no-such-test-zzz"` → 3406 tests skipped, **exit 0**. So a `-t`-filtered row
   is a green that asserted nothing the moment the file exists with any test in it. Every row below
   therefore runs a **whole file**. P1108's contract records the same finding independently; this run
   reproduced it rather than citing it.
2. **A missing test file exits 1.** Measured against `src/tests/p1210-does-not-exist.test.ts` → exit
   1. That is what makes row absence a real red, and it is the whole of Phase 4's evidence below.
3. **No command contains a pipe.** `contract_rows()` splits each row with `awk -F'|'` and reads the
   command from field 4 — a `|` inside a command silently shifts the fields and runs the wrong string.
4. **`contract_hash()` hashes only this section's body.** The loop may append new sections to this
   spec without breaking the pin; it may not touch a character between this heading and the next `##`.

**Run B is gitignored, so no row may read it directly.** `.private/points-runs/ai-power-remedies.run-B.md`
does not exist in CI, and every row below is CI-tier (only Playwright and `e2e/` rows are local). The
regression rows therefore assert against a committed **structurally identical redacted fixture** —
same three contradiction sentences, same five points, same four arguers, same `positions_unfilled`
field, arguers as `A1`–`A5` — and additionally assert against the real run file **when it is present**,
skipping that half when it is not. The checker is a pure function over a run file; the fixture
preserves every field the checker reads. **This is the invariant this spec asserts, applied to its own
test data:** a public file must not pair a named real person with an agent-derived position value.

**Every row's test must resolve this spec by glob (`features/**/p1210_*.md`), never by literal path** —
`/ship` moves the file into `features/done/{sprint}/` in the same commit the gate validates.

| line | class | decided by | artifact |
|---|---|---|---|
| DW-1 points-process states the objective and the ten-condition table, each row mapped to a stage output that exists | MECHANICAL | `npx vitest run src/tests/p1210-objective-table.test.ts` | src/tests/p1210-objective-table.test.ts |
| DW-2 a point names its pair, contradiction sentence and axis; quote-grounded assert AND deny FILES, either side missing REFUSES | MECHANICAL | `npx vitest run src/tests/p1210-point-unit.test.ts` | src/tests/p1210-point-unit.test.ts |
| DW-3 redundancy check three-fixture control set — two distinct axes pass, verbatim repeat fails, reworded repeat fails | MECHANICAL | `npx vitest run src/tests/p1210-redundancy-control.test.ts` | src/tests/p1210-redundancy-control.test.ts |
| DW-4 + DW-5 run B regression — 2 of 3 sentences unspanned, 4 of 5 points untraced, P1 P2 P4 on pairs with no written contradiction, and the unfilled count derived from cast entries fires its disagreement assert | MECHANICAL | `npx vitest run src/tests/p1210-run-b-regression.test.ts` | src/tests/p1210-run-b-regression.test.ts + src/tests/fixtures/p1210/run-b-redacted.md |
| DW-6 one gate for cast and points — a new downstream axis stops, a sharpening of an approved axis passes | MECHANICAL | `npx vitest run src/tests/p1210-single-gate.test.ts` | src/tests/p1210-single-gate.test.ts |
| DW-7 counterpart hypothesized from person one transcript with 2–3 candidates printed before any search, and a search-first attempt refused | MECHANICAL | `npx vitest run src/tests/p1210-counterpart-order.test.ts` | src/tests/p1210-counterpart-order.test.ts |
| DW-8 a run short of target adds an arguer only against a named new contradiction sentence, and reports filed-of-target when it stops short | MECHANICAL | `npx vitest run src/tests/p1210-point-target.test.ts` | src/tests/p1210-point-target.test.ts |
| DW-9 + DW-10 one story per person per point, single-point scope judged by a checker that is not the writer with a known-bad two-point story in the batch, and no timestamps in story prose | MECHANICAL | `npx vitest run src/tests/p1210-story-scope.test.ts` | src/tests/p1210-story-scope.test.ts |
| DW-11 the event run-of-show carries the pre-read model, per-point staking and the stakeable-statement rule | MECHANICAL | `npx vitest run src/tests/p1210-event-contract.test.ts` | src/tests/p1210-event-contract.test.ts |
| DW-12 + DW-13 + DW-18 no store is inspected with ls, a blocker names its clearing artifact across all four stores, a staged ledger-orphan is FOUND and does not stop the run, and a genuinely absent artifact still blocks | MECHANICAL | `npx vitest run src/tests/p1210-cache-blocker.test.ts` | src/tests/p1210-cache-blocker.test.ts |
| DW-14 the same-vote three-way gate is still present and re-cast is described as a new run | MECHANICAL | `npx vitest run src/tests/p1210-same-vote-gate.test.ts` | src/tests/p1210-same-vote-gate.test.ts |
| DW-15 prepare asks about audience size only below the run file's recorded floor, checked with a source above and a source below | MECHANICAL | `npx vitest run src/tests/p1210-audience-floor.test.ts` | src/tests/p1210-audience-floor.test.ts |
| DW-16 event tag and filing identity in publish Stage 0, story fan-out approval in the orchestrator input block, no mid-stage input turn on the way to publish | MECHANICAL | `npx vitest run src/tests/p1210-input-turns.test.ts` | src/tests/p1210-input-turns.test.ts |
| DW-17 cast-level controls reported every run — a star cast is FLAGGED, a balanced cast is not, and their printed values differ | MECHANICAL | `npx vitest run src/tests/p1210-cast-controls.test.ts` | src/tests/p1210-cast-controls.test.ts |
| DW-19 the two-artifact seal model is implemented (RD-1 KEEP, so this row may not be struck) | MECHANICAL | `npx vitest run src/tests/p1210-seal-model.test.ts` | src/tests/p1210-seal-model.test.ts |
| DW-20 every new refusal passes the pipeline's own documented happy path and has been watched to FAIL on a staged bad input | MECHANICAL | `npx vitest run src/tests/p1210-refusal-suite.test.ts` | src/tests/p1210-refusal-suite.test.ts |
| VC-17 blind prose review of the changed skill files against this spec's controls, by a reader given neither the diff nor the rationale (RD-3) | HUMAN-ONLY | founder, AT /ship | — |

**Every MECHANICAL row above carries paired controls, and that is deliberate.** A row that only
asserts the good case is a formatter. The Done-When lines already name the must-fail fixture for
each; DW-20 is the sweep, and it explicitly does **not** substitute for them — a generic end-of-run
check is what let earlier versions of this work ship gates whose false-positive rate was never
measured (`epistemic.md` 7c).

**Phase 4 — red-first, run 2026-09-01 before the branch existed.** All 16 MECHANICAL commands were
executed against the current tree. Every one exited **1** on a missing file. That is a real red for
row absence and nothing more: it does **not** prove any individual assertion inside a file can fail.
That property is DW-20's job and the loop's, per `epistemic.md` gate 7 — a check never watched to
fail is not a check.
