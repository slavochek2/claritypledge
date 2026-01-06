# P37.2: GDPR Compliance (Consent & User Rights)

**Status:** Ready for Implementation
**Priority:** 🔴 Critical (Before First Public Recording)
**Est. Effort:** 4-6 hours (consent + logging), +4 hours (export/deletion)
**Created:** 2026-01-06
**Depends On:** P37.1 (Legal Entity Update)

---

## Context

Live Meetings record user voice data and train ML models. Under GDPR:
- **Voice recordings = biometric data** (Article 9 - "special category")
- **Biometric data requires explicit consent** (not just Terms acceptance)
- **Users have rights:** access, export, deletion, opt-out

Without explicit consent + audit trail, we're vulnerable to GDPR complaints and fines.

---

## Objectives

**Phase 1 (Must-Have - Before ANY Public Recordings):**
- [ ] Explicit consent UI before Live Meeting recording starts
- [ ] Log consent timestamps with proof (session ID, user/guest hash, IP hash, timestamp)
- [ ] Store consent in database for audit trail

**Phase 2 (Nice-to-Have - Before 50-100 Users):**
- [ ] Data export endpoint (user downloads all their data as JSON)
- [ ] Data deletion endpoint (user requests account deletion)
- [ ] Settings page UI for data management

**Phase 3 (Future - When Scaling):**
- [ ] Opt-out of ML training (keep recordings, don't use for training)
- [ ] Auto-delete recordings after 90 days (configurable retention policy)
- [ ] Admin dashboard for deletion requests

---

## Phase 1: Explicit Consent + Logging (Critical)

### User Flow

**Before Session Recording Starts:**

```
┌─────────────────────────────────────────────────────┐
│  🎙️  Recording Consent Required                     │
│                                                     │
│  This Live Meeting will record your voice and may  │
│  be used to improve our AI models.                 │
│                                                     │
│  • Voice recordings stored securely in Google Cloud│
│  • Used to train understanding verification AI     │
│  • Personal identifiers removed before ML training │
│  • You can request deletion anytime                │
│                                                     │
│  [✓] I consent to recording and ML training        │
│                                                     │
│  Learn more: Privacy Policy                        │
│                                                     │
│  [Cancel]  [Start Recording] (disabled until ✓)   │
└─────────────────────────────────────────────────────┘
```

**Key requirements:**
- Checkbox must be **manually checked** (no pre-ticked boxes)
- "Start Recording" button **disabled** until consent given
- Link to Privacy Policy for full details
- Clear, non-legal language

### Database Schema

**New table:** `session_consents`

```sql
CREATE TABLE session_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Session identification
  session_id TEXT NOT NULL, -- Live Meeting session code

  -- User identification (nullable for guests)
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_identifier TEXT, -- Hashed guest ID (e.g., "guest_abc123")

  -- Consent details
  consent_given BOOLEAN NOT NULL DEFAULT false,
  consent_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Audit trail
  ip_hash TEXT, -- SHA256 hash of IP address (privacy-preserving)
  user_agent TEXT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT user_or_guest CHECK (
    (user_id IS NOT NULL AND guest_identifier IS NULL) OR
    (user_id IS NULL AND guest_identifier IS NOT NULL)
  )
);

-- Index for lookups
CREATE INDEX idx_session_consents_session_id ON session_consents(session_id);
CREATE INDEX idx_session_consents_user_id ON session_consents(user_id);

-- RLS Policies
ALTER TABLE session_consents ENABLE ROW LEVEL SECURITY;

-- Users can view their own consents
CREATE POLICY "Users can view own consents"
  ON session_consents FOR SELECT
  USING (auth.uid() = user_id);

-- Any authenticated user can insert consent (for joining sessions)
CREATE POLICY "Anyone can record consent"
  ON session_consents FOR INSERT
  WITH CHECK (true);
```

### Implementation Files

**1. Consent Dialog Component**

**File:** `src/app/components/live-meeting/recording-consent-dialog.tsx`

```tsx
interface RecordingConsentDialogProps {
  open: boolean;
  onConsent: () => void;
  onCancel: () => void;
}

export function RecordingConsentDialog({
  open,
  onConsent,
  onCancel
}: RecordingConsentDialogProps) {
  const [consentChecked, setConsentChecked] = useState(false);

  return (
    <Dialog open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>🎙️ Recording Consent Required</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-muted-foreground">
            This Live Meeting will record your voice and may be used to improve our AI models.
          </p>

          <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
            <li>Voice recordings stored securely in Google Cloud</li>
            <li>Used to train understanding verification AI</li>
            <li>Personal identifiers removed before ML training</li>
            <li>You can request deletion anytime</li>
          </ul>

          <div className="flex items-start gap-2">
            <Checkbox
              id="consent"
              checked={consentChecked}
              onCheckedChange={(checked) => setConsentChecked(checked === true)}
            />
            <label htmlFor="consent" className="text-sm cursor-pointer">
              I consent to recording and ML training
            </label>
          </div>

          <p className="text-xs text-muted-foreground">
            Learn more:{" "}
            <a href="/privacy-policy" target="_blank" className="text-blue-600 hover:underline">
              Privacy Policy
            </a>
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={onConsent}
            disabled={!consentChecked}
          >
            Start Recording
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**2. Consent Logging Function**

**File:** `src/app/data/api.ts` (add to existing file)

```typescript
/**
 * Log user consent for session recording and ML training.
 *
 * @param sessionId - Live Meeting session code
 * @param userId - Authenticated user ID (null for guests)
 * @param guestIdentifier - Hashed guest identifier (null for auth users)
 */
export async function logSessionConsent(
  sessionId: string,
  userId: string | null,
  guestIdentifier: string | null
): Promise<void> {
  // Hash IP address for privacy (don't store raw IP)
  const ipHash = await hashIP();

  const { error } = await supabase
    .from('session_consents')
    .insert({
      session_id: sessionId,
      user_id: userId,
      guest_identifier: guestIdentifier,
      consent_given: true,
      ip_hash: ipHash,
      user_agent: navigator.userAgent,
    });

  if (error) {
    console.error('Failed to log consent:', error);
    throw new Error('Failed to record consent');
  }

  console.log('✅ Consent logged:', { sessionId, userId, guestIdentifier });
}

/**
 * Hash IP address using SHA-256 for privacy-preserving audit trail.
 */
async function hashIP(): Promise<string> {
  try {
    // Fetch IP from ipify or similar service
    const response = await fetch('https://api.ipify.org?format=json');
    const { ip } = await response.json();

    // Hash with SHA-256
    const encoder = new TextEncoder();
    const data = encoder.encode(ip);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return hashHex;
  } catch (error) {
    console.warn('Failed to hash IP:', error);
    return 'unknown';
  }
}
```

**3. Integration into Live Meeting Flow**

**File:** `src/app/pages/clarity-live-page.tsx` (or relevant session start component)

```tsx
// Add state
const [showConsentDialog, setShowConsentDialog] = useState(false);
const [consentGiven, setConsentGiven] = useState(false);

// Before starting recording
const handleStartSession = () => {
  if (!consentGiven) {
    setShowConsentDialog(true);
    return;
  }

  // Proceed with recording...
};

const handleConsent = async () => {
  try {
    // Log consent
    await logSessionConsent(
      sessionCode,
      user?.id || null,
      user ? null : `guest_${generateGuestHash()}`
    );

    setConsentGiven(true);
    setShowConsentDialog(false);

    // Now start recording
    startRecording();
  } catch (error) {
    console.error('Consent failed:', error);
    alert('Failed to record consent. Please try again.');
  }
};

// Render
return (
  <>
    <RecordingConsentDialog
      open={showConsentDialog}
      onConsent={handleConsent}
      onCancel={() => setShowConsentDialog(false)}
    />

    {/* Rest of Live Meeting UI */}
  </>
);
```

### Acceptance Criteria (Phase 1)

- [ ] User CANNOT start recording without checking consent checkbox
- [ ] Consent dialog shows BEFORE any recording starts (both host and guest)
- [ ] Consent timestamp logged to `session_consents` table
- [ ] IP hash stored (not raw IP address)
- [ ] Guest users get hashed identifier (e.g., `guest_abc123`)
- [ ] Authenticated users have `user_id` linked to `auth.users`
- [ ] Privacy Policy link in dialog works
- [ ] Cancel button returns user to session without recording

---

## Phase 2: Data Export & Deletion (Before 50-100 Users)

### User Flow

**Settings Page → Data Management Section:**

```
┌─────────────────────────────────────────────┐
│  📦 Your Data                                │
│                                             │
│  You have the right to export or delete    │
│  your personal data.                       │
│                                             │
│  [Download My Data] (JSON export)          │
│  [Request Account Deletion] (permanent)    │
└─────────────────────────────────────────────┘
```

### Implementation

**1. Data Export Endpoint**

**File:** `src/app/data/api.ts`

```typescript
/**
 * Export all user data as JSON (GDPR Article 20 - Right to Data Portability)
 */
export async function exportUserData(userId: string): Promise<UserDataExport> {
  // Fetch profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (profileError) throw profileError;

  // Fetch witnesses
  const { data: witnesses, error: witnessesError } = await supabase
    .from('witnesses')
    .select('*')
    .eq('profile_id', userId);

  if (witnessesError) throw witnessesError;

  // Fetch session consents
  const { data: consents, error: consentsError } = await supabase
    .from('session_consents')
    .select('*')
    .eq('user_id', userId);

  if (consentsError) throw consentsError;

  // TODO: Fetch session data (when live meetings table exists)

  return {
    profile,
    witnesses,
    consents,
    exportedAt: new Date().toISOString(),
  };
}

interface UserDataExport {
  profile: Profile;
  witnesses: Witness[];
  consents: SessionConsent[];
  exportedAt: string;
}
```

**2. Data Deletion Endpoint**

**File:** `src/app/data/api.ts`

```typescript
/**
 * Request account deletion (GDPR Article 17 - Right to be Forgotten)
 *
 * Note: Some data may be retained for legal compliance (e.g., financial records).
 * Anonymized data in ML models cannot be removed (personal identifiers already removed).
 */
export async function requestAccountDeletion(userId: string): Promise<void> {
  // Delete witnesses
  await supabase.from('witnesses').delete().eq('profile_id', userId);

  // Delete consents
  await supabase.from('session_consents').delete().eq('user_id', userId);

  // TODO: Delete session recordings from Google Cloud Storage

  // Delete profile (cascades to auth.users via FK)
  await supabase.from('profiles').delete().eq('id', userId);

  console.log('✅ Account deleted:', userId);
}
```

**3. Settings Page UI**

**File:** `src/app/pages/settings-page.tsx` (add section)

```tsx
<section>
  <h2 className="text-xl font-bold mb-4">Your Data</h2>
  <p className="text-muted-foreground mb-4">
    You have the right to export or delete your personal data.
  </p>

  <div className="space-y-2">
    <Button
      variant="outline"
      onClick={handleExportData}
    >
      📦 Download My Data
    </Button>

    <Button
      variant="destructive"
      onClick={handleRequestDeletion}
    >
      🗑️ Request Account Deletion
    </Button>
  </div>
</section>
```

### Acceptance Criteria (Phase 2)

- [ ] User can download JSON export of all their data
- [ ] Export includes: profile, witnesses, consents, session data
- [ ] Deletion request removes profile, witnesses, consents
- [ ] Deletion shows confirmation dialog ("This is permanent. Continue?")
- [ ] After deletion, user is logged out and redirected to homepage
- [ ] Deletion logs event for audit trail

---

## Phase 3: Advanced Features (Future)

**Out of scope for initial launch. Implement when:**
- User base > 100
- Revenue > €0
- Support requests for opt-out increase

**Features:**
- Opt-out of ML training checkbox (Settings page)
- Auto-delete recordings after 90 days (cron job)
- Anonymization pipeline for ML training (strip user IDs before training)
- Admin dashboard for manual deletion requests

---

## Testing Checklist

### Phase 1 (Consent)
- [ ] Start Live Meeting as authenticated user → consent dialog appears
- [ ] Start Live Meeting as guest → consent dialog appears
- [ ] Try to start recording without checking checkbox → button disabled
- [ ] Check consent checkbox → button enabled
- [ ] Click "Start Recording" → consent logged to database
- [ ] Check `session_consents` table → entry exists with correct session_id, user_id, ip_hash
- [ ] Cancel consent dialog → no consent logged, no recording starts

### Phase 2 (Export/Deletion)
- [ ] Click "Download My Data" → JSON file downloads with all user data
- [ ] Click "Request Account Deletion" → confirmation dialog appears
- [ ] Confirm deletion → account removed, logged out, redirected to homepage
- [ ] Try to log in after deletion → profile not found error

---

## Migration Plan

**Database migration file:** `supabase/migrations/003_session_consents.sql`

```sql
-- Run this after P37.1 is deployed

-- Create session_consents table
-- (See schema above)

-- Add RLS policies
-- (See schema above)
```

**Deployment order:**
1. Deploy P37.1 (legal docs)
2. Run database migration (add `session_consents` table)
3. Deploy P37.2 Phase 1 (consent dialog + logging)
4. Test with 10 friends/team members
5. Deploy P37.2 Phase 2 (export/deletion) when hitting 50 users

---

## Non-Goals (Out of Scope)

- Setting up `privacy@claritypledge.com` email (use `support@` for now)
- Registering with Estonian Data Protection Inspectorate (wait for 100+ users)
- Cyber liability insurance (wait for revenue)
- DPO appointment (not required for small operations)
- End-to-end encryption for Live Meetings (future security enhancement)

---

## Dependencies

- **P37.1** must be deployed first (legal entity established)
- **Supabase database migration** required for `session_consents` table
- **Google Cloud Storage access** for recording deletion (Phase 2)

---

## Success Metrics

**Phase 1:**
- 100% consent rate before any recording starts
- Zero recordings without consent logged
- Audit trail available for all sessions

**Phase 2:**
- <24 hour turnaround on data export requests
- <7 day turnaround on deletion requests
- Zero GDPR complaints

---

## Notes

- **Why IP hash instead of raw IP?** GDPR requires "data minimization." We don't need exact IP, just proof of consent origin.
- **Why separate consent from Terms?** GDPR Article 9 requires explicit consent for biometric data (voice). Terms acceptance isn't specific enough.
- **Can we skip consent for "private" sessions?** No. GDPR applies even for private/test data if it involves real people.
- **What if user declines consent?** They can use the pledge/profile features, but cannot participate in Live Meetings.

---

## Open Questions

- [ ] Should we auto-delete recordings after 90 days, or keep indefinitely? (Recommend 90 days for GDPR "storage limitation" principle)
- [ ] Should we allow opt-out of ML training but keep recordings? (Nice-to-have, not critical)
- [ ] Do we need separate consent for "storage" vs "ML training"? (One consent is sufficient if clearly explained)

---

## Related Documents

- [Privacy Policy](../src/app/pages/privacy-policy-page.tsx)
- [Terms of Service](../src/app/pages/terms-of-service-page.tsx)
- [P37.1: Legal Entity Update](./p37_1_legal_entity_update.md)
- [CLAUDE.md - GDPR Compliance Notes](../CLAUDE.md)
