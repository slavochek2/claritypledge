# P27: Live Speaker Detection + ML Training Data Capture

## Problem

Currently in `/live` meetings, there's no visibility into:
1. **Who is speaking** at any moment
2. **How much content has been verified** vs remains unverified
3. **Raw audio data** for future ML training

We need this data to:
- Give users real-time awareness of "common knowledge" creation (Pinker's theory)
- Incentivize listening and verification through gamification
- Capture timestamped audio + rating events for training a prediction model
- Eventually predict understanding ratings from voice/transcript without asking

## Goal

Build the **minimum viable data pipeline** that:
1. Shows users a **verification bar** tracking common knowledge creation
2. Records audio + events with precise timestamps for later ML analysis
3. Validates whether 50 sessions can tell us if 100+ hours of data will train a useful model

---

## User-Facing Feature: Verification Bar

### Core Concept: Common Knowledge (Pinker)

The bar visualizes the journey from "fractured realities" to "common reality":
- **Unverified content**: "I said something, but I don't know if you understood"
- **Verified content**: "I know that you know I know" — created through explain-back flow

**This is NOT about speaking balance.** It's about what content has become "common knowledge" through verification.

### UX Design

A compact 4-segment bar below the header showing:
- **Who is speaking** (🎤 icon next to active speaker)
- **Verification state** of content from each person

**Layout: 4-Segment Verification Bar**

```
┌────────────────────────────────────────────────────┐
│  [←]        Meeting with Gosha              [Exit] │
├────────────────────────────────────────────────────┤
│  🎤Slava                                     Gosha │
│  ┌─────────────────────────────────────────────┐   │
│  │ Slava said │ ✓ understood ║ ✓ understood │ Gosha said │
│  │   (gray)   │    (blue)    ║    (blue)    │   (gray)   │
│  └─────────────────────────────────────────────┘   │
├────────────────────────────────────────────────────┤
│              ... existing UI ...                   │
└────────────────────────────────────────────────────┘
```

**The 4 Segments:**

| Segment | Label | Color | Meaning |
|---------|-------|-------|---------|
| Left outer | "Slava said" | Light gray | What Slava shared, not yet verified |
| Left inner | "✓ understood" | Blue | What Slava shared AND Gosha confirmed understanding |
| Right inner | "✓ understood" | Blue | What Gosha shared AND Slava confirmed understanding |
| Right outer | "Gosha said" | Light gray | What Gosha shared, not yet verified |

**Simpler mental model:**
- Gray = "I said it, but do you get it?"
- Blue = "You proved you got it" (via explain-back)

**Visual progression during a session:**

```
Start (no one spoke yet):
│                    empty                           │

Slava shares an idea:
│ ████████████████████████████████ unverified ░░░░░ │
│            Slava 100%                              │

Gosha shares a response:
│ █████████████ Slava ░░░░░│░░░░░ Gosha ████████████ │
│   unverified 50%         │        unverified 50%   │

Gosha explains back Slava's idea (verification!):
│ ████ Slava ░░│▓▓▓▓▓▓▓▓▓▓▓│░░░░░ Gosha ███████████ │
│ unverified   │  verified │        unverified      │
│    20%       │    30%    │           50%          │

Both verify each other's content:
│ ███ │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ ███████████ │
│ 10% │         verified 60%         │    30%      │
```

### Gamification

**Both Win Together:**
- Total verified % grows when either person verifies → shared progress
- "35% of this conversation is now common knowledge"

**Individual Credit:**
- Each person sees how much they verified
- Incentivizes listening and doing explain-backs
- "You verified 20% of Gosha's content"

**End-of-Session Stats:**
```
Session Summary:
- Total verified: 65% (great clarity!)
- Slava verified: 35% of Gosha's content
- Gosha verified: 30% of Slava's content
```

### What We Show

| Element | Why |
|---------|-----|
| **4-segment bar** | Visualizes common knowledge creation — the core value proposition |
| **🎤 speaker indicator** | Real-time awareness of turn-taking |
| **Verified vs unverified proportions** | Incentivizes verification through visibility |
| **Individual verification credit** | Gamifies listening (the harder skill) |

### What We DON'T Show

| Removed | Why Not |
|---------|---------|
| **Streak timer** | Wrong focus — verification matters, not speaking duration |
| **Speaking percentages** | Incentivizes wrong behavior (speaking more) |
| **Separate listening bar** | Verification IS the meaningful listening metric |
| **Numeric percentages in bar** | Visual proportions are clearer; numbers cause layout shift |
| **Speaking time accumulation** | Creates competition to speak, not listen |

### Detection Logic

- Use Web Audio API (`AudioContext` + `AnalyserNode`) on each user's mic
- Threshold-based Voice Activity Detection (VAD):
  - `speaking = audioLevel > threshold` (e.g., -50 dB)
  - Debounce: 200ms before "stopped speaking" to avoid flicker
- Each user broadcasts their own speaking state to Supabase realtime
- Verification events come from existing explain-back flow completion

---

## Data Layer: ML Training Data Capture

### What We Capture (Hidden from User)

Every session produces a complete training dataset:

```
/storage/sessions/{session_id}/
├── audio/
│   ├── {user1_id}.webm    # Full audio recording per participant
│   └── {user2_id}.webm
├── events.json            # Timestamped events
└── metadata.json          # Session summary
```

### Event Schema

```typescript
interface SessionEvent {
  type: 'speaking_start' | 'speaking_end' | 'rating' | 'explain_back_start' | 'explain_back_end';
  userId: string;
  timestamp: number;  // ms since session start (NOT wall clock)

  // For rating events only:
  ratingValue?: number;       // 0-10
  ratingType?: 'understanding' | 'confidence' | 'explain_back';
  targetUserId?: string;      // Who was being rated
}
```

### Example Events Timeline

```json
{
  "sessionId": "abc123",
  "startedAt": "2024-01-15T10:30:00Z",
  "events": [
    { "type": "speaking_start", "userId": "slava", "timestamp": 0 },
    { "type": "speaking_end", "userId": "slava", "timestamp": 45000 },
    { "type": "speaking_start", "userId": "gosha", "timestamp": 45500 },
    { "type": "rating", "userId": "gosha", "timestamp": 46000, "ratingValue": 7, "ratingType": "confidence", "targetUserId": "slava" },
    { "type": "rating", "userId": "slava", "timestamp": 47000, "ratingValue": 5, "ratingType": "understanding", "targetUserId": "gosha" },
    { "type": "speaking_end", "userId": "gosha", "timestamp": 50000 },
    { "type": "explain_back_start", "userId": "gosha", "timestamp": 52000 },
    { "type": "speaking_start", "userId": "gosha", "timestamp": 52000 },
    { "type": "speaking_end", "userId": "gosha", "timestamp": 80000 },
    { "type": "explain_back_end", "userId": "gosha", "timestamp": 80500 },
    { "type": "rating", "userId": "slava", "timestamp": 82000, "ratingValue": 9, "ratingType": "explain_back", "targetUserId": "gosha" }
  ]
}
```

### Metadata Schema

```typescript
interface SessionMetadata {
  sessionId: string;
  startedAt: string;           // ISO timestamp
  endedAt: string;
  durationMs: number;
  participants: {
    id: string;
    name: string;
    totalSpeakingTimeMs: number;
    speakingPercentage: number;
  }[];
  ratings: {
    total: number;
    byType: Record<string, number>;
    averageValue: number;
  };
  audioQuality: {
    format: string;            // 'webm/opus'
    sampleRate: number;
    averageBitrate: number;
  };
}
```

---

## Technical Implementation

### 1. Audio Level Detection Hook

```typescript
// New hook: src/hooks/use-audio-level.ts

interface UseAudioLevelOptions {
  threshold?: number;         // dB threshold for "speaking" (default: -50)
  debounceMs?: number;        // Debounce before "stopped" (default: 200)
  onSpeakingChange?: (isSpeaking: boolean) => void;
}

interface UseAudioLevelReturn {
  isSpeaking: boolean;
  audioLevel: number;         // Current dB level
  startListening: () => Promise<void>;
  stopListening: () => void;
}

function useAudioLevel(options: UseAudioLevelOptions): UseAudioLevelReturn;
```

### 2. Audio Recording Hook

```typescript
// New hook: src/hooks/use-audio-recorder.ts

interface UseAudioRecorderReturn {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob>;
  getRecordingDuration: () => number;
}

function useAudioRecorder(): UseAudioRecorderReturn;
```

### 3. Session Events Collector

```typescript
// New utility: src/lib/session-events.ts

class SessionEventsCollector {
  private events: SessionEvent[] = [];
  private sessionStartTime: number;

  constructor() {
    this.sessionStartTime = Date.now();
  }

  addEvent(event: Omit<SessionEvent, 'timestamp'>): void {
    this.events.push({
      ...event,
      timestamp: Date.now() - this.sessionStartTime
    });
  }

  getEvents(): SessionEvent[] {
    return [...this.events];
  }

  toJSON(): string {
    return JSON.stringify({ events: this.events });
  }
}
```

### 4. Storage Upload

```typescript
// Addition to src/app/data/api.ts

async function uploadSessionRecording(
  sessionId: string,
  userId: string,
  audioBlob: Blob,
  events: SessionEvent[],
  metadata: SessionMetadata
): Promise<void>;
```

### 5. Database Schema Addition

```sql
-- New table for session recordings metadata
CREATE TABLE session_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL REFERENCES clarity_sessions(code),
  user_id TEXT NOT NULL,
  audio_path TEXT NOT NULL,           -- Supabase storage path
  events_path TEXT NOT NULL,          -- JSON file path
  duration_ms INTEGER NOT NULL,
  speaking_time_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by session
CREATE INDEX idx_session_recordings_session ON session_recordings(session_id);
```

### 6. Supabase Storage Bucket

```
Bucket: session-recordings
├── {session_id}/
│   ├── audio/
│   │   ├── {user_id}.webm
│   │   └── ...
│   ├── events.json
│   └── metadata.json
```

---

## Integration Points

### New Component: VerificationBar

```typescript
// src/app/components/partners/verification-bar.tsx

interface VerificationBarProps {
  currentUserName: string;
  partnerName: string;
  currentUserSpeaking: boolean;
  partnerSpeaking: boolean;

  // Verification segments (all in ms, converted to % for display)
  currentUserUnverifiedMs: number;    // Content I shared, not yet verified by partner
  currentUserVerifiedMs: number;      // Content I shared, partner explained back
  partnerVerifiedMs: number;          // Content partner shared, I explained back
  partnerUnverifiedMs: number;        // Content partner shared, not yet verified

  // Gamification stats
  totalVerifiedPercent: number;       // (verified / total) * 100
  myVerificationPercent: number;      // How much of partner's content I verified
}
```

### LiveModeView Changes

1. Add `VerificationBar` component below header
2. Connect to `useAudioLevel` hook for current user
3. Subscribe to partner's speaking state via existing realtime channel
4. Track speaking time as "unverified content" accumulation
5. When explain-back completes successfully, move content from "unverified" to "verified"

### ClarityLivePage Changes

1. Initialize `useAudioRecorder` when entering `live` view
2. Initialize `SessionEventsCollector`
3. Hook into existing rating callbacks to log events
4. On session end: stop recording, upload to storage

### LiveSessionState Extension

```typescript
interface LiveSessionState {
  // ... existing fields ...

  // P27: Speaking state broadcast
  speakingState?: {
    [userId: string]: {
      isSpeaking: boolean;
      totalSpeakingTimeMs: number;
    }
  };
}
```

---

## ML Validation Metrics (After 50 Sessions)

After collecting 50 sessions, run this analysis to determine if scaling to 100+ hours is worthwhile:

### Data Quality Checks

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Audio quality (SNR) | > 20 dB | Automated analysis of recordings |
| Speaker detection accuracy | > 90% | Manual audit of 10% of segments |
| Timestamp sync | < 500ms drift | Compare event times to audio |
| Recording completeness | > 95% | Check for truncated files |

### Signal Detection

| Analysis | What We're Looking For |
|----------|------------------------|
| Speaking time vs. rating | Does person who speaks more get rated lower? |
| Speech rate vs. rating | Do faster speakers get understood less? |
| Pause frequency vs. rating | Do more pauses correlate with better understanding? |
| Transcript complexity vs. rating | Do simpler sentences get higher ratings? |

### Decision Criteria

**Proceed to 100+ hours if:**
- At least ONE correlation > 0.3 between audio features and ratings
- Audio quality consistently meets threshold
- Timestamp sync is accurate enough for segment extraction

**Pivot/stop if:**
- No meaningful correlations found
- Audio quality too variable
- Users complain about recording (privacy concerns)

---

## Storage Estimates

| Sessions | Audio Hours | Storage Size | Supabase Free Tier |
|----------|-------------|--------------|-------------------|
| 50 | ~25-50 hrs | ~750 MB - 1.5 GB | OK (1 GB free) |
| 200 | ~100-200 hrs | ~3-6 GB | Need paid tier |
| 500 | ~250-500 hrs | ~7.5-15 GB | Need paid tier |

**Recommendation:** Start with free tier, upgrade after validating signal exists.

---

## Privacy Considerations

### User Consent

- Show clear notice when joining: "This session may be recorded for quality improvement"
- Add toggle in settings to opt-out of recording (still allow live meeting)
- Recordings are only used for ML training, never shared

### Data Retention

- Raw audio deleted after 90 days
- Anonymized features extracted and stored permanently
- User can request deletion via settings

---

## Success Criteria

- [ ] Verification bar displays live during meetings (4-segment visualization)
- [ ] 🎤 indicator shows who is currently speaking
- [ ] Verification state updates when explain-back completes
- [ ] End-of-session shows gamification stats (total verified %, individual credit)
- [ ] Audio recorded for both participants
- [ ] Events logged with <500ms timestamp accuracy
- [ ] Files uploaded to Supabase storage on session end
- [ ] 50 sessions collected for validation analysis
- [ ] Analysis report: proceed/pivot decision documented

---

## Out of Scope (Future)

- Real-time transcription (Phase 2: Deepgram integration)
- Speaker diarization from single audio source
- Voice fingerprinting / speaker identification
- Post-meeting transcript display
- Understanding prediction model (after validation)

---

## Dependencies

- P23 Live Meeting (complete) - base infrastructure
- Supabase Storage bucket creation
- User consent UI for recording

---

## Estimated Effort

| Component | Effort |
|-----------|--------|
| Audio level detection hook | 3-4 hours |
| Audio recording hook | 2-3 hours |
| Speaking time UI component | 2-3 hours |
| Events collector + storage | 3-4 hours |
| Database schema + API | 2 hours |
| Integration into LiveModeView | 2-3 hours |
| Privacy consent UI | 1-2 hours |
| **Total** | **~2-3 days** |
