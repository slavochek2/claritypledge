---
status: week
type: story
rank: 1.0
tags: [transcription, live, diarization, c3]
prepped_date: '2026-03-12'
flow: dev
delivery_stage: 1-prd-review
reviews:
  ux: null
  architect: null
  alignment: null
---

# P495: Automatic Live Session Transcription with Speaker Labels

## Problem Statement

**Current state:** /live sessions record audio to GCS (`gs://claritypledge-ml-training/sessions/{code}/`) as chunked webm files. Audio exists but is never transcribed. Users see session history with ratings and content snapshots, but no record of what was actually said.

**Pain points:**
- Slava must manually transcribe recordings for coaching prep (C3 retainer model requires "review meeting transcripts, identify divergence with AI")
- Users can't review what they or their partner said during a session — only ratings and content titles remain
- No way to verify whether explain-back accuracy matched actual words spoken
- Mirror agents (future: AI drafting stories/points on behalf of users) have no text to work from
- Multi-language sessions produce audio that nobody will manually transcribe

**Who's affected:**
- Slava (facilitator/coach): needs transcripts to prepare for retainer sessions and identify divergence
- Session participants: want to review what was discussed, track communication patterns over time
- Future mirror agents: need speaker-attributed text to draft content on behalf of users

---

## Intention (Why This Matters)

**Strategic importance:** Transcription is the foundation of the C3 paid product ("Fractional Clarity Officer"). Without automatic transcripts, the retainer model requires manual transcription — limiting capacity to 2-3 pairs instead of 7. Transcripts also unlock the mirror agent capability needed for scale beyond manual facilitation.

**Why now:** First real facilitated session (Jan + Nejc) just happened. Audio recording infrastructure (P28.1) is proven and working. Benchmark confirmed Whisper + pyannote produces excellent transcripts with accurate speaker attribution. The pipeline from audio → transcript is validated locally — needs to become automatic and server-side.

**Impact if not solved:** C3 retainer model is bottlenecked on manual transcription. Each 60-min session takes 2-3 hours to manually transcribe and review. At 7 retainer pairs × 4 sessions/month = 28 sessions = 56-84 hours/month of transcription alone. Automatic transcription reduces this to review-only (~15 min/session = 7 hours/month).

---

## Business Requirements

**Must-haves:**
- Automatic transcription of every /live session after it ends — no manual trigger needed
- Speaker diarization: identify who said what (Speaker 1, Speaker 2, facilitator)
- Speaker labels mapped to participant names using session metadata
- Transcripts available at both session level (full session) and round level (per calibration round)
- Multi-language support with automatic language detection
- Support for 2-5 speakers (co-founder pair + optional facilitator + observers)
- Transcripts accessible to session participants via session history UI
- Processing completes within 15 minutes of session end for a 60-minute session

**Success conditions:**
- Every session with audio recording produces a transcript within 15 minutes
- Speaker attribution is correct for ≥90% of segments (validated on benchmark recordings)
- Transcripts are split correctly at round boundaries
- Users can read transcripts in session history alongside existing round summaries

