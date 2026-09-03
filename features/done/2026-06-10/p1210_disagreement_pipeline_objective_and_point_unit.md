---
status: all-done
type: task
rank: 1000060
workstream: infrastructure
created_date: '2026-09-01'
tags: [disagreement, pipeline, points, event]
pipeline_ran: [create-spec, dev, finish, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
completed_at: 2026-09-03
---

# P1210: The Disagreement Pipeline has no stated objective, and its unit of work is the wrong size

**Supersedes [p1208](../../archive/p1208_disagreement_pipeline_produces_points_nobody_splits_on.md)**, rejected
rather than revised (founder decision 2026-09-01 — see *Alternatives Considered*). P1208's evidence and
rejected options are carried forward here; its four-workstream frame is not.

## Run This

**Re-emitted 2026-09-03.** The first contract was rejected in adversarial review and its `/goal`
line was suspended; §12 (RD-5) then changed what a check *is*, so `/goalify` was re-run against the
new triage input rather than the table being hand-patched. The line below is the second contract's,
pinned to a fresh digest. The Solution (§§1–12) was not reopened.

Type this from anywhere in the repo — the main checkout is fine. Nothing to `cd` into, nothing to
rebase; the worktree is already claimed for this spec and carries the pinned contract.

    /goal "Work in the worktree on branch feature/p1210-objective-and-point-unit. Then: ./scripts/goal-gate.sh p1210 exits 0, output pasted. Stop after 50 turns."

**50, not 30 — founder decision 2026-09-03 (RD-10).** The 30 in the suspended line was set when the
checks were prose. §12 commissions seven predicate modules with paired fixtures, a derivation script,
wiring into six skill files and nineteen test files; 30 turns ends mid-build with a red gate and no
committed branch.

`/goal` is native Claude Code, not a repo skill — the founder types it; no agent can invoke it for
them. The condition names an exit code on purpose: the loop's evaluator reads the transcript and
runs nothing, so the only trustworthy condition is one naming an artifact the agent cannot author.

**Why the worktree clause is not decoration.** `goal-gate.sh` CHECK 3 hard-refuses to run on the
shared main checkout — *"refusing to soft-reset outside a worktree — main's index and HEAD are
shared"* — so a loop started there cannot reach exit 0 no matter what it builds. Naming the branch
rather than a slot keeps this line correct if the work is ever moved.

**What the loop is walking into, so it does not have to discover it from red gates.** Nothing under
`scripts/points/` exists yet and no `src/tests/p1210-*` file exists; all 24 rows are red by
construction and Phase 4 measured them that way. `features/verification/p1210/` and
`features/uat/p1210.md` exist as deliberately unsatisfied seeds — the scorecard's rows carry no
results and `feedback.md` carries zeroes. Filling them is work, not housekeeping: CHECK 4 and
CHECK 6 read them.

**Two rows are already true and stay in the contract anyway.** DW-11 and DW-14 are regression
guards — they were green before the loop started and earn their rows by going red if a later edit
removes what they check. The first contract carried DW-11 as if it were new work; that is corrected
rather than hidden.

**Honest limit of the finish line.** The loop still stops on the agent's *paste* of the exit code;
nothing here changes that. What the gate buys is that forgery and decay are caught at the merge
boundary by CI — and that only holds once the pin is on `origin/main`, which the first pinning never
was (RD-9).

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



### 12. The pipeline's checks are CODE the skills call, not prose the skills recite

**Added 2026-09-03 by founder decision (RD-5), after the verification contract was rejected.** This
is a scope change to the Solution, and it is the deepest correction in this spec.

**The argument, which is this spec's own.** §10 rules that no cache check may `ls` a store — *"each
runs the owning tool and reads its verdict."* A sentence in `prepare.md` telling an agent to check
redundancy is the same class of object as an `ls`: a check whose execution depends on a reader
choosing to perform it. That is the mechanism that produced run B. Five points shipped with two
carrying no opposition, and the checks that would have caught it existed — as prose, in files that
ran too late or not at all. **A pipeline whose defect is "our checks did not run" cannot be repaired
by writing more prose instructing an agent to run them.**

**What this commissions.** A module under `scripts/points/`, in `.mjs` so that ONE implementation has
two callers: the six skill files invoke it through `node scripts/points/…` and read an exit code,
and vitest imports the same functions directly. Neither caller gets its own copy of the logic.

| Predicate | Input | Verdict |
|---|---|---|
| assert-and-deny on an axis | a point plus its quote set | FILE / REFUSE, naming the missing side |
| pair carries a written contradiction | two arguers plus the run's `phase_0_note` | the sentence, or NONE |
| canonical pair | a point's positions | the pair, `AMBIGUOUS-PAIR`, or `UNPAIRABLE` |
| sentence-span and point-trace counts | a whole run file | the two counts plus the untraced point ids |
| unfilled positions | the cast entries | count, plus agreement assert against `positions_unfilled` |
| cast concentration | the cast plus every position | per-person share, pair coverage, FLAG or clear |
| store reconciliation | the four stores plus the ledger | orphans, by bytes-vs-ledger diff, never a ledger query |

**Three requirements, each closing a defect the review found.**

1. **The canonical-pair tie-break must define a total order** over inference-strength labels. The
   current text — *"ties break toward the pair with the stronger inference-strength labels"* — names
   no ordering, and §2 already flags an unresolved tie on P3. A rule that cannot be executed is prose
   wearing an algorithm's clothes, which is the defect this spec was rewritten to remove.
2. **Every predicate ships with a must-pass AND a must-fail fixture**, and the must-fail is watched
   to fail before the predicate is trusted (`epistemic.md` gate 7). A predicate with only good inputs
   has an unmeasured false-positive rate.
3. **The run-file fixtures are DERIVED, never authored** — by a committed redaction script run over
   the real run file, asserted to reproduce the committed fixture byte-for-byte. Otherwise the loop
   authors the fixture, the checker and the expected numbers in one turn, and the oracle is the
   system under test. **Specify each fixture by the fields the checker reads and the transform applied
   to each field — never as "the same as the original except X."** A verbatim contradiction sentence
   carries the names it mentions, so anonymizing the arguer roster while keeping the sentences
   reconnects them; that is the P1208 defect (RD-2) reproduced in test data.

**What stays prose, and is honest about it.** Ordering rules (transcript before search), gate
placement (cast and points at one gate), the sharpen-not-add rule, the separate-checker requirement,
and the input-turn consolidation are instructions to an agent. **No test can assert an agent obeys
them** — only that the rule exists and is correctly stated at a named location. Their Done-When lines
and contract rows must say exactly that and claim nothing more.

**Non-goal:** this does NOT move judgment into code. The redundancy check's semantic half (two
reworded propositions are one point) stays a judgment with a fixture — §2 already says exact-string
identity cannot decide it, and a similarity threshold tuned until its own three fixtures pass is
fitting the measure to the result.

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

