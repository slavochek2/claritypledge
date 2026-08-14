---
status: all-done
type: task
rank: 0.1
flow: dev
tags:
  - transcription
  - infrastructure
  - speaker-attribution
created_date: 2026-03-21
---

# P556: Energy-Based Speaker Attribution for Multi-Phone Sessions

> **Record correction, 2026-08-14 — this is marked done, and the approach it describes was replaced four days after it closed.**
>
> [decisions.md](../../../docs/decisions.md) 2026-03-22 [technical] superseded the energy approach outright: *"Multi-phone pipeline = align via cross-correlation, Whisper each phone separately, LLM merge for attribution. **No amix. No pyannote for multi-phone. No energy comparison.**"* That entry named its own consequence — *"P556 spec needs rewrite"* — and the rewrite never happened.
>
> **What is actually deployed today is neither.** `services/transcribe/pipeline.py:106` still runs `diarize(audio.merged_wav, ...)` — pyannote over an `amix` merge (`audio.py:319`) — the exact combination that decision banned. None of the decided redesign exists in `services/transcribe/` (`llm_merge|cross_correlation|align_recordings|multi_phone` -> zero matches, verified 2026-08-14). Even the piece the decision called *"production-ready (keep regardless of approach)"* — cross-correlation alignment in `audio.py` — is not there.
>
> **The redesign is parked, not abandoned** — see **P558**, which that decision promoted to the core attribution mechanism, for the unpark triggers. This note exists because `status: all-done` on this file misled a backlog triage on 2026-08-14 into believing the decided pipeline had shipped.

## Problem Statement

ClarityPledge records two-person coaching sessions where each participant holds their own phone. Both phones capture both speakers (same room). The current pipeline mixes both recordings into mono via `amix`, then runs pyannote diarization — which gives 99.7%/0.3% speaker split (completely broken, worse than random).

Root cause: `amix` destroys the volume difference between phones. The per-phone WAVs already exist in `SessionAudio.recorder_wavs` BEFORE `_merge_wavs()` is called — we're destroying useful data then spending 8 minutes trying to recover it.

## Intention

Use the physical fact that the phone closer to the active speaker captures higher RMS energy. Energy-gate BEFORE Whisper: per speech segment, send only the dominant phone's audio to Whisper. Speaker identity = phone owner. No ML, no enrollment, works for any two strangers.

## Validated Signal

Local test on GB7JWW (Florrie+Slava, ~5 min sample):
- 70%/30% speaker split (vs 99.7%/0.3% with pyannote)
- Only 2% ambiguous windows (energy ratio 0.67-1.5)
- Clear turn-taking structure visible in merged segments
- 408 windows clearly Slava, 174 clearly Florrie, 13 ambiguous

## Challenge Resolutions (from /challenge-prd)

### BLOCK 1: No ground truth → RESOLVED
**Validation approach:** Use events.json structured round boundaries where speaker/listener roles are known. Automated, no human effort. Check if energy-attributed speaker matches designated speaker at round boundaries. Secondary: vocabulary divergence (facilitator vs participant language patterns).

### BLOCK 2: Whisper crosstalk duplicates → RESOLVED
**Approach:** Energy-gate BEFORE Whisper, not after. Per speech segment (VAD-detected), send only the dominant phone's audio to Whisper. No duplicate text ever enters the pipeline. For ambiguous segments (energy delta < 3dB), transcribe both and pick by Whisper confidence score.

### BLOCK 3: P552 code reverted → RESOLVED
**Approach:** P552's pipeline branching code was reverted. P556 /dev re-implements the multi-phone vs single-phone branch as part of this spec. The per-phone WAVs already exist in `recorder_wavs` — no new audio architecture needed.

## Alternatives Considered and Rejected

| Approach | Why rejected |
|----------|-------------|
| Voice enrollment (ECAPA-TDNN) | Tested locally: cross-device similarity 0.58 vs 0.47 (delta 0.11 — too low). Doesn't work for strangers. |
| Deepgram multichannel | Both phones capture both speakers → joint stereo → duplicate transcripts. Recurring cost. |
| LLM zero-shot correction | Google DiarizationLM 2024: worse than nothing without fine-tuning. |
| "Recorder = speaker" (P552) | Wrong: both phones hear both people. Energy comparison needed. |
| Pyannote on amix mono | `amix` destroys energy difference. Pyannote gets equalized mono → 99.7%/0.3%. |
| Stereo amerge to pyannote | Research: pyannote downmixes to mono internally. |
| Transcribe both phones + dedup | Creates duplicate text. Energy-gate before Whisper avoids the problem entirely. |

## Technical Approach (from innovate+falsify)

### Core: Energy-gated feeding with VAD segments

1. **VAD on both phone recordings** — find natural speech segments (not fixed 2s windows)
2. **Per segment: compare RMS energy** between both phones
3. **Send only the dominant phone's audio** to Whisper for that segment
4. **Label resulting text** with dominant phone's speaker identity (recorder name)
5. **For ambiguous segments** (energy delta < 3dB): transcribe both, pick by Whisper confidence

### Supplementary: Round structure as constraint

- During structured rounds: events.json designates speaker/listener → use as ground truth validation
- During free discussion: energy comparison is the primary signal

### Fallback: Single-phone path

- If only 1 recorder: existing pyannote diarization + P546 word-level merger (8 min, pre-load fix)

## Business Requirements

1. **Multi-phone: energy-gated Whisper feeding.** Per speech segment, send only the dominant phone's audio. No duplicate transcription.
2. **Single-phone fallback preserved.** Pyannote diarization with word-level merger for single-recorder sessions.
3. **No prior data required.** Works for any two strangers, first session.
4. **Ambiguous segments marked explicitly.** Energy delta < threshold → marked, not force-assigned.
5. **Round structure validation.** events.json speaker roles validate energy attribution in structured portions.
6. **Speaker identity = recorder name.** Maps to participant names via `SessionAudio.recorder_wavs` keys.

## Acceptance Criteria

- [ ] Multi-phone sessions use energy-gated Whisper feeding (not pyannote diarization)
- [ ] Speaker split on H44Q9H within 60/40 (was 99.7/0.3)
- [ ] Validated against events.json round boundaries (energy speaker = designated speaker ≥80% of time)
- [ ] Ambiguous segments (< 3dB delta) explicitly marked
- [ ] Single-phone sessions unchanged (pyannote fallback)
- [ ] Re-processing GB7JWW, E7QDTX, H44Q9H all show balanced splits
- [ ] Processing time < 10 min for 30-min multi-phone session
- [ ] No duplicate text in output (energy-gate prevents double transcription)

## Files to Change

- `services/transcribe/pipeline.py` — branch multi-phone vs single-phone, energy-gated Whisper feeding
- `services/transcribe/energy_speaker.py` — NEW: energy comparison + VAD segment detection
- `services/transcribe/audio.py` — stop calling `_merge_wavs()` for multi-phone, keep per-phone WAVs
- `services/transcribe/speaker_map.py` — recorder name = speaker for multi-phone path

## Done When

- [ ] Energy-gated pipeline produces balanced speaker splits on 3 benchmark sessions
- [ ] events.json validation confirms ≥80% match at round boundaries
- [ ] Processing time < 10 min
- [ ] Single-phone fallback regression-free
