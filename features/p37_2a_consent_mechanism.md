# P37.2a: Recording Consent Mechanism (CRITICAL)

**Status:** Ready for Implementation
**Priority:** 🔴 CRITICAL (Blocks Public Launch)
**Est. Effort:** 6-8 hours
**Created:** 2026-01-06
**Depends On:** P37.1 (Legal Entity Update)

---

## Context

Live Meetings record user voice data and train ML models. Under GDPR:
- **Voice recordings = biometric data** (Article 9 - "special category")
- **Biometric data requires explicit consent** (not just Terms acceptance)
- **Must have audit trail** to prove consent was obtained

**Current State:** Recording system exists in [clarity-live-page.tsx](../src/app/pages/clarity-live-page.tsx:148) but has NO consent mechanism. Every recording without explicit consent is a GDPR violation.

**This feature blocks public launch.** Do NOT allow public recordings until deployed.

---

## Objectives

- [ ] Explicit consent UI before Live Meeting recording starts
- [ ] Log consent timestamps with audit trail (session ID, user/guest hash, IP hash, timestamp)
- [ ] Store consent in database with secure RLS policies
- [ ] Block recording start until consent is given and logged
- [ ] Verify consent before uploading audio chunks

---

## User Flow

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

---

## Database Schema

**New table:** `session_consents`

**Migration file:** `supabase/migrations/20260106_session_consents.sql`

```sql
-- P37.2a: Session consent audit trail for GDPR compliance
-- Voice recordings = biometric data (GDPR Article 9) requiring explicit consent

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

-- Indexes for lookups
CREATE INDEX idx_session_consents_session_id ON session_consents(session_id);
CREATE INDEX idx_session_consents_user_id ON session_consents(user_id);

-- RLS Policies
ALTER TABLE session_consents ENABLE ROW LEVEL SECURITY;

-- Users can view their own consents
CREATE POLICY "Users can view own consents"
  ON session_consents FOR SELECT
  USING (auth.uid() = user_id);

-- SECURE POLICY: Prevent fake consent records
-- Only allow inserting for own user_id OR as guest (can't verify guest uniqueness)
CREATE POLICY "Users can record own consent"
  ON session_consents FOR INSERT
  WITH CHECK (
    -- Authenticated users must match their auth.uid()
    (auth.uid() = user_id AND guest_identifier IS NULL) OR
    -- Guest consents allowed (can't verify guest_identifier uniqueness)
    (user_id IS NULL AND guest_identifier IS NOT NULL)
  );
```

**Security Fix:** The original P37.2 spec had `WITH CHECK (true)` which allowed ANY user to insert fake consent records. This version restricts to own user_id or guest mode.

---

## Implementation Files

### 1. Consent Dialog Component

**File:** `src/app/components/live-meeting/recording-consent-dialog.tsx`

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
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

---

### 2. Consent Logging Functions

**File:** `src/app/data/api.ts` (add to existing file)

```typescript
/**
 * Log user consent for session recording and ML training.
 * CRITICAL: Must be called before any recording starts.
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
  // TODO: Replace with server-side IP hashing via Edge Function
  // For now, use browser-based hashing (not ideal but better than nothing)
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
 * Verify consent was logged before uploading recordings.
 * CRITICAL: Call this before uploadAudioChunk() to ensure compliance.
 *
 * @param sessionId - Live Meeting session code
 * @param userId - User ID (null for guests)
 * @param guestIdentifier - Guest identifier (null for auth users)
 */
export async function verifyConsentLogged(
  sessionId: string,
  userId: string | null,
  guestIdentifier: string | null
): Promise<boolean> {
  const query = supabase
    .from('session_consents')
    .select('id')
    .eq('session_id', sessionId)
    .eq('consent_given', true);

  if (userId) {
    query.eq('user_id', userId);
  } else if (guestIdentifier) {
    query.eq('guest_identifier', guestIdentifier);
  }

  const { data, error } = await query.single();

  if (error || !data) {
    console.error('Consent verification failed:', error);
    return false;
  }

  return true;
}

/**
 * Generate cryptographically secure guest identifier.
 */
export function generateGuestHash(): string {
  // Use crypto.randomUUID() for secure random ID
  return `guest_${crypto.randomUUID()}`;
}

/**
 * Hash IP address using SHA-256 for privacy-preserving audit trail.
 * TODO: Move to server-side Edge Function for better security.
 */
async function hashIP(): Promise<string> {
  try {
    // Fetch IP from ipify (free, reliable service)
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
    // Return browser-generated hash as fallback
    return `browser_${crypto.randomUUID()}`;
  }
}
```

