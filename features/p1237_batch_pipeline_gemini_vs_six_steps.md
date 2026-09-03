---
status: backlog
type: comment
rank: 255
workstream: transcription
created_date: '2026-09-03'
tags: [transcription, gemini, diarization, cost]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: heuristic
---

# P1237: The batch pipeline still mixes phones and diarizes — decide between separate-channel and Gemini

## Problem

**Situation:** `services/transcribe/pipeline.py` runs six steps per session: Whisper → pyannote
diarization → speaker embeddings → merge → speaker mapping → store. Four of those six exist only to
recover *who said what*.

**Complication:** [P552](done/23_mar_26/p552_separate_channel_transcription.md) specified removing
exactly that, in March 2026 — *"Speaker identity = recorder identity — each phone IS one speaker, no
diarization needed"* — and is marked `status: all-done, completed_at: 2026-03-19`. **Its mechanism is
not in the code.** Verified 2026-09-03:

- `audio.py:198` — multi-recorder sessions still go through `_merge_wavs()`, destroying per-phone
  separation. `get_separate_wavs()`, the function P552 specifies, does not exist.
- `pipeline.py:106` — `diarize()` is called unconditionally on the merged WAV. There is no
  multi-phone branch anywhere in the pipeline.
- `pipeline.py:223` — `num_recorders` IS read, but only to *hint pyannote a speaker count*. That is
  the inverse of P552's design: recorder identity feeds the diarizer instead of replacing it.

Meanwhile the founder independently re-derived P552's insight from first principles this session:

> *"isnt right now what hwe have a diarizaiton that runs on gpus? shold we not use gemini transcribe
> or whieper instead on gpus when it comes only to transcribion of one perosn - assuming they all
> have thier own micorophnes?"*

And a third option now exists that did not in March: Gemini 3.5 Transcribe (`/slava:util:diarize`),
at ≈$0.005/min, which could collapse all six steps into one call.

**Question:** For batch session transcription, do we implement P552's separate-channel path, replace
the pipeline with Gemini, or both — and what evidence decides it?

## Appetite

**Blast radius:** Medium — batch transcription only; no live path, no user-facing surface.
**Reversibility:** High — the current pipeline stays until a replacement is proven on the same audio.
**Decision density:** Zero founder decisions. This spec exists to produce a recommendation from
measurement, not to choose by preference.

## Approach

Run all three paths over the **same** archived multi-phone sessions and compare on the criteria
below. This is a measurement spec; the deliverable is a decision, not a deployment.

1. **Baseline** — the current six steps, as they run today.
2. **Separate-channel (P552 as specified)** — transcribe each recorder's WAV independently, speaker
   = recorder, no diarization.
3. **Gemini 3.5 Transcribe** — one call per session, diarization on.

## Research Questions

1. Does separate-channel attribution beat the current merged+diarized pipeline, measured
   **per-speaker**, not overall? ([decisions.md](../docs/decisions.md) 2026-03-22 established that
   overall accuracy inflates on skewed conversations — 74% of one session was one speaker.)
2. How much cross-talk does a co-located phone actually capture? P569's energy scan found every
   phone hears every voice; P552 assumes the owner dominates their own channel. Both can be true —
   the question is whether the dominance is large enough for per-channel transcription to be clean.
3. Does Gemini's diarization beat pyannote on the same audio, per-speaker?
4. What does each path cost per session-hour, and is that cost credit-covered today?
5. Does the 30-minute Gemini diarization cap apply when diarization is OFF?

## Decision Criteria

Pre-registered — written before any run.

1. **Which path?** → Pick separate-channel if its **per-speaker** accuracy is at least as good as the
   current pipeline on the same sessions, since it also deletes four steps and a GPU dependency. If
   separate-channel loses on per-speaker accuracy, pick Gemini if *it* beats the current pipeline
   per-speaker at a credit-covered cost. If neither beats the baseline, keep the baseline and record
   that P552's premise was wrong — an acceptable outcome for this spec.
2. **Is the cross-talk objection real?** → Real if the owner's voice is under 10dB above the loudest
   other voice in their own channel, on a majority of measured sessions. Below that, per-channel
   transcription is unsafe on its own and needs a gating step.
3. **Is Gemini's cost acceptable?** → Only if credit coverage on
   `generativelanguage.googleapis.com` is verified current at ≥95%, and a hard spend cap is in place
   on that service before any batch run.

## Time Box

Measurement over archived sessions only. Stop and report when questions 1-4 have numbers, even if
the recommendation is "keep what we have."

## Deliverable

A recommendation recorded in this spec, with the per-speaker numbers behind it, plus a verdict on
whether P552 should be reopened, superseded, or closed as refuted.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| P552's `all-done` status hides that nothing shipped, and this spec repeats it | MITIGATE | Deliverable is a recorded number, not a status change; a path is only adopted after it beats the baseline on the same audio |
| Overall-accuracy framing hides a per-speaker regression | MITIGATE | Criterion 1 is per-speaker by construction — the 2026-03-22 ruling |
| Archived sessions are unrepresentative of current recording conditions | ACCEPT | They are the only labelled audio that exists; note the caveat with the result |
| Gemini mis-renders proper nouns | ACCEPT | Documented in `/slava:util:diarize`. Names are never evidence of who spoke; attribution comes from channel or diarization label |

**Non-Goals**
- Do NOT change the live path — that is [P1236](p1236_server_side_live_transcription_for_rooms.md).
- Do NOT deploy any replacement in this spec. It produces a decision; adoption is separate work.
- Do NOT re-enable Vertex AI.
- Do NOT re-litigate P556/P568/P569's energy approach — it is superseded by both candidates here.

## Done-When

- [ ] All three paths run over the same archived multi-phone sessions, per-speaker accuracy recorded
- [ ] Cross-talk dominance measured in dB per channel, answering research question 2 with a number
- [ ] Cost per session-hour recorded per path, with current credit coverage verified against billing
- [ ] A recommendation written here against the pre-registered criteria above
- [ ] P552 explicitly reopened, superseded, or closed as refuted — not left `all-done` with unshipped code

## Related

- [P552](done/23_mar_26/p552_separate_channel_transcription.md) — specified this in March, closed
  `all-done`, mechanism absent from the code (verified above).
- [P558](p558_gemini_transcript_speaker_correction.md) — parked; calls itself *"the seed of the
  transcription redesign."* This spec is that redesign; P558 should be superseded by whatever this
  concludes.
- [P1236](p1236_server_side_live_transcription_for_rooms.md) — the live half. If P1236 resolves to
  acoustically-separate streams, this spec's scope narrows to single-mic `/live` sessions only.
- [P858](done/2026-04-22/p858_event_driven_transcription.md) — the pipeline this would replace.
