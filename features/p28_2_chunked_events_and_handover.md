# P28.2: Chunked Events + Handover Spec

## Status Summary

**P28.1 Phase 1 (Infrastructure): COMPLETE ✅**
**P28.2.1 Chunked Events Upload: COMPLETE ✅**
**P28.2.2 Reliability & Safeguards: COMPLETE ✅**
**P28.2.3 Mixpanel Correlation: COMPLETE ✅**

This document captures what was built, what's remaining, and how to continue.

---

## What Was Built (P28.1)

### Infrastructure
| Component | Status | Location |
|-----------|--------|----------|
| `useAudioRecorder` hook | ✅ | `src/hooks/use-audio-recorder.ts` |
| Chunked upload mode | ✅ | 30-second intervals |
| `SessionEventsCollector` | ✅ | `src/lib/session-events-collector.ts` |
| GCS bucket | ✅ | `gs://claritypledge-ml-training/` |
| Cloud Function (signed URLs) | ✅ | `us-central1-gen-lang-client-0869694595` |
| CORS configuration | ✅ | Allows localhost + production |
| IAM permissions | ✅ | `iam.serviceAccountTokenCreator` role |
| `ml_training_sessions` DB table | ✅ | Supabase |
| Upload functions | ✅ | `uploadAudioChunk()`, `uploadSessionRecording()` |
| Recording banner | ✅ | "Recording session" in UI |
| Verification script | ✅ | `scripts/verify-ml-session.sh` |

### Data Flow
```
Browser (30s interval)
    │
    ├── Audio chunks → GCS (slava_chunk_000.webm, _001, _002...)
    │
    └── Events.json → GCS (uploaded on session exit only ⚠️)
```

### Known Issues
1. **Events only upload on exit** - If user closes tab, events are lost
2. **Test sessions have gaps** - Pre-CORS sessions missing chunk_000

---

## What Needs to Be Done

### ✅ COMPLETED: Chunk Events (P28.2.1)

**Problem:** Events.json only uploads when user clicks "Exit". If they close the browser, we lose all behavioral data.

**Solution:** Upload events every 30 seconds alongside audio chunks.

**Implementation (DONE):**
- Added `uploadEventsSnapshot()` function in [api.ts](../src/app/data/api.ts:2566)
- Modified `handleChunkReady()` in [clarity-live-page.tsx](../src/app/pages/clarity-live-page.tsx:113) to upload events with each chunk
- Added `sessionForChunks` ref to track session participants for metadata
- Added `getMetadata()` method to SessionEventsCollector

**File structure after implementation:**
```
gs://claritypledge-ml-training/sessions/{session_code}/
├── slava_chunk_000.webm       # Creator's audio
├── slava_chunk_001.webm
├── slava_events_000.json      # Creator's events at 0-30s
├── slava_events_001.json      # Creator's events at 0-60s (cumulative)
├── gosha_chunk_000.webm       # Joiner's audio
├── gosha_chunk_001.webm
├── gosha_events_000.json      # Joiner's events at 0-30s
├── gosha_events_001.json      # Joiner's events at 0-60s (cumulative)
└── events.json                # Final (if user exits properly)
```

**Analysis note:** Use the highest-numbered `{user}_events_XXX.json` for analysis. Each user has their own events file to avoid overwrites.

### ✅ COMPLETED: Reliability & Safeguards (P28.2.2)

**Implemented:**
1. **90-minute max recording duration** - Auto-stops to prevent runaway recordings
2. **Auto-stop when partner leaves** - Recording stops immediately when `partnerLeft` or `sessionEnded` detected
3. **Production-only recording** - Dev sessions skip recording (`import.meta.env.PROD` check)
4. **User-prefixed events files** - `slava_events_000.json` instead of `events_000.json` to prevent overwrites when both users upload

**Files changed:**
- [use-audio-recorder.ts](../src/hooks/use-audio-recorder.ts) - Added `maxDurationMs` option (default 90 min)
- [clarity-live-page.tsx](../src/app/pages/clarity-live-page.tsx) - Added auto-stop effect, prod-only check
- [api.ts](../src/app/data/api.ts) - Added `userName` param to `uploadEventsSnapshot()`

### ✅ COMPLETED: Mixpanel Correlation (P28.2.3)

**Problem:** Can't correlate GCS recordings to Mixpanel user profiles.

**Solution:** Added `uploader` field to events.json with user ID and email (if logged in).

### ✅ COMPLETED: Auto-capture ALL Events (P28.2.4)

**Problem:** Manual `trackLiveEvent()` calls were easy to forget when adding new events.

**Solution:** ML collection now happens automatically at the Mixpanel wrapper level.

**How it works:**
1. When recording starts, `analytics.registerMLCollector(collector)` is called
2. ALL `analytics.track()` calls are automatically captured for ML (not just `live_*` events)
3. When recording stops, `analytics.unregisterMLCollector()` is called
4. Future events added anywhere in the app are automatically captured - no code changes needed

**Files changed:**
- [mixpanel.ts](../src/lib/mixpanel.ts) - Added `registerMLCollector()` and `unregisterMLCollector()`
- [clarity-live-page.tsx](../src/app/pages/clarity-live-page.tsx) - Register/unregister on recording start/stop