**Rewritten 2026-09-03 after the contract was rejected** (RD-5 §12, RD-6 – RD-9). Eight lines
previously demanded a verdict on **future agent behaviour**, which no test can produce: the pipeline
is six markdown files with zero executables, and a test asserts prose *contains* a rule, never that
an agent *obeys* it. Each line below is now either a **code predicate** under `scripts/points/`
(§12) or a **rule-presence check** that says plainly it asserts only that the rule exists and is
correctly stated at a named location. Every line names a must-pass **and** a must-fail fixture — the
pre-repair claim that they all already did was false for roughly half of them.

- [x] **DW-1** `docs/points-process.md` carries the objective paragraph, its provenance paragraph, and a table whose row ids are exactly `1a, 1b, 2, 3, 4, 5, 6, 7, 8, 9` (row identity, never a count). Each row's Owner resolves to an existing pipeline file, and each of rows 1a–7 names a stage-output token that occurs in that file. **Both controls:** the real doc RESOLVES all ten; a fixture doc with row 5's owner pointed at a non-existent stage is REJECTED. *Scope, stated honestly: this checks that every condition has a real referent. It does not check that a run emits it — no test can observe a run.*
- [x] **DW-2** `scripts/points/admissibility.mjs` returns FILE for a point whose axis carries a quote-grounded assert AND deny, and REFUSE naming the missing side otherwise. **Both controls:** the assert-and-deny fixture FILES; the deny-only fixture REFUSES with the missing side named. Both verdicts printed.
- [x] **DW-3a** `scripts/points/redundancy.mjs` decides the two deterministic cases: two distinct propositions PASS, one proposition repeated verbatim FAILS. **Both controls, both verdicts printed.**
- [x] **DW-3b** The reworded near-miss verdict is printed by the same harness and **judged by the founder at `/ship`** (RD-7, HUMAN-ONLY). §2 already rules that exact-string identity cannot decide it and §12's non-goal forbids tuning a similarity threshold until its own three fixtures pass, so this half is not mechanized and the contract does not pretend it is.
- [x] **DW-4** `scripts/points/run-scoring.mjs` over the derived run-B fixture reproduces, exactly: **2 of 3 contradiction sentences unspanned**; canonical pairs **P1=(A2,A4), P2=(A1,A4), P3=AMBIGUOUS-PAIR, P4=(A3,A2), P5=(A1,A2)**; **P1, P2 and P4 on pairs carrying no written contradiction, P5 on sentence (a), P3 unscoreable**; and **4 of 5 points tracing to no sentence**, counted from the fixture's own declared `traces_to_sentence` field. **These values were derived by hand at `/goalify` time from the real run file under RD-6's tie-break and are pinned here: the loop writes the checker, never the expectation.** If the checker disagrees, the checker is wrong until the derivation is shown to be. *(The pre-repair line said the opposite — that the LINE was wrong if the run disagreed — which licensed the loop to rewrite the expectation to whatever its own fixture yielded.)*
- [x] **DW-5** `scripts/points/unfilled.mjs` derives the unfilled-position count from the cast entries — **1**, position 3 carries `status: UNFILLED` — and asserts agreement with `positions_unfilled`, which is **0** (an empty list). **On run B the two disagree and the assert MUST fire.** **Both controls:** a fixture where the two agree must NOT fire.
- [x] **DW-6** The one-gate rule is stated at named locations: `select.md` proposes candidate points beside the cast, and `prepare.md` states that downstream may sharpen an approved axis and may not add a new one, a genuinely new fork returning to the founder. Checked by `scripts/points/rule-present.mjs`. **Both controls:** the edited files RESOLVE; a fixture with the sharpen-not-add sentence removed is REJECTED. *Scope: rule presence at a named location. No test asserts an agent obeys it — §12.*
- [x] **DW-7** The transcript-first ordering rule is stated in `select.md`: person one's transcript is read first, 2–3 counterpart candidates and the contradiction sentence each would produce are printed, and no counterpart video search runs before that. Checked by `rule-present.mjs`, **both controls** as above. *Scope: rule presence at a named location.*
- [x] **DW-8** The point-target rule is stated (an arguer is added only against a named new contradiction sentence) and the shortfall report is emitted by `scripts/points/report-target.mjs` in the form `<filed> of <planned>`. **Both controls:** short of target prints the shortfall line; at target prints none.
- [x] **DW-9** `story-draft.md` states one story per (person, point), the no-ceiling rule, and that single-point scope is judged by a checker that is not the writer. Rule presence, **both controls**. *Scope: rule presence at a named location.*
- [x] **DW-10** `scripts/points/story-scan.mjs` finds zero timestamps in story prose and permits them inside the supporting-evidence block. **Both controls:** a clean story PASSES; a story carrying a timestamp in its prose FAILS, naming the offending span.
- [x] **DW-11** **REGRESSION GUARD — and it was already satisfied when the first contract was pinned** (commits `0f1fdf7c` / `694f9e97`; verified 2026-09-03, three greps, one hit each). `docs/events/clarity-practice-event.md` §Run-of-show still carries the pre-read model, per-point staking and the stakeable-statement rule. It earns its row by failing if a later edit removes one, not by being new work — relabelled rather than struck (RD-8), the way DW-14 already was. **Both controls:** the real doc RESOLVES; a fixture with per-point staking deleted is REJECTED.
- [x] **DW-12** `scripts/points/store-inspection-scan.mjs` finds zero direct store inspections across the six skill files plus `docs/points-process.md`. The pattern is **widened beyond `ls`** to `find`, `cat`, `test -f`, `stat`, and any literal `~/.local/share` or `$HOME/.local/share` path outside the single naming sanctioned in `docs/points-process.md`. **Both controls:** the edited tree PASSES; a fixture file containing a store-inspection line is FLAGGED with its line number. *The pre-repair version had exactly one occurrence to find, no known-bad control, and no coverage of any other spelling — deleting that one line would have made it permanently green.*
- [x] **DW-13** `scripts/points/store-reconcile.mjs` takes **a store root and a ledger path as parameters** and walks the bytes, diffing them against the ledger — never a ledger query, which by construction cannot find an artifact whose defining property is having no ledger row. It runs against a **committed fixture store tree** under `src/tests/fixtures/p1210/stores/`, never a home directory: that is what makes this row ci-tier honestly, and the pre-repair version was ci-tier while depending on four real home stores.
- [x] **DW-14** **REGRESSION GUARD.** The same-vote three-way gate is still present in `positions.md`, and "re-cast" is described as meaning fresh Gates 1–2, a fresh seal and therefore a new run. Rule presence, **both controls**.
- [x] **DW-15** `scripts/points/audience-floor.mjs` returns ASK only when a source's metrics fall below the floor recorded in the run file. **Both controls:** a source above the recorded floor returns NO-ASK; one below returns ASK, naming which metric failed.
- [x] **DW-16** `scripts/points/input-block-scan.mjs` finds the event tag and the filing identity inside `publish.md`'s Stage 0 block, the story fan-out approval inside the orchestrator's input block, and **zero** founder-input asks between those blocks and the end of `publish.md`. **Both controls:** the edited files PASS; a fixture with the event tag moved to a mid-stage ask is FLAGGED with its section.
- [x] **DW-17** `scripts/points/cast-controls.mjs` reports distinct verified axes, per-person concentration and pair coverage every run. **Both controls:** a constructed star cast (one arguer carrying more than half the filed points) is FLAGGED; a balanced cast is not, **and the two printed value sets differ** — identical output on both means the control is a formatter.
- [x] **DW-18** **Both controls on the blocker check:** a staged ledger-ORPHAN in the fixture store tree (bytes present, zero ledger rows — the exact shape that blocked run B) is FOUND and the run does NOT stop; a genuinely absent artifact still produces a blocker. A check that never blocks is not a check.
- [x] **DW-19** The two-artifact seal model is implemented as `scripts/points/seal.mjs`, and **"implemented" is defined here** because the pre-repair line left it undefined for a prose spec: the module emits and verifies two immutable blocks — a **construction seal** (the original prediction block plus its hash) and an **eligibility seal** (measured-position eligibility plus its hash) — with the publication version sealed separately against the second, construction accuracy scoring against the first and audience responses against the second. **Both controls:** an untouched block VERIFIES; a block with one character changed returns TAMPERED, naming which seal broke. RD-1 is KEEP, so this row may not be struck.
- [x] **DW-20** `scripts/points/verify-all.mjs` runs every predicate above against its must-pass **and** its must-fail fixture through the identical code path, prints both results beside each other, and **exits non-zero if any predicate has no must-fail fixture** (`epistemic.md` gates 7 and 7c). **This completeness sweep does not substitute for the per-line controls** — a generic end-of-run check is what let earlier versions of this work ship gates whose false-positive rate was never measured.
- [x] **DW-21** **No vacuous tests.** `scripts/points/no-vacuous-tests.mjs p1210` runs the p1210 suite under vitest's JSON reporter and exits non-zero if **any** test is skipped, todo or `.only`, or if zero tests executed. **Measured 2026-09-03 and again at this repair: a file whose every test is `it.skip` / `it.todo` exits 0 under vitest.** Whole-file rows therefore do NOT close the exit-0 hole the way the pre-repair contract claimed — all 16 of its rows could have been green with zero assertions executed, and neither CHECK 1 nor CHECK 2 reads for it. **Both controls:** the real suite PASSES; a fixture file carrying one `it.skip` FAILS this scan.
- [x] **DW-22** **One implementation, two callers** (§12). Every predicate module under `scripts/points/` is invoked by at least one of the six skill files through `node scripts/points/…` and imported by at least one p1210 test. Checked by `scripts/points/two-callers.mjs`. **Both controls:** the wired tree PASSES; a fixture module reachable from tests only is FLAGGED. *A check that exists as code nothing calls is prose with a file extension — the exact defect §12 was written to end.*
- [x] **DW-23** **The run-B fixture is DERIVED, never authored.** `scripts/points/verify-fixture.mjs` (a) scans the committed `src/tests/fixtures/p1210/run-b-redacted.md` and hard-fails on **any** real arguer surname or **any** verbatim contradiction sentence — a verbatim sentence carries the names it mentions, so anonymizing the roster to A1–A5 while keeping the sentences reconnects them, which is the P1208 defect (RD-2) reproduced in test data; and (b) re-runs `scripts/points/redact-run.mjs` over the real run file and asserts it reproduces the committed fixture **byte for byte**. The fixture is specified by **the fields the checker reads and the transform applied to each**, never as "the same as the original except X". **The roster transform is fixed and must match the predecessor's:** the four *filled* arguers map to `A1`–`A4` in cast order and position 3 keeps `status: UNFILLED` with no code — this is the convention already used in `features/archive/p1208_*.md`, where `A3` is the fourth cast position. Numbering by position instead would silently shift every pair in DW-4's pinned expectation. **Honest CI limit:** the run file is gitignored, so half (b) prints `DERIVATION: UNVERIFIABLE (source absent)` and exits 0 in CI; half (a) always runs because it reads only the committed fixture. The derivation is verified locally, where the loop and `/ship` both run.

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

