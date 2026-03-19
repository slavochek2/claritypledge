---
status: today
type: task
rank: 0.2
flow: dev
created_date: "2026-03-19"
tags:
  - transcription
  - infrastructure
  - performance
---

# P552: Separate-Channel Transcription — Skip Diarization for Multi-Phone Sessions

## Problem

Pyannote diarization takes 76 minutes for 30 min audio on L4 GPU (2.5x real-time, 100x slower than pyannote's own benchmark). Root cause: `_merge_wavs()` in `audio.py` mixes separate phone recordings into one mono stream via ffmpeg `amix`, then diarization spends 76 min trying to recover which speaker said what — information we already had.

Each participant records on their own phone. The `recorder_wavs` dict in `SessionAudio` already contains per-recorder WAV files. We destroy this data by mixing it.

## Solution

### Primary path: multi-phone sessions (most sessions)

1. **Stop mixing** — skip `_merge_wavs()` when 2+ recorders exist
2. **Transcribe each phone independently** — run Whisper on each recorder's WAV
3. **Interleave by timestamp** — merge transcripts by word/segment timestamps
4. **Speaker identity = recorder identity** — each phone IS one speaker, no diarization needed

Pipeline drops from ~79 min to ~4 min (2x Whisper runs in sequence).

### Fallback: single-phone sessions

For sessions with only 1 recorder, pyannote diarization is still needed. Fix the speed issue:
- Verify GPU execution (check for ONNX CPU fallback)
- Pre-load audio into memory before passing to pyannote
- Expected: ~1-3 min (pyannote benchmark) vs current 76 min

### Round structure enhancement (optional)

For structured rounds, `events.json` contains `live_round_started`/`live_round_ended` with speaker/listener roles. Use as ground truth for structured portions — no audio analysis needed at all.

## Technical Notes

### Files to change

- `services/transcribe/audio.py` — add `get_separate_wavs()` that returns individual recorder WAVs instead of mixing. Keep `_merge_wavs()` for single-phone fallback.
- `services/transcribe/pipeline.py` — branch: if 2+ recorders, transcribe each separately and interleave. If 1 recorder, use existing diarization path (with speed fix).
- `services/transcribe/speaker_map.py` — for multi-phone: recorder name = speaker. Map directly without embeddings/diarization.
- `services/transcribe/merger.py` — P546 word-level merger still applies for the single-phone diarization path. For multi-phone, merger is simpler (just interleave by timestamp).

### Key insight from research

The `recorder_wavs` dict in `SessionAudio` already contains per-recorder WAV files keyed by recorder name (e.g., `{"florrie": "/tmp/.../florrie.wav", "vyacheslav-ladischenski": "/tmp/.../vyacheslav.wav"}`). The `amix` step in `_merge_wavs()` destroys this separation.

### Pyannote speed investigation

76 min for 30 min audio is 100x slower than pyannote's benchmark (~45s). Likely causes:
- ONNX runtime CPU fallback (pyannote silently falls back to CPU if ONNX isn't configured for GPU)
- Disk I/O on Cloud Run (reading 160MB WAV from container filesystem)
- Missing optimization flags

Check: `import onnxruntime; print(onnxruntime.get_available_providers())` — should include `CUDAExecutionProvider`.

## Acceptance Criteria

- [ ] Multi-phone sessions (2+ recorders) transcribed WITHOUT diarization
- [ ] Each recorder's WAV transcribed independently with Whisper
- [ ] Transcripts interleaved by timestamp into unified segment list
- [ ] Speaker identity derived from recorder name (no embedding matching needed)
- [ ] Single-phone sessions still use diarization (fallback path preserved)
- [ ] Pipeline time for multi-phone 30-min session < 10 min (was 79 min)
- [ ] Existing tests updated, new tests for multi-phone path

## Done When

- [ ] Re-processed H44Q9H (2-phone session) with separate-channel path
- [ ] Speaker split reflects actual speakers (not 99.7%/0.3%)
- [ ] Processing time < 10 min (was 79 min)
- [ ] Single-phone session still works via diarization fallback
