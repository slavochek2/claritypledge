---
status: rejected
type: task
rank: 12
tags:
  - transcription
  - speaker-attribution
created_date: 2026-03-22
closed_at: '2026-08-14'
---

# P569: Energy Post-Validation for LLM Speaker Attribution

> **Closed 2026-08-14 — backlog triage.** Superseded **by name**: [decisions.md](../../docs/decisions.md) 2026-03-22 [technical] — *"No amix. No pyannote for multi-phone. **No energy comparison.**"* Also benchmarked net-negative on real data (7 false flags vs 2 catches).
>
> Full reasoning and the adversarial review that produced this call: session plan v2, 2026-08-14.

## Problem Statement

Gemini 3 Flash text merge achieves 83% speaker attribution accuracy. The remaining 17% errors are lines where conversational context alone is ambiguous. Energy comparison (RMS volume per phone) failed as a primary signal (one mic systematically louder → 92/8 split), but it hasn't been tested as a VALIDATION signal after LLM attribution.

## Intention

After the LLM assigns speakers, cross-check each attribution against the energy signal. Where LLM and energy agree → high confidence. Where they disagree → flag for re-evaluation or ask the LLM to reconsider with the energy hint.

## Technical Approach

1. **LLM pass 1:** Gemini 3 Flash merges two per-phone Whisper transcripts → speaker-attributed transcript (83%)
2. **Energy check:** For each attributed segment, compare RMS energy between phones at that timestamp. Record: "Phone A was louder" or "Phone B was louder"
3. **Confidence scoring:** LLM says "Slava at 30s" + energy says "Slava's phone louder at 30s" → high confidence. LLM says "Slava at 30s" + energy says "JB's phone louder at 30s" → low confidence, flag.
4. **Optional LLM pass 2:** Send flagged segments back to Gemini with the energy hint: "You attributed this to Slava, but JB's phone was louder at this moment. Reconsider?" This is cheap (only the ~17% flagged segments, not the full transcript).

## Acceptance Criteria

- [ ] Energy validation scores each segment as agree/disagree with LLM attribution
- [ ] Segments where LLM and energy disagree are flagged with `confidence: low`
- [ ] Optional: LLM pass 2 reconsiders flagged segments with energy hint
- [ ] Benchmark on E7QDTX shows improvement over 83% baseline

## Dependencies

- P556 parallel Whisper + alignment (done, on feature branch)
- P566 chunk upload reliability (improves input quality)

## Done When

- [ ] Energy post-validation integrated into multi-phone pipeline
- [ ] Accuracy improvement measured on E7QDTX ground truth