- [p1208](../../archive/p1208_disagreement_pipeline_produces_points_nobody_splits_on.md) — **superseded by this spec.** Its two adversarial rounds and their corrections are the source of several findings above
- `p1202` — added the same-vote and room-vs-arguer checks that detect this defect too late. All 13 Done-When complete
- `p1190` — whether a point is load-bearing. Adjacent, not the same question: a point can matter and not split, or split and not matter
- `p1171` — `select` Phase 0 contestedness + the N-arguer spectrum. Establishes the topic is contested; says nothing about whether the cast preserves it
- [p1161](../p1161_first_physical_event_chiang_mai.md) — event #1; §Run-of-show and the deviation that cut in-room story reading
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
| RD-3 | How is reviewer independence held for a spec that renders nothing? | **Mechanical gate, blind prose review at `/ship`** | Zero COMPARABLE rows. VC-24 carries the review (VC-17 before the 2026-09-03 re-triage); it is HUMAN-ONLY and the gate does not decide it |
| RD-4 | The event's per-point budget for block 6 | **36 min total, 12 per point over 3 points** | Written into the event doc in this same commit. Objective condition 7 becomes evaluable |
| RD-5 | The pipeline's checks: prose an agent recites, or code the skills call? (2026-09-03, after the contract was rejected) | **CODE** | New §12. Scope change to the Solution. The contract is rewritten against it before re-pinning; the `/goal` line stays suspended until then |
| RD-6 | §12 requires a total order over the inference-strength labels for the canonical-pair tie-break | **Sorted-descending lexicographic** — `close` > `derived` > `stretch`; a pair's strength is its two labels sorted descending and compared position by position; still equal ⟹ `AMBIGUOUS-PAIR` | Applied by hand to run B at `/goalify` time: P1=(A2,A4), P2=(A1,A4), **P3=AMBIGUOUS-PAIR**, P4=(A3,A2), P5=(A1,A2) — codes per the P1208 roster convention, filled arguers numbered in cast order. P3's two max-difference pairs both score `[close, derived]`. This contradicts §*What the run measures*'s table, which named a pair for P3 — and §2 already rules that when the rule and the table disagree, **the table is wrong**. DW-4 pins these five verdicts |
| RD-7 | DW-3 demanded a reworded proposition deterministically FAIL, which §2 and §12's own non-goal both say is a judgment | **Split** | DW-3a is MECHANICAL (two distinct propositions PASS, one repeated verbatim FAILS). DW-3b is HUMAN-ONLY — the harness prints the near-miss verdict, the founder judges it at `/ship`. No similarity threshold is tuned |
| RD-8 | DW-11 was already satisfied before the loop started (finding 9) — strike it or relabel it? | **Relabel as a regression guard** | It stays in the contract, labelled the way DW-14 already was, and earns its row by failing if a later edit removes pre-read, per-point staking or the stakeable-statement rule. Recorded rather than quietly dropped |
| RD-9 | The contract pin is on local `main` but not on `origin/main`, so CHECK 7's merge-boundary guarantee is not in force (finding 13) | **Push the re-pin** | The repaired digest is committed to `main` and the founder is asked to approve the push before the loop starts. Until that push lands, CHECK 7 compares against a ref inside the same repository the branch lives in |
| RD-10 | The suspended `/goal` line said *stop after 30 turns*, written when the checks were prose | **50 turns** | §12's commissioned scope is seven predicate modules with paired fixtures, a derivation script, six skill-file edits and nineteen test files. 30 ends mid-build with a red gate and no committed branch |

