---
status: in-progress
type: task
rank: 87
workstream: infrastructure
created_date: '2026-08-28'
tags: [disagreement, arbiter-failure, points, skills]
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1190: The disagreement pipeline ranks points by split-hardness and never asks whether they matter

## Problem

**Situation:** `/slava:disagreement:prepare` Stage 3 is the entire load-bearing filter for every
point that reaches an event. It is one sentence: *"Does taking a position on this decide an
allocation? If nothing moves either way, drop it."* No checklist, no magnitude, no ordering. The
skill's optimisation target is the polarization band in Stage 4; consequence is a yes/no
afterthought.

**Complication:** cp already owns the filter that answers this — the **arbiter-failure criteria**
(`lean-canvas.md` §Customer Segments): a challenge earns the comprehension instrument when its
natural consequence-arbiter fails, in one of four ways, unless the **interface disqualifier**
applies. P1185 (shipped 2026-08-28) wired exactly that filter into `/understanding:detect`, which
now tags every card with the mode that fires or `NONE`. The disagreement pipeline — which produces
the points real people take positions on at a real event — was not given the same filter.

The 2026-08-28 `ai-power-remedies` run is the evidence. Five points shipped, all defensible, none
scored for consequence. Asked whether they were the *most* load-bearing, the honest answer was that
the skill never asked: it gates on split-hardness and stops.

**Question:** Should the pipeline that produces published points apply the criteria the project
already uses to decide whether the instrument applies at all — and does the current single home for
those criteria survive a fourth consumer?

> Founder framing, verbatim: *"if something is polarizing but not deciding, then people just have
> fun. And what did we actually achieve? What we want actually is to move people on some important
> things that have big consequences."*

> On ordering, verbatim: *"it's not rank, it's just like think about in stages, right?"*

> On the extraction, verbatim: *"should we extract and make sure actually it's one single source.
> So everywhere where there is a pointer, that it starts to point to this file."*

## Appetite

**Blast radius: medium** — two pipeline skill files, **plus `understanding/detect.md`** if the
definition moves (it holds two derived tables, so it is edited, not just repointed) — three skill
files, not two. **Reversibility: high** for the skill edits; **medium** for a doc move
(strategy-doc gate, and live pointers must be repointed in the same change). **Decision density:
one founder call** — whether the four modes move out of `lean-canvas.md` §Customer Segments into
their own home, which is a strategy-doc question, not a technical one.

## Invariants

- **The re-run must not see run A.** The frozen baseline
  `.private/points-runs/baselines/ai-power-remedies.run-A-2026-08-28.md` (sha256
  `2f6e909b02330928e40b670a4c2e0899f7e509ead35277769d3e7ff5b4498e19`) is read-only input to
  **scoring only**. The session that generates run B must not be given run A's points, and the
  session that scores must not be the session that generated either run. An agent grading its own
  output against output it remembers produces a comparison with no information in it.
- **Comparison criteria are pre-registered.** The scoring rubric below is frozen before run B
  exists. Criteria written after seeing run B measure whatever run B happens to be.
- **A `NONE` verdict is a finding, never a defect** (inherited from P1185). A run whose
  "not for this instrument" list is empty on every topic is a filter that is not running, and must
  be reported as such rather than read as a clean result.
- Every existing seal rule survives unchanged: approvals re-verified before acting, prediction
  sealed before display, mismatch is a STOP and never a re-seal.

## Solution

**0. What the four modes actually do on this corpus — measured before designing around them.**
A dry-run of the model against run A's five statements (bearer = the room) fires on **5 of 5**:
P1 and P5 on fuzzy intent (*"a bigger threat to your life"*, *"should be decided by a vote"* are
not specifiable); P2, P3, P4 on delayed feedback. `NONE`: zero. This is not an accident of run A —
a public argument about what *should* be done is normative or long-horizon by construction, so its
natural arbiter fails almost always.

**Consequence, and it inverts the obvious design: on this class of topic the four modes are a
near-universal pass and do not discriminate.** The component that actually excludes is the
**interface disqualifier** — the claim a price, standard, precedent, default *or a document*
already settles. The `KL9_1GbmCic` source is the live example: *"the METR report found X"* is
settled by reading the report and must be skipped, while *"labs are turning to AI to oversee AI
development"* is not settled by anything and stands.

