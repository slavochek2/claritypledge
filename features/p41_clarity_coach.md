# P41: Clarity Coach (Post-Session Email & Feedback)

**Status:** Ready for Implementation
**Priority:** HIGH (Guest conversion + user value)
**Est. Effort:** 2 days
**Created:** 2026-01-07
**Depends On:** P37.2a (Recording Consent + Guest Registration)

---

## Implementation Order

```
┌─────────────────────────────────────────────────────────────┐
│  Feature Dependencies                                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  P37.2a (Consent + Join) ──► P41 (This)                    │
│  - Guest user records         - Post-session email         │
│  - Consent audit trail        - AI coaching                │
│  - Audio recordings           - Guest → verified user      │
│                                                             │
│  P41 REQUIRES from P37.2a:                                  │
│  - profiles table with guest users (email + userId)        │
│  - session_consents table (consent audit)                  │
│  - Audio recordings uploaded at session end                │
│                                                             │
│  P41 PROVIDES:                                              │
│  - Guest → verified user conversion via magic link         │
│  - AI coaching feedback (value delivery)                   │
│  - Transcript storage for future features                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**For AI agents:** Implement P37.2a first. P41 cannot function without guest user records and session data from P37.2a.

---

## Context

With P37.2a's soft registration approach, guests provide their email at session join but aren't verified users yet. The post-session email serves two critical purposes:

1. **Convert guests to verified users** via magic link
2. **Deliver value** through AI coaching feedback

This replaces the old "registration gate" concept - users already provided email, now we deliver on the promised value.

---

## What Changed from Original P29

| Aspect | Old (P29) | New (P41) |
|--------|-----------|-----------|
| Registration | Optional, gate to coaching | Already done (soft registration at join) |
| Recording consent | "May be recorded" notice | Explicit consent at join (P37.2a) |
| Audio upload | Only if user opts in | Automatic (consent given at join) |
| Email trigger | User clicks "Get Feedback" | Automatic after session ends |
| Verification | Separate flow | Magic link in coaching email |

---

## User Flow

### For Guests (Unverified Users)

```
1. Session ends normally

2. Email sent (within 5 minutes):
   ┌────────────────────────────────────────┐
   │  Your Clarity Feedback                 │
   │                                        │
   │  Hi [Name],                            │
   │                                        │
   │  Here's your coaching from today's     │
   │  session with [Partner Name]:          │
   │                                        │
   │  AS A SPEAKER:                         │
   │  ✓ Good: Short sentences, clear        │
   │  △ Try: Pause after key points         │
   │                                        │
   │  AS A LISTENER:                        │
   │  ✓ Good: Asked clarifying Qs           │
   │  △ Try: Reflect back more often        │
   │                                        │
   │  ─────────────────────────────────     │
   │                                        │
   │  [View Full Report & Create Profile]   │
   │                                        │
   │  Click above to access your complete   │
   │  coaching report and join the Clarity  │
   │  Pledge community.                     │
   └────────────────────────────────────────┘

3. User clicks link → Magic link verification:
   - If unverified: Verify email, redirect to full report
   - If already verified: Login, redirect to full report

4. In-app full report (after verification):
   ┌────────────────────────────────────┐
   │  Your Clarity Feedback             │
   │  Session with [Partner] • [Date]   │
   │                                    │
   │  OVERALL CLARITY SCORE: 7.5/10     │
   │                                    │
   │  AS A SPEAKER (detailed):          │
   │  [Expanded feedback with quotes]   │
   │                                    │
   │  AS A LISTENER (detailed):         │
   │  [Expanded feedback with quotes]   │
   │                                    │
   │  [Start Another Session]           │
   └────────────────────────────────────┘
