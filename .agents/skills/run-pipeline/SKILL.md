---
name: run-pipeline
description: "One-command conductor for the Disagreement Pipeline. Takes a topic (optionally with a seed person or video URL) and a room, and runs /slava:disagreement:select → prepare → positions → story-draft → publish in order, carrying the run file across every stage. A topic that select's Phase 0 finds to be a CONSENSUS stops the whole pipeline there, reported, with nothing searched. Does NOT reimplement any stage — it invokes each one as-is and stops at each stage's own founder gate. Publishes to TEST by default; the PROD run is a separate, deliberate invocation."
when_to_use: "You have a topic (or a link) and want the whole disagreement filed without remembering five command names and their order. Use the individual stage skills instead when resuming a half-finished run, re-running one stage, or debugging a single stage's output."
version: 1.1.0
---

# /slava:disagreement:run-pipeline

The end-to-end conductor for the Disagreement Pipeline. It does not contain pipeline logic — it
**runs the existing skills in order** and carries the run file between them. Each stage's own file is
the source of truth for that stage; this skill only sequences them and enforces where the founder is
asked.

**Canonical pipeline:** [docs/points-process.md](../../../../docs/points-process.md). Read it if any
stage's I/O, the run-file schema, or a seal is unclear. **This orchestrator restates none of it** —
schema, sealed-block rules and gate definitions live there and only there.

**Reuse, don't reimplement.** Every stage below is invoked as its own skill. If a stage changes its
interface, fix it in that stage's file and update the one line here — never fork its logic into this
file.

> **Why this exists.** Deferred by [p1156](../../../../features/done/2026-06-10/p1156_points_pipeline_selector_and_chain_contract.md)
> decision (2d) — *"a conductor over four skills that are being split this week is a conductor built on
> moving parts."* That condition ended when the namespace rename shipped
> ([P1165](../../../../features/done/2026-06-10/p1165_disagreement_pipeline_namespace_rename.md),
> 2026-08-27) and the five stage names stopped moving. **Built 2026-08-27 on founder decision**, ahead
> of the "one topic end-to-end" trigger, because the cost being paid was the founder holding five
> names and an order in memory — verbatim: *"I don't want to remember."*

---

## Announce at start

> "Running /slava:disagreement:run-pipeline — the five-stage conductor. Stages: select → prepare → positions →
> story-draft → publish. **Every stage's own gates still halt for you; this skill removes the
> remembering, not the approvals.** Target for this run: TEST. Standing rules loaded: select.md
> *Standing rules* 1-10 and `scripts/points/standing-rules.json`."

**Load the standing rules before Stage 1** (P1355 R2): read the *Standing rules* section at the top of
`select.md` and the values in `scripts/points/standing-rules.json`. This file points at both and
copies neither — a copy is how the founder ended up repeating himself on Clarity Night #2.

---

## The gates are NOT collapsed — and that is deliberate

`/video-publish` collapses its pipeline into two gates because its founder instruction was *"I don't
want to review anything manually."* **This pipeline is the opposite case and must not copy that
pattern.** It publishes verbatim quotes from named real people under machine accounts holding
positions those people never took. Every existing gate stays exactly where it is:

| Stage | Gates that still halt |
|---|---|
| `select` | **Phase 0** (contestedness — a `CONSENSUS` verdict STOPS the run here, before any search) · **Gate 1** (the spectrum + people + portrait status) · **Gate 0** (one voice, or one voice plus a verified questioner) · **Gate 2** (the video set, N ∈ 2..6) |
| `prepare` | its own stage confirmations; the sealed prediction is written, never shown to a later pass |
| `positions` | quote verification is evidence-producing, not a gate — but a failed `grep -F` **stops the run** |
| `story-draft` | length and uniqueness asserts stop the run |
| `publish` | **dry-run by default**, then an explicit founder affirmative before any write |

**This skill adds no gate of its own and removes none.** Its only authority is ordering.

---

## Inputs