**0b. The tag vocabulary has no doc home — resolve that before wiring anything.** The mode names
plus their firing conditions exist only in `detect.md:212-217` (operational) and `detect.md:393-400`
(reader translation). `lean-canvas.md:89` carries the parenthetical glosses and **no firing
conditions**. So `prepare.md` can neither point at the canvas (the tag would be inapplicable) nor
point at another skill file (that makes a skill the source), and copying violates this spec's own
non-goal. All three branches are blocked until the operational table has one home.
**Ordering is load-bearing: extract the table → repoint `detect.md` → then wire `prepare.md`.**

**1. Therefore: disqualifier gates, loss magnitude ranks, modes are a reported tag.**

- **Gate** — the interface disqualifier. A candidate a document, price, standard, precedent or
  default already arbitrates is set aside with the interface **named**, per P1185's
  `SKIP — interface: ‹the interface›` form.
- **Rank** — potential loss to the room, in its own currency (time · money · **a burned read**),
  from `/understanding:detect` Step B. For an event, burned read dominates: a weak point spends
  the room's willingness to take a position on that topic, and that is spent once.
- **Tag, reported not gating** — which of the four modes fires, or `NONE`. Expected to be a pass
  almost always here; a run where it fires on everything is reported as such, never presented as
  the filter having worked (P1185's own `NONE`-is-a-finding rule, inverted).

**2. Stages, not a ranking of both.** Load-bearing is a **gate + a rank**; polarization is what
surviving candidates are then **formulated for**. The two are never traded against each other.

**3. The freeze goes between Stage 4a and Stage 4c, not before Stage 4.** Run A's five points are
all `is_synthesized: true` — statements **neither speaker made**, invented at Stage 4a. So the
object the room takes a position on does not exist at Stage 3, and a Stage-3-only gate scores
candidate claims while the shipped artifact is something else. **The tag and the loss estimate are
therefore applied at 4a, to the synthesized statement**, and the frozen list is written before 4c
(bald restatement) runs. Stage 3 keeps its cheap pre-filter on candidate claims; it is not the gate.

**4. Write the reported-speech rule down, in exclude-the-passage form.** **Corrected status quo:**
no rule anywhere rejects a source for containing reported speech. `points-process.md:97` and `:276`
describe the scan as one of several Gate 0 verification steps, and `grep -c "reported speech"`
returns **0** on all six disagreement skill files. So the rule is unwritten in the skills and
enforced only by whoever remembers it — this item makes it explicit rather than loosening something
that was ever binding.

Write into `select.md` Gate 0: a source is **not** rejected for containing reported speech; the
passages where the speaker voices someone else are excluded from the quotable span, confirmed per
quote in `/slava:disagreement:positions`. **`points-process.md` invariant 2 must be updated in the
same change** — it is the canonical contract, and line `:276` already records this exact drift
happening once ("this invariant previously read 'no multi-speaker sources', which P1167 had already
superseded in `select.md`"). Changing the skill and not the contract repeats it.

*(The "1 of 5 positions" figure is deliberately **not** cited here. It is at `select.md:341` and is
accurate, but it measures rejections for two-way word share and panel shape — 60.0%, 56.0%, 53.8%,
80.8% — which is a different mechanism. It argues that the medium is source-starved; it does not
argue about reported speech.)*

**4b. Gate 0 must require a name-bearing artefact as identity evidence.** The sealed
`mapping_evidence` for position 3 read *"spk:1 addresses spk:0 with 'the title of your book'"* —
which establishes that a speaker **changed** and that they **wrote a book**, and nothing else. Both
co-authors satisfy it, and the source turned out to be Nate Soares, not Eliezer Yudkowsky.
`select.md` Step 2b already states the principle (*"each one marks that the speaker changed, never
who it changed to"*); Gate 0 accepted evidence that did not meet it.

Add to `select.md` Gate 0: identity must be fixed by an artefact that **carries the name** — the
transcript, the video description, or the title — never by inference from a turn boundary. The
cheapest form is one command, and it is now required in the pasted Gate 0 evidence:

```bash
grep -ciE "<surname>" ~/.local/share/yt-store/<id>/en.vtt   # 0 is a STOP
```

Today's failure returns **0** for `yudkowsky|eliezer` and **6** for `soares|sores` on the same track.

**5. The single-source question.** [FOUNDER DECISION: do the four arbiter-failure modes move out of
`lean-canvas.md` §Customer Segments into their own model doc?]

**Verified state as of this spec, corrected after an earlier claim in this file was wrong.**
`grep -c "fuzzy intent"` returns **4** in `lean-canvas.md` and **4** in
`understanding/detect.md`, **0** in `definitions.md`. So there are **two homes holding content**,
not one home and two pointers:

- `lean-canvas.md` §Customer Segments — definition, derivation, falsifiers, provenance, GTM framing.
- `detect.md:211-219` — a **five-row operational table** (mode · what breaks · *fires when the
  corpus shows*), plus a pointer to the canvas for provenance. The third column is new content
  that exists **only** in a skill file. Created by P1185 on 2026-08-28.
- `definitions.md:292` — the interface disqualifier only, correctly pointing back. Not a mode home.

What argues for a move: a go-to-market section is the operational source for a filter two skills now
apply and a third is being added; the newest content lives in a skill rather than a doc; and the
canvas entry records that its own wording already drifted into articles (*"Read 'the three criteria'
anywhere else in this repo as this list"*). What argues against: the canvas entry's derivation,
falsifiers and provenance do GTM work and must not travel with the definition, so a move is a split,
not a cut-and-paste.

**If the move happens, `detect.md`'s "fires when the corpus shows" column moves with it** — it is
the only operational guidance either home carries, and the disagreement pipeline needs its own
equivalent column (*fires when a public claim shows…*), which is not the same text.

**6. If the move happens, the dimensions get defined, not listed.** Each mode carries its
reconciled name, the rival name recorded in `decisions.md` 2026-08-24, what breaks about
arbitration, and its epistemic status. `specifiability` is `fuzzy intent`; `observability` is
`delayed feedback` **widened to name scale and distance alongside delay**; `explanatory divergence`
stays marked UNTESTED with zero field contact; both falsifiers travel with them.

**7. The re-run and its scoring.** Run B is generated in a fresh session against the same five
sources and the same room, under the amended skill. Scored by a **third** session against the
pre-registered criteria below.

## Alternatives Considered

- **A new sixth pipeline command between `select` and `prepare`.** Rejected: the claim-level test
  needs the transcripts, which `prepare` Stages 1–2 already read, so a separate command either
  re-reads them or reaches into another skill's work. The founder's own second formulation — one
  skill taking both models and showing why each point is load-bearing — is what is built here.
- **A percentage quota (e.g. 70% load-bearing / 30% polarizing).** Rejected on the founder's
  correction: both properties are required, so a quota would licence shipping points that fail one.
  Gate on one, formulate for the other.
- **Re-running point generation in the session that produced run A.** Rejected: that session holds
  run A's five points, so the comparison would be an agent grading its own remembered work.
- **Rejecting sources that contain reported speech (status quo).** Rejected: the medium is already
  starved — `select.md` records Gate 0 admitting **1 of 5** positions before diarization was added —
  and the guard is available one stage later at per-quote granularity.

## Decision Criteria — pre-registered, frozen before run B exists

**The mode-count metric was dropped before it was ever run.** A dry-run against run A returned
**5/5 fired**, a ceiling run B can tie but never beat, so "which set has more fired modes" had no
path to `adopt`. It is replaced below by criteria that can actually return each of their outcomes.
Recorded rather than quietly swapped, because a rubric changed after seeing the data is exactly
what pre-registration exists to prevent — this change was made from run A alone, before run B
exists, and that is the only reason it is legitimate.

**Who scores, fixed now — a subagent is fine; the blinding is not the scorer's job.**
The requirement is that the scorer never generated either run, and a fresh subagent satisfies that
by construction. It does **not** need to be a separate interactive session.

But the scorer cannot blind itself, and neither can the session that produced run B — that session
knows which set is which, so if it shuffles the labels it also holds the key while reading the
verdict. **A script does the shuffle**, not an agent: it writes the two sets to `X.md` and `Y.md`
in random order and the mapping to a third file that nobody opens until the verdict is recorded.
Then the subagent scores X and Y, and only afterwards is the mapping read.

Without that, "blind" means an agent promising not to think about something it knows.

**Scorer input, fixed now.** For every criterion, the scoring session receives, per statement: the
statement, **all four inference chains** (chain count normalised to four — run A's P3 carries only
two, and that gap is a fingerprint of the Soares block, so P3's missing chains are marked
`withheld` in both sets rather than absent in one). Sets are labelled X and Y, order randomised, all
run metadata stripped. **Bearer of the loss is fixed as: the room** — not the arguers — so two
scorers cannot produce different counts from the same statements.

**Run B's input, fixed now.** A redacted header: topic, `room_key`, the four confirmed arguer
entries with video IDs, position 3 marked unfilled, and **everything from `## Points & Predictions`
onward stripped.** Hashed and committed the way run A is, before run B starts. Run B is told
**four** arguers, not five — the spec previously said "the same five sources", which would send that
session hunting a fifth and reintroduce the confound this spec declares out of scope.

1. **Did the wiring change the output at all?** → Statement-level overlap between run B and run A.
   Full overlap means the wiring is decoration; zero overlap means it is a different instrument.
   Both are reportable. **This is the criterion N=1 actually supports.**
2. **Did the gate ever exclude anything?** → Run B must print a `Not for this instrument` list with
   at least one entry naming its interface, **or** state that nothing was excluded and why that is
   credible. **This is a precondition on the verdict, not an axis**: an empty list with no
   statement means no verdict is issued. Run A's Stage 3 discards must be recovered into a
   companion file first, or criterion 1 has nothing to compare exclusions against.
3. **Does the filter discriminate?** → Score all ten statements. **If every statement in both sets
   fires a mode, the four modes did not transfer to public claims** — report that as the finding,
   and the gate stands on the disqualifier alone. This is the criterion that can detect
   non-transfer; the previous rubric had no branch for it.
4. **Does the loss-magnitude rank agree with anything?** → The scorer ranks all ten by potential
   loss to the room and states its currency per item. **Reported, not adjudicated** — there is no
   validated oracle for this room, and pretending otherwise would score a replacement against the
   signal it replaces.
5. **Did polarization survive?** → The existing agreement test on both sets. **Reported as an
   observation, not a gate.** Every baseline prediction reads `basis — room: INFERRED, no data`,
   the run A prediction pass is self-labelled `NOT independent`, and `prepare.md`'s own open
   questions ask whether the 15–40% band is right for a room this size. An unvalidated band cannot
   be a condition of adoption.
6. **Verdict rule, written now — provisional only, and covering every outcome:**
   - Criterion 2 fails → **no verdict.** Re-run or abandon; do not read criterion 1 alone.
   - Sets differ (crit 1) **and** the gate excluded something (crit 2) → **adopt provisionally**,
     pending a second topic.
   - Sets are identical → **wiring is decoration**; keep the disqualifier, drop the rest.
   - Filter fires on everything (crit 3) → **the four modes do not transfer**; the disqualifier and
     the loss rank stay, the mode tag is demoted to reporting. *(Predicted by the dry-run — so this
     is the branch to expect, and predicting it in advance is what makes it evidence.)*
   - Any outcome, including a tie on any axis → **provisional.** One topic, one room, one scoring
     session, ten items, no inter-rater check. **Rejecting the model itself requires a second
     topic**; this run cannot do it, and the Risks table's own `n=1` row says so.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The four modes were derived for a *dyad's* challenge; a public room is not a dyad | MITIGATE | Criterion 5 above makes a failure to transfer a rejection, not a fudge |
| Blind scoring leaks — the scorer infers which set is new from style | MITIGATE | Randomise order, strip all run metadata, label X/Y |
| Moving the modes out of the canvas breaks a live pointer, or leaves a home behind | MITIGATE | Repoint `detect.md:209,522` and `definitions.md:292` in the same change; `grep -c "fuzzy intent"` must return 0 everywhere except the new home before closing |
| A pointer resolves to a section that does not contain what it claims | MITIGATE | The P1145 failure mode verbatim: read each target section after repointing, do not trust the link text |
| Relaxing reported-speech admits a quote where the speaker voices someone else | ACCEPT | Caught per quote in `positions`, which already confirms speaker per quote |
| `explanatory divergence` is untested with zero field contact | ACCEPT | Carried with its label; it may simply never fire on a public corpus, which is itself data |
| Run A's five points were produced under the old skill and may be unrepresentative of it | ACCEPT | n=1 either way; this is a single comparison, not a measurement of the skill |
| A sixth arguer (`KL9_1GbmCic`, solo shape, cached) is available but unapproved | DEFER | Needs a fresh Gate 1/2; do not add mid-comparison — it would confound run B |

**Non-Goals**
- Do NOT change the seal mechanics, gate structure, or approvals flow.
- Do NOT re-open the `ai-power-remedies` approvals block or re-seal it.
- Do NOT add a sixth pipeline command.
- Do NOT resolve the Nate Soares misattribution here — *which person fills position 3* stays a separate founder decision. Item 4b fixes the **check that missed it**, not the run.
- Do NOT copy the arbiter-failure definitions into any skill file; skills point at the source.

## Done-When

- [x] The operational mode table has exactly one home; `detect.md` and `prepare.md` both point at it
- [x] `prepare.md` applies the interface disqualifier as the gate and a loss estimate as the rank, **at Stage 4a on the synthesized statement**, and prints a `Not for this instrument` list naming each interface  
      *(Implemented at **4b-iii**, not inside 4a: the tag and loss are computed on the 4a statement, but the gate and freeze run after 4b/4b-ii, which can force a set rebuild. Freezing before a rebuild would describe a set that no longer exists. Reason stated in the file.)*
- [x] `prepare.md` writes the frozen list between Stage 4a and Stage 4c, and the ordering is stated as a constraint in the file
- [x] `select.md` Gate 0 carries the reported-speech rule in exclude-the-passage form; `grep -c "reported speech"` across the six disagreement skills returns non-zero
- [x] `select.md` Gate 0 requires a name-bearing identity artefact, and the pasted evidence includes a surname `grep -ciE` count against the raw `.vtt`
- [x] The new identity check is exercised against its failure path: run it on `B_HDkqZtGOE` for `yudkowsky` and confirm it returns 0 and halts (epistemic gate 7 — a gate not seen to fail is unproven)
- [x] Founder decision recorded on whether the four modes move out of `lean-canvas.md`
- [x] `points-process.md` invariant 2 updated in the same change as `select.md` Gate 0
- [x] Run B's redacted input file written and hashed before run B starts; `grep -c "### Point P"` on it returns 0
- [x] Run A's Stage 3 discards recovered into a companion file, or criterion 2 recorded as unavailable
- [x] Scorer dry-run against run A alone recorded, with its fired-mode count, before run B is generated
- [x] If they moved: `grep -rn` finds zero remaining definitions outside the new home, and every pointer resolves to a section that actually contains what it claims (the P1145 false-pointer failure mode)
- [ ] Run B generated in a session with no access to run A's points
- [ ] A script shuffled the two sets into `X`/`Y` and wrote the mapping to a file left unopened
- [ ] A fresh subagent scored X and Y against the six criteria with the fixed input and bearer
- [ ] The mapping was read only after the verdict was written down, and the verdict recorded
- [ ] Verdict applied per criterion 6 — provisional in every branch; rejecting the model itself deferred to a second topic

## Open Questions

1. Does an arbiter-failure mode fire on a claim held by public strangers, or does the model only
   work where a specific dyad bears the consequence? Criterion 5 is designed to answer this.
2. Is the room (`chiang-mai-ai-safety`) the right bearer of the loss, or is it the arguers?
   Unresolved — the model was written for the person who holds the challenge, and at an event the
   room holds it only by proxy.

## Related

- **P1185** (all-done, 2026-08-28) — wired the same filter into `/understanding:detect`. Tag
  vocabulary and the `NONE`-is-a-finding rule are reused verbatim from it.
- **P1145** (backlog) — the anti-point reconciliation, which already names the disagreement
  pipeline as its fourth consumer and records the false-pointer failure mode this spec must avoid.
- **P1156** — split quote selection out of position-setting for the same ordering reason applied
  here at Stage 3/4.
- **P1171** — `select` Phase 0 contestedness, where the cheap fork-level version of this test
  would sit.
