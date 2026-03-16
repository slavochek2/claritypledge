---
status: done
type: story
rank: 125002.875
tags:
  - transcription
  - live
  - diarization
  - c3
prepped_date: '2026-03-12'
completed_at: '2026-03-16'
flow: dev
delivery_stage: uat
reviews:
  ux: null
  architect: null
  alignment: null
created_date: 2026-03-12T00:00:00.000Z
uat_file: features/uat/p495.md
test_files:
  - e2e/integration/p495-transcription-migration.spec.ts
  - e2e/p495-transcription.spec.ts
  - e2e/a11y/p495-accessibility.spec.ts
  - e2e/p495-smoke.spec.ts
locked_at: '2026-03-15T08:05:20.374Z'
---

# P495: Automatic Live Session Transcription with Speaker Labels

## Problem Statement

**Current state:** /live sessions record audio to GCS (`gs://claritypledge-ml-training/sessions/{code}/`) as chunked webm files. Audio exists but is never transcribed. Users see session history with ratings and content snapshots, but no record of what was actually said.

**Pain points:**
- Slava must manually transcribe recordings for coaching prep (C3 retainer model requires "review meeting transcripts, identify divergence with AI")
- Users can't review what they or their partner said during a session — only ratings and content titles remain
- Mirror agents (future) need reliable speaker-attributed text to draft stories/points on behalf of users — wrong attribution means wrong content filed under the wrong person
- Multi-language sessions produce audio that nobody will manually transcribe

**Who's affected:**
- Slava (facilitator/coach): needs transcripts for retainer prep
- Session participants: want to review what was discussed
- Future mirror agents: need speaker-attributed text

---

## Intention (Why This Matters)

**Strategic importance:** Transcription is the foundation of C3 paid product ("Fractional Clarity Officer"). Without automatic transcripts, retainer model requires manual transcription — limiting capacity to 2-3 pairs instead of 7.

**Why now:** First real facilitated session happened. Audio infrastructure (P28.1) proven. Benchmark confirmed Whisper + pyannote produces excellent transcripts. Review mode already promises transcripts ("Transcript will be available in a future update").

**Impact if not solved:** Each 60-min session takes 2-3 hours to manually transcribe. At 7 retainer pairs x 4 sessions/month = 56-84 hours/month. Automatic transcription reduces to review-only (~7 hours/month).

---

## Business Requirements

**Must-haves:**
- Automatic transcription of every /live session after it ends — no manual trigger
- Speaker diarization with labels mapped to participant names via session metadata + voice profiles
- Voice enrollment: extract and store pyannote speaker embeddings per user, building voice profiles automatically from confirmed sessions — enables reliable speaker identification across sessions and for 3+ speaker scenarios
- Session-level transcript (full session)
- Multi-language support with automatic language detection
- Support for 2-5 speakers
- Transcripts accessible to session participants via /sessions UI
- Silence detection and trimming: use pyannote VAD to detect trailing silence (forgotten-to-close sessions) and skip silent regions — saves GPU cost and processing time
- Processing within 15 minutes of session end

**Success conditions:**
- Every recorded session produces a transcript within 15 minutes
- Speaker attribution correct for ≥95% of segments (two-phone sessions with voice profiles; ≥90% for single-phone cold-start)
- Users can read and copy transcripts from session history

**Constraints:**
- Audio in GCS as chunked webm (only chunk_000 has headers)
- Must run server-side
- Processing costs covered by $25k GCP credits
- Private sessions (`?insights=off`) produce no transcript
- Existing "Session recorded for AI Insights" banner + join consent cover user expectations

---

## User Stories

**As a facilitator preparing for a retainer session:**
- I want automatic transcripts of every facilitated session, so I can review without manually transcribing — accessed via `/pull-transcripts` skill (separate from this spec), not through the participant UI
- I want speaker labels on each segment, so I can see who said what

**As a session participant reviewing my session:**
- I want to read what was said during the session, so I can reflect on communication patterns
- I want to copy the full transcript, so I can paste it into my notes or share with my co-founder
- I want speaker labels using real names, so the transcript is immediately readable

**As a mirror agent drafting content on behalf of users:**
- I want reliable speaker attribution, so I can draft stories/points for the correct user — wrong attribution means wrong content under the wrong person's name

**As the system processing recordings:**
- I want transcription to start automatically after audio upload
- I want failed transcriptions to be retryable
- I want voice profiles to build automatically from confirmed speaker mappings, so attribution improves with each session

---

## Jobs to Be Done

**When a facilitated session ends:**
- I want the transcript ready by next morning for coaching prep (motivation: efficient retainer delivery)

**When reviewing a session where calibration scores diverged:**
- I want to read what each person actually said (motivation: learning from specific moments)

**When mirror agents need to draft content for a specific user:**
- I want speaker attribution reliable enough to automate content creation (motivation: wrong attribution = wrong stories filed under wrong person = trust damage)

---

## Outcomes (Success Metrics)

**Capacity:** Per-session prep 2-3 hours → 15 minutes. Enable 7 concurrent retainer pairs.

**Quality:** ≥95% speaker attribution accuracy for two-phone sessions with voice profiles (≥90% single-phone cold-start). Voice profiles built automatically — improve with each session. (Multi-language works out of the box — Whisper auto-detects, pyannote is language-agnostic.)

**Reliability:** 100% of recorded sessions produce transcripts. Failed jobs visible and retryable. Processing ≤15 min for ≤60 min sessions.

**Engagement:** Track `transcript_viewed` and `transcript_copied` via Mixpanel.