**RD-6 through RD-10 were answered on 2026-09-03 during the second `/goalify` run.**

**RD-3 is the one with a cost, so state it plainly.** `goal-gate.sh` CHECK 5 hard-fails a reviewer
round that judged zero screenshots (*"an empty round is not a round"*), so a COMPARABLE row on a
prose spec is unsatisfiable without fabricating images. Classifying every checkable row MECHANICAL
keeps the gate honest, but it means **the gate enforces no independent reader of the skill prose.**
That property is held at `/ship` by a reviewer given the changed skill files and this spec's
controls — never the diff, never the rationale — and it is recorded outside the gate so the loop
cannot self-certify it.

## Verification Contract

**Second contract, written 2026-09-03 after the first was rejected in adversarial review.** The
first is not revised here — §12 changed what a check *is*, so every row was re-triaged from the
Done-When lines rather than edited. The 15 findings and the repair order live in
[`verification/p1210/contract-review-2026-09-03.md`](../../verification/p1210/contract-review-2026-09-03.md),
deliberately not named `review-round-N.md` because that glob is CHECK 5's and a round judging zero
screenshots hard-fails.

**Twenty-four rows: 22 MECHANICAL, 2 HUMAN-ONLY (8%), zero COMPARABLE.** Under goalify's 25%
refusal threshold, which CHECK 1 recomputes rather than trusting this sentence.

