# P28.2: Chunked Events + Handover Spec

## Status Summary

**P28.1 Phase 1 (Infrastructure): COMPLETE ✅**

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

### Immediate: Chunk Events (P28.2.1)

**Problem:** Events.json only uploads when user clicks "Exit". If they close the browser, we lose all behavioral data.

**Solution:** Upload events every 30 seconds alongside audio chunks.

**Implementation:**

```typescript
// In clarity-live-page.tsx, modify handleChunkReady:

const handleChunkReady = useCallback(async (
  chunkBlob: Blob,
  chunkNum: number,
  isLastChunk: boolean
) => {
  const sessionCode = sessionCodeForChunks.current;
  const userName = userNameForChunks.current;

  if (!sessionCode || !userName) return;

  // 1. Upload audio chunk (existing)
  await uploadAudioChunk(sessionCode, userName, chunkBlob, chunkNum, isLastChunk);

  // 2. NEW: Upload events snapshot with each chunk
  await uploadEventsSnapshot(sessionCode, chunkNum, eventsCollectorRef.current);
}, []);
```

**New function in api.ts:**

```typescript
export async function uploadEventsSnapshot(
  sessionCode: string,
  chunkNumber: number,
  collector: SessionEventsCollector,
): Promise<void> {
  const events = collector.getEvents();
  const metadata = collector.getMetadata();

  // Upload as events_{chunkNumber}.json (e.g., events_000.json, events_001.json)
  // Latest one contains all events accumulated so far
  const fileName = `events_${String(chunkNumber).padStart(3, '0')}.json`;

  const payload: MLTrainingEvents = {
    sessionCode,
    capturedAt: new Date().toISOString(),
    sessionStartedAt: metadata.sessionStartedAt,
    sessionEndedAt: Date.now(), // Current time (not final)
    durationMs: Date.now() - metadata.sessionStartedAt,
    participants: metadata.participants,
    events,
  };

  const { uploadUrl } = await getSignedUploadUrl(sessionCode, fileName, 'application/json');
  await uploadToGCS(uploadUrl, new Blob([JSON.stringify(payload)], { type: 'application/json' }), 'application/json');

  console.log(`[ML Upload] Events snapshot ${chunkNumber} uploaded: ${events.length} events`);
}
```

**File structure after change:**
```
gs://claritypledge-ml-training/sessions/{session_code}/
├── slava_chunk_000.webm
├── slava_chunk_001.webm
├── events_000.json          # Events at 0-30s
├── events_001.json          # Events at 0-60s (cumulative)
├── events_002.json          # Events at 0-90s (cumulative)
└── events.json              # Final (if user exits properly)
```

**Analysis note:** Use the highest-numbered `events_XXX.json` for analysis. It contains all events up to that point.

### Phase 2: Collect 100 Sessions

| Task | Status |
|------|--------|
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
