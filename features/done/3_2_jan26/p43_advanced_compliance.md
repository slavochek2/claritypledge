---
status: all-done
type: story
tags: []
rank: 125437.0
created_date: 2026-01-14
completed_at: '2026-02-09'
---

# P43: Advanced Compliance Features

**Status:** Future Enhancement (Deploy at 100+ Users)
**Priority:** LOW (nice-to-have for scale)
**Est. Effort:** 8-12 hours
**Created:** 2026-01-06
**Renamed:** 2026-01-07 (was P37.2c)
**Depends On:** P37.2a (Consent), P42 (Data Rights)

---

## Implementation Order

```
┌─────────────────────────────────────────────────────────────┐
│  GDPR Compliance Phases                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  LAUNCH (Now)        SCALE (10-20 users)   GROWTH (100+)   │
│  ─────────────       ─────────────────     ─────────────   │
│  P37.2a Consent  ──► P42 Data Rights   ──► P43 (This)      │
│  P40 Microphone                                             │
│  P41 Coaching                                               │
│                                                             │
│  P43 includes:                                              │
│  - Consent withdrawal (separate from deletion)             │
│  - ML training opt-out                                     │
│  - Auto-delete after 90 days                               │
│  - Admin dashboard                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**For AI agents:** Don't implement P43 until 100+ active users OR legal counsel recommends. These are enterprise-grade features.

---

## Context

Advanced GDPR compliance features for scaling. These are **not critical for launch** and should only be implemented when:
- User base > 100 active users
- Revenue > €0 (paying customers)
- Support requests for opt-out increase (>5 requests/month)
- Legal counsel recommends additional safeguards

**For MVP:** Handle edge cases manually. Automate when manual handling becomes a burden.

---

## Objectives (Future)

- [ ] Consent withdrawal (separate from account deletion)
- [ ] Opt-out of ML training (keep recordings, don't use for models)
- [ ] Auto-delete recordings after 90 days (configurable retention policy)
- [ ] Anonymization pipeline for ML training (strip user IDs before training)
- [ ] Admin dashboard for manual deletion requests
- [ ] Data Processing Agreement (DPA) audit trail

---

## Feature 1: Consent Withdrawal

**Use Case:** User wants to stop recordings but keep their account.

**User Flow:**
```
Settings → Data Management → Consent Preferences

┌─────────────────────────────────────────────┐
│  🎙️ Recording Consent                       │
│                                             │
│  [✓] Allow voice recording in Live Meetings│
│                                             │
│  You previously consented on 2026-01-06.   │
│  Withdrawing consent will prevent future   │
│  recordings but keep your account active.  │
│                                             │
│  [Withdraw Consent]                         │
└─────────────────────────────────────────────┘
```

**Implementation:**
- Add `consent_withdrawn_at` column to `session_consents`
- Check consent status before showing Live Meeting join option
- Allow re-consent if user changes mind

**Database change:**
```sql
ALTER TABLE session_consents
ADD COLUMN consent_withdrawn_at TIMESTAMPTZ NULL;

-- User can view/update own consent status
CREATE POLICY "Users can update own consent"
  ON session_consents FOR UPDATE
  USING (auth.uid() = user_id);
```

---

## Feature 2: Opt-Out of ML Training

**Use Case:** User wants recordings for personal review but not AI training.

**User Flow:**
```
Settings → Privacy → ML Training

