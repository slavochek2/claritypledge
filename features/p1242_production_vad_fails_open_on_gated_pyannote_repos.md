---
status: week
type: bug
rank: 1000070
severity: high
workstream: transcription
date_reported: '2026-09-03'
created_date: '2026-09-03'
drafted_by: opus
exec_model: opus
exec_effort: medium
tags: [transcription, pyannote, vad, hallucination]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1242: VAD fails open in the shipped configuration — `hf-token` is 403 on the two gated repos `vad.py` needs

## Summary

`vad.py` loads `pyannote/voice-activity-detection`, which the deployed `hf-token` secret cannot
download, so `Pipeline.from_pretrained` returns `None`, `.to()` raises, and `_apply_vad` falls back
to un-stripped audio — so whenever the pipeline runs, Whisper runs without the silence gate P546
added to stop it hallucinating.

**Strength of claim (tightened 2026-09-04 after review):** what is established is that the *shipped
configuration* fails open, reproduced on the exact production image, secret, service account and
env. What is NOT established is that any particular stored transcript was produced this way — no
session has been transcribed inside the retained log window, so there is no production warning line,
and the running revision's cached model state was never inspected. Phrase it as "fails open under
the reproduced configuration", not "has been broken in production for N months".

## Root Cause

Confirmed 2026-09-03 while running P1236's Step-1 measurement on the **exact production image, the
same `hf-token` secret, the same service account, and the same `MOCK_DIARIZATION=false`**, on a
Cloud Run L4.

The chain:

1. `services/transcribe/vad.py:92` calls
   `Pipeline.from_pretrained("pyannote/voice-activity-detection", use_auth_token=HF_TOKEN)`.
   That pipeline's weights live in `pyannote/segmentation`.
2. Both repos are **gated, and this token has not accepted their conditions**. Checked directly
   against the HF API with the deployed secret — the token itself is valid (`whoami-v2` → 200):

   | repo | file fetch |
   |---|---|
   | `pyannote/voice-activity-detection` | **403** |
   | `pyannote/segmentation` | **403** |
   | `pyannote/segmentation-3.0` | 200 |
   | `pyannote/speaker-diarization-3.1` | 200 |
   | `pyannote/embedding` | 200 |
   | `pyannote/wespeaker-voxceleb-resnet34-LM` | 200 |

3. On a 403 `from_pretrained` returns `None` rather than raising, so `vad.py:98`'s
   `pipeline.to(torch.device("cuda"))` raises `AttributeError: 'NoneType' object has no attribute 'to'`.
4. `pipeline.py:262` catches every exception, logs
   `VAD failed (non-fatal, using original audio)` at WARNING, and returns the original path.

This is exactly why **diarization works while VAD does not** — everything `diarizer.py` loads is on
the 200 list, and only the two repos VAD needs are 403.

**The fail-open itself is by design, and the design is on the record.** [decisions.md](../docs/decisions.md)
2026-04-25 (P815) states the normalization fallback *"mirrors the VAD fallback pattern: try/except
logs a warning and continues with un-normalized audio rather than hard-failing the job."* So the
defect is not that a fallback exists — it is that the fallback has been **permanently engaged with
nothing surfacing it**.

**What is NOT established:** how long this has been true, and whether any specific stored transcript
was affected. No session has been transcribed inside the retained log window, so there is no
production log line showing the warning — the evidence is the identical image reproducing it on
demand plus the direct 403, not a prod trace. Do not write a start date into the fix without
checking stored transcripts.

## Invariants

- **VAD failure must remain non-fatal to the job** — a transcript with hallucinations beats no
  transcript. Ruled 2026-04-25 (P815); this bug does not reopen it.
- **A preprocessing step that has silently stopped running must be observable without reading
  logs by hand.** The fallback may fire; it may not fire unnoticed forever.
- Whatever replaces the model choice must load with a token this project can actually hold — an
  ungated repo, or one whose conditions are accepted on the account that owns `hf-token`.

## Reproduction Steps

1. Build any image from `services/transcribe/` (or reuse the deployed
   `gcr.io/…/transcribe-session:p858-cutover-3`).
2. Deploy it to Cloud Run with a GPU and `HF_TOKEN` bound to the `hf-token` secret,
   `MOCK_DIARIZATION=false`.