**New events.json structure:**
```json
{
  "sessionCode": "ABC123",
  "capturedAt": "2025-01-05T14:30:00Z",
  "sessionStartedAt": 1735913400000,
  "sessionEndedAt": 1735914300000,
  "durationMs": 900000,
  "participants": [
    { "name": "Slava", "role": "creator" },
    { "name": "Gosha", "role": "joiner" }
  ],
  "uploader": {
    "supabaseUserId": "abc-123-def",  // Supabase auth.users.id - same value passed to Mixpanel identify()
    "email": "slava@example.com",     // For manual lookup
    "name": "Slava"                   // Display name used in session
  },
  "events": [...]
}
```

**Correlation with Mixpanel:**
- `userId` matches what we pass to `analytics.identify(userId)` in auth flow
- Can query Mixpanel by userId to get full user journey
- `email` allows manual lookup if needed

**Files changed:**
- [session-events-collector.ts](../src/lib/session-events-collector.ts) - Added `uploader` to `MLTrainingEvents` interface
- [api.ts](../src/app/data/api.ts) - Added `uploader` param to `uploadEventsSnapshot()`
- [clarity-live-page.tsx](../src/app/pages/clarity-live-page.tsx) - Added `userForChunks` ref, pass user info

### Phase 2: Pilot Test (10 Sessions)

Before collecting 100 sessions, run a pilot with 10 to validate the pipeline works end-to-end.

**Pilot Checklist:**
- [ ] Deploy to production
- [ ] Run 10 real sessions (production only - dev is skipped)
- [ ] Verify each session: `./scripts/verify-ml-session.sh SESSION_CODE`
- [ ] Stitch audio and confirm playback works
- [ ] Confirm events.json has expected structure
- [ ] Run sample correlation analysis (see `docs/technical/ml-data-dictionary.md`)
- [ ] Fix any issues found

**Pilot Success Criteria:**
- 8/10 sessions have valid audio (chunk_000 with WebM header)
- 10/10 sessions have events.json or events_XXX.json
- Audio stitching produces playable files
- At least 5 `live_rating_submitted` events across all sessions

### Phase 3: Full Collection (100 Sessions)

| Task | Status |
|------|--------|
| Pilot test (10 sessions) | Pending |
| Run sessions with recording | 0/100 valid |
| Monitor via `verify-ml-session.sh` | Ready |
| Target: 100 valid sessions | Pending |

**Valid session criteria:**
- Has `chunk_000.webm` (WebM header present)
- Has `events.json` or `events_XXX.json`
- Audio plays correctly when stitched

### Phase 3: Analysis (Future)

| Task | Tool |
|------|------|
| Download all sessions | `gsutil -m cp -r gs://...` |
| Stitch audio chunks | FFmpeg concat |
| Extract audio features | Python (pyannote, librosa, whisper) |
| Correlate with events | Python (pandas, scipy) |
| Go/No-Go decision | r > 0.3 correlation |

---

## Commands Reference

### Verify a session
```bash
./scripts/verify-ml-session.sh SESSION_CODE
```

### List all sessions
```bash
gsutil ls gs://claritypledge-ml-training/sessions/
```

### Download a session
```bash
gsutil -m cp -r gs://claritypledge-ml-training/sessions/ABC123/ ./ABC123/
```

### Stitch audio (requires ffmpeg)
```bash
cat slava_chunk_*.webm > slava_full.webm
# Or with ffmpeg for better compatibility:
ls slava_chunk_*.webm | sort -V | sed "s/^/file '/" | sed "s/$/'/" > list.txt
ffmpeg -f concat -safe 0 -i list.txt -c copy slava_full.webm
```

### Check Cloud Function logs
```bash
gcloud functions logs read gcs-signed-url --region=us-central1 --limit=20
```

### Check Supabase records
```sql
SELECT session_code, user_name, created_at
FROM ml_training_sessions
ORDER BY created_at DESC
LIMIT 10;
```

---

## Configuration Reference

### GCS Bucket
- **Name:** `claritypledge-ml-training`
- **Region:** us-central1
- **Project:** gen-lang-client-0869694595

### Cloud Function
- **URL:** `https://us-central1-gen-lang-client-0869694595.cloudfunctions.net/gcs-signed-url`
- **Source:** `/cloud-functions/gcs-signed-url/`
- **Runtime:** Node.js 20

### CORS Configuration
```json
[{
  "origin": ["http://localhost:5200", "http://localhost:5173", "https://claritypledge.com"],
  "method": ["PUT", "GET", "HEAD", "OPTIONS"],
  "responseHeader": ["Content-Type", "Content-Length", "Content-MD5", "x-goog-*"],
  "maxAgeSeconds": 3600
}]
```

### Supabase Table
```sql
CREATE TABLE ml_training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code TEXT NOT NULL,
  user_name TEXT NOT NULL,
  audio_path TEXT NOT NULL,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Handover Checklist

For the next agent:

- [ ] Read this document
- [ ] Read `docs/technical/ml-training-setup.md` for detailed setup
- [ ] Implement chunked events upload (P28.2.1)
- [ ] Run a test session and verify with `./scripts/verify-ml-session.sh`
- [ ] Commit to worktree-2 branch
- [ ] Merge to main when verified

---

## Success Criteria (from P28.1)

| Metric | Target | Current |
|--------|--------|---------|
| Valid sessions | 100 | 0 |
| Audio capture rate | > 90% | TBD |
| Feature-label correlation | r > 0.3 | TBD |
| UX impact | No drop in completion | TBD |

**GO:** Build P29 (real-time coaching)
**NO-GO:** Pivot to text/behavior-only models
