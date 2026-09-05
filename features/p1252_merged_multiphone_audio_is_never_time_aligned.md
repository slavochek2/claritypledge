---
status: backlog
type: bug
rank: 240
workstream: transcription
created_date: '2026-09-05'
tags: [transcription, audio, diarization]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: anomaly
---

# P1252: Multi-phone audio is mixed from t=0, so every merged session is time-misaligned

## Problem

**Situation:** `services/transcribe/audio.py::_merge_wavs()` mixes each recorder's WAV with ffmpeg
`amix` **from t=0, applying no offset at all**. The phones do not start together.

**Complication:** [P1237](done/2026-06-10/p1237_batch_pipeline_gemini_vs_six_steps.md) measured the
offsets across the archived corpus: **median 2.2 s, maximum 51.7 s**. At the median the two voices
are already displaced past a diarizer's tolerance; at the maximum, most of a minute of one person's
audio is laid over the wrong minute of the other's. Everything downstream — Whisper, pyannote,
speaker mapping — runs on that.

This was diagnosed in March and never fixed. [decisions.md](../docs/decisions.md) 2026-03-22 lists
rejected alternative (D) as *"Pyannote on unaligned amix — the '50/50' result was an artifact of
misalignment"*, and the same entry's Consequences say *"Cross-correlation alignment in `audio.py`
is production-ready (keep regardless of approach)"*. `git log --all -S` over that file returns
**zero commits** containing `align` or `correlat`.

**Question:** How should the recorders be aligned before mixing, given that the obvious
signal — each recorder's own `sessionStartedAt` — is unreliable in a way P1237 measured?

## Appetite

**Blast radius:** medium, and currently latent. **Reversibility:** high — one function, and the
current behaviour is a special case (offset 0) of the fixed one. **Decision density:** zero founder
decisions; this is a correctness fix with a measurable oracle.

**This is not urgent, and the spec should say why.** Every transcription job since 2026-08-29 has
failed with *"No files found"* — `RECORD_AUDIO_WHILE_LIVE = false` in
`transcribe-room-page.tsx:54` disables recording as P1236's mitigation, so no audio reaches GCS.
The most recent transcript on prod is **2026-07-05**. Fixing alignment improves a pipeline that
currently produces nothing. It becomes urgent the moment [P1236](p1236_server_side_live_transcription_for_rooms.md)
restores recording, and it should land **before** that, not after.

## Approach

Align each recorder to a common timeline before `amix`, then mix with the offsets applied.

The offset source is the interesting part, and P1237 already measured both candidates:

- **`sessionStartedAt` from each recorder's events JSON** is independent of the audio, which is
  what makes it valuable — but it is the *session's* start on that device, not the *recording's*.
  A late join or a rejoin puts it hundreds of seconds off the true offset: **5 of 44 sessions**.
  It is a prior to be validated, never ground truth.
- **Envelope cross-correlation** degrades exactly where it matters: the better the acoustic
  separation between the two phones, the more *anti*-correlated their envelopes are. On one
  session the best blind peak was **negative**.

So neither alone is sufficient, which is presumably why the March note called correlation
"production-ready" and it still went wrong. `scripts/p1237-crosstalk-scan.py` already implements
the combination that worked — events prior, correlation refinement inside a bounded window, and a
confidence check that refuses when the refinement could not be applied — and its two-estimate
disagreement is a median of **1.73 s**. That function is the reference; port it, do not reinvent it.

**When the offset cannot be established with confidence, do not silently mix at t=0.** Record that
the session is unaligned and let the pipeline decide, rather than producing a confident-looking
transcript built on superimposed audio.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Fixing alignment does not improve attribution | ACCEPT, and expect it | P1237 measured pyannote at 59.5% against the physical oracle on well-separated, correctly-aligned audio, below the 75.0% naive rate. Alignment is necessary, not sufficient — do not justify this fix by promising better speaker labels |
| The events prior is wrong on late joins and rejoins | MITIGATE | Treat it as a prior, validate by correlation inside a bounded window, refuse when the window cannot be applied — the P1237 scan's own arrangement |
| Aligning changes every existing transcript's timeline | ACCEPT | No transcript has been produced since 2026-07-05 and none are regenerated automatically; there is no backfill obligation |
| A confidence check that refuses too often silently drops sessions | MITIGATE | Gate 7c — run the archived corpus through it and report how many sessions it would refuse, before shipping. P1237 measured 18 of 44 as confidently alignable |

**Non-Goals**
- Do NOT change what happens after the merge — no diarizer, engine or attribution changes here.
- Do NOT re-enable audio recording; that is P1236's call.
- Do NOT treat this as the fix for speaker attribution. It is not, and P1237 measured why.

## Done-When

- [ ] `_merge_wavs` applies a per-recorder offset instead of mixing from t=0
- [ ] The offset is derived from the events prior validated by bounded correlation, and a session
      whose offset cannot be established is marked unaligned rather than silently mixed at t=0
- [ ] Run against the archived corpus: the number of sessions alignable with confidence is
      recorded, and compared against the 18 of 44 P1237 measured
- [ ] The refusal path is exercised — a session with an out-of-range prior is shown to be marked
      unaligned rather than mixed, with the output pasted
- [ ] A regression test pins the offset for at least one session with a known non-zero offset, so
      a future change back to t=0 fails rather than passing quietly

## Related

- [P1237](done/2026-06-10/p1237_batch_pipeline_gemini_vs_six_steps.md) — measured the offsets and
  wrote the reference implementation in `scripts/p1237-crosstalk-scan.py`.
- [P1236](p1236_server_side_live_transcription_for_rooms.md) — owns recording; this should land
  before it restores audio.
- [P1250](p1250_colocated_autoclose_closes_specs_nobody_did.md) — owns the disposition of the March
  alignment code this fix replaces.