---

### 3. Integration into Live Meeting Flow

**File:** `src/app/pages/clarity-live-page.tsx`

**Changes needed:**

```tsx
// Add state for consent
const [showConsentDialog, setShowConsentDialog] = useState(false);
const [consentGiven, setConsentGiven] = useState(false);
const guestIdentifierRef = useRef<string | null>(null);

// Before starting session in live mode
const handleStartLiveSession = () => {
  if (!consentGiven) {
    // Generate guest identifier if not authenticated
    if (!user && !guestIdentifierRef.current) {
      guestIdentifierRef.current = generateGuestHash();
    }
    setShowConsentDialog(true);
    return;
  }

  // Consent already given, proceed with recording
  startRecording();
};

const handleConsent = async () => {
  try {
    // Log consent
    await logSessionConsent(
      roomCode,
      user?.id || null,
      user ? null : guestIdentifierRef.current
    );

    setConsentGiven(true);
    setShowConsentDialog(false);

    // Mixpanel event
    analytics.track('consent_given', {
      sessionCode: roomCode,
      userType: user ? 'authenticated' : 'guest',
    });

    // Now start recording
    startRecording();
  } catch (error) {
    console.error('Consent failed:', error);
    alert('Failed to record consent. Please try again.');
  }
};

// CRITICAL: Add consent verification before uploading chunks
const handleChunkReady = useCallback(async (
  chunkBlob: Blob,
  chunkNumber: number,
  isLastChunk: boolean
) => {
  const code = sessionCodeForChunks.current;
  const userName = userNameForChunks.current;
  const currentSession = sessionForChunks.current;
  const currentUser = userForChunks.current;

  if (!code || !userName) {
    console.warn('[P28.1] Cannot upload chunk - missing session code or user name');
    return;
  }

  // CRITICAL: Verify consent before uploading
  const consentLogged = await verifyConsentLogged(
    code,
    currentUser?.id || null,
    currentUser ? null : guestIdentifierRef.current
  );

  if (!consentLogged) {
    console.error('❌ Cannot upload - no consent on record');
    throw new Error('Consent not recorded - cannot upload audio');
  }

  // Consent verified, proceed with upload
  await uploadAudioChunk(code, userName, chunkBlob, chunkNumber, isLastChunk);

  // Upload events snapshot
  if (currentSession && eventsCollectorRef.current.isStarted()) {
    const participants: { name: string; role: 'creator' | 'joiner' }[] = [
      { name: currentSession.creatorName, role: 'creator' },
      ...(currentSession.joinerName ? [{ name: currentSession.joinerName, role: 'joiner' as const }] : []),
    ];
    const uploader = currentUser
      ? { supabaseUserId: currentUser.id, email: currentUser.email, name: userName }
      : { name: userName };
    await uploadEventsSnapshot(code, userName, chunkNumber, eventsCollectorRef.current, participants, uploader);
  }
}, []);

// Render consent dialog
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

---

### 4. Privacy Policy Update

**File:** `src/app/pages/privacy-policy-page.tsx`

**Change line 69-70 from:**
```tsx
Audio recordings and session data may be used to improve our AI/ML models for better
understanding verification. By participating in a Live Meeting, you consent to this usage.
```

**To:**
```tsx
Audio recordings and session data may be used to improve our AI/ML models for better
understanding verification. Before any recording starts, you will be asked to provide
explicit consent via a consent dialog. You can withdraw consent or request deletion anytime
via your Settings page.
```

---

## Acceptance Criteria

- [ ] User CANNOT start recording without checking consent checkbox
- [ ] Consent dialog shows BEFORE any recording starts (both host and guest)
- [ ] Consent timestamp logged to `session_consents` table
- [ ] IP hash stored (not raw IP address)
- [ ] Guest users get cryptographically secure identifier (e.g., `guest_550e8400-e29b-41d4-a716-446655440000`)
- [ ] Authenticated users have `user_id` linked to `auth.users`
- [ ] RLS policy prevents users from inserting fake consent records for others
- [ ] `verifyConsentLogged()` blocks audio uploads if consent missing
- [ ] Privacy Policy link in dialog works
- [ ] Cancel button returns user to session without recording
- [ ] Mixpanel event tracked: `consent_given`

---

## Testing Checklist

### Manual Testing
- [ ] Start Live Meeting as authenticated user → consent dialog appears
- [ ] Start Live Meeting as guest → consent dialog appears
- [ ] Try to start recording without checking checkbox → button disabled
- [ ] Check consent checkbox → button enabled
- [ ] Click "Start Recording" → consent logged to database
- [ ] Check `session_consents` table → entry exists with correct session_id, user_id, ip_hash
- [ ] Cancel consent dialog → no consent logged, no recording starts
- [ ] Verify audio chunks upload ONLY after consent logged

### E2E Test (Playwright)
```typescript
test('recording requires explicit consent', async ({ page }) => {
  // Navigate to live meeting
  await page.goto('/live');

  // Create session
  await page.fill('[name="name"]', 'Test User');
  await page.click('button:has-text("Start Session")');

  // Consent dialog should appear
  await expect(page.locator('text=Recording Consent Required')).toBeVisible();

  // Start button should be disabled
  await expect(page.locator('button:has-text("Start Recording")')).toBeDisabled();

  // Check consent checkbox
  await page.check('#consent');

  // Start button should be enabled
  await expect(page.locator('button:has-text("Start Recording")')).toBeEnabled();

  // Click start recording
  await page.click('button:has-text("Start Recording")');

  // Verify consent was logged to database
  // (requires test helper to check Supabase)
});
```

---

## Deployment Checklist

**Pre-deployment:**
- [ ] Create migration file: `supabase/migrations/20260106_session_consents.sql`
- [ ] Test migration on local Supabase instance
- [ ] Review RLS policies (ensure no `WITH CHECK (true)` vulnerabilities)
- [ ] Build consent dialog component
- [ ] Add API functions to api.ts
- [ ] Integrate into clarity-live-page.tsx
- [ ] Update Privacy Policy

**Deployment:**
1. [ ] Run migration on production Supabase
2. [ ] Deploy frontend code
3. [ ] Verify consent table exists and RLS works
4. [ ] Test with 5 real users (authenticated + guests)
5. [ ] Monitor Sentry for consent logging errors
6. [ ] Check Mixpanel for `consent_given` events

**Post-deployment:**
- [ ] Audit first 20 sessions - verify all have consent records
- [ ] Check for any recordings without consent (delete if found)
- [ ] Document rollback plan if issues found

---

## Rollback Plan

**If consent logging fails in production:**

1. **Immediate:** Stop all Live Meeting sessions (add maintenance banner)
2. **Database:** Check `session_consents` table for failures
3. **Code:** Add fallback to block recording if consent insert fails
4. **Fix:** Deploy hotfix within 2 hours
5. **Audit:** Review all recordings from failure period, delete if no consent

**SQL to check for recordings without consent:**
```sql
-- Find sessions with recordings but no consent
SELECT s.code, s.creator_name, s.joiner_name, s.created_at
FROM clarity_sessions s
LEFT JOIN session_consents c ON s.code = c.session_id
WHERE c.id IS NULL
  AND s.created_at > '2026-01-06'; -- After P37.2a deployment
