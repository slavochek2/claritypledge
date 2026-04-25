---
status: qa
type: bug
rank: 1000802.0
severity: high
workstream: C1
date_reported: '2026-04-25'
created_date: '2026-04-25'
tags: [transcription, cloud-run, whisper, quality-regression]
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: services/transcribe/tests/test_p815_audio_normalization.py
  root_cause: "Cloud Run pipeline lacks an audio loudness-normalization stage. Quiet recordings (mean volume below ~-25 dB) cause Whisper to hallucinate words. VG6CJR session captured at -40.6 dB → 'Pour it into a new nail'. Same audio normalized to -16 dB → 'I'm into a new day under the hot sun'. Local mlx_whisper on raw audio produces the same kind of garbage, ruling out pipeline-specific blame (VAD, attribution, model config)."
  confidence: high
  reproduced_at: '2026-04-25'
  evidence_session: VG6CJR
  evidence_audio: /tmp/vg6cjr/vg6cjr.wav
---

# P815: Transcription quality regression on Cloud Run vs local Whisper

## Summary

Cloud Run `transcribe-session` produces noticeably worse transcripts than plain local Whisper on the same audio — both word-level recognition AND speaker attribution have regressed after multiple iterations on the pipeline.

## Root Cause

**Confirmed: missing audio loudness normalization before Whisper.**

The Cloud Run pipeline (`services/transcribe/audio.py:_concat_and_decode`) cats WebM chunks and decodes to 16 kHz mono WAV with `ffmpeg -ac 1 -ar 16000`, but applies no level normalization. Whisper hallucinates on audio whose mean volume falls below roughly -25 dB.

### Evidence (session VG6CJR, 2026-04-25)

| Stage | Mean dB | Whisper output |
|-------|---------|----------------|
| Cloud Run pipeline (no normalization) | -40.6 dB | "Pour it into a new nail Under the hot side Stay all the done See who you want to see Do what you want Be like a woman to" |
| Local `mlx_whisper` on identical concat'd audio | -40.6 dB | Stuck in counting-loop hallucination ("1, 2, 3, 4, 5" repeating) |
| Local `mlx_whisper` on **`loudnorm`'d** audio (`-i -16`) | -16.1 dB | "I'm into a new day under the hot sun. Stay out of time. See who you wanna see. Do what you want. But be like a woman to me." |

The CONTENT is identical between Cloud Run and the working local run — Whisper is decoding the same recording. The DIFFERENCE is hallucination strength on quiet vs. loud input.

### What this rules out

- **Pipeline iteration** (VAD, diarization, word-merger, language hint) is NOT the cause. Even raw-audio Whisper without any pipeline produces the same garbage on the un-normalized recording.
- **Speaker attribution** is NOT the active failure on this session. Pyannote correctly returned a single speaker (`SPEAKER_00`).
- **Chunk concatenation** is NOT broken. The `cat` + ffmpeg-decode produces a coherent 1m9s WAV with reasonable spectrogram and detectable speech regions.

### What this exposes (separate bug)

The captured audio is unusually quiet. Likely causes (file as separate spec): mic gain too low on recording device, AGC disabled, OR the browser MediaRecorder is capturing system/secondary audio rather than the primary mic. Whatever the recording problem is, the pipeline must defend against it — quiet recordings should still transcribe correctly.

## Reproduction Steps

1. Generate a quiet sine-wave WAV: `ffmpeg -f lavfi -i "sine=frequency=440:duration=3" -af "volume=-40dB" -ac 1 -ar 16000 quiet.wav`
2. Run mlx_whisper (or openai-whisper `large-v3-turbo`) on it — observe hallucinated/looping output
3. Apply loudness normalization: `ffmpeg -i quiet.wav -af "loudnorm=I=-16:TP=-1.5:LRA=11" loud.wav`
4. Run Whisper again on `loud.wav` — observe coherent silence/empty output (sine ≠ speech, but no hallucinations)

**Real-world reproduction:** Session VG6CJR (`gs://claritypledge-ml-training/sessions/VG6CJR/`) — concat all `test-ladischenski_chunk_*.webm` in order, decode with `ffmpeg -ac 1 -ar 16000`, the resulting WAV is -40.6 dB and triggers the bug.

**Reproduction rate:** 100% on quiet input. Sessions with normal recording level (mean > -25 dB) transcribe correctly today — bug surfaces only when client-side audio is unusually quiet.

## Expected Behavior

Cloud Run transcript should be at least as accurate as local Whisper on the same audio. When audio is single-speaker (one mic, in-room), attribution should either be correct or absent — never wrong.

## Actual Behavior

- Words misrecognized that local Whisper handles correctly
- Last prod session: only Slava spoke, but Cloud Run attributed segments to the partner

## Affected Files

- `services/transcribe/audio.py:204-239` — `_concat_and_decode`, where the Whisper-bound WAV is produced. Add normalization here (or expose a new `normalize_audio` callable invoked by `pipeline.py` before Whisper).
- `services/transcribe/pipeline.py:74-88` — call site between `download_session_audio` and `whisper_transcribe`. Where the normalization step should be invoked.
- `services/transcribe/tests/test_p815_audio_normalization.py` — canary test (added by `/reproduce`).

## Severity

**High** — transcription is core to the post-session product loop (review, sift, points). A regression that makes transcripts worse than the baseline Whisper undermines every downstream feature.

## Fix Approach

Add a loudness-normalization step to the Cloud Run pipeline before Whisper. Two equivalent shapes — pick whichever fits the existing code style:

**Option A — extend `_concat_and_decode`:** Add a `loudnorm` audio filter to the existing ffmpeg command in `audio.py:222-230`:

```python
cmd = [
    "ffmpeg", "-y",
    "-i", concat_path,
    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",  # NEW
    "-ac", "1", "-ar", "16000",
    "-f", "wav",
    wav_path,
]
```

**Option B — separate `normalize_audio` step (preferred — testable, explicit):** Add a `normalize_audio(input_wav: str) -> str` function in `audio.py` that runs `loudnorm` and returns a new WAV path. Call it in `pipeline.py` between `download_session_audio` and the VAD step (`pipeline.py:74-79`). The canary test imports `normalize_audio` directly, so Option B is what the test expects — pick this unless there's a strong reason not to.

**Why `loudnorm` (EBU R128) over peak/RMS normalize:** speech audio has wide dynamic range; peak normalization can amplify a single shout while leaving the rest quiet. `loudnorm` targets perceived loudness (LUFS), which is what Whisper effectively listens to.

**Out of scope (file as separate specs if confirmed):**
- Why the VG6CJR recording was -40 dB (client-side mic gain / AGC / wrong audio source) — separate `/create-bug`
- Attribution policy when audio is mixed/single-mic — separate `/create-spec` (drop attribution unless confidently separated)

## Acceptance Criteria

- [x] Reproduction confirmed: VG6CJR audio at -40.6 dB transcribes to gibberish; same audio normalized to -16 dB transcribes correctly (evidence in `## Root Cause` table)
- [x] Root cause identified: missing loudness normalization before Whisper
- [x] Canary test written: `services/transcribe/tests/test_p815_audio_normalization.py`
- [x] Fix implemented: `normalize_audio` added to `services/transcribe/audio.py` and invoked in `pipeline.py` before Whisper
- [x] Canary test passes after fix
- [ ] [post-deploy] Re-running the pipeline on VG6CJR yields a transcript matching the normalized-local baseline within reasonable tolerance
- [x] Pipeline output WAV mean volume is consistently ≥ -25 dB regardless of input loudness (verified by canary: -40 dB input → output > -25 dB)
