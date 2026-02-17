---
status: done
type: comment
tags: []
rank: 125404.0
created_date: 2026-01-04
---

# P27.1: Verification Bar (Simple) + ML Data Capture

## Problem

Currently in `/live` meetings, users have no visibility into how much of their conversation has been verified as common knowledge.

We need:
1. A simple **verification %** that grows as explain-backs complete
2. Visual feedback showing who's contributing what
3. Hidden **audio + event capture** for future ML training

## Goal

Build the **minimum viable feedback loop**:
1. Show users `X% verified` that grows when explain-backs succeed
2. Show 3-segment bar: my unverified | verified | their unverified
3. Record audio + events with timestamps for later ML analysis

---

## User-Facing Feature: Verification Bar

### Layout (3-Segment Bar)

```
┌─────────────────────────────────────────────────────────────┐
│  [←]           Meeting with Gosha                    [Exit] │
├─────────────────────────────────────────────────────────────┤
│                      65% verified                           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │░░░░░░│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│░░░░░░░░░││
│  └─────────────────────────────────────────────────────────┘│
│  🎤Slava                                            Gosha   │
├─────────────────────────────────────────────────────────────┤
│                  ... existing UI ...                        │
└─────────────────────────────────────────────────────────────┘
```

### The 3 Segments

| Position | Color | Meaning |
|----------|-------|---------|
| Left | Gray | Content Slava spoke, not yet verified |
| Middle | Blue | Verified content (doesn't matter who verified) |
| Right | Gray | Content Gosha spoke, not yet verified |

### Two Modes

**Mode 1: Normal Conversation (VAD-based)**
- 🎤 icon appears next to whoever is speaking (detected via audio)
- Speaker's gray section grows
- Blue stays same (no verification happening)

```
              12% verified
┌─────────────────────────────────────────┐
│░░░░░░░░░░░░░│▓▓▓▓▓│░░░░░░░░░░░░░░░░░░░░│
└─────────────────────────────────────────┘
🎤Slava                              Gosha
```

**Mode 2: Listener Mode (explicit via "Did you get me?")**
- 👂 icon appears next to the verifier
- Blue grows as explain-back succeeds
- Speaker's gray shrinks

```
              35% verified
┌─────────────────────────────────────────┐
│░░░░░░░░░│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│░░░░░░░░░░░░░░│
└─────────────────────────────────────────┘
Slava                              👂Gosha
```

### The Feedback Loop

| Action | Visual Effect |
|--------|---------------|
| Slava speaks | 🎤Slava, his gray grows |
| Gosha speaks | 🎤Gosha, his gray grows |
| Gosha verifies Slava | 👂Gosha, blue grows, Slava's gray shrinks |
| Slava verifies Gosha | 👂Slava, blue grows, Gosha's gray shrinks |

### Why This Works

- **Speaking = debt accumulation** (gray grows)
- **Listening + verifying = debt payoff** (blue grows, gray shrinks)
- Users see immediate cause → effect
- Incentivizes listening because that's what makes blue grow

### Calculation

```
verified_percent = (verified_speaking_time / total_speaking_time) * 100
```

Where:
- **verified_speaking_time** = speaking time that was later verified via explain-back
- **total_speaking_time** = all speaking time from both participants

Each successful explain-back "converts" a portion of gray → blue.

---

## Data Layer: ML Training Data Capture (Hidden)

### What We Capture

Every session produces training data:

```
/storage/sessions/{session_id}/
├── audio/
│   ├── {user1_id}.webm
│   └── {user2_id}.webm
├── events.json
└── metadata.json
```

### Event Schema

```typescript
interface SessionEvent {
  type: 'speaking_start' | 'speaking_end' | 'rating' | 'explain_back_start' | 'explain_back_end';
  userId: string;
  timestamp: number;  // ms since session start

  // For rating events:
  ratingValue?: number;
  ratingType?: 'understanding' | 'explain_back';
  targetUserId?: string;
}
```

### Detection Logic

- Use Web Audio API (`AudioContext` + `AnalyserNode`) for voice activity
- Threshold-based VAD: `speaking = audioLevel > -50dB`
- 200ms debounce before "stopped speaking"
- Broadcast state via Supabase realtime

---

## Technical Implementation

### New Component: VerificationBar

```typescript
// src/app/components/partners/verification-bar.tsx

interface VerificationBarProps {
  verifiedPercent: number;  // 0-100
}
```

### New Hooks

```typescript
// src/hooks/use-audio-level.ts
function useAudioLevel(options: {
  threshold?: number;
  debounceMs?: number;
  onSpeakingChange?: (speaking: boolean) => void;
}): {
  isSpeaking: boolean;
  audioLevel: number;
  startListening: () => Promise<void>;
  stopListening: () => void;
};

// src/hooks/use-audio-recorder.ts
function useAudioRecorder(): {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob>;
};
```

### Database Schema

```sql
CREATE TABLE session_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL REFERENCES clarity_sessions(code),
  user_id TEXT NOT NULL,
  audio_path TEXT NOT NULL,
  events_path TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Integration Points

### LiveModeView Changes

1. Add `VerificationBar` component below header
2. Calculate `verifiedPercent` from explain-back ratings
3. Update % after each successful explain-back

### ClarityLivePage Changes

1. Initialize audio recorder on session start
2. Log events with timestamps
3. Upload to storage on session end

---

## Success Criteria

- [ ] Verification % displays and updates during meetings
- [ ] Bar visually fills as % increases
- [ ] Audio recorded for both participants
- [ ] Events logged with timestamps
- [ ] Files uploaded to Supabase storage on session end

---

## Out of Scope

- Speaker/listener indicators (moved to future iteration)
- 4-segment bar showing individual contributions
- Real-time speaking time tracking in UI
- Per-person verification credit display

---

## Estimated Effort

| Component | Effort |
|-----------|--------|
| VerificationBar component | 1-2 hours |
| Audio level detection hook | 3-4 hours |
| Audio recording hook | 2-3 hours |
| Events collector + storage | 3-4 hours |
| Database schema + API | 2 hours |
| Integration | 2-3 hours |
| **Total** | **~1.5-2 days** |