| Input | Notes |
|---|---|
| **Topic** | Required. One topic per invocation — never batch. Passed straight to `select`. |
| **The room** | Required. Who the points will be shown to. **Resolve from the audience registry at `.private/audiences.json`** — pass the entry's `room` string to `select` verbatim. A `"scope": "wide"` entry is never narrowed for one run; apply its per-run overlay (`overlay_of`) instead. |
| **Seed** *(optional)* | A person, a video URL, or both. Passed to `select` unchanged — see its *Optional seed* section. The seeded side is accepted; only the counterpart is proposed. |
| **Target** | `test` (default) or `prod`. **Never both in one invocation** — see the hard rule below. |
| **Event intention** *(when the run feeds an event)* | Who the evening is for, what it tests, its frame. Passed to `select` (see its *Inputs*). |
| **Event folder** *(when the run feeds an event)* | `.private/events/<city>-<topic>-<YYYY-MM-DD>/` — page text, handoff, prep notes, results and `improvements.md` live here, with a README linking the run file and the campaign folder. The run file itself stays at `.private/points-runs/<slug>.md`. Existing events are not migrated. |

<!-- input-block:start -->
**The story fan-out approval is asked HERE, in this block (P1210 §9), and it runs only AFTER select's
Gate 2 has approved the videos** — say so plainly when asking: the stories are written from the approved
sources, so nothing is spawned while the cast can still change (founder, Clarity Night #2: *"Wait, what?
So we have one video…"*). Stage 4 spawns one **Gemini 3.8** writer and one **Sonnet** checker per
arguer plus five Sonnet control checkers — thirteen subagents on a four-arguer run, of which the four
writers run **off** the Claude subscription (P1358 R3) — and the standing rule is that three or more
need an explicit ok with a rough token estimate first. **The halt
stays; the 3+-subagent rule is not this pipeline's to delete.** What changes is that it stops being a
mid-stage interruption whose answer sits twenty lines below it in another file. Print the fan-out plan
and the token estimate with the inputs above, and take the answer once. **The estimate prints Sonnet
and Opus separately and names the roles that run off the subscription** — a blended total hides the
only figure being decided about, which is the quota. `story-draft.md` holds the template and the
model-per-role table; this block restates neither.
<!-- input-block:end -->

Gather all of these **before** Stage 1, in one message. Then go quiet until `select`'s Gate 1.

---

## Self-check before Stage 1 — the pipeline's own rules are CODE, not recitation (P1210 §12)

**Run these three and read the exit codes.** A check whose execution depends on a reader choosing to
perform it is the mechanism that produced run B; the checks that would have caught it existed as
prose, in files that ran too late or not at all.

```sh
node scripts/points/rule-present.mjs            # every ordering / placement rule still stated at its named location
node scripts/points/store-inspection-scan.mjs   # zero directory inspections; ask the owning tool instead
node scripts/points/input-block-scan.mjs        # founder inputs live in their blocks, not mid-stage
```

A non-zero exit is a STOP: a stage file has lost a rule this pipeline depends on. **These verify that
the RULES ARE STATED, never that an agent obeyed them** — the pipeline is markdown with zero
executables, and no test can observe a reader.

---

## Hard rule — TEST and PROD are two invocations, never one

**This skill never chains a prod run onto a test run**, regardless of how clean the test run was.
Filing to test and filing to production are two separate deliberate acts
([p1161](../../../../features/done/p1161_first_physical_event_chiang_mai.md) invariant: *"Filing to test
and filing to production are two separate deliberate invocations. Never one."*).

After a `test` run completes, **stop** and print the tag feed URL for review. The prod run is the
founder re-invoking this skill with `target: prod` — which **resumes from Stage 5 against the existing
run file**, it does not re-select or re-extract anything.

---

## Stage 1 — Select  (`/slava:disagreement:select`)

Invoke with the topic, the room, and the seed if one was given.

**Produces:** the run file at `.private/points-runs/<slug>.md` with header, topic, room, approved
people and sources, and the Gate 1/Gate 2 approvals block, sealed to
`.points-run-seals/<slug>.approvals.sha256`.

**Carry forward:** the `<slug>`. Every later stage is addressed by it.

**Optional, after Gate 2 — a TEST draft of the event page** (P1355 R4). When the run feeds a Clarity
Night, `/slava:disagreement:clarity-night-publish` may run in its **draft mode** on TEST as soon as
Gate 2 approves the cast, so the founder reviews the real page while stages 2-5 run — **quotes only
with a confirmation record** (that skill's rule 4, P1358 R1c). PROD stays a separate invocation of
that skill, after publish.

**Stop conditions:** Gate 1 or Gate 2 refused · Gate 0 fails (multi-speaker) · `yt` exit code 7 (quota
exhausted — surface it, never retry, never purchase) · a truncated fetch (funnel INCOMPLETE).

**Portrait status is not a stop.** `portrait: none` is a valid outcome and flows to the initials-only
provisioning branch. Only `UNKNOWN LICENCE` halts. (Founder decision 2026-08-26.)

---

## Stage 2 — Prepare  (`/slava:disagreement:prepare`)

Invoke against `<slug>`. It re-verifies the approvals seal before acting — **a mismatch is a STOP, and
this skill never re-seals to clear one.**

**Produces:** the `## Points & Predictions` section, and seals the named `### Prediction Block` to
`.points-run-seals/<slug>.sha256`.

**Do not read the prediction block aloud, summarise it, or carry any part of it into later stages.**
The prediction pass is deliberately blind to agent positions, and this orchestrator is the one place
that could accidentally leak them across that boundary. Pass the slug, nothing else.

---

## Stage 3 — Positions  (`/slava:disagreement:positions`)

Invoke against `<slug>`. Quotes first, then positions.

**Produces:** the `## Quotes & Positions` section, with `grep -F` exit codes pasted, timecodes
resolved from the RAW `.vtt`, an inference-strength label per position, and — on **any multi-speaker
source**, diarized included (P1358 R1a) — a per-quote speaker confirmation naming which evidence
landed (**Steps 4b + 4c**, with the window and its label-to-person mapping), plus a printed
`DROPPED (unconfirmed speaker)` line for every quote that could not be confirmed.

**Then, per approved video: P1357 `draft` + `check` of its video summary, one row per video** (P1358 R2).

**Stop conditions:** any quote that fails `grep -F` · a `turn-inferred` attribution on a multi-speaker
source · **any multi-speaker basis (`turn-verified` **or** `speaker-labelled`) with no per-quote
4b + 4c confirmation artifact behind it** · a `subject_key: UNKNOWN`.

*(Widened 2026-09-28, P1358 R1a: this named only `turn-verified`, two lines under the sentence R1a
had widened — so a `speaker-labelled` quote with no artifact had a Produces line asking for one and
no stop condition to halt on, which is the enforcement half missing for exactly the basis R1a was
written about.)*

---

## Stage 4 — Story draft  (`/slava:disagreement:story-draft`)

Invoke against `<slug>`.

**Produces:** the `## Story Drafts` section — one story per (person, point) (P1210 §7), quotes only, no imputed
interiority.

**Stop conditions:** a body over 10,000 characters · a duplicate `(author_id, point_id)`.

---

## Stage 5 — Publish  (`/slava:disagreement:publish`)

Invoke against `<slug>` with the target environment named **out loud**.

It runs its own precondition table (seal present, client deployed, agent accounts resolve to distinct
profiles, avatars branch on deliberate-vs-accidental absence, filing identity is a human account),
prints the exact payload as a **dry run**, and writes only after an explicit founder affirmative.

**The dry run lists each approved video's summary status, and `confirm` is per video id** (P1358 R2).

**Missing agent account:** `publish` may invoke `/slava:content:provision-agent` inline, one gated
confirmation each. **This orchestrator does not pre-provision anything** — account creation stays
where it is.

**Returns:** the tag feed URL. Print it, and stop.

**Next, after a PROD run:** `/slava:disagreement:clarity-night-publish` builds and publishes the event page
for the tag. Name it in the hand-off; never chain into it (it has its own PROD gate).

---

## Delegate the BULK READS; keep the judgement; verify the load-bearing claims by command

**Measured 2026-09-04:** one `select` stage alone consumed most of a context window and forced a
compaction mid-run, because the orchestrator pulled metadata one video at a time and read whole
transcripts inline. That is the wrong work for the conductor to hold, and the founder named the cost:
*"this takes also time which is a problem in the process as well."*

**Delegate — mechanical, high-volume, and re-runnable by one command:**

- the candidate metadata sweep (ids in → `upload_date | view_count | comment_count` table out)
- per-source claim-match and position-match counts over a named word list
- Step 2b parity measurement and Step 2c label→person mapping evidence
- transcript reads whose product is a table, a count, or a quote list with timecodes

**Never delegate:** Phase 0's contradiction sentences · which arguer occupies which position · the
Phase 3 judge (it is *already* an isolated agent and its independence is the point) · anything
presented at a founder gate. **Delegated screening proposes; the stance and minutes shown at a gate
are re-derived** (P1355 R6): the Phase 1b pre-screen may pick candidates and propose ranges and
quotes, but minutes come from `on-topic-minutes.mjs`, every quote is `grep -F`-verified with a planted
fake as the control, and the stance is written by the orchestrator from the quoted passages.

**The pairing is not optional.** [epistemic.md](../../../../.claude/rules/epistemic.md) gate 9 binds
the consumer: a subagent's claim is not evidence until a command confirms it, and the command must
test the CLAIM. These delegations are safe **because each returns something one command re-derives** —
re-run the sweep, re-run the grep, re-count. A delegation whose output cannot be re-derived that way
is not on this list and does not belong in a subagent. Follow CLAUDE.md's standing rule: **default
ONE**, name the independent failure domain before spawning a second, and print
`<reports received> of <spawned>`.

**Announce it.** Say which work went out and that its load-bearing claims were re-run — a silent
delegation is indistinguishable from the orchestrator having done the work itself.

---

## Every founder clarification is written down (P1355 R5)

When the founder corrects, clarifies or decides something during a run that the pipeline should have
known, append one line to `improvements.md` in the event folder: the date, the stage, the founder's
words verbatim, and which rule or file should have carried it. Clarity Night #2 produced 34 such
items, reconstructed afterwards from two halves of a transcript; the file makes the next reflection a
read, not an archaeology.

---

## What this skill does NOT do

- **Does not skip, merge, or auto-answer any stage gate.** If a stage halts, this skill halts.
- **Does not re-seal, re-hash, or repair a seal mismatch.** That is a STOP by design.
- **Does not chain test → prod.** Two invocations, always.
- **Does not create agent accounts**, and does not reach for a prod credential of its own — each stage
  holds the credential its own file names.
- **Does not restate the run-file schema, the gate definitions, or any stage's logic.** Those live in
  `docs/points-process.md` and the five stage files.
- **Does not source the topic.** Topic selection is its own upstream work — it takes a topic, it does
  not choose one.

## Why the name is `run-pipeline`, not `run`

The skill projection is **flat and name-keyed**: the leaf name must be unique across every namespace,
not just within `disagreement/`. `/slava:events:run` already holds `run`, and the sync gate hard-fails
on the collision rather than silently picking one — the same trap that made the story stage
`story-draft` rather than `story` in [P1165](../../../../features/done/2026-06-10/p1165_disagreement_pipeline_namespace_rename.md).
Do not rename this back to `run` without moving the events skill first.

## Related

- [docs/points-process.md](../../../../docs/points-process.md) — the canonical pipeline contract
- `/slava:disagreement:select` · `prepare` · `positions` · `story-draft` · `publish` — the five stages
- `/slava:content:provision-agent` — the only skill that creates an agent account
