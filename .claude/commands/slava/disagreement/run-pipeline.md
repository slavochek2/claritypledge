---
name: run-pipeline
description: "One-command conductor for the Disagreement Pipeline. Takes a topic (optionally with a seed person or video URL) and a room, and runs /slava:disagreement:select → prepare → positions → story-draft → publish in order, carrying the run file across every stage. A topic that select's Phase 0 finds to be a CONSENSUS stops the whole pipeline there, reported, with nothing searched. Does NOT reimplement any stage — it invokes each one as-is and stops at each stage's own founder gate. Publishes to TEST by default; the PROD run is a separate, deliberate invocation."
when_to_use: "You have a topic (or a link) and want the whole disagreement filed without remembering five command names and their order. Use the individual stage skills instead when resuming a half-finished run, re-running one stage, or debugging a single stage's output."
version: 1.0.1
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
> remembering, not the approvals.** Target for this run: TEST."

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

Gather all of these **before** Stage 1, in one message. Then go quiet until `select`'s Gate 1.

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
resolved from the RAW `.vtt`, an inference-strength label per position, and — on a `turn-verified`
source — a per-quote speaker confirmation naming which evidence landed (Step 4b), plus a printed
`DROPPED (unconfirmed speaker)` line for every quote that could not be confirmed.

**Stop conditions:** any quote that fails `grep -F` · a `turn-inferred` attribution on a multi-speaker
source · a `turn-verified` label with no per-quote confirmation artifact behind it · a
`subject_key: UNKNOWN`.

---

## Stage 4 — Story draft  (`/slava:disagreement:story-draft`)

Invoke against `<slug>`.

**Produces:** the `## Story Drafts` section — one story per arguer, quotes only, no imputed
interiority.

**Stop conditions:** a body over 10,000 characters · a duplicate `(author_id, point_id)`.

---

## Stage 5 — Publish  (`/slava:disagreement:publish`)

Invoke against `<slug>` with the target environment named **out loud**.

It runs its own precondition table (seal present, client deployed, agent accounts resolve to distinct
profiles, avatars branch on deliberate-vs-accidental absence, filing identity is a human account),
prints the exact payload as a **dry run**, and writes only after an explicit founder affirmative.

**Missing agent account:** `publish` may invoke `/slava:content:provision-agent` inline, one gated
confirmation each. **This orchestrator does not pre-provision anything** — account creation stays
where it is.

**Returns:** the tag feed URL. Print it, and stop.

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