┌─────────────────────────────────────────────┐
│  🤖 AI Model Training                        │
│                                             │
│  [✓] Use my recordings to improve AI models│
│                                             │
│  Your recordings help us build better      │
│  understanding verification. We remove     │
│  personal identifiers before training.     │
│                                             │
│  If disabled, recordings are kept for your │
│  review only and deleted after 90 days.    │
└─────────────────────────────────────────────┘
```

**Implementation:**
- Add `ml_training_opt_out` to profiles table
- Tag recordings in GCS with metadata: `ml_training_allowed: false`
- Filter out opt-out recordings in ML pipeline

**Database change:**
```sql
ALTER TABLE profiles
ADD COLUMN ml_training_opt_out BOOLEAN DEFAULT false;
```

**GCS metadata tagging:**
```typescript
await bucket.file(filename).setMetadata({
  metadata: {
    userId,
    sessionCode,
    mlTrainingAllowed: !user.ml_training_opt_out,
  },
});
```

---

## Feature 3: Auto-Delete After 90 Days

**Use Case:** GDPR storage limitation (Article 5(1)(e)) - don't keep data longer than necessary.

**Retention Policy:**
- Recordings: Delete after 90 days
- Consent logs: Keep for 2 years (audit requirement)
- Profiles: Keep indefinitely (user account)

**Implementation:**
- Supabase cron job (or Cloud Function)
- Runs daily at 2am UTC
- Deletes recordings older than 90 days
- Logs deletion count for audit

**Example cron (Supabase Edge Function):**
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  // Get recordings older than 90 days
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);

  // List files in GCS with creation date < cutoffDate
  // Delete them
  // Log count

  return new Response(JSON.stringify({ deleted: count }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

**Supabase cron config:**
```sql
SELECT cron.schedule(
  'delete-old-recordings',
  '0 2 * * *', -- Every day at 2am
  $$
  SELECT net.http_post(
    'https://your-project.supabase.co/functions/v1/delete-old-recordings',
    headers := '{"Authorization": "Bearer service-role-key"}'::jsonb
  );
  $$
);
```

---

## Feature 4: Anonymization Pipeline

**Use Case:** Strip personal identifiers before ML training.

**What to strip:**
- User IDs → Replace with random hash
- Email addresses → Remove
- Names → Replace with "Speaker A", "Speaker B"
- IP addresses → Already hashed in consent logs

**Pipeline (when training models):**
```typescript
function anonymizeRecording(recording: Recording): AnonymizedRecording {
  return {
    sessionId: hashSessionId(recording.sessionId), // One-way hash
    speakerRole: recording.userName === recording.creatorName ? 'A' : 'B',
    audioUrl: recording.audioUrl, // Keep audio
    transcript: recording.transcript, // Keep content
    accuracy: recording.accuracy, // Keep metrics
    // Remove: userId, email, name, IP
  };
}
```

---

## Feature 5: Admin Dashboard

**Use Case:** Support team needs to manually handle edge cases.

**Features:**
- View pending deletion requests
- Manually trigger deletion for specific user
- View consent logs for audit
- Export user data on behalf of user (if request via email)

**Access Control:**
- Only admin users can access
- Add `is_admin` column to profiles
- Protected route: `/admin/data-requests`

**UI (React Admin or custom):**
```
┌─────────────────────────────────────────────┐
│  Admin: Data Requests                        │
├─────────────────────────────────────────────┤
│  User: john@example.com                     │
│  Request: Export data                       │
│  Date: 2026-01-06                           │
│  [Export] [Mark Complete]                   │
├─────────────────────────────────────────────┤
│  User: jane@example.com                     │
│  Request: Delete account                    │
│  Date: 2026-01-05                           │
│  [Delete] [Cancel]                          │
└─────────────────────────────────────────────┘
```

---

## Feature 6: Data Processing Agreement (DPA) Audit

**Use Case:** Document third-party processors for GDPR Article 28.

**Current processors:**
- Google Cloud Storage (recordings)
- Supabase (database)
- Mixpanel (analytics)
- Sentry (error tracking)

**Audit trail:**
- Create `data_processors` table
- Document each processor: name, purpose, DPA signed, review date
- Admin dashboard to track renewals

**Database:**
```sql
CREATE TABLE data_processors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, -- "Google Cloud Storage"
  purpose TEXT NOT NULL, -- "Audio recording storage"
  dpa_signed BOOLEAN DEFAULT false,
  dpa_url TEXT, -- Link to signed DPA
  review_date DATE, -- Next review date
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## When to Implement These Features

| Feature | Trigger | Priority |
|---------|---------|----------|
| **Consent withdrawal** | >5 withdrawal requests/month | Medium |
| **Opt-out ML training** | User complaints about AI use | Medium |
| **Auto-delete (90 days)** | Storage costs >$50/month | High |
| **Anonymization pipeline** | Before training first ML model | High |
| **Admin dashboard** | >10 manual data requests/month | Low |
| **DPA audit trail** | Legal counsel recommends | Low |

---

## Non-Goals (Still Out of Scope)

- Setting up `privacy@claritypledge.com` email (use `support@` for now)
- Registering with Estonian Data Protection Inspectorate (wait for 100+ EU users)
- Cyber liability insurance (wait for revenue)
- DPO appointment (not required for small operations <250 employees)
- End-to-end encryption for Live Meetings (future security enhancement)
- Cookie consent banner (only needed if using non-essential cookies)

---

## Success Metrics (Future)

- Auto-delete job runs successfully daily (0 failures)
- ML training uses only anonymized data (0 personal identifiers leaked)
- Admin dashboard reduces manual request handling time by 80%
- Consent withdrawal rate <5% (indicates clear communication)

---

## Related Documents

- [P37.2a: Consent Mechanism](./p353_2a_consent_mechanism.md)
- [P37.2b: Data Rights](./p37_2b_data_rights.md)
- [Privacy Policy](../../../src/app/pages/privacy-policy-page.tsx)
- [CLAUDE.md - GDPR Compliance](../../../CLAUDE.md)
