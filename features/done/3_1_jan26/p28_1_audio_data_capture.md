---
status: done
type: story
tags: []
rank: 125428.0
created_date: 2026-01-04
---

# P28.1: Audio + Event Data Capture for ML Validation

## Vision Context

We're building toward a world where **verified understanding replaces loud opinions as social currency**. The long-term goal is real-time prediction of understanding gaps during conversations—enabling AI coaching that helps people communicate more clearly.

Before investing in ML infrastructure, we need to validate a core hypothesis:

> **"Voice/audio patterns correlate with understanding gaps in ways that are predictable."**

This feature captures the minimum data needed to test that hypothesis with 100 sessions.

See [tournament theory vision](../docs/visions/v2.%20tournament%20_%20theory.md) for the full strategic context.

---

## Goal

**Capture 100 sessions with audio + behavioral events to validate ML signal exists.**

Success criteria:
- At least ONE correlation > 0.3 between audio features and behavioral labels
- Audio capture success rate > 90%
- No significant drop in session completion rate

If validated → Build P29 (real-time coaching)
If not → Pivot to text/behavior-only models

---

## User Flow (KISS)

```
1. Session starts
   └── Banner: "🔴 Recording for quality improvement"
   └── Audio recording begins (consent via ToS)

2. Meeting happens normally
   └── All existing behavioral events captured
   └── Audio recorded locally

3. Session ends
   └── Audio + events uploaded to Supabase Storage
   └── No waitlist prompt (users at controlled events already consented)
```

**Why no waitlist gate?**
- Primary data source is controlled events where consent is given verbally
- Reduces friction, increases capture rate
- Can add waitlist later if public usage grows

---

## What We Capture

### Audio
- Single audio file per user (their mic input)
- Format: webm/opus (native browser format)
- Storage: Supabase Storage bucket `ml-training-sessions`

### Behavioral Events (Already Built)

We leverage the existing Mixpanel events which already capture rich behavioral data:

| Event | What It Captures | ML Label Value |
|-------|------------------|----------------|
| `live_rating_submitted` | Rating value, role, flow_type, round | Direct understanding label |
| `live_understanding_revealed` | Gap, gap_type, is_perfect | Ground truth for prediction |
| `live_explain_back_started` | Round number, initial ratings | Correction loop entry |
| `live_explain_back_done` | When listener finishes explaining | Audio segmentation marker |
| `live_explain_back_rated` | Rating after correction, round | Learning trajectory |
| `live_perfect_understanding` | Rounds to achieve, initial ratings | Success signal |
| `live_round_skipped` | Phase, round | Tolerance threshold |
| `live_clarify_started/done` | Round number | Speaker correction phase |
| `live_role_switch_*` | Negotiation patterns | Cognitive friction signal |

**Event Gap to Fix:** Add `live_explain_back_done` event (currently missing—critical for audio segmentation).

### Session Bundle

At session end, we create a bundle:

```
/storage/ml-training-sessions/{session_code}/
├── {user1_name}.webm         # Audio file
├── {user2_name}.webm         # Audio file (partner)
├── events.json               # Snapshot of session events
└── metadata.json             # Session summary
```

---

## Events JSON Format

```typescript
interface MLTrainingEvents {
  sessionCode: string;
  capturedAt: string;           // ISO timestamp
  sessionStartedAt: number;     // Unix ms
  sessionEndedAt: number;       // Unix ms
  durationMs: number;
  participants: {
    name: string;
    role: 'creator' | 'joiner';
  }[];
  events: {
    type: string;               // Event name from Mixpanel
    timestamp: number;          // ms since session start
    properties: Record<string, unknown>;
  }[];
}
```

We capture a snapshot of all `live_*` events that occurred during the session, with timestamps relative to session start for easy audio alignment.

---

## Technical Implementation

### 1. Audio Recording Hook

```typescript
// src/hooks/use-audio-recorder.ts

interface UseAudioRecorderReturn {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob>;
  error: string | null;
}

function useAudioRecorder(): UseAudioRecorderReturn;
```

Implementation notes:
- Uses MediaRecorder API with `audio/webm` mimeType
- Records user's mic stream (not partner's—each user records their own)
- Handles permission errors gracefully

### 2. Recording State in LiveModeView

```typescript
// In clarity-live-page.tsx

const { isRecording, startRecording, stopRecording } = useAudioRecorder();
const eventsCollector = useRef(new SessionEventsCollector());

// On session join/create:
await startRecording();
eventsCollector.current.start();

// On session end:
const audioBlob = await stopRecording();
const collector = eventsCollector.current;
const events = collector.getEvents();
const metadata: SessionMetadata = {
  sessionStartedAt: collector.getStartTime(),
  sessionEndedAt: Date.now(),
  durationMs: collector.getDurationMs(),
  participants: [
    { name: creatorName, role: 'creator' },
    { name: joinerName, role: 'joiner' },
  ],
};
await uploadSessionRecording(sessionCode, name, audioBlob, events, metadata);
```

### 3. Events Collector

```typescript
// src/lib/session-events-collector.ts

class SessionEventsCollector {
  private events: MLEvent[] = [];
  private startTime: number = 0;

  start(): void {
    this.startTime = Date.now();
    this.events = [];
  }

  addEvent(type: string, properties: Record<string, unknown>): void {
    this.events.push({
      type,
      timestamp: Date.now() - this.startTime,
      properties,
    });
  }

  getEvents(): MLEvent[] {
    return [...this.events];
  }

  getStartTime(): number {
    return this.startTime;
  }

  getDurationMs(): number {
    return Date.now() - this.startTime;
  }
}
```

### 4. Upload Function