**Five parser and runner facts this table rests on, each measured this session — none inherited.**

1. **An all-skipped file exits 0.** Measured: a probe file whose tests are `it.skip` and `it.todo`
   → *1 skipped, 1 todo*, **exit 0**. The first contract concluded that whole-file rows closed the
   vacuity hole; they close the `-t` spelling only, and all 16 of its rows could have been green
   with zero assertions executed. Neither CHECK 1 nor CHECK 2 reads for it. **DW-21 is the row that
   does**, and it is the reason this contract has 24 rows rather than 23.
2. **`vitest -t` on a filter matching nothing also exits 0**, so no row below uses a `-t` filter.
3. **A missing test file exits 1.** That is what makes row absence a real red, and it is the whole
   of Phase 4's evidence — it proves nothing about any assertion inside a file that exists.
4. **No command contains a pipe.** `contract_rows()` splits each row with `awk -F'|'` and reads the
   command from field 4; a `|` inside a command shifts the fields and runs the wrong string.
5. **`contract_hash()` hashes only this section's body.** New sections may be appended to this spec
   without breaking the pin; nothing between this heading and the next `##` may change.

**What the eight behavioural rows became.** The pipeline is six markdown files with zero
executables, so no test can decide whether an agent obeys an ordering rule. §12 splits the work:
seven predicates become real `.mjs` modules with one implementation and two callers, and what stays
prose — ordering, gate placement, sharpen-not-add, the separate-checker requirement, input-turn
consolidation — is checked for **rule presence at a named location** by `rule-present.mjs`, with a
must-fail fixture in every case. Those rows say so in their own text and claim nothing more.

