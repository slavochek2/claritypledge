# P28: Clarity Coach (Post-Session Feedback)

## Problem

Users finish a Clarity Meeting but get no feedback on how to improve. They don't know:
- Did I explain clearly?
- Did I listen well?
- What should I do differently next time?

Meanwhile, we need:
- Registered users (currently meetings work without signup)
- Audio/transcript data for ML training

## Goal

**Give users coaching feedback in exchange for registration.**

User gets: Personalized tips to communicate more clearly
We get: Registration + audio data

---

## User Flow

```
1. Meeting happens (no login required)
   └── Audio recorded locally (both participants)

2. Meeting ends → prompt appears:
   ┌────────────────────────────────────┐
   │  Want clarity coaching?            │
   │                                    │
   │  Get personalized feedback on:     │
   │  • How clearly you explained       │
   │  • How well you listened           │
   │  • Tips to improve next time       │
   │                                    │
   │  [Get My Feedback] ← requires email│
   │  [No thanks]                       │
   └────────────────────────────────────┘

3. User clicks "Get My Feedback"
   └── Sign up / log in modal

4. Audio uploads → transcribed → analyzed

5. User receives coaching (email + in-app):
   ┌────────────────────────────────────┐
   │  Your Clarity Feedback             │
   │                                    │
   │  AS A SPEAKER:                     │
   │  ✓ Good: Short sentences, clear    │
   │  △ Try: Pause after key points     │
   │                                    │
   │  AS A LISTENER:                    │
   │  ✓ Good: Asked clarifying Qs       │
   │  △ Try: Reflect back more often    │
   │                                    │
   │  [Start Another Session]           │
   └────────────────────────────────────┘
```

---

## What the Coach Analyzes

### Speaker Metrics
| Metric | What we measure | Good vs needs work |
|--------|-----------------|-------------------|
| Speaking duration | Longest uninterrupted stretch | < 2 min good |
| Jargon usage | Unexplained technical terms | 0 is good |
| Check-ins | "Does that make sense?" moments | More is better |
| Clarity rating | Partner's understanding ratings | 7+ is good |

### Listener Metrics
| Metric | What we measure | Good vs needs work |
|--------|-----------------|-------------------|
| Explain-back accuracy | Did they capture key points? | 80%+ good |
| Questions asked | Clarifying questions before explaining | More is better |
| Explain-back rating | Speaker's rating of their summary | 7+ is good |

---

## Technical Implementation

### 1. Audio Recording (During Meeting)

```typescript
// Record each participant's audio locally
// Use MediaRecorder API
// Store as webm/opus (good compression)
```

No upload during meeting. Just local recording.

### 2. End-of-Session Prompt

New component after session ends:
```typescript
// src/app/components/partners/coaching-prompt.tsx

interface CoachingPromptProps {
  onRequestCoaching: () => void;  // → triggers auth flow
  onSkip: () => void;
}
```

### 3. Upload + Transcribe (After Registration)

```typescript
// After user registers:
// 1. Upload audio to Supabase Storage
// 2. Send to transcription (Deepgram or Whisper)
// 3. Store transcript
```

### 4. Generate Coaching (LLM)

```typescript
// Input to LLM:
// - Full transcript with speaker labels
// - Ratings from the session
// - Explain-back moments marked

// Output:
// - 2-3 speaker tips
// - 2-3 listener tips
// - Overall clarity score
```

### 5. Deliver Feedback

- Show in-app immediately after processing
- Email a copy for reference
- Store for user's history

---

## Database Schema

```sql
-- Store session recordings
CREATE TABLE session_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  audio_path TEXT,           -- Supabase storage path
  transcript TEXT,           -- Full transcript
  transcript_path TEXT,      -- Or store as file
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Store coaching feedback
CREATE TABLE coaching_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  speaker_tips JSONB,        -- Array of tips
  listener_tips JSONB,       -- Array of tips
  clarity_score INTEGER,     -- 1-10
  raw_analysis JSONB,        -- Full LLM response
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Privacy & Consent

- Clear notice at session start: "This session may be recorded"
- Recording only uploads if user opts in for coaching
- User can delete their recordings anytime
- Transcript used for coaching, then anonymized for ML

---

## MVP Scope

### In Scope
- [ ] Record audio locally during meeting
- [ ] End-of-session prompt for coaching
- [ ] Registration gate for coaching
- [ ] Upload audio after registration
- [ ] Transcribe with Deepgram/Whisper
- [ ] Generate coaching with LLM
- [ ] Show feedback in-app
- [ ] Email feedback

### Out of Scope (Future)
- Real-time coaching during meeting
- Detailed analytics dashboard
- Progress tracking over multiple sessions
- Comparing to other users

---

## Cost Estimates

| Service | Cost per session | Notes |
|---------|------------------|-------|
| Deepgram | ~$0.01/min | ~$0.10 for 10 min session |
| OpenAI GPT-4 | ~$0.05 | For coaching generation |
| Storage | ~$0.001 | Negligible |
| **Total** | **~$0.15/session** | |

At 100 sessions/month = ~$15/month

---

## Success Metrics

- [ ] X% of session completers click "Get Feedback"
- [ ] X% of those complete registration
- [ ] User returns for another session after getting feedback

---

## Dependencies

- Supabase Storage bucket
- Deepgram or Whisper API key
- LLM API (Claude/GPT) for coaching generation

---

## Estimated Effort

| Component | Effort |
|-----------|--------|
| Audio recording hook | 2-3 hours |
| End-of-session prompt UI | 1-2 hours |
| Upload to storage | 1-2 hours |
| Transcription integration | 2-3 hours |
| LLM coaching prompt | 2-3 hours |
| Feedback display UI | 2-3 hours |
| Email delivery | 1-2 hours |
| **Total** | **~2 days** |