```typescript
// src/app/data/api.ts

interface SessionMetadata {
  sessionStartedAt: number;   // Unix ms from collector.getStartTime()
  sessionEndedAt: number;     // Unix ms (Date.now() at upload)
  durationMs: number;         // From collector.getDurationMs()
  participants: { name: string; role: 'creator' | 'joiner' }[];
}

async function uploadSessionRecording(
  sessionCode: string,
  userName: string,
  audioBlob: Blob,
  events: MLEvent[],
  metadata: SessionMetadata,
): Promise<void> {
  const basePath = `ml-training-sessions/${sessionCode}`;

  // Upload audio
  await supabase.storage
    .from('ml-training')
    .upload(`${basePath}/${userName}.webm`, audioBlob);

  // Upload events (only if first uploader—avoid duplicates)
  const eventsPath = `${basePath}/events.json`;
  const { error: existsError } = await supabase.storage
    .from('ml-training')
    .download(eventsPath);

  if (existsError) {
    // Events don't exist yet, upload them
    const eventsPayload: MLTrainingEvents = {
      sessionCode,
      capturedAt: new Date().toISOString(),
      sessionStartedAt: metadata.sessionStartedAt,
      sessionEndedAt: metadata.sessionEndedAt,
      durationMs: metadata.durationMs,
      participants: metadata.participants,
      events,
    };
    await supabase.storage
      .from('ml-training')
      .upload(eventsPath, JSON.stringify(eventsPayload));
  }

  // Create DB record for tracking
  await supabase.from('ml_training_sessions').insert({
    session_code: sessionCode,
    user_name: userName,
    audio_path: `${basePath}/${userName}.webm`,
    duration_ms: metadata.durationMs,
  });
}
```

---

## Database Schema

```sql
-- Minimal tracking table
CREATE TABLE ml_training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code TEXT NOT NULL,
  user_name TEXT NOT NULL,
  audio_path TEXT NOT NULL,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ml_sessions_code ON ml_training_sessions(session_code);
```

**Why no user_id foreign key?**
- Users at events may not have accounts
- Simplifies capture—we just need the data, not identity

---

## Storage Setup

Create Supabase Storage bucket:
- Name: `ml-training`
- Public: No (private bucket)
- File size limit: 100MB (enough for ~30 min audio)

---

## Consent Approach

For controlled events:
- Verbal consent given at event start
- Banner in UI: "🔴 Recording for quality improvement"
- ToS covers data usage for ML training

For public users (future):
- Add explicit consent modal if needed
- Or skip recording for non-event sessions

---

## What We DON'T Build (Deferred)

| Component | Why Skip |
|-----------|----------|
| Voice activity detection | Extract speaking segments post-hoc from audio |
| Real-time transcription | Not needed for correlation analysis |
| Waitlist/registration gate | Users at events already consented |
| Coaching UI | That's P29, after validation |
| ML model training | Analysis phase, not capture |

---

## Missing Event to Add

Before implementing, add this event:

```typescript
// In clarity-live-page.tsx, handleExplainBackDone callback:
analytics.track('live_explain_back_done', {
  session_code: session?.code,
  round: confirmedLiveStateRef.current.explainBackRound,
});
```

This marks when listener finishes explaining—critical for audio segmentation.

---

## Validation Analysis (After 100 Sessions)

### Audio Feature Extraction (Post-Hoc, Python)

| Feature | How to Extract | Tool |
|---------|----------------|------|
| Speaking time per user | VAD on audio | pyannote.audio |
| Speech rate (syllables/sec) | ASR + syllable count | whisper + nltk |
| Pause frequency | VAD gaps > 500ms | pyannote.audio |
| Pitch variance | F0 extraction | librosa |
| Turn-taking balance | Speaking time ratio | pyannote.audio |

### Correlation Questions

| Audio Feature | Behavioral Label | Hypothesis |
|---------------|------------------|------------|
| Speaking time ratio | `gap_type` | Imbalanced speaking → worse understanding |
| Speech rate | `rounds_to_achieve` | Faster speakers need more correction |
| Pause frequency | `responder_rating` | More pauses → higher listener confidence |
| Pitch variance | `role_switch_requested` | Monotone → listener wants to interrupt |

### Go/No-Go Criteria

| Criterion | Threshold |
|-----------|-----------|
| Audio capture success | > 90% of sessions |
| Feature-label correlation | r > 0.3 on at least one pair |
| Statistical significance | p < 0.05 |
| UX impact | No drop in session completion |

**GO:** Build P29 (real-time coaching)
**PAUSE:** Investigate quality issues, adjust capture
**NO-GO:** Pivot to text/behavior-only models

---

## Implementation Checklist

### Phase 1: Capture Infrastructure (~6 hours)

- [ ] Add `live_explain_back_done` event to codebase
- [ ] Create `useAudioRecorder` hook
- [ ] Create `SessionEventsCollector` utility
- [ ] Create Supabase Storage bucket `ml-training`
- [ ] Create `ml_training_sessions` database table
- [ ] Add upload function to api.ts
- [ ] Wire recording into session lifecycle
- [ ] Add recording banner to LiveModeView

### Phase 2: Run Sessions (4-8 weeks)

- [ ] Run events with recording enabled
- [ ] Monitor upload success via DB queries
- [ ] Spot-check audio quality (manual sampling)
- [ ] Reach 100 sessions milestone

### Phase 3: Analyze (1 week)

- [ ] Extract audio features (Python script)
- [ ] Pull events from stored JSON
- [ ] Run correlation analysis
- [ ] Document findings
- [ ] Make Go/No-Go decision

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Sessions captured | 100 | Count rows in `ml_training_sessions` |
| Audio quality | Usable in 90%+ | Manual spot-check |
| Correlation found | r > 0.3 | Python analysis |
| Decision made | Binary | Go/No-Go for P29 |