**Constraints:**
- Audio is already in GCS as chunked webm files (MediaRecorder format — only chunk_000 has headers)
- Must run server-side (not on user devices or Slava's Mac)
- Processing costs covered by existing $25k GCP credits
- Must not leak transcript data between users (RLS on transcript tables)
- Infrastructure must be reusable for personal transcription pipeline (separate bucket, separate delivery)

---

## User Stories

**As a facilitator preparing for a retainer session:**
- I want automatic transcripts of every facilitated session, so I can review what was said without manually transcribing
- I want speaker labels on each segment, so I can see who said what without guessing from context
- I want round-level transcripts, so I can focus on specific rounds where calibration scores diverged

**As a session participant reviewing my session:**
- I want to see what was said during each round, so I can reflect on my communication patterns
- I want transcripts alongside existing round summaries (ratings, content), so I have the full picture in one place
- I want speaker labels using real names (not "Speaker 1"), so the transcript is immediately readable

**As a participant in a non-English session:**
- I want automatic language detection, so I don't need to configure language before the session
- I want transcription to work in my language, so non-English sessions are equally supported

**As a participant concerned about privacy:**
- I want to be able to delete the transcript of a session I participated in, so consent is revocable (existing "AI Insights" banner + join consent already set expectations)
- I want private sessions to produce no transcript, so I have a way to opt out entirely

**As the system processing recordings:**
- I want transcription to start automatically after session audio is uploaded, so no manual trigger is needed
- I want failed transcriptions to be retryable, so transient errors don't permanently lose a transcript

---

## Jobs to Be Done

**When a facilitated session ends:**
- I want the transcript ready by next morning, so I can review it during coaching prep (motivation: efficient retainer delivery at scale)

**When reviewing a session where calibration scores were surprising:**
- I want to read exactly what each person said during that round, so I can understand why scores diverged (motivation: learning from specific moments, not just aggregate scores)

**When onboarding a new retainer pair:**
- I want to show them their first session transcript with highlighted divergence, so they see concrete evidence of misalignment (motivation: demonstrating value of the retainer)

**When a session happens in German/Slovenian/other language:**
- I want it transcribed just like English sessions, so I can serve non-English-speaking founder pairs (motivation: market expansion beyond English)

---

## Outcomes (Success Metrics)

**Capacity unlock:**
- Reduce per-session prep time from 2-3 hours (manual transcription) to 15 minutes (review only)
- Enable 7 concurrent retainer pairs (C3 capacity target) without transcription bottleneck

**Quality:**
- ≥90% speaker attribution accuracy on sessions with 2-3 speakers
- Round-level splitting matches actual round transitions (verified on benchmark recording)
- Language auto-detection works for English, German, Slovenian (primary user languages)

**Reliability:**
- 100% of sessions with recordings produce transcripts (no silent failures)
- Failed jobs are visible and retryable
- Processing within 15 minutes for sessions ≤60 minutes

**User engagement:**
- Session participants view transcripts (track via Mixpanel: `transcript_viewed` event)
- Facilitator uses transcripts in coaching prep (qualitative: Slava confirms value)

---

## Acceptance Criteria

- [ ] Every /live session with audio recording automatically produces a transcript
- [ ] Transcript includes speaker-labeled segments with timestamps
- [ ] Speaker labels use participant display names (from session metadata), not generic "Speaker 0/1"
- [ ] Session-level transcript available (full session, all rounds)
- [ ] Round-level transcripts available (one per completed round)
- [ ] Language is auto-detected — no manual configuration needed
- [ ] Works with 2-5 speakers (pair + facilitator + observers)
- [ ] Transcript visible in session history UI alongside existing round data
- [ ] Transcript is collapsible/expandable (doesn't overwhelm the session history view)
- [ ] Only session participants (creator + joiner who were in the session) can see transcripts — existing "Session recorded for AI Insights" banner and join-time consent already cover user expectations
- [ ] Any participant can delete the session transcript (revocable — deletes for everyone)
- [ ] Private sessions (`?insights=off`) produce no transcript (no audio = no transcript)
- [ ] Transcript sharing with non-participants is a future feature (C3 retainer) — P495 RLS should be designed to support per-user grants later
- [ ] Failed transcriptions are visible (not silently lost) and retryable
- [ ] Processing completes within 15 minutes for a 60-minute session
- [ ] Works with single-phone recordings (all speakers on one device) and two-phone recordings

---

## Pre-deploy Checklist

### Secrets to provision
- [ ] `HF_TOKEN` — HuggingFace token for pyannote gated models (Cloud Run env var)
- [ ] Supabase service role key in Cloud Run env for transcript storage

### Deploy commands
- [ ] Deploy Cloud Run transcription service
- [ ] Create Cloud Scheduler job for polling transcription_jobs
- [ ] Run database migration (3 new tables)

### Post-deploy verification
- [ ] Process benchmark session (h44q9h) through full pipeline
- [ ] Verify transcript appears in session history UI
- [ ] Check Sentry for errors in first 24 hours

---

## Next Steps

1. Run `/ux` — design transcript viewer interactions (expand/collapse, round vs session view, speaker labels, search/filter)
2. Run `/architect` — Cloud Run container, DB schema, trigger mechanism, GCS integration, RLS policies
3. Run `/generate-tests` → `/spec-review` → `/dev`

---

## References

- Plan: `~/.claude/plans/compiled-singing-nova.md` — full technical plan with benchmark results
- P28.1: Audio + Event Data Capture (predecessor — built the recording infrastructure)
- C3 milestone: `docs/milestones/c3-paid-workshops.md` — business context for retainer model
- ML training docs: `docs/archive/ml-training-setup.md` — GCS bucket, Cloud Function for signed URLs
