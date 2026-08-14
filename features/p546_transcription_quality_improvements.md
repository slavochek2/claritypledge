---
status: backlog
type: task
rank: 15
tags:
  - transcription
  - infrastructure
  - data-quality
created_date: 2026-03-18
---

# P546: Transcription Quality Improvements — Diarization, Hallucinations, Language

## Problem

Transcript corpus audit (2026-03-18, 28 sessions) revealed systematic quality issues that make transcripts unreliable for the FCO workflow — specifically, Slava's post-session transcript review to identify false agreements and prepare targeted follow-up sessions (H-Stories-ColdStart). The `/analyze-transcripts` skill also depends on accurate speaker attribution and clean text to extract product insights from session data.

1. **Broken speaker diarization** — 70-99% of words attributed to one speaker. Florrie session: Slava gets 12,302 words, Florrie gets 27. Root cause: merger operates at segment-level, not word-level. Whisper segments span 10-60 seconds covering both speakers; entire segment assigned to dominant speaker.

2. **Whisper hallucinations** — "Thank you" repeated 53 times (LHU4RH), "Продолжение следует..." repeated 54 times (Q7BBEA), looped phrases during silence. Root cause: no VAD pre-processing — silence and ambient noise go straight to Whisper.

3. **Language misattribution** — Sessions tagged English contain Korean, Vietnamese, Turkish fragments. These are Whisper hallucinations on noise, not real multilingual speech. No language hint is provided to Whisper.

4. **Mega-segments** — Single segments of 3,000+ words with no turn-taking. Root cause: `_consolidate_same_speaker()` merges consecutive same-speaker segments with no max length, and diarization assigns everything to one speaker.

5. **Ambient recording noise** — Recordings left running capture restaurant conversation, fire shows, post-session chat. Whisper dutifully transcribes all of it.

## Current Architecture

