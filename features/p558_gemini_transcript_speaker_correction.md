---
status: backlog
type: task
rank: 39
tags:
  - transcription
  - ai
  - speaker-attribution
created_date: 2026-03-21
---

# P558: Gemini Post-Processing for Transcript Speaker Correction

> **PARKED 2026-08-14 — gated, not actionable.** [decisions.md](../docs/decisions.md) 2026-03-22 promoted this from post-processing layer to **the core attribution mechanism**, but this spec's Dependencies still say *"P556 must ship first"* — and P556 is marked done while the decided architecture was never built. This is the seed of the transcription redesign, not an independent task. **Unpark triggers:** (a) letter audio explain-backs need transcribing, (b) sessions should auto-produce a letter, (c) transcription cost bites. Prior art waiting: `.private/docs/research/live-transcription-stt-models-2026-08.md`.

## Problem

After energy-based speaker attribution (P556), some segments may have incorrect speaker labels — especially during ambiguous windows, overlapping speech, or edge cases where energy comparison is unreliable. A human reading the transcript can often spot these errors from conversational context ("the facilitator is asking himself a question — labels are swapped here").

## Solution

After the transcription pipeline produces a speaker-attributed transcript, run Gemini 2.0 Flash over it to flag and correct speaker label errors using conversational context. This is NOT zero-shot blind correction (published as worse than nothing — Google DiarizationLM 2024). This is informed correction with strong structural priors:

- **Facilitator role:** asks questions, guides conversation, uses coaching language
- **Participant role:** answers, explains back, uses personal narrative language
- **Round structure:** events.json designates speaker/listener per round
- **Pronoun patterns:** "I think you..." (facilitator) vs "I feel that I..." (participant)
- **Turn-taking:** facilitator question → participant answer → facilitator affirm

## Technical Notes

- Uses existing Gemini API key (`GEMINI_API_KEY` in `.env.local`) + $25k GCP credits
- Model: `gemini-2.0-flash` (already used for story-guide-chat edge function)
- Input: speaker-attributed transcript segments + events.json round structure
- Output: corrected speaker labels + confidence flags on changed segments
- Runs AFTER P556 energy attribution, as a cleanup layer

## Acceptance Criteria

- [ ] Gemini reviews transcript and flags segments where speaker label conflicts with conversational context
- [ ] Corrections are applied only when confidence is high (not on ambiguous cases)
- [ ] Round structure priors are included in the prompt
- [ ] Processing adds < 30 seconds to pipeline
- [ ] Benchmark: compare P556-only vs P556+Gemini on 3 sessions

## Dependencies

- **P556** (energy-based attribution) — must ship first. Gemini corrects P556's output.
- Gemini API key (already provisioned)

## Done When

- [ ] Gemini correction reduces speaker attribution errors on benchmark sessions
- [ ] No regressions (Gemini doesn't make correct attributions worse)
- [ ] Processing time impact < 30s