**The run-B expectations are pinned, not computed by the loop.** DW-4's five canonical pairs, the
two counts and P3's `AMBIGUOUS-PAIR` verdict were derived by hand at `/goalify` time from the real
run file under RD-6's tie-break, and are written into the Done-When line this contract pins. The
loop writes the checker; if the checker disagrees with the expectation, the checker is wrong. The
first contract said the reverse, which licensed the loop to author the fixture, the checker and the
oracle in one turn.

**Run B is gitignored, so no row reads it directly.** `.private/points-runs/ai-power-remedies.run-B.md`
does not exist in CI. Rows assert against a **derived** redacted fixture — produced by a committed
redaction script, asserted byte-for-byte, scanned for real names and verbatim contradiction
sentences (DW-23). *Both* transforms are required: an A1–A5 roster beside a verbatim sentence
reconnects the names, which is this spec's own Invariant broken in its own test data.

**Every row's test must resolve this spec by glob (`features/**/p1210_*.md`), never by literal path** —
`/ship` moves the file into `features/done/{sprint}/` in the same commit the gate validates.

| line | class | decided by | artifact |
|---|---|---|---|
| DW-1 objective + ten-condition table, every row id present and every owner and stage-output token resolving to a real file | MECHANICAL | `npx vitest run src/tests/p1210-objective-table.test.ts` | src/tests/p1210-objective-table.test.ts |
| DW-2 admissibility predicate — assert-and-deny FILES, either side missing REFUSES naming it | MECHANICAL | `npx vitest run src/tests/p1210-admissibility.test.ts` | scripts/points/admissibility.mjs |
| DW-3a redundancy, deterministic half — two distinct propositions PASS, one repeated verbatim FAILS | MECHANICAL | `npx vitest run src/tests/p1210-redundancy.test.ts` | scripts/points/redundancy.mjs |
| DW-3b redundancy, reworded near-miss — verdict printed by the same harness, judged by the founder at /ship (RD-7) | HUMAN-ONLY | founder, AT /ship | — |
| DW-4 run-B regression reproduces the pinned expectation — 2 of 3 unspanned, the five canonical pairs including P3 AMBIGUOUS-PAIR, 4 of 5 untraced | MECHANICAL | `npx vitest run src/tests/p1210-run-b-regression.test.ts` | scripts/points/run-scoring.mjs |
| DW-5 unfilled count derived from cast entries is 1, the field says 0, the disagreement assert fires; an agreeing fixture does not fire it | MECHANICAL | `npx vitest run src/tests/p1210-unfilled.test.ts` | scripts/points/unfilled.mjs |
| DW-6 one-gate and sharpen-not-add rules PRESENT at named locations; a fixture missing the sentence is REJECTED | MECHANICAL | `npx vitest run src/tests/p1210-rule-one-gate.test.ts` | scripts/points/rule-present.mjs |
| DW-7 transcript-first ordering rule PRESENT at its named location; a fixture missing it is REJECTED | MECHANICAL | `npx vitest run src/tests/p1210-rule-transcript-first.test.ts` | scripts/points/rule-present.mjs |
| DW-8 point-target rule present and the shortfall report emits filed-of-planned when short, nothing when at target | MECHANICAL | `npx vitest run src/tests/p1210-point-target.test.ts` | scripts/points/report-target.mjs |
| DW-9 story-unit rules PRESENT — one per person per point, no ceiling, checker is not the writer; fixture missing them REJECTED | MECHANICAL | `npx vitest run src/tests/p1210-rule-story-unit.test.ts` | scripts/points/rule-present.mjs |
| DW-10 story scan — clean prose PASSES, prose carrying a timestamp FAILS naming the span, evidence block exempt | MECHANICAL | `npx vitest run src/tests/p1210-story-scan.test.ts` | scripts/points/story-scan.mjs |
| DW-11 regression guard — run-of-show still carries pre-read, per-point staking, stakeable statement; fixture with staking deleted REJECTED | MECHANICAL | `npx vitest run src/tests/p1210-event-contract.test.ts` | src/tests/p1210-event-contract.test.ts |
| DW-12 store-inspection scan over seven files, pattern widened past ls; clean tree PASSES, planted inspection FLAGGED with its line | MECHANICAL | `npx vitest run src/tests/p1210-store-inspection.test.ts` | scripts/points/store-inspection-scan.mjs |
| DW-13 + DW-18 store reconcile over a committed fixture store tree — planted ledger-orphan FOUND and not blocking, genuinely absent artifact still blocks | MECHANICAL | `npx vitest run src/tests/p1210-store-reconcile.test.ts` | scripts/points/store-reconcile.mjs |
| DW-14 regression guard — same-vote three-way gate present, re-cast described as a new run; fixture missing it REJECTED | MECHANICAL | `npx vitest run src/tests/p1210-rule-same-vote.test.ts` | scripts/points/rule-present.mjs |
| DW-15 audience floor — source above the recorded floor returns NO-ASK, source below returns ASK naming the failed metric | MECHANICAL | `npx vitest run src/tests/p1210-audience-floor.test.ts` | scripts/points/audience-floor.mjs |
| DW-16 input blocks — event tag and filing identity inside publish Stage 0, fan-out approval in the orchestrator block, zero asks between; planted mid-stage ask FLAGGED | MECHANICAL | `npx vitest run src/tests/p1210-input-blocks.test.ts` | scripts/points/input-block-scan.mjs |
| DW-17 cast controls — star cast FLAGGED, balanced cast not, and the two printed value sets differ | MECHANICAL | `npx vitest run src/tests/p1210-cast-controls.test.ts` | scripts/points/cast-controls.mjs |
| DW-19 seal model — construction seal and eligibility seal emitted and verified; untouched VERIFIES, one character changed returns TAMPERED naming the seal | MECHANICAL | `npx vitest run src/tests/p1210-seal.test.ts` | scripts/points/seal.mjs |
| DW-20 refusal sweep — every predicate run against its must-pass and its must-fail through one code path, exits non-zero if any predicate has no must-fail fixture | MECHANICAL | `node scripts/points/verify-all.mjs` | scripts/points/verify-all.mjs |
| DW-21 no vacuous tests — zero skipped, todo or only across the p1210 suite, and a non-zero executed-test count | MECHANICAL | `node scripts/points/no-vacuous-tests.mjs p1210` | scripts/points/no-vacuous-tests.mjs |
| DW-22 two callers — every predicate module invoked by a skill file and imported by a test; a test-only module is FLAGGED | MECHANICAL | `npx vitest run src/tests/p1210-two-callers.test.ts` | scripts/points/two-callers.mjs |
| DW-23 fixture is derived and clean — zero real surnames, zero verbatim contradiction sentences, and the redaction script reproduces it byte-for-byte where the source is present | MECHANICAL | `node scripts/points/verify-fixture.mjs` | scripts/points/verify-fixture.mjs |
| VC-24 blind prose review of the changed skill files against this spec's controls, by a reader given neither the diff nor the rationale (RD-3) | HUMAN-ONLY | founder, AT /ship | — |

