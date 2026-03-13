---
status: in-progress
type: story
rank: 1.0
tags: [transcription, live, diarization, c3]
prepped_date: '2026-03-12'
flow: dev
delivery_stage: uat
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

- [x] Every /live session with audio recording automatically produces a transcript
- [x] Transcript includes speaker-labeled segments with timestamps
- [ ] Speaker labels use participant display names (from session metadata), not generic "Speaker 0/1"
- [x] Session-level transcript available (full session, all rounds)
- [ ] Round-level transcripts available (one per completed round)
- [ ] Language is auto-detected — no manual configuration needed
- [ ] Works with 2-5 speakers (pair + facilitator + observers)
- [x] Transcript visible in session history UI alongside existing round data
- [x] Transcript is collapsible/expandable (doesn't overwhelm the session history view)
- [x] Only session participants (creator + joiner who were in the session) can see transcripts — existing "Session recorded for AI Insights" banner and join-time consent already cover user expectations
- [ ] Any participant can delete the session transcript (revocable — deletes for everyone)
- [x] Private sessions (`?insights=off`) produce no transcript (no audio = no transcript)
- [x] Transcript sharing with non-participants is a future feature (C3 retainer) — P495 RLS should be designed to support per-user grants later
- [x] Failed transcriptions are visible (not silently lost) and retryable
- [ ] Processing completes within 15 minutes for a 60-minute session
- [ ] Works with single-phone recordings (all speakers on one device) and two-phone recordings

---

## Phase 2: Transcription Pipeline

Cloud Run service that processes session audio into speaker-attributed transcripts. Picks up `pending` jobs from `transcription_jobs`, downloads audio + events from GCS, runs Whisper + pyannote, and writes results to `session_transcripts` + `user_voice_profiles`.

### Service Location

`services/transcribe/` in the monorepo root. Self-contained Python project — no dependency on the TypeScript app code.

### Files to Create

| File | Description |
|------|-------------|
| `services/transcribe/Dockerfile` | Python 3.11, ffmpeg, torch, whisper (large-v3-turbo via MLX/transformers), pyannote-audio, google-cloud-storage. GPU-capable base image (`nvidia/cuda:12.1-runtime`). Multi-stage build: deps first (cached), app code second. |
| `services/transcribe/requirements.txt` | Pinned deps: `openai-whisper`, `pyannote.audio==3.1.*`, `torch`, `google-cloud-storage`, `supabase-py`, `numpy`, `ffmpeg-python`, `scipy` |
| `services/transcribe/main.py` | FastAPI app with two endpoints: `POST /transcribe` (single job by session_code) and `POST /poll` (Cloud Scheduler entry — queries pending jobs, processes one at a time) |
| `services/transcribe/pipeline.py` | Core orchestration: `transcribe_session(session_code, session_id)` — download, decode, transcribe, diarize, merge, map speakers, store. Each step is a function; failures update `transcription_jobs.status = 'failed'` with `error_message`. |
| `services/transcribe/audio.py` | Audio handling: `download_chunks(bucket, session_code)` → list + download `{user}_chunk_NNN.webm` per recorder. `concat_and_decode(chunks)` → cat raw bytes (only chunk_000 has WebM headers), ffmpeg decode to 16kHz mono WAV. Returns one WAV per recorder + a merged WAV for single-phone sessions. |
| `services/transcribe/transcriber.py` | Whisper wrapper: `whisper_transcribe(wav_path)` → list of `Segment(text, start_ms, end_ms)`. Uses `--condition-on-previous-text False` to prevent hallucination loops. Auto-detects language (returns detected language code). |
| `services/transcribe/diarizer.py` | pyannote wrapper: `diarize(wav_path, num_speakers)` → list of `DiarSegment(speaker_id, start_ms, end_ms)`. Requires `HF_TOKEN` env var for gated model access. |
| `services/transcribe/merger.py` | Overlap-based alignment: merges Whisper transcript segments with pyannote diarization segments. Each output segment gets `{ speaker_id, text, start_ms, end_ms }`. Handles edge cases: speaker change mid-sentence (split at word boundary), silence gaps, overlapping speech. |
| `services/transcribe/speaker_map.py` | Speaker-to-user mapping (two layers). **Layer 1 (metadata):** chunk filenames reveal recorder identity (`slava_chunk_000.webm` → Slava's phone). For two-phone sessions, volume cross-reference: recorder's phone captures them louder → map diarization labels. For single-phone: map using `events.json` participant list + order heuristics. **Layer 2 (voice profiles):** extract 512-dim pyannote embeddings per speaker, cosine similarity against `user_voice_profiles`. Confidence threshold: 0.75. Override metadata mapping when voice match is confident. |
| `services/transcribe/round_splitter.py` | Splits full-session segments into per-round segments using `events.json` timestamps. Reads `live_round_started` and `live_round_ended` events, maps each segment to its round by `start_ms`. Returns dict of `{ round_index: [segments] }`. |
| `services/transcribe/storage.py` | Supabase writes via service role key: `store_transcript(session_id, segments, speaker_map, language, model_version, processing_time_ms)` → INSERT into `session_transcripts`. `update_voice_profiles(speaker_map, embeddings)` → UPSERT into `user_voice_profiles` (running average of embeddings, increment `session_count`). `update_job_status(job_id, status, error_message?)` → UPDATE `transcription_jobs`. |
| `services/transcribe/config.py` | Environment config: `GCS_BUCKET` (default: `claritypledge-ml-training`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `HF_TOKEN`, `WHISPER_MODEL` (default: `large-v3-turbo`), `GPU_ENABLED` (auto-detect torch.cuda). |
| `services/transcribe/tests/test_pipeline.py` | Integration test: mock GCS + mock Supabase, feed real short WAV (5s, 2 speakers), verify full pipeline produces correct segment structure. |
| `services/transcribe/tests/test_merger.py` | Unit tests for overlap-based alignment edge cases: speaker change mid-word, silence gaps, 3+ speakers. |
| `services/transcribe/tests/test_round_splitter.py` | Unit tests: events.json with 3 rounds, verify segments split correctly at round boundaries. |
| `services/transcribe/.dockerignore` | Exclude `tests/`, `__pycache__/`, `.venv/`, `*.pyc` |

### Build Sequence

1. **Create `services/transcribe/` directory structure** — all files listed above
2. **Implement `audio.py`** — GCS download + WebM concat + ffmpeg decode. Test locally with benchmark session `h44q9h` audio.
3. **Implement `transcriber.py` + `diarizer.py`** — Whisper and pyannote wrappers. Verify output format matches merger expectations.
4. **Implement `merger.py`** — overlap-based alignment. Unit test with synthetic segments before real audio.
5. **Implement `speaker_map.py`** — Layer 1 (metadata) first, Layer 2 (voice embeddings) second. Layer 2 needs pyannote embedding extraction (`model.get_embedding()`).
6. **Implement `round_splitter.py`** — depends on `events.json` structure (see Contract below).
7. **Implement `storage.py`** — Supabase writes. Test against test project (`gfjctyxqlwexxwsmkakq`).
8. **Implement `pipeline.py`** — orchestrate all steps. Error handling: catch per-step, update job status on failure, continue to next job.
9. **Implement `main.py`** — FastAPI endpoints. `/poll` queries `transcription_jobs WHERE status = 'pending' ORDER BY created_at LIMIT 1`, processes sequentially.
10. **Build + test Docker image locally** — `docker build -t transcribe . && docker run -p 8080:8080 transcribe`
11. **Deploy to Cloud Run** — see Deployment section below.
12. **End-to-end test** — process benchmark session `h44q9h` through deployed service.

### Contract

**Reads:**

| Source | Path / Query | Format |
|--------|-------------|--------|
| GCS audio | `gs://claritypledge-ml-training/sessions/{code}/{userName}_chunk_{NNN}.webm` | WebM (only chunk_000 has headers; subsequent chunks are raw continuation bytes — must `cat` in order before ffmpeg decode) |
| GCS events | `gs://claritypledge-ml-training/sessions/{code}/{userName}_events_{NNN}.json` | JSON: `MLTrainingEvents` — contains `participants[].name`, `participants[].role`, `uploader.supabaseUserId`, `events[]` with `type` + `timestamp` (ms relative to `sessionStartedAt`) |
| Supabase | `transcription_jobs WHERE status = 'pending' ORDER BY created_at LIMIT 1` | Row: `{ id, session_code, session_id, status, created_at }` |
| Supabase | `user_voice_profiles WHERE user_id IN (...)` | Rows: `{ user_id, display_name, embedding (VECTOR 512) }` — for cosine similarity matching |

**Writes:**

| Target | Table / Action | Data |
|--------|---------------|------|
| `session_transcripts` | INSERT | `{ session_id, session_code, language, segments (JSONB), speaker_map (JSONB), model_version, processing_time_ms }` |
| `user_voice_profiles` | UPSERT (on `user_id`) | `{ user_id, display_name, embedding (running average), session_count (increment), last_session_id }` |
| `transcription_jobs` | UPDATE | `status → 'processing'` at start, `status → 'completed' + completed_at` on success, `status → 'failed' + error_message` on failure |

**Segment JSONB format** (stored in `session_transcripts.segments`):
```json
[
  {
    "speaker_id": "SPEAKER_00",
    "speaker_label": "Slava",
    "text": "So let me explain back what I heard you say...",
    "start_ms": 45200,
    "end_ms": 52800,
    "round_index": 1
  }
]
```

**Speaker map JSONB format** (stored in `session_transcripts.speaker_map`):
```json
{
  "SPEAKER_00": {
    "user_id": "uuid-or-null",
    "display_name": "Slava",
    "mapping_method": "voice_profile",
    "confidence": 0.92
  },
  "SPEAKER_01": {
    "user_id": null,
    "display_name": "Jan",
    "mapping_method": "metadata",
    "confidence": 0.7
  }
}
```

### Local Development

**CPU-mode Whisper (no GPU required):**
```bash
cd services/transcribe
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt  # installs CPU torch by default
GPU_ENABLED=false python main.py  # starts on port 8080
```
CPU mode uses the same Whisper model but runs ~3-4x slower (15-20 min for a 60-min session vs 5 min on GPU). Acceptable for local testing.

**Mock pyannote (for fast iteration without HuggingFace token):**
Set `MOCK_DIARIZATION=true` — `diarizer.py` returns synthetic diarization segments (alternating speakers every 10s) instead of running the real model. Useful for testing merger, round splitter, and storage without waiting for diarization.

**Test with benchmark session:**
```bash
# Download benchmark audio locally (requires gcloud auth)
gsutil cp -r gs://claritypledge-ml-training/sessions/h44q9h/ /tmp/test-audio/

# Run pipeline against local files
MOCK_GCS=true LOCAL_AUDIO_PATH=/tmp/test-audio/h44q9h \
  python -c "from pipeline import transcribe_session; transcribe_session('h44q9h', 'test-session-id')"
```

**Run tests:**
```bash
cd services/transcribe
pytest tests/ -v  # no GPU, no HF token, no GCS needed — all mocked
```

### Deployment

**Cloud Run service:**
```bash
# Build and push container
gcloud builds submit --tag gcr.io/gen-lang-client-0869694595/transcribe-session services/transcribe/

# Deploy with L4 GPU, scale-to-zero
gcloud run deploy transcribe-session \
  --image gcr.io/gen-lang-client-0869694595/transcribe-session \
  --region us-central1 \
  --gpu 1 --gpu-type nvidia-l4 \
  --cpu 4 --memory 16Gi \
  --timeout 900 \
  --min-instances 0 --max-instances 2 \
  --no-allow-unauthenticated \
  --set-env-vars "GCS_BUCKET=claritypledge-ml-training,SUPABASE_URL=<prod-url>,WHISPER_MODEL=large-v3-turbo" \
  --set-secrets "SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest,HF_TOKEN=hf-token:latest"
```

**Cloud Scheduler (polls for pending jobs every 5 min):**
```bash
gcloud scheduler jobs create http transcription-poll \
  --location us-central1 \
  --schedule "*/5 * * * *" \
  --uri "https://transcribe-session-<hash>.run.app/poll" \
  --http-method POST \
  --oidc-service-account-email <service-account>@gen-lang-client-0869694595.iam.gserviceaccount.com \
  --oidc-token-audience "https://transcribe-session-<hash>.run.app"
```

**Secrets (in GCP Secret Manager):**
- `supabase-service-role-key` — prod Supabase service role key (bypasses RLS for writes)
- `hf-token` — HuggingFace token for pyannote gated model access

**IAM:**
- Cloud Run service account needs `roles/storage.objectViewer` on `claritypledge-ml-training` bucket
- Cloud Scheduler service account needs `roles/run.invoker` on the Cloud Run service

**Cost estimate:** ~$0.11-0.17 per session-hour of audio (L4 GPU at $0.67/hr, 5-8 min processing per hr). Scale-to-zero means no cost when idle. Covered by $25k GCP credits.

---

## Pre-deploy Checklist

### Phase 1 (UI + DB) — already built
- [x] Run database migration (`20260313120000_p495_transcription_tables.sql` — 3 new tables + RLS + triggers)
- [x] Client-side `createTranscriptionJob()` call in `stopAndUploadRecording()`
- [x] Transcript viewer UI in session history
- [x] Retry button for failed transcriptions

### Phase 2 (Pipeline) — secrets to provision
- [ ] `HF_TOKEN` — HuggingFace token for pyannote gated models → GCP Secret Manager
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — prod service role key → GCP Secret Manager
- [ ] Cloud Run service account with `roles/storage.objectViewer` on `claritypledge-ml-training`
- [ ] Cloud Scheduler service account with `roles/run.invoker` on the transcription service

### Phase 2 — deploy commands
- [ ] `gcloud builds submit` — build + push container image
- [ ] `gcloud run deploy transcribe-session` — deploy Cloud Run service with L4 GPU
- [ ] `gcloud scheduler jobs create http transcription-poll` — create 5-min polling schedule
- [ ] Verify service is accessible: `curl -X POST https://<service-url>/poll` (with auth)

### Phase 2 — post-deploy verification
- [ ] Process benchmark session (h44q9h) through full pipeline
- [ ] Verify transcript appears in session history UI with correct speaker labels
- [ ] Verify round-level splitting matches actual round transitions
- [ ] Check voice profile created for known user (Slava)
- [ ] Process a second session — verify voice profile matching works
- [ ] Check Sentry for errors in first 24 hours
- [ ] Verify scale-to-zero: no running instances after idle period

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