```

### For Verified Users

Same flow, but:
- Email goes to verified email
- Link logs them in (if not already)
- No verification needed

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

### 1. Trigger: Session End Event

```typescript
// When session ends successfully:
async function onSessionEnd(sessionCode: string) {
  const participants = await getSessionParticipants(sessionCode);

  for (const participant of participants) {
    // Queue coaching generation + email
    await queueCoachingEmail({
      sessionCode,
      userId: participant.userId,
      email: participant.email,
      name: participant.name,
      isVerified: participant.isVerified,
    });
  }
}
```

### 2. Audio Upload (Already Consented)

```typescript
// Audio recorded during session, uploaded at end
// No prompt needed - consent given at join (P37.2a)
async function uploadSessionAudio(
  sessionCode: string,
  audioBlob: Blob,
  userId: string
) {
  const path = `sessions/${sessionCode}/${userId}.webm`;
  await supabase.storage
    .from('recordings')
    .upload(path, audioBlob);

  await supabase
    .from('session_recordings')
    .insert({
      session_code: sessionCode,
      user_id: userId,
      audio_path: path,
    });
}
```

### 3. Transcription + Coaching (Background Job)

```typescript
// Edge function or background job
async function generateCoaching(sessionCode: string, userId: string) {
  // 1. Get audio
  const recording = await getRecording(sessionCode, userId);

  // 2. Transcribe
  const transcript = await transcribe(recording.audio_path);

  // 3. Get session ratings
  const ratings = await getSessionRatings(sessionCode, userId);

  // 4. Generate coaching with LLM
  const coaching = await generateWithLLM({
    transcript,
    ratings,
    role: 'both', // speaker + listener feedback
  });

  // 5. Store
  await supabase
    .from('coaching_feedback')
    .insert({
      session_code: sessionCode,
      user_id: userId,
      speaker_tips: coaching.speakerTips,
      listener_tips: coaching.listenerTips,
      clarity_score: coaching.overallScore,
      raw_analysis: coaching.raw,
    });

  return coaching;
}
```

### 4. Email Delivery

```typescript
async function sendCoachingEmail(
  email: string,
  name: string,
  coaching: CoachingFeedback,
  isVerified: boolean
) {
  const magicLink = await generateMagicLink(
    email,
    `/coaching/${coaching.session_code}` // redirect after verify
  );

  await sendEmail({
    to: email,
    subject: 'Your Clarity Coaching Feedback',
    template: 'coaching-feedback',
    data: {
      name,
      speakerTips: coaching.speaker_tips,
      listenerTips: coaching.listener_tips,
      score: coaching.clarity_score,
      ctaLink: magicLink,
      ctaText: isVerified
        ? 'View Full Report'
        : 'View Full Report & Create Profile',
    },
  });
}
```

---

## Database Schema

```sql
-- Store session recordings (updated from P29)
CREATE TABLE session_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code TEXT NOT NULL,
  user_id UUID NOT NULL,  -- Can be unverified user
  audio_path TEXT,
  transcript TEXT,
  transcript_status TEXT DEFAULT 'pending',  -- pending, processing, complete, failed
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES profiles(id)
);

-- Store coaching feedback
CREATE TABLE coaching_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code TEXT NOT NULL,
  user_id UUID NOT NULL,
  speaker_tips JSONB,
  listener_tips JSONB,
  clarity_score INTEGER CHECK (clarity_score >= 1 AND clarity_score <= 10),
  raw_analysis JSONB,
  email_sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,  -- Track if user opened report
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES profiles(id)
);

-- RLS: Users can only see their own coaching
CREATE POLICY "Users can view own coaching"
  ON coaching_feedback FOR SELECT
  USING (auth.uid() = user_id);
```

---

## Privacy & Consent

All handled by P37.2a:
- Recording consent given at session join
- Terms agreement at session join
- Data processing covered by Privacy Policy
- Deletion rights preserved (user can request deletion anytime)

**P41 adds no new consent requirements** - it just delivers the promised value.

---

## MVP Scope

### In Scope
- [ ] Trigger coaching generation on session end
- [ ] Upload audio to Supabase Storage
- [ ] Transcribe with Deepgram/Whisper
- [ ] Generate coaching with LLM
- [ ] Send email with preview + magic link
- [ ] Full report page (requires verification)
- [ ] Track email sent/viewed metrics

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
| Email (Resend) | ~$0.001 | Negligible |
| Storage | ~$0.001 | Negligible |
| **Total** | **~$0.15/session** | |

At 100 sessions/month = ~$15/month

---

## Success Metrics

- [ ] 80%+ of coaching emails delivered (not bounced)
- [ ] 40%+ of unverified users click through to verify
- [ ] 60%+ of verified users view their full report
- [ ] Users who receive coaching return for another session

---

## Dependencies

- P37.2a implemented (consent flow)
- P40 implemented (microphone permission)
- Supabase Storage bucket configured
- Deepgram or Whisper API key
- LLM API (Claude/GPT) for coaching
- Email provider (Resend) configured

---

## Related Documents

- [P37.2a: Recording Consent](./p37_2a_consent_mechanism.md) - Prerequisite consent flow
- [P40: Microphone Permission](./p40_microphone_permission.md) - Prerequisite mic handling
