---
status: week
type: comment
rank: 1000069
workstream: transcription
created_date: '2026-09-05'
tags: [transcription, process, diarization]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: anomaly
---

# P1251: Decide what happened to the four March transcription artifacts recorded as shipped and never committed

## Problem

**Situation:** [P1237](done/2026-06-10/p1237_batch_pipeline_gemini_vs_six_steps.md) verified by
`git log --all -S` across every branch that four artifacts recorded as done, shipped or
production-ready have **never existed in this repository**:

| Recorded as | Where | In the repo? |
|---|---|---|
| `get_separate_wavs()` | P552, `status: all-done` 2026-03-19 | never existed |
| `llm_merge.py` | P556, closed *"deployed to prod 2026-03-22"* | never existed |
| `energy_validator.py` | decisions.md 2026-03-22, *"complete with adaptive gates"* | never existed |
| cross-correlation alignment in `audio.py` | decisions.md 2026-03-22, *"production-ready"* | never existed |

**Complication:** This is not bookkeeping. The 2026-03-22 decision reads *"align recordings via
cross-correlation, Whisper each phone separately, LLM merge… **No amix. No pyannote for
multi-phone.**"* The shipped pipeline does amix, then pyannote, for multi-phone — it is the option
that entry explicitly rejected. And the LLM-merge path is the **only** approach ever measured to
attribute the minority speaker: 8 of 10 on R8FUEQ, against 0 of 10 for everything P1237 could
actually run. So the missing code is not incidental; it is the only thing that ever worked.

**Question:** For each of the four, is the right disposition rebuild, abandon, or supersede — and
is there a copy anywhere outside this repository, or is the measured 8-of-10 result the only
surviving trace of it?

## Appetite

**Blast radius:** low today and high later. Nothing consumes the batch pipeline right now (see
Risks), so no user is affected this week; but every future transcription decision is being made
against a baseline nobody chose. **Reversibility:** total — this spec writes a verdict, no code.
**Decision density:** one founder call per artifact, at most; the recommendation should come from
the evidence.

## Approach

1. **Search outside the repo before concluding it is gone.** A deployed Cloud Run revision, a
   container image, a local worktree, `~/Downloads`, or the conversation history stores. The
   pipeline ran in prod in March and produced the R8FUEQ benchmark, so the code executed
   somewhere. Absence from git is established; absence everywhere is not.
2. **For each artifact, write one verdict** — rebuild / abandon / supersede — with the reason and
   what it would cost.
3. **Reconcile the record.** P552 and P556 both sit in `features/done/` asserting outcomes their
   code never delivered. Whatever is decided, the specs should stop claiming otherwise.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Rebuilding LLM merge on the strength of one 8-of-10 benchmark over-reads n=1 | MITIGATE | The 8/10 is a reason to *look*, not to adopt; any rebuild is re-benchmarked per-speaker against the same ground truth before it counts |
| The batch pipeline is currently producing nothing, so all of this is moot | ACCEPT and STATE | Every transcription job since 2026-08-29 failed with *"No files found"* because `RECORD_AUDIO_WHILE_LIVE = false` disables recording ([P1236](p1236_server_side_live_transcription_for_rooms.md)). The last transcript on prod is 2026-07-05. This work only pays off once recording resumes |
| The code exists in a prod container and gets rebuilt from scratch anyway | MITIGATE | Step 1 searches before step 2 decides |
| Recording the March record as unreliable reads as blame | ACCEPT | The pattern is mechanical and has six instances across two distinct causes; naming the mechanism is what prevents the seventh |

**Non-Goals**
- Do NOT rebuild anything in this spec. It produces verdicts.
- Do NOT re-run P1237's measurement; its numbers stand.
- Do NOT re-enable Vertex AI.

## Done-When

- [ ] Each of the four artifacts has a written verdict — rebuild / abandon / supersede — with its
      reason recorded here
- [ ] A search outside git is run and its result recorded, so "gone" is a finding rather than an
      assumption
- [ ] P552 and P556 no longer assert outcomes their code did not deliver
- [ ] If any verdict is `rebuild`, it names the per-speaker benchmark that would have to pass, and
      is filed as its own spec rather than done here

## Related

- [P1237](done/2026-06-10/p1237_batch_pipeline_gemini_vs_six_steps.md) — established the absences.
- [P1250](p1250_colocated_autoclose_closes_specs_nobody_did.md) — the same
  closure-without-outcome shape from a mechanical cause.
- [P1236](p1236_server_side_live_transcription_for_rooms.md) — owns why nothing is being recorded.