3. Call `strip_silence()` on any 16 kHz mono WAV.
4. Observe: `AttributeError: 'NoneType' object has no attribute 'to'` at `vad.py:98`.

Faster check, no deploy — with the deployed token in `$T`:

```bash
curl -sIL -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $T" \
  https://huggingface.co/pyannote/segmentation/resolve/main/pytorch_model.bin   # → 403
```

**Reproduction rate:** 100%

## Expected Behavior

`_apply_vad` returns a WAV with non-speech regions stripped, so Whisper only sees speech. When VAD
genuinely cannot run, the job still completes on un-stripped audio (per P815) **and the degradation
is visible** — not a WARNING line nobody reads.

## Actual Behavior

`_apply_vad` catches the `AttributeError` on every call and returns the original audio. Whisper then
transcribes silence, which is the failure P546 was written for — its own docstring says *"P546:
Added to fix hallucinations ("Thank you" x53)"*.

Measured on the same L4 during P1236, un-gated vs VAD-gated over identical audio: 4-second chunks
produced **205 words without VAD vs 139 with it** (whole-file batch ≈ 134 on the same input), the
excess being `"Thank you."` over silence, stray non-Latin tokens, and one wholly fabricated
sentence. The effect is largest on short inputs but is not confined to them.

## Affected Files

- `services/transcribe/vad.py:92-98` — loads the two 403 repos; `.to()` on a `None` pipeline
- `services/transcribe/pipeline.py:255-265` (`_apply_vad`) — catches everything, returns original
- `services/transcribe/pipeline.py:88-96` — the call site, between normalization and Whisper
- Secret `hf-token` (Secret Manager) — the account behind it has not accepted the two repos' terms

## Severity

**High** — every batch transcript produced while this has been true carries hallucinated content
from silence, and transcripts are the product's output, not an internal artifact. Not critical: jobs
complete, nothing is lost, and normalization (P815) still mitigates the quiet-audio half.

## Fix Approach

Two independent halves; the first is the actual fix, the second stops a silent recurrence.

1. **Make VAD loadable.** Either accept the user conditions for `pyannote/voice-activity-detection`
   and `pyannote/segmentation` on the HF account that owns `hf-token` (a human click-through on
   huggingface.co — no code change), **or** re-point `vad.py` at
   `pyannote.audio.pipelines.VoiceActivityDetection(segmentation="pyannote/segmentation-3.0")`,
   which this token already downloads. The second was exercised end-to-end during P1236's
   measurement (`services/transcribe/measurement/measure_chunks.py::_get_vad`) and gated 28% of 4s
   chunks as silence, so it is known to work on this stack — but it changes the model, so compare
   its output against a batch run before adopting it.
2. **Surface a permanently-engaged fallback.** `_apply_vad` swallowing the error is correct per
   P815; swallowing it invisibly for an unknown number of months is not. A counter on the job row,
   a Sentry breadcrumb, or a startup-time model-load probe would all have caught this. Prefer the
   startup probe: it fires once per revision instead of once per job, and it fails at deploy time
   rather than mid-transcript.

**Rejected — do not re-derive:** making VAD failure fatal to the job. [decisions.md](../docs/decisions.md)
2026-04-25 explicitly chose the non-fatal pattern for this exact step. If new evidence overrides
that, say what it is; otherwise keep the fallback and fix the visibility.

## Acceptance Criteria

- [ ] `strip_silence()` returns a stripped WAV on the deployed image + secret — no `AttributeError`
- [ ] A transcription job's logs show VAD ran, naming the model it loaded
- [ ] Re-running an archived session end-to-end produces a transcript with no `"Thank you."`
      repetitions over silent stretches, compared against the pre-fix transcript for the same session
- [ ] The blast radius is established rather than assumed: stored transcripts are checked for the
      hallucination signature, and the spec records how many were affected (or that none were)
- [ ] A deliberately broken model reference fails visibly at deploy or startup, not silently per job
      (exercise the failure path and paste the non-zero exit / alert — epistemic gate 7)
- [ ] The job still completes on un-stripped audio when VAD genuinely cannot load (P815 invariant
      holds — verify by running with the model reference removed)
- [ ] No console or job errors introduced in the normal transcription flow
