# P41: Clarity Coach (Post-Session Email & Conversion)

**Status:** Ready for Implementation
**Priority:** HIGH (Guest conversion)
**Est. Effort:** 1 day
**Created:** 2026-01-07
**Revised:** 2026-01-09 (KISS simplification)
**Depends On:** P37.2a (Recording Consent + Guest Registration)

---

## Goal

**Convert guests to verified users** via magic link in post-session email.

The AI coaching is the *carrot* (promise of value), not the *engine* (actual feature).

---

## Phase 1: KISS (This Spec)

Ship the conversion mechanism. Validate demand for AI coaching before building it.

| What Ships | What Doesn't Ship (Yet) |
|------------|-------------------------|
| Post-session email with magic link | Transcription |
| "Coming Soon" page at `/coaching` | LLM analysis |
| Feature request capture | Audio upload pipeline |
| Demand validation | Full coaching report |

**Cost per session:** $0.00 (email only)

---

## User Flow

```
1. Session ends normally

2. Email sent immediately via Brevo:
   ┌────────────────────────────────────────┐
   │  Nice session with [Partner]!          │
   │                                        │
   │  Your AI Clarity Coaching is ready.    │
   │                                        │
   │  [Unlock My Coaching Report]           │
   │         ↑ magic link                   │
   └────────────────────────────────────────┘

3. User clicks → magic link verifies email → redirect to /coaching

4. /coaching page (Coming Soon):
   ┌────────────────────────────────────────┐
   │  AI Coaching - Coming Soon             │
   │                                        │
   │  We're building personalized feedback  │
   │  based on your clarity sessions.       │
   │                                        │
   │  Want early access? Tell us why:       │
   │  ┌──────────────────────────────────┐  │
   │  │ (optional text field)            │  │
   │  └──────────────────────────────────┘  │
   │                                        │
   │  [Request Early Access]                │
   │                                        │
   │  Meanwhile, check your profile →       │
   └────────────────────────────────────────┘

5. Submit → insert to feature_requests table
```

---

## Technical Implementation

### 1. Database: Feature Requests Table

```sql
CREATE TABLE feature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id),
  feature TEXT NOT NULL,  -- 'ai_coaching'
  reason TEXT,            -- optional user input
  requested_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Users can insert their own requests
CREATE POLICY "Users can request features"
  ON feature_requests FOR INSERT
  WITH CHECK (auth.uid() = profile_id);

-- RLS: Users can view their own requests
CREATE POLICY "Users can view own requests"
  ON feature_requests FOR SELECT
  USING (auth.uid() = profile_id);
```

### 2. Trigger: Session End → Email

```typescript
// When session ends successfully
async function onSessionEnd(sessionCode: string) {
  const participants = await getSessionParticipants(sessionCode);

  for (const participant of participants) {
    await sendCoachingTeaser({
      email: participant.email,
      name: participant.name,
      partnerName: getPartnerName(participants, participant),
      sessionCode,
    });
  }
}
```

### 3. Email via Brevo

```typescript
async function sendCoachingTeaser({
  email,
  name,
  partnerName,
  sessionCode,
}: CoachingTeaserParams) {
  // Generate magic link that redirects to /coaching after verification
  const magicLink = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${SITE_URL}/coaching?session=${sessionCode}`,
    },
  });

  // Send via Brevo
  await brevo.sendTransactionalEmail({
    to: [{ email, name }],
    templateId: COACHING_TEASER_TEMPLATE_ID,
    params: {
      name,
      partnerName,
      ctaLink: magicLink,
    },
  });
}
```

### 4. Route: `/coaching`

New page at `src/app/pages/CoachingPage.tsx`:

```typescript
export function CoachingPage() {
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function handleRequest() {
    await supabase.from('feature_requests').insert({
      profile_id: user.id,
      feature: 'ai_coaching',
      reason: reason || null,
    });
    setSubmitted(true);
    analytics.track('feature_requested', { feature: 'ai_coaching' });
  }

  if (submitted) {
    return <ThankYouState />;
  }

  return (
    <ComingSoonState
      reason={reason}
      setReason={setReason}
      onRequest={handleRequest}
    />
  );
}
```

### 5. Add Route to App.tsx

```typescript
<Route path="/coaching" element={<CoachingPage />} />
```

---

## Email Template (Brevo)

**Subject:** Your AI Clarity Coaching is ready

**Body:**
```
Hi {{name}},

Nice session with {{partnerName}}!

Your personalized AI Clarity Coaching report is ready.
Click below to unlock your feedback:

[Unlock My Coaching Report]

See you next session,
The Clarity Pledge Team
```

---

## MVP Scope

### In Scope (Phase 1)
- [ ] Create `feature_requests` table + RLS
- [ ] Post-session email trigger
- [ ] Brevo email template
- [ ] `/coaching` coming soon page
- [ ] Feature request form (optional reason field)
- [ ] Mixpanel tracking for requests

### Out of Scope (Phase 2 - Future)
- Audio upload to storage
- Transcription (Deepgram/Whisper)
- LLM coaching generation
- Full coaching report page
- Coaching history

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Email delivery rate | 95%+ | Brevo dashboard |
| Click-through rate | 30%+ | Magic link clicks / emails sent |
| Guest → Verified conversion | 25%+ | New verified users / guests emailed |
| Feature request rate | 20%+ | Requests / verified users on page |

---

## Validation Signal

**If 40%+ of users click "Request Early Access"** → Build Phase 2 (full AI coaching).

**If <10% click** → Reconsider the feature or improve the promise.

---

## Phase 2: Full AI Coaching (Future)

Only build after Phase 1 validates demand. Original scope preserved here:

<details>
<summary>Phase 2 Technical Spec (click to expand)</summary>

### Audio Upload
```typescript
async function uploadSessionAudio(
  sessionCode: string,
  audioBlob: Blob,
  userId: string
) {
  const path = `sessions/${sessionCode}/${userId}.webm`;
  await supabase.storage
    .from('recordings')
    .upload(path, audioBlob);
}
```

### Transcription + Coaching
```typescript
async function generateCoaching(sessionCode: string, userId: string) {
  const recording = await getRecording(sessionCode, userId);
  const transcript = await transcribe(recording.audio_path);
  const ratings = await getSessionRatings(sessionCode, userId);

  const coaching = await generateWithLLM({
    transcript,
    ratings,
    role: 'both',
  });

  return coaching;
}
```

### Cost Estimates (Phase 2)
| Service | Cost per session |
|---------|------------------|
| Deepgram | ~$0.10/session |
| OpenAI GPT-4 | ~$0.05/session |
| **Total** | ~$0.15/session |

</details>

---

## Dependencies

- P37.2a implemented (guest registration with email)
- Brevo configured (already done)
- Supabase auth magic links (already done)

---

## Related Documents

- [P37.2a: Recording Consent](./p37_2a_consent_mechanism.md) - Prerequisite consent flow
- [P40: Microphone Permission](./p40_microphone_permission.md) - Prerequisite mic handling
