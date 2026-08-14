---
status: backlog
type: story
rank: 5
workstream: letters
created_date: '2026-06-17'
tags:
  - letters
  - verification
  - calibration
  - async-live
delivery_stage: create-spec
pipeline_ran:
  - create-spec
---

# P949: Async Letter Calibration — author scores the paraphrase + asks follow-ups

> **PLACEHOLDER spec.** Captures the idea and its scope boundary. Do NOT design the build
> yet. Much of the substance is already drafted in P904's "Deferred Ideas" (Async grading
> v0 cut + `verdict`/`question`/`answer` typed items) — lift from there at expansion.
> Gated on **P904 CR** shipping (it produces the explain-back data this scores).

## Problem

**Situation:** P904 v0 deliberately cut async grading. The author can **listen** to a
receiver's explain-back, but cannot score it, cannot reveal a two-sided gap, and cannot ask
a follow-up question. All grading was pushed to /live.

**Complication:** Capture-and-deliver alone produces a corpus and a delivered voice — it does
**not** produce calibration. Real verification (the synchrony-vs-bandwidth crux P904 names)
requires the author to **score the paraphrase** (the sealed two-sided gap) and **probe with
follow-up questions** — the full /live verification protocol, async. Without this, the dyad
still needs /live to actually calibrate.

**Question:** Can letter verification *converge* asynchronously — receiver paraphrases,
author counter-rates (sealed), gap reveals, author probes or certifies — without a meeting?
This is the actual crux P904 set up but did not test.

## Appetite

**Placeholder — not yet sized.** Heavier than the P904 CR (scoring UI, sealed two-sided
reveal, typed question/answer items). Strictly downstream of P904 (data producer). Build only
after early signal that receivers respond at all.

## Solution

*(Sketch, not final — to be designed at expansion. Lift the resolved shape from P904
"Deferred Ideas" and the append-only typed-item thread model.)*

- Author reviews the explain-back and submits a **sealed accuracy rating (0–10)**; receiver's
  self-rating was sealed at submission. **Gap reveals to both only after both ratings exist**
  (the /live sealed-bid ordering, preserved async).
- Author **certifies** OR sends a **correction note** / **follow-up question**; receiver can
  **answer** (typed item bound to the question) — the `verdict` / `question` / `answer` typed
  items from P904's data model, now surfaced in UI.
- After certification, the receiver's position on the linked point(s) is re-captured — the
  before/after delta is the flip detector.

`[FOUNDER DECISION]` Interpretation thresholds: what convergence rate / rounds-to-certify
counts as "async calibration works" (pre-commit, p851-style).
`[FOUNDER DECISION]` Whether badge doctrine changes if async calibration converges (currently
badge requires /live — definitions.md). Separate strategy call, not assumed here.

## Risks / Non-Goals

### Risks
- **Async convergence may not happen — that is the experiment.** `DEFER` Instrument
  rounds-to-convergence + abandonment per thread; pre-commit the reading before the first
  real thread.
- **Seller-as-judge.** `DEFER` The author scoring their own letter's paraphrase is a
  seller-as-judge read; keep felt-vs-recited a diagnostic, pair with the receiver's own report.

### Non-Goals
- Do NOT build the scoring/thread UI now — this is a **placeholder**.
- Do NOT build agent scoring of paraphrases — speaker confirmation stays ground truth; the
  corpus accrues for a later pre-screener, never the judge.
- Do NOT build the **answer letter** here (receiver assembling their own letter) — that is the
  Job-2 (bootstrapping) consumer, its own spec. This spec is the **Job-1 (calibration)**
  consumer only.
- Do NOT link certification to a public "verified" badge without an explicit doctrine decision.

## Done-When

- [ ] **Placeholder** — to be expanded into observable criteria once P904 response data
      justifies the build.

## Related

- **P904** — async letter responses (the data producer: explain-backs + sealed self-ratings).
  This spec adds the author-side scoring + probing that P904 v0 cut. Gated on the P904 CR.
- **Answer letter** (sibling placeholder) — the Job-2 consumer of the same responses.
- **P570** (mini-/live on stories) — the async→sync bridge; if calibration converges async,
  /live becomes the escalation path for stalled threads, not the default.