---

## UI (from conversation)

**Session Detail view** (`/sessions` → tap session) — new row below round list:

```
│ 📄 Transcript    [📋 Copy]  [Open] │   ← when ready
│ 📄 Transcript          processing...│   ← when pending
```

- **Copy** — copies full transcript to clipboard, no navigation
- **Open** — navigates to full-page transcript view (new View 4 in the existing list→session→round stack)

**Transcript View** (View 4):

```
┌─────────────────────────────────────┐
│ ← Transcript              [📋 Copy]│
├─────────────────────────────────────┤
│ Gosh  0:42  "I think we should..." │
│ Slava 1:15  "So what you're..."    │
│ Gosh  1:38  "Not abandon —..."     │
│ ...            (native page scroll) │
└─────────────────────────────────────┘
```

Speaker name + timestamp + text. Native scroll. Copy in header.

---

## Acceptance Criteria

- [x] Every /live session with audio recording automatically produces a transcript
- [x] Transcript includes speaker-labeled segments with timestamps
- [ ] Speaker labels use participant display names (from session metadata), not generic "Speaker 0/1"
- [x] Session-level transcript available (full session, all rounds)
- [ ] Round-level transcripts available (one per completed round)
- [x] Language auto-detected
- [ ] Works with 2-5 speakers (pair + facilitator + observers)
- [x] Transcript visible in session history UI alongside existing round data
- [x] Transcript is collapsible/expandable (doesn't overwhelm the session history view)
- [x] Only session participants can see transcripts
- [x] Private sessions produce no transcript
- [x] Failed transcriptions visible and retryable
- [ ] Processing ≤15 minutes for 60-minute session
- [ ] Works with single-phone and two-phone recordings

---

## Explicitly NOT in scope

- Per-round transcript splitting (future — data supports it via events.json timestamps)
- Audio playback or download
- Transcript deletion
- Transcript sharing with non-participants (C3 retainer concern)
- AI summary of transcript (Gemini is configured but summary is a follow-up)
- Inline audio player
- Facilitator dashboard / `/pull-transcripts` skill (Slava's retainer prep — queries transcripts with service role, can merge events.json for enriched coaching view. Separate spec.)
- Event annotations in transcript (interleaving UI events like ratings/button clicks into transcript timeline — achievable at query time in `/pull-transcripts`, not stored in transcript)

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
- [x] `HF_TOKEN` — HuggingFace token for pyannote gated models → GCP Secret Manager
- [x] `SUPABASE_SERVICE_ROLE_KEY` — prod service role key → GCP Secret Manager (version 3)
- [x] Cloud Run service account with `roles/storage.objectViewer` on `claritypledge-ml-training`
- [x] Cloud Scheduler service account with `roles/run.invoker` on the transcription service

### Phase 2 — deploy commands
- [ ] `gcloud builds submit` — build + push container image
- [ ] `gcloud run deploy transcribe-session` — deploy Cloud Run service with L4 GPU
- [ ] `gcloud scheduler jobs create http transcription-poll` — create 5-min polling schedule
- [ ] Verify service is accessible: `curl -X POST https://<service-url>/poll` (with auth)

### Phase 2 — post-deploy verification
- [ ] Process benchmark session (h44q9h) through full pipeline
- [x] Verify transcript appears in session history UI (tested with session 2D59JB)
- [ ] Verify speaker labels use display names
- [ ] Check Sentry for errors in first 24 hours
- [ ] Verify scale-to-zero: no running instances after idle period

---

## Next Steps

1. Run `/ux` — formalize transcript view design
2. Run `/architect` — Cloud Run, DB schema, trigger, RLS
3. Run `/generate-tests` → `/spec-review` → `/dev`

---

## References

- Plan: `~/.claude/plans/compiled-singing-nova.md`
- P28.1: Audio + Event Data Capture (predecessor)
- C3: `docs/milestones/c3-paid-workshops.md`
- ML training: `docs/archive/ml-training-setup.md`

---

## UX Design

### Lean Challenge

**No violations found.** The feature has zero onboarding friction (transcription is automatic, no user action required), serves immediate business need (facilitator prep), and the UI surfaces only when data exists. Voice enrollment builds passively from confirmed sessions -- no enrollment flow needed. Scope is appropriately minimal: read-only transcript display with copy.

---

### 1. User Flow

#### Flow A: Participant views transcript from session detail

```
Entry: /sessions → tap session card → Session Detail view (existing View 2)
  ↓
  User sees round list (existing) + new Transcript row at bottom
  ↓
  Decision: Transcript status?
    ├─ "processing" → Row shows "Transcript processing..." (no actions)
    ├─ "failed" → Row shows "Transcript failed" + [Retry] button
    │    └─ User taps [Retry] → spinner on button → success: row updates to ready / failure: toast error
    ├─ "ready" → Row shows "Transcript" + [Copy] + [Open]
    │    ├─ User taps [Copy] → full text copied to clipboard → brief toast "Copied to clipboard"
    │    └─ User taps [Open] → navigates to Transcript View (new View 4)
    └─ no transcript (private session or no audio) → no row shown
```

#### Flow B: Participant reads full transcript

```
Entry: Session Detail → tap [Open] on Transcript row
  ↓
  Transcript View (View 4) loads
    - Header: ← back arrow + "Transcript" + [Copy] button
    - Body: scrollable list of segments
      Each segment: Speaker name | Timestamp | Spoken text
  ↓
  User scrolls through (native page scroll, no virtual scroll)
  ↓
  User taps [Copy] in header → full transcript copied → toast "Copied to clipboard"
  ↓
  User taps ← → returns to Session Detail (View 2)
```

#### Flow C: Private session -- no transcript

```
Entry: /sessions → tap private session card → Session Detail
  ↓
  No Transcript row visible (session had ?insights=off)
  Exit: User sees rounds only, same as current behavior
```

#### Flow D: Failed transcription retry

```
Entry: Session Detail → Transcript row shows "Transcript failed"
  ↓
  User taps [Retry]
    ↓
    Button shows spinner, text becomes "Retrying..."
    ↓
    Decision: Retry result?
      ├─ Success → Row transitions to "processing" state
      │    (next page load or poll will show "ready" when complete)
      └─ Failure → Toast: "Couldn't retry. Please try again later."
           Row stays in "failed" state
```

---

### 2. Screen Designs

#### 2a. Session Detail — Transcript Row (added below round list)

```
┌─────────────────────────────────────────────┐
│  ✓ Round 1 — "The pivot conversation"    >  │  ← existing
│  ✓ Round 2 — "Revenue model"             >  │  ← existing
│  ✗ Round 3 (Skipped)                        │  ← existing
├─────────────────────────────────────────────┤
│  📄 Transcript                 [Copy] [Open]│  ← NEW: ready state
└─────────────────────────────────────────────┘
```

**States of the Transcript row:**

| State | Left content | Right content |
|-------|-------------|---------------|
| Ready | 📄 icon + "Transcript" | [Copy] ghost button + [Open] ghost button |
| Processing | 📄 icon + "Transcript" | Spinner + "processing..." (muted text) |
| Failed | 📄 icon + "Transcript failed" (destructive text) | [Retry] ghost button |
| No transcript | Row not rendered | — |

- The row is visually separated from the round list by a top border (subtle divider)
- Icon uses `FileText` from lucide (matches existing icon usage)
- [Copy] and [Open] are ghost-style buttons (text + icon, no background) matching existing button patterns
- Row has the same horizontal padding as round rows (px-4)

#### 2b. Transcript View (View 4 — full page)

```
┌─────────────────────────────────────────────┐
│  ← Transcript                        [Copy] │  ← header
├─────────────────────────────────────────────┤
│                                             │
│  Slava    0:42                              │
│  I think we should focus on the core        │
│  metric first before expanding.             │
│                                             │
│  Gosh     1:15                              │
│  So what you're saying is we should         │
│  narrow down to one KPI?                    │
│                                             │
│  Slava    1:38                              │
│  Not abandon the others — just lead         │
│  with retention as the north star.          │
│                                             │
│  Speaker 3   2:04                           │
│  That makes sense from an investor          │
│  perspective too.                           │
│                                             │
│               (native scroll)               │
└─────────────────────────────────────────────┘
```

**Segment layout:**
- Each segment is a block with no card border (clean reading experience)
- **Speaker name**: bold, `text-sm font-semibold text-foreground`
- **Timestamp**: inline after name, `text-xs text-muted-foreground`, separated by a gap
- **Text**: below name+timestamp line, `text-sm text-foreground`, normal weight
- Segments separated by `mb-4` (consistent spacing)
- Unknown speakers labeled "Speaker 3", "Speaker 4", etc. in the same style

**Header:**
- Back arrow (ChevronLeft) + "Transcript" title (text-lg font-bold) — same pattern as existing view stack headers
- [Copy] button in top-right: ghost button with clipboard icon, same style as session detail copy button

**Copy button feedback:**
- Default: clipboard icon + "Copy"
- After tap: checkmark icon + "Copied" for 2 seconds, then reverts
- Uses existing `copyToClipboard()` utility from `lib/utils.ts`

**Copy format (plain text):**
```
Slava [0:42]: I think we should focus on the core metric first before expanding.
Gosh [1:15]: So what you're saying is we should narrow down to one KPI?
Slava [1:38]: Not abandon the others — just lead with retention as the north star.
```

---

### 3. Edge Cases

**Loading states:**
- Session Detail fetch already has loading/error/empty states (existing)
- Transcript row only appears after session data loads — no independent loading state needed
- Transcript View: if entered via [Open] and data is already in memory from session detail, render immediately. If direct URL access is supported in future, show a skeleton (3 text blocks with animated pulse)

**Error states:**
- Transcript fetch failure within session detail: transcript row shows "failed" state with [Retry]
- Copy failure (rare — clipboard API denied): toast "Couldn't copy. Try selecting the text manually."
- Retry API failure: toast "Couldn't retry. Please try again later." — row stays in failed state

**Empty states:**
- No transcript exists (private session): row not rendered — no "empty" message needed
- Transcript exists but has zero segments (edge case — audio was silence): show row in ready state, Transcript View shows "No speech was detected in this recording." centered in muted text

**Validation:**
- No user input in this feature — no validation needed
- Copy button is only enabled when transcript data is present

**Timing edge cases:**
- User opens session detail while transcription is still processing: row shows "processing..." — on next page visit (or background poll), it updates
- User opens Transcript View, then transcript gets updated server-side: stale until next page load (acceptable — transcripts are immutable once generated)

---

### 4. Accessibility

**Screen reader support:**
- Transcript row: `aria-label="Session transcript, status: ready"` (or "processing" / "failed")
- Copy button: `aria-label="Copy transcript to clipboard"`
- Open button: `aria-label="Open full transcript"`
- Retry button: `aria-label="Retry transcript processing"`
- Copy success: `aria-live="polite"` region announces "Transcript copied to clipboard"
- Transcript View segments: each segment is a `<div>` with implicit content structure (speaker name as inline heading weight, text as paragraph). Wrap in `<article>` with `aria-label="Transcript segment by {speaker}"` for screen reader navigation
- Processing state: `aria-busy="true"` on the transcript row

**Keyboard navigation:**
- Tab order in Session Detail: round rows → transcript row buttons (Copy, Open or Retry)
- Tab order in Transcript View: back button → Copy button → transcript content (scrollable region)
- Enter/Space activates all buttons
- Escape in Transcript View: returns to Session Detail (same as back button)

**Color contrast:**
- "processing..." text uses `text-muted-foreground` — verify against background meets 4.5:1
- "Transcript failed" uses `text-destructive` — already WCAG AA compliant in the design system
- Speaker names (foreground on background): inherits existing compliant contrast
- Timestamps (muted-foreground): meets 4.5:1 for small text per existing design system

**Focus indicators:**
- All interactive elements use existing `focus-visible:ring-2 focus-visible:ring-ring` pattern
- Back button in Transcript View uses same focus style as other back buttons in the view stack

---

### 5. Responsive Design

**Mobile (320px-767px) — primary target:**
- Transcript row: full width, Copy and Open buttons side by side (both compact: icon + short label)
- Transcript View: full width, segments stack vertically with comfortable reading width
- Speaker name + timestamp on one line, text wraps naturally below
- Touch targets: all buttons minimum 44x44px tap area
- Copy button in header: icon-only on mobile (clipboard icon, no "Copy" text) to save space
- Native scroll — no custom scrollbar

**Tablet (768px-1023px):**
- Same layout as mobile — transcript is a reading view, no multi-column benefit
- Slightly larger padding (px-6 vs px-4)
- Copy button in header shows icon + "Copy" text

**Desktop (1024px+):**
- Constrained to `max-w-2xl` (matches existing session page container)
- Same single-column layout — transcript reading benefits from constrained width
- Copy button shows icon + "Copy" text
- Hover states on all buttons (bg-muted/50 on hover, matching existing patterns)

**Breakpoint changes:**
- < 768px: icon-only Copy in header, px-4 padding
- >= 768px: icon + text Copy in header, px-6 padding
- No layout structure changes between breakpoints (intentional — reading content is best single-column)

---

### 6. Component Analysis

| Element | Classification | File / Notes | Decision needed? |
|---------|---------------|--------------|-----------------|
| Session Detail page (view stack) | **Reuse** | `src/app/pages/my-sessions-page.tsx` — add `'transcript'` to `SessionView` union type | No |
| Round row | **Reuse** | `src/app/pages/my-sessions-page.tsx` `RoundRow` — no changes | No |
| Session list | **Reuse** | `src/app/components/sessions/session-list.tsx` — no changes | No |
| Transcript row (in session detail) | **New** | `TranscriptRow` — renders the status-aware row below round list. Props: `status`, `onCopy`, `onOpen`, `onRetry`. Inline in `my-sessions-page.tsx` or extracted to `src/app/components/sessions/transcript-row.tsx` | Where to place: inline in page (simpler) or separate file (reusable)? |
| Transcript View (View 4) | **New** | `TranscriptView` — full-page scrollable transcript with header. Could be inline in `my-sessions-page.tsx` (following existing pattern where all views are in the page file) or a separate component | Same decision as above — follow existing pattern (inline) |
| Copy button with feedback | **Extend** | `copyToClipboard()` in `src/lib/utils.ts` exists. Need a small wrapper component or inline state for icon swap (clipboard -> checkmark -> clipboard). Pattern already used in `src/app/components/feed/feed-story-card.tsx` | No |
| Toast notifications | **Reuse** | `src/components/ui/sonner.tsx` (Sonner toast) — already in use across the app | No |
| Back button in header | **Reuse** | Existing pattern in `my-sessions-page.tsx` (ChevronLeft button with same styling) | No |
| Skeleton loading (if needed) | **Reuse** | `SessionSkeleton` pattern in `session-list.tsx` — same animated pulse approach | No |
| "Transcript will be available" placeholder | **Remove** | `src/app/components/partners/review-mode-view.tsx` line 141 — this placeholder text should be removed or updated once real transcripts exist | Yes — remove placeholder now, or update text to link to the transcript? |
| `SessionSummary` type | **Extend** | `src/app/data/sessions-service.ts` — needs new field for transcript status (`transcript_status?: 'processing' | 'ready' | 'failed' | null`) and transcript data | No |
| `SessionView` union type | **Extend** | `src/app/pages/my-sessions-page.tsx` line 17 — add `| { type: 'transcript'; session: SessionSummary }` | No |

**Decisions for founder:**

1. **Transcript components: inline in page or separate files?** The existing pattern puts `RoundRow` inline in `my-sessions-page.tsx`. TranscriptRow is similarly simple. TranscriptView is larger but follows the same view-stack pattern. Recommendation: keep both inline (follow existing pattern) unless the page file grows past ~300 lines, then extract.

2. **Review mode placeholder (line 141 of review-mode-view.tsx):** Currently says "Transcript will be available in a future update." Options: (a) remove the text entirely now, (b) replace with a link to the transcript in session detail, (c) leave as-is and update in a follow-up. Recommendation: (b) replace with contextual link when transcript is available for that session.

---

## Technical Architecture

### Technical Analysis

**Current code state:**

1. **Session history page** (`src/app/pages/my-sessions-page.tsx`, ~200 lines): View stack with three states: `list | session | round`. Uses `SessionView` discriminated union. `RoundRow` is inline. Page fetches sessions via `getUserSessions()` and holds them in state. The session detail view renders a `<ul>` of rounds — the transcript row will be appended after this list.

2. **Session data** (`src/app/data/sessions-service.ts`): `SessionSummary` has `id`, `partnerName`, `roundCount`, `date`, `sessionHistory[]`. Fetches from `clarity_sessions` table using `creator_profile_id`/`joiner_profile_id` match. Does NOT currently know about transcripts — no join to any transcript table.

3. **Audio upload pipeline** (`clarity-live-page.tsx` → `api.ts`): `stopAndUploadRecording()` uploads events.json to GCS via `uploadSessionRecording()`. Audio chunks uploaded in 30s intervals via `uploadAudioChunk()`. Private sessions (`is_private = true`) skip recording entirely. The transcription trigger point is AFTER this upload completes.

4. **Events.json structure** (`src/lib/session-events-collector.ts`): `MLTrainingEvents` contains `participants[{name, role}]`, `uploader.supabaseUserId`, `sessionCode`, timestamped events. This metadata is critical for speaker-to-user mapping in the transcription pipeline.

5. **Review mode placeholder** (`src/app/components/partners/review-mode-view.tsx`, line 141): Shows "Transcript will be available in a future update." — to be replaced with link to real transcript.

6. **Existing types** (`src/app/types/index.ts`): No transcript-related types exist. `SessionHistoryItem` and `LiveSessionState` are well-established patterns to follow. The `LiveTurn.transcript` field is unrelated — it's a per-turn text field, not session audio transcription.

7. **Database**: `clarity_sessions` has `is_private`, `creator_profile_id`, `joiner_profile_id`, `code`, `live_state` (JSONB). No transcript tables exist. No `pgvector` extension enabled yet (needed for voice embeddings). Migration pattern uses `YYYYMMDDHHMMSS` timestamps.

8. **Supabase RLS**: Strict participant-only access pattern established. Sessions readable by participants via profile_id match. New transcript tables must follow the same pattern.

**Dependencies:**
- GCP Cloud Run (new — Python transcription service)
- GCP Cloud Scheduler (new — polling trigger)
- HuggingFace `pyannote` models (requires `HF_TOKEN`)
- Whisper model (bundled in container)
- `pgvector` Supabase extension (for voice embeddings)
- Existing GCS bucket `claritypledge-ml-training` (audio source)

---

### Architecture Decisions

#### Decision 1: Transcription Job Trigger — Client-side insert vs. GCS notification

**Chosen:** Client-side insert into `transcription_jobs` table after upload completes.

**Rationale:** The client already knows session_code, session_id, and whether the session is private. Inserting a job row from `stopAndUploadRecording()` is a single Supabase INSERT with data already in scope. No new infrastructure needed.

**Trade-off:** Relies on client completing the insert — if the browser closes before INSERT, no job is created. Acceptable because: (a) `stopAndUploadRecording` runs before navigation, (b) events.json upload already has the same reliability characteristic, (c) a manual retry mechanism exists as fallback.

**Alternative rejected:** GCS Pub/Sub notification on events.json upload → Cloud Function → insert job. More reliable but adds two infrastructure components (Pub/Sub topic + Cloud Function) for a problem that occurs rarely. Can be added later if missed jobs become an issue.

#### Decision 2: Transcript storage — JSONB in `session_transcripts` vs. separate `transcript_segments` table

**Chosen:** Single `session_transcripts` table with `segments JSONB` column containing the full segment array.

**Rationale:** Transcripts are written once and read as a whole. There's no query pattern that filters individual segments server-side. A JSONB array is simpler to insert (one row), simpler to read (one fetch), and avoids N+1 queries. Segments array for a 60-min session is ~50-200KB — well within JSONB limits.

**Trade-off:** Cannot index individual segment fields (e.g., search by speaker within SQL). Acceptable because search/filter is a future concern, and full-text search over transcripts would use a different approach (embeddings or `tsvector` on a materialized field).

**Alternative rejected:** Normalized `transcript_segments` table with one row per segment. Would enable SQL-level queries per segment but adds complexity for insert (batch insert ~500 rows) and read (join or multiple queries) with no current benefit.

#### Decision 3: Transcript fetch — Join with session query vs. separate fetch

**Chosen:** Separate fetch. `getUserSessions()` returns `SessionSummary` with a new `transcriptStatus` field (derived from a LEFT JOIN to `transcription_jobs`). Full transcript segments fetched only when user opens the transcript view via a dedicated `fetchSessionTranscript(sessionId)` call.

**Rationale:** Transcript segments are large (50-200KB per session). Loading them for all sessions in the list view is wasteful. The session list only needs to know the status (`processing | ready | failed | null`) to render the transcript row correctly. Status comes from a lightweight LEFT JOIN on `transcription_jobs`.

**Trade-off:** Two network requests to see a transcript (session list + transcript detail). Acceptable because the user explicitly navigates to the transcript view, and the fetch is fast (single row by session_id with index).

**Alternative rejected:** Embedding full transcript in `SessionSummary`. Would bloat the session list response by 10-100x for data the user may never read.

#### Decision 4: Round-level transcript splitting — V1 scope

**Chosen:** Session-level transcript only in V1. Round-level splitting deferred.

**Rationale:** The spec explicitly lists "Per-round transcript splitting" as out of scope. The data to support it exists (events.json has round timestamps), and the `session_transcripts.segments` array includes timestamps for future splitting. But the UI only shows a full session transcript, and the Cloud Run pipeline is simpler without round-alignment logic.

**Trade-off:** No per-round transcript snippets in round detail view. The `/pull-transcripts` skill can do round splitting at query time using events.json — no storage needed.

**Alternative rejected:** Building `round_transcripts` table now. Adds schema, pipeline complexity, and UI for a feature nobody has requested yet.

#### Decision 5: Voice embeddings storage — pgvector vs. JSONB array

**Chosen:** `pgvector` extension with `VECTOR(512)` column in `user_voice_profiles`.

**Rationale:** pyannote produces 512-dimensional speaker embeddings. Cosine similarity matching is the core operation. pgvector provides native `<=>` (cosine distance) operator with IVFFlat indexing. Supabase supports pgvector out of the box (`CREATE EXTENSION vector`). Storing as JSONB array would require application-level cosine similarity computation for every comparison.

**Trade-off:** Adds a Postgres extension dependency. Acceptable because pgvector is first-class on Supabase, widely used, and the alternative (JSONB + application-level math) is strictly worse for this use case.

**Alternative rejected:** JSONB array of floats + application-level cosine similarity. Slower, no indexing, more code to maintain.

#### Decision 6: Transcript view — inline in page file vs. separate component

**Chosen:** Both `TranscriptRow` and `TranscriptView` inline in `my-sessions-page.tsx`, following the existing pattern where `RoundRow` is inline.

**Rationale:** The page is currently ~200 lines. Adding `TranscriptRow` (~30 lines) and `TranscriptView` (~60 lines) brings it to ~290 lines — under the 300-line threshold mentioned in the UX component analysis. The view stack pattern (discriminated union + conditional rendering) works best when all views are co-located. If the page exceeds 300 lines during implementation, extract to `src/app/components/sessions/transcript-view.tsx`.

**Trade-off:** Larger page file. Acceptable at this size. The alternative (separate files) adds import overhead and splits the view stack logic across files for marginal benefit.

#### Decision 7: Polling for transcript readiness — No real-time subscription

**Chosen:** No polling or real-time subscription for transcript status updates. Status is fetched with the session data on page load. User sees "processing" and refreshes or returns later.

**Rationale:** Transcription takes 5-15 minutes. Users don't sit on the session detail page waiting. The processing indicator tells them it's coming. Real-time subscription (Supabase Realtime) would add complexity for a scenario where the user is almost certainly not on the page when transcription completes.

**Trade-off:** User must refresh to see the transcript after processing completes. Acceptable because: (a) 5-15 min processing time means they've left the page, (b) adding polling for a rarely-observed transition is over-engineering.

**Alternative rejected:** Supabase Realtime subscription on `transcription_jobs.status`. Adds channel management, cleanup logic, and connection overhead for a status transition the user will almost never witness in real time.

---

### Security Review

**RLS Policies:**

- ⚠️ **`session_transcripts` — participant-only SELECT.** The existing `clarity_sessions` SELECT policy is `USING (true)` — anyone can read any session. Transcripts must NOT follow this pattern. SELECT must enforce only session participants (creator or joiner) can read.
- ⚠️ **`session_transcripts` INSERT/UPDATE/DELETE — service_role only.** Cloud Run writes transcripts using the service role key. No authenticated user should be able to insert, update, or delete transcripts.
- ⚠️ **`transcription_jobs` — same pattern.** Readable by participants (for status display), writable by service_role only. **Retry: use an RPC function** that validates the caller is a participant before inserting — avoids giving users direct INSERT access.
- ⚠️ **`user_voice_profiles` — biometric data, strictest RLS.** SELECT: users can only read their own profile (`auth.uid() = user_id`). INSERT/UPDATE/DELETE: service_role only.
- ⚠️ **Private session guard at DB level.** Add a `BEFORE INSERT` trigger on `session_transcripts` that raises an exception for private sessions — don't rely solely on application code.

**Authentication:**

- ✅ **Participant check** achievable via `creator_profile_id` / `joiner_profile_id` on `clarity_sessions` + `auth.uid()`.
- ⚠️ **Anonymous joiners cannot see transcripts.** `joiner_profile_id` can be NULL for guest joiners. Correct behavior — transcripts contain PII, only authenticated participants get access.
- ⚠️ **Cloud Run → Supabase auth.** Service role key must be stored as a Cloud Run secret (not a plain env var visible in logs).

**Input Validation:**

- ✅ **No user input in transcript read path.** Read-only feature — transcript text comes from server pipeline.
- ⚠️ **Retry rate limiting.** Prevent GPU cost abuse: RPC function checks if a job for this session was created in the last N minutes.
- ⚠️ **Transcript content stored as plain text, not HTML.** Use React default text rendering to prevent XSS — never render transcript content as raw HTML.
- ⚠️ **Voice embeddings validation.** CHECK constraint on embedding column to enforce correct dimensionality (512).

**Data Protection:**

- ⚠️ **Transcripts are PII by definition.** May include names, financial figures, health info. Never log transcript content in Cloud Run or Sentry. Data retention policy needed (future spec).
- ⚠️ **Voice embeddings are biometric data — GDPR Article 9 "special category."** The existing recording banner is insufficient for biometric data. Voice profile creation needs explicit, specific consent mentioning voice identification. Right to deletion must be supported. Embeddings used only for speaker diarization within ClarityPledge, never shared or used for other identification.
- ⚠️ **`is_private` immutability.** Prevent UPDATE from flipping `is_private` from true to false after creation — a creator could trigger transcription of a session their partner expected private. Add trigger or CHECK constraint.

**Critical Items (must-address before implementation):**

1. RLS: participant-only SELECT on `session_transcripts`
2. RLS: service_role-only writes on all three new tables
3. RLS: user can only read own voice profile
4. DB-level private session guard (trigger)
5. Biometric consent for voice profiles (GDPR Art. 9)
6. Retry rate limiting via RPC
7. `is_private` immutability constraint
8. Retry mechanism: RPC function, not direct INSERT

---

### Implementation Approach

**Worktree recommended:** Feature touches Cloud Run service (new), database migration, frontend view stack, API layer, and types — 10+ files across multiple concerns.

#### Files to Create

1. **`supabase/migrations/20260313120000_p495_transcription_tables.sql`** — Creates `session_transcripts`, `transcription_jobs`, `user_voice_profiles` tables. Enables `pgvector` extension (`CREATE EXTENSION IF NOT EXISTS vector`). Adds RLS policies: transcripts readable by session participants (via JOIN to `clarity_sessions`), jobs readable by participants, all three tables writable by service role only. Adds `BEFORE INSERT` trigger on `session_transcripts` to block private sessions. Adds `retry_transcription(p_session_id UUID)` RPC function: validates caller is a participant, checks no pending/processing job exists for this session in the last 5 minutes (rate limit), then inserts a new `transcription_jobs` row with status `pending`. Adds immutability trigger on `clarity_sessions.is_private` (prevent UPDATE from true→false). Indexes on `session_id` for transcript tables. Timestamps in segments stored as seconds (number) — UI formats as `M:SS` for display.

2. **`services/transcribe/`** (Cloud Run service — separate repo concern, not built in this spec's `/dev` run):
   - `Dockerfile` — Python 3.11 + ffmpeg + whisper + pyannote + torch
   - `main.py` — HTTP POST endpoint, full pipeline
   - `requirements.txt`
   - `cloudbuild.yaml`

   *Note: The Cloud Run service is infrastructure. The `/dev` run builds the client-side UI + database + API. Cloud Run deployment is a separate task tracked in the pre-deploy checklist.*

#### Files to Modify

1. **`src/app/types/index.ts`** — Add `TranscriptSegment`, `SessionTranscript`, `TranscriptionJobStatus` types.

2. **`src/app/data/sessions-service.ts`** — Extend `SessionSummary` with `transcriptStatus?: 'pending' | 'processing' | 'completed' | 'failed' | null` and `isPrivate: boolean`. Add `is_private` to the SELECT columns in `getUserSessions()` and map to `isPrivate` in `SessionSummary`. Add `is_private` to the `SessionRow` interface. Modify the Supabase query to LEFT JOIN `transcription_jobs` on `session_id` and SELECT `status` as `transcriptStatus`. UI maps DB status `completed` → display label "ready".

3. **`src/app/data/api.ts`** — Add `fetchSessionTranscript(sessionId): Promise<SessionTranscript | null>` function that queries `session_transcripts` by `session_id`. Add `retryTranscription(sessionId): Promise<void>` that calls the `retry_transcription` RPC function (see migration). Add `createTranscriptionJob(sessionCode, sessionId): Promise<void>` for client-side job creation.

4. **`src/app/pages/my-sessions-page.tsx`** — Extend `SessionView` union with `| { type: 'transcript'; session: SessionSummary }`. Add `TranscriptRow` component (status-aware row with Copy/Open/Retry). Add `TranscriptView` component (full-page scrollable transcript). Wire transcript fetch on entering transcript view. Update `goBack` to handle transcript → session navigation. Update header for transcript view.

5. **`src/app/pages/clarity-live-page.tsx`** — In `stopAndUploadRecording()`, after successful events.json upload, insert a row into `transcription_jobs` table (only for non-private sessions). Import and call `createTranscriptionJob()`.

6. **`src/app/components/partners/review-mode-view.tsx`** — Replace line 141 placeholder text "Transcript will be available in a future update." with either a link to the session transcript (if available) or remove the text entirely.

#### Build Sequence

1. **Database migration** — Create tables, enable pgvector, add RLS policies. Run `./scripts/migrate.sh`. This is foundational — everything else depends on the schema existing.

2. **Types** — Add `TranscriptSegment`, `SessionTranscript`, `TranscriptionJobStatus` to `src/app/types/index.ts`. No runtime dependency, but TypeScript will enforce correctness in subsequent steps.

3. **API layer** — Add `fetchSessionTranscript()`, `retryTranscription()`, `createTranscriptionJob()` to `api.ts`. Extend `sessions-service.ts` to include `transcriptStatus` in `SessionSummary` via LEFT JOIN.

4. **Client trigger** — Modify `stopAndUploadRecording()` in `clarity-live-page.tsx` to call `createTranscriptionJob()` after upload. Guard with `if (!isPrivate)` — the `isPrivate` state variable is already in scope (same component, line 177).

5. **Session detail UI** — Add `TranscriptRow` to session detail view, below the round list. Wire Copy (clipboard), Open (view transition), and Retry (API call) handlers.

6. **Transcript view UI** — Add `TranscriptView` as new view in the stack. Fetch transcript on mount. Render segments with speaker labels and timestamps. Wire Copy button with feedback animation.

7. **Review mode cleanup** — Update placeholder text in `review-mode-view.tsx`.

8. **Manual testing** — Verify with existing session data by manually inserting a test transcript row. Confirm: session list shows status, transcript view renders, copy works, back navigation works, private sessions show no row.

*Cloud Run service deployment and Cloud Scheduler setup are post-merge infrastructure tasks tracked in the Pre-deploy Checklist section above.*

---

## Test Coverage Strategy

### What IS Tested and Why

**Integration tests (MANDATORY per P270 rule)** — `e2e/integration/p495-transcription-migration.spec.ts`:
- Schema existence: all three new tables (`session_transcripts`, `transcription_jobs`, `user_voice_profiles`) with required columns. **Why:** Catches the class of bug where code references a column/table that doesn't exist (P160 incident).
- RLS participant-only SELECT on `session_transcripts`: creator can read, joiner can read, non-participant blocked. **Why:** Transcripts are PII — wrong RLS means data leak.
- RLS service_role-only INSERT on `session_transcripts`: authenticated user blocked, anon blocked, admin succeeds. **Why:** Prevents users from injecting fake transcripts.
- RLS on `user_voice_profiles`: user reads only own, cannot read others', cannot INSERT. **Why:** Voice embeddings are biometric data (GDPR Art. 9).
- RLS on `transcription_jobs`: participant reads status, non-participant blocked, direct INSERT blocked. **Why:** Retry must go through RPC, not direct INSERT.
- Private session guard: BEFORE INSERT trigger blocks transcript creation for `is_private = true` sessions. **Why:** DB-level enforcement, not just application logic.

**E2E tests** — `e2e/p495-transcription.spec.ts`:
- Session detail shows transcript row with Copy/Open when ready. **Why:** Core happy path.
- Copy button puts text in clipboard with feedback. **Why:** Primary user action.
- Open navigates to transcript view with speakers, timestamps, text. **Why:** Core reading experience.
- Back button returns to session detail. **Why:** View stack navigation integrity.
- Processing state shows "processing..." indicator. **Why:** User must know transcription is in progress.
- Failed state shows Retry button. **Why:** Recovery path.
- Private session shows no transcript row. **Why:** Privacy guarantee.
- Empty transcript shows "no speech detected" message. **Why:** Edge case — silence-only recordings.

**Accessibility tests** — `e2e/a11y/p495-accessibility.spec.ts`:
- Transcript row has aria-label with status. **Why:** Screen reader must announce state.
- Copy/Open buttons have correct aria-labels. **Why:** Spec section 4 contract.
- Keyboard navigation: Tab + Enter on Copy/Open. **Why:** Not all users use a mouse.
- Escape in transcript view returns to session detail. **Why:** Spec section 4 keyboard nav contract.
- Copy success announced via aria-live region. **Why:** Clipboard action must be announced.
- Focus indicators visible. **Why:** WCAG 2.4.7 compliance.

**Smoke tests** — `e2e/p495-smoke.spec.ts`:
- Sessions list page loads without JS errors. **Why:** Regression guard — new LEFT JOIN must not break existing page.
- Session detail page loads without errors. **Why:** New TranscriptRow must not crash.
- Transcript view renders without crashing. **Why:** New View 4 stability check.

**UAT scenarios** — `features/uat/p495.md`:
- 13 manual validation scenarios covering all acceptance criteria with Given/When/Then format.

### What is NOT Tested and Why

- **Cloud Run transcription pipeline** (Whisper + pyannote + ffmpeg): runs on GCP infrastructure, not in the Playwright test environment. Testing requires GPU, HuggingFace models, and GCS access. Covered by: manual smoke test in pre-deploy checklist (process benchmark session h44q9h).
- **Whisper transcription accuracy**: model quality is not a code concern. Covered by: benchmark evaluation (separate from this spec).
- **pyannote speaker diarization quality**: ML model accuracy is not testable in E2E. Covered by: speaker attribution accuracy metric (95% target) measured on real sessions.
- **Voice profile embedding extraction and cosine similarity matching**: requires pyannote model + pgvector queries. The Cloud Run service handles this. Covered by: integration tests verify the `user_voice_profiles` table schema and RLS; actual embedding operations tested in the Python service's own test suite.
- **Cloud Scheduler polling**: infrastructure concern. Verified by: checking Cloud Scheduler logs after deployment.
- **GCS audio download and chunk concatenation**: Python service concern. Not testable from the frontend.
- **Multi-language detection**: Whisper capability, not frontend code. Tested via benchmark sessions in different languages.
- **Retry RPC function**: requires the RPC to be deployed. Integration test verifies direct INSERT is blocked; RPC behavior tested after migration.
- **Real-time transcript status updates**: intentionally not implemented (Decision 7) — no polling or Realtime subscription.

### Test Pyramid Breakdown

```
         /\
        /  \  UAT (13 manual scenarios)
       /    \
      /──────\  E2E (9 tests) — user flows, view transitions
     /        \
    /──────────\  A11y (7 tests) — ARIA, keyboard, focus
   /            \
  /──────────────\  Smoke (3 tests) — page stability
 /                \
/──────────────────\  Integration (16 tests) — schema, RLS, triggers
```

### Files Generated

| File | Type | Test Count |
|------|------|-----------|
| `e2e/integration/p495-transcription-migration.spec.ts` | Integration | 16 |
| `e2e/p495-transcription.spec.ts` | E2E | 9 |
| `e2e/a11y/p495-accessibility.spec.ts` | Accessibility | 7 |
| `e2e/p495-smoke.spec.ts` | Smoke | 3 |
| `features/uat/p495.md` | UAT | 13 scenarios |
| **Total** | | **35 automated + 13 manual** |