**Coverage, stated so it can be audited rather than believed.** Twenty-four Done-When lines
(`DW-1` … `DW-23`, with `DW-3` split into `3a` and `3b`) map to **twenty-three** rows — `DW-13` and
`DW-18` share one row and one fixture tree, every other line has its own, and no line is uncovered
or claimed twice. The twenty-fourth row, `VC-24`, is the only one with no Done-When line: RD-3 holds
the blind prose review at `/ship`, outside the gate, so the loop cannot self-certify it.

**Paired controls, stated per row rather than asserted globally.** The first contract carried the
sentence *"every MECHANICAL row above carries paired controls"* and it was false for roughly half
the lines. Each row's Done-When line above now names its own must-fail fixture in its own text, and
DW-20 fails the run if any predicate is missing one. That is the check on the claim; the sentence is
not the check.

**Phase 4 — red-first, run 2026-09-03 against the current tree, before any of it was built.** All
**22** MECHANICAL commands below were executed and every one exited **1**: the 19 vitest rows on a
missing test file, the 3 `node scripts/points/…` rows on a missing module directory. The rows were
extracted with `goal-gate.sh`'s own `contract_rows()` parser, which read 24 rows and classified them
22 MECHANICAL / 2 HUMAN-ONLY — the same arithmetic CHECK 1 will recompute. That is a real red for
row absence and **nothing more**: it does not prove any individual assertion inside a file can fail.
That property is DW-20's job and the loop's, per `epistemic.md` gate 7.

**One guarantee that is weaker than it looks, stated rather than hidden.** CHECK 7 reads the pin
from `origin/main` and falls back to local `main`. At the first pinning the digest was never pushed,
so the merge-boundary guarantee the gate advertises was not in force. RD-9 resolves it: the repaired
pin is committed to `main` and pushed before the loop starts. Until that push lands, CHECK 7 is
comparing against a ref inside the same repository the branch lives in.