```

---

## Known Limitations

1. **IP hashing in browser:** Not ideal - ad blockers may block ipify.org. Future: move to Edge Function.
2. **Guest identifier security:** Can't prevent duplicate guest IDs if user clears browser storage. Acceptable risk for MVP.
3. **No consent withdrawal yet:** Covered in P37.2b (data rights feature).
4. **Recording already in progress:** If user denies consent after recording started (edge case), need to delete partial upload. Future enhancement.

---

## Open Questions

- [ ] Should we require re-consent for each session, or remember consent per user? (Recommend: per-session for explicit GDPR compliance)
- [ ] Should we show consent dialog to both participants or just the one starting recording? (Recommend: both participants must consent)
- [ ] What if one participant consents but the other declines? (Recommend: session cannot proceed with recording)

---

## Success Metrics

- 100% consent rate before any recording starts
- Zero recordings without consent logged
- Audit trail available for all sessions
- No Sentry errors on consent logging
- <5 second delay from consent to recording start

---

## Related Documents

- [Privacy Policy](../src/app/pages/privacy-policy-page.tsx)
- [Terms of Service](../src/app/pages/terms-of-service-page.tsx)
- [P37.1: Legal Entity Update](./p37_1_legal_entity_update.md)
- [P37.2b: Data Rights](./p37_2b_data_rights.md)
- [CLAUDE.md - GDPR Compliance Notes](../CLAUDE.md)