- **Model:** `large-v3-turbo` (config.py, overridable via `WHISPER_MODEL`)
- **Diarization:** pyannote.audio v3.1 (`pyannote/speaker-diarization-3.1`)
- **Merger:** `services/transcribe/merger.py` — assigns each Whisper **segment** to pyannote speaker with greatest temporal overlap
- **Word timestamps:** `word_timestamps=True` in Whisper config — data exists but **thrown away** during merging
- **Audio:** WebM chunks from GCS → concatenated → ffmpeg to 16kHz mono WAV. Multi-phone: `amix` filter (mixes, doesn't interleave)
- **Voice profiles:** `user_voice_profiles` table with 512-dim pgvector embeddings, cosine matching at 0.75 threshold. Updated after each session.
- **No VAD pre-processing.** No temperature/beam tuning. No hallucination post-filter.

## Root Cause Analysis

From /innovate (30 alternatives) + /falsify (adversarial stress-test):

1. **Problem 1+4 (diarization + mega-segments):** `Segment` dataclass in `transcriber.py` has no `words` field. `word_timestamps=True` is set but word data is discarded. `_find_best_speaker` in `merger.py` operates at segment granularity (10-60s), making correct speaker assignment impossible when segments span both speakers. Problem 4 is a downstream consequence — fix diarization, mega-segments disappear.
2. **Problem 2+3 (hallucinations + language):** No VAD gate before Whisper. Silence and ambient noise trigger hallucination-on-silence behavior. Language misattribution is the same root cause — Whisper hallucinates in random languages on noise, especially without a `language` hint.
3. **Problem 5 (ambient noise):** No session boundary enforcement. Recording runs until user stops it. This is an operational/audio preprocessing issue, not a transcription issue. VAD partially addresses it by stripping silence.

## Alternatives Considered and Rejected

**WhisperX drop-in replacement** — REJECTED. Last release Oct 2023, 326 open issues. Wraps pyannote 3.0 (we use 3.1). The word-level alignment it provides is achievable with a 50-line merger.py edit using data that already exists. Introduces wav2vec2 dependency (~1GB). Loses direct access to pyannote embedding API needed for voice profiles.

**Gemini audio-native analysis** — REJECTED. Incompatible with existing structured data pipeline (`{speaker_id, text, start_ms, end_ms}`). Cannot map speakers to user IDs (no embedding support). Non-deterministic output format. Sidesteps the problem instead of solving it.

**Deepgram API complete replacement** — REJECTED. Recurring cost ($0.26/session) when we have $25k GCP credits and a self-hosted pipeline that needs a ~50-line bug fix. Also destroys the voice profile system (no speaker embeddings exposed) and adds vendor lock-in.

**P546 all 7 items at once** — REJECTED as a unit. Items 1+2 solve 90%+ of issues. Items 3-7 are premature without post-fix measurement. Hallucination post-filter with hardcoded patterns is brittle. Round correction creates a second-opinion system that fights pyannote. Multi-phone separation is an architecture change deserving its own spec.

## Changes (Phased — Measure Before Expanding)

### Phase 0: Timestamp Verification Gate (30 min — before any code)

Spot-check word timestamp accuracy on one benchmark session (GB7JWW/Florrie):
- Extract 20 word timestamps from Whisper output
- Compare against audio playback
- **Go/no-go:** median offset <200ms → proceed with word-level merger. If >500ms → reconsider approach (forced alignment via wav2vec2 or segment subdivision instead).

### Phase 1: Core Fixes (1-1.5 days — fixes all 5 problems)

#### 1. Word-Level Diarization Alignment (fixes problems 1 + 4)

- Add `words` field to `Segment` dataclass in `transcriber.py`
- Extract word-level timestamps from `result["segments"][n]["words"]` in transcription loop
- Rewrite `merger.py` to iterate words, not segments: for each word, find overlapping pyannote speaker
- Group consecutive same-speaker words into segments
- Add max segment length (30s) to `_consolidate_same_speaker()`
- Add minimum segment duration (500ms) to prevent hyper-fragmentation

This is the single highest-impact change. Word timestamps already exist but are thrown away.

#### 2. VAD Pre-processing (fixes problems 2 + 3 + 5)

- Add pyannote VAD gate in `pipeline.py` before the Whisper step (pyannote VAD already available — same library)
- Strip non-speech regions from the WAV before Whisper processes it
- Eliminates hallucinations on silence, language misattribution from noise, and reduces ambient recording transcription

#### 3. Language Hint (one-line fix for problem 3)

- Pass session's `language` field from metadata to `model.transcribe()` in `transcriber.py`
- Prevents Whisper auto-detection from hallucinating wrong languages on noisy edge cases
- Insurance layer on top of VAD

### Phase 2: Measure and Decide (after Phase 1)

Re-process 3 benchmark sessions (GB7JWW/Florrie, E7QDTX/Jb, H44Q9H/Jan+Nejc). Measure:
- **Speaker word-count ratio** — target within 60/40 for all known two-speaker sessions
- **Hallucination rate** — target zero repeated phrases (grep for 3+ consecutive duplicates)
- **Foreign script count** — target zero non-Latin fragments in English-tagged sessions

**Only proceed to Phase 3 items if Phase 1 metrics show residual issues:**

### Phase 3: Conditional — Only If Measured (defer until Phase 2 data)

| Item | Condition to implement | Effort |
|------|----------------------|--------|
| Hallucination post-filter | If VAD doesn't eliminate all hallucinations | ~100 lines, new file |
| Whisper param tuning (`no_speech_threshold`, `compression_ratio_threshold`) | If hallucination rate > 1% after VAD | 3 lines in transcriber.py |
| Round structure as diarization correction | If speaker ratio still >70/30 after word-level merger | Careful design needed — avoid fighting pyannote |
| Multi-phone channel separation | If multi-phone sessions still have poor diarization | Architecture change, own spec |

## Files to Change (Phase 1)

- `services/transcribe/transcriber.py` — add `words` field to Segment, pass `language` param
- `services/transcribe/merger.py` — word-level alignment (rewrite `_find_best_speaker`)
- `services/transcribe/pipeline.py` — add pyannote VAD preprocessing step

## Done When

- [ ] Phase 0: Word timestamp accuracy verified (<200ms median offset on 20 spot-checked words)
- [ ] Re-processed Florrie session (GB7JWW) shows balanced speaker split (within 60/40)
- [ ] Zero hallucinated repetitions in re-processed Q7BBEA
- [ ] No foreign script hallucinations in re-processed 78PRAC
- [ ] Speaker word-count ratio within 60/40 on all 3 benchmark sessions
- [ ] Phase 2 measurements documented — decision on Phase 3 items recorded
