# P37.2a: Recording Consent Mechanism (CRITICAL)

**Status:** Ready for Implementation
**Priority:** CRITICAL (Blocks Public Launch)
**Est. Effort:** 4-5 hours
**Created:** 2026-01-06
**Updated:** 2026-01-07 (Simplified based on Zoom/Google Meet patterns)
**Depends On:** None (P40 is included in this implementation)
**Blocks:** P41 (Post-Session Email + Coaching)
**Supersedes:** P26 (Lightweight Signup), P34.1, P34.2

---

## Implementation Order

```
┌─────────────────────────────────────────────────────────────┐
│  Live Meeting Join Flow                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  User clicks "Join"                                         │
│        │                                                    │
│        ▼                                                    │
│  ┌─────────────────┐                                        │
│  │ 1. CONSENT      │  ← P37.2a (This)                      │
│  │    Dialog       │    - Name + Email                      │
│  │    (Legal)      │    - Terms + Privacy agreed            │
│  └────────┬────────┘    - Consent logged to DB              │
│           │                                                 │
│           ▼                                                 │
│  ┌─────────────────┐                                        │
│  │ 2. MICROPHONE   │  ← P40 (Included in P37.2a)           │
│  │    Permission   │    - Browser permission request        │
│  │    (Technical)  │    - Deny → Show instructions          │
│  └────────┬────────┘                                        │
│           │                                                 │
│           ▼                                                 │
│  ┌─────────────────┐                                        │
│  │ 3. SESSION      │  ← Actual meeting starts               │
│  │    Starts       │                                        │
│  └────────┬────────┘                                        │
│           │                                                 │
│           ▼                                                 │
│  ┌─────────────────┐                                        │
│  │ 4. POST-SESSION │  ← P41 (Separate feature)             │
│  │    Email        │    - Coaching + Magic link             │
│  └─────────────────┘                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**For AI agents:**
- P37.2a includes the microphone permission hook (P40) as part of its implementation
- Implement P37.2a as a single feature that handles: consent → mic permission → join
- P41 is a separate feature that depends on P37.2a's guest user records

---

## Context

Live Meetings record user voice data. Under GDPR, users must be informed and consent before recording starts.

**Key insight:** Zoom and Google Meet use a simple approach — notify users that recording will happen, and "Join" = consent. No checkbox required. This is legally valid because:
- User is informed (notification in dialog)
- Consent is specific (links to Terms + Privacy Policy)
- Consent is freely given (can cancel instead of join)
- Affirmative action (clicking "Join Session" IS the consent act)

**Current State:** Recording exists but no consent mechanism. This blocks public launch.

---

## Design Decision: Why No Checkbox?

Per [IAPP GDPR guidance](https://iapp.org/news/a/how-do-the-rules-on-audio-recording-change-under-the-gdpr) and [Zoom's implementation](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059819):

- GDPR requires "clear affirmative action" — clicking "Join" qualifies
- Checkbox is a UX choice, not a legal requirement
- Zoom/Google Meet don't use checkboxes for recording consent
- Simpler UX = higher completion rate

**ML training disclosure:** Not required in dialog. Privacy Policy covers it. Zoom doesn't mention ML in their recording notification either.

---

## Objectives

**Core Requirements:**
- [ ] Single join dialog that covers: name, email, terms, privacy, recording consent
- [ ] Guest "soft registration" (name + email = unverified user record created immediately)
- [ ] No email confirmation needed for NEW guests — join instantly after entering name + email
- [ ] Email verification required for EXISTING unverified users (security - prevent profile hijacking)
- [ ] Post-session: magic link email (converts guest to verified user) — see P41

**Host Requirement:**
- [ ] **Hosts MUST be verified users.** Creating a session requires authentication.
- [ ] Guests can join sessions, but cannot create them.
- [ ] This ensures at least one participant is accountable for the session.

**Audit & Compliance:**
- [ ] Audit trail in database (consent timestamp, session ID, user ID)
- [ ] Terms version tracking (re-prompt on policy updates)
- [ ] No recording without consent logged
- [ ] Handle edge case: guest enters email of existing verified user → prompt to log in
- [ ] Handle edge case: guest enters email of existing unverified user → require email verification

**Note:** AI coaching summary in post-session email is a P41 feature (depends on this).

---

## User Flow

### Guest Joining (No Account)

```
┌─────────────────────────────────────────────────────┐
│  Join Clarity Meeting                               │
│                                                     │
│  Name: [_______________]                            │
│                                                     │
│  Email: [_______________]                           │
│                                                     │
│  This session will be recorded.                     │
│  By joining, you agree to our Terms and             │
│  Privacy Policy.                                    │
│                                                     │
│  [Cancel]                    [Join Session]        │
└─────────────────────────────────────────────────────┘
```

### Registered User (Already Accepted Current Terms)

```
→ Skip consent dialog entirely
→ Go straight to session
```

### Registered User (Terms Updated Since Last Acceptance)

```
┌─────────────────────────────────────────────────────┐
│  Updated Terms                                      │
│                                                     │
│  We've updated our Terms and Privacy Policy.        │
│                                                     │
│  This session will be recorded.                     │
│  By continuing, you agree to the updated terms.     │
│                                                     │
│  [View Terms] [View Privacy Policy]                 │
│                                                     │
│  [Cancel]                    [Continue]            │
└─────────────────────────────────────────────────────┘
```

### If User Cancels

```
→ Return to landing page or previous screen
→ No consent logged
→ No session access
```

---

## Database Schema

### Table: `terms_acceptances`

**Migration file:** `supabase/migrations/20260107_terms_acceptances.sql`

```sql
-- P37.2a: Terms and consent acceptance tracking
-- Tracks when users accept Terms + Privacy Policy + Recording consent

CREATE TABLE terms_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User identification
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Terms version accepted
  terms_version TEXT NOT NULL,  -- e.g., "v1.0", "v1.1"

  -- Audit trail
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash TEXT,
  user_agent TEXT,

  -- Unique constraint: one acceptance per user per version
  UNIQUE(user_id, terms_version)
);

-- Index for lookups
CREATE INDEX idx_terms_acceptances_user_id ON terms_acceptances(user_id);

-- RLS Policies
ALTER TABLE terms_acceptances ENABLE ROW LEVEL SECURITY;

-- Users can view their own acceptances
CREATE POLICY "Users can view own acceptances"
  ON terms_acceptances FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert own acceptances only
CREATE POLICY "Users can record own acceptance"
  ON terms_acceptances FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

### Table: `session_consents`

**Migration file:** `supabase/migrations/20260107_session_consents.sql`

```sql
-- P37.2a: Per-session consent audit trail
-- Records that user consented before each recording session

CREATE TABLE session_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Session identification
  session_id TEXT NOT NULL,  -- Live Meeting session code

  -- User identification
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Consent record
  consent_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  terms_version TEXT NOT NULL,  -- Version of terms at time of consent

  -- Audit trail
  ip_hash TEXT,
  user_agent TEXT
);

-- Indexes
CREATE INDEX idx_session_consents_session_id ON session_consents(session_id);
CREATE INDEX idx_session_consents_user_id ON session_consents(user_id);

-- RLS Policies
ALTER TABLE session_consents ENABLE ROW LEVEL SECURITY;

-- Users can view own consents
CREATE POLICY "Users can view own consents"
  ON session_consents FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert own consents only
CREATE POLICY "Users can record own consent"
  ON session_consents FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

### Profile Table Addition

```sql
-- Add to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS
  accepted_terms_version TEXT DEFAULT NULL;
```

---

## Implementation

### 1. Constants

**File:** `src/lib/constants.ts`

```typescript
// Current terms version - update when Terms or Privacy Policy changes
export const CURRENT_TERMS_VERSION = 'v1.0';
```

### 2. Join Dialog Component

**File:** `src/app/components/live-meeting/join-session-dialog.tsx`

```typescript
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface JoinSessionDialogProps {
  open: boolean;
  onJoin: (name: string, email: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function JoinSessionDialog({
  open,
  onJoin,
  onCancel,
  isLoading = false,
}: JoinSessionDialogProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const isValid = name.trim().length > 0 && email.includes('@');

  const handleJoin = () => {
    if (isValid) {
      onJoin(name.trim(), email.trim());
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join Clarity Meeting</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
            />
          </div>

          <p className="text-sm text-muted-foreground">
            This session will be recorded.{' '}
            By joining, you agree to our{' '}
            <a href="/terms" target="_blank" className="text-blue-600 hover:underline">
              Terms
            </a>{' '}
            and{' '}
            <a href="/privacy-policy" target="_blank" className="text-blue-600 hover:underline">
              Privacy Policy
            </a>.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleJoin} disabled={!isValid || isLoading}>
            {isLoading ? 'Joining...' : 'Join Session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 3. Email Verification Dialog (Security - Existing Unverified User)

**File:** `src/app/components/live-meeting/email-verification-dialog.tsx`

```typescript
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Mail } from 'lucide-react';

interface EmailVerificationDialogProps {
  open: boolean;
  email: string;
  onSendVerification: () => void;
  onUseDifferentEmail: () => void;
  isLoading?: boolean;
}

export function EmailVerificationDialog({
  open,
  email,
  onSendVerification,
  onUseDifferentEmail,
  isLoading = false,
}: EmailVerificationDialogProps) {
  return (
    <Dialog open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Verify Your Email
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-muted-foreground">
            We found an existing account for:
          </p>

          <p className="font-medium text-center py-2 bg-muted rounded-md">
            {email}
          </p>

          <p className="text-sm text-muted-foreground">
            We'll send a verification link to confirm this is your email.
            Click the link to join the session.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onUseDifferentEmail}
            disabled={isLoading}
          >
            Use Different Email
          </Button>
          <Button onClick={onSendVerification} disabled={isLoading}>
            {isLoading ? 'Sending...' : 'Send Verification Link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 4. Terms Update Dialog

**File:** `src/app/components/live-meeting/terms-update-dialog.tsx`

```typescript
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface TermsUpdateDialogProps {
  open: boolean;
  onAccept: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function TermsUpdateDialog({
  open,
  onAccept,
  onCancel,
  isLoading = false,
}: TermsUpdateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Updated Terms</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-muted-foreground">
            We've updated our Terms and Privacy Policy.
          </p>

          <p className="text-sm text-muted-foreground">
            This session will be recorded.{' '}
            By continuing, you agree to the updated terms.
          </p>

          <div className="flex gap-4 text-sm">
            <a href="/terms" target="_blank" className="text-blue-600 hover:underline">
              View Terms
            </a>
            <a href="/privacy-policy" target="_blank" className="text-blue-600 hover:underline">
              View Privacy Policy
            </a>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={onAccept} disabled={isLoading}>
            {isLoading ? 'Continuing...' : 'Continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 4. API Functions

**File:** `src/app/data/api.ts` (add to existing file)

```typescript
import { CURRENT_TERMS_VERSION } from '@/lib/constants';

/**
 * Check if user needs to accept updated terms.
 */
export async function needsTermsAcceptance(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('accepted_terms_version')
    .eq('id', userId)
    .single();

  if (error || !data) return true;

  return data.accepted_terms_version !== CURRENT_TERMS_VERSION;
}

/**
 * Record terms acceptance for a user.
 */
export async function recordTermsAcceptance(userId: string): Promise<void> {
  const ipHash = await hashIP();

  // Update profile
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ accepted_terms_version: CURRENT_TERMS_VERSION })
    .eq('id', userId);

  if (profileError) {
    console.error('Failed to update profile terms version:', profileError);
    throw new Error('Failed to record terms acceptance');
  }

  // Insert audit record
  const { error: auditError } = await supabase
    .from('terms_acceptances')
    .insert({
      user_id: userId,
      terms_version: CURRENT_TERMS_VERSION,
      ip_hash: ipHash,
      user_agent: navigator.userAgent,
    });

  if (auditError) {
    console.error('Failed to insert terms acceptance audit:', auditError);
    // Don't throw - profile was updated, audit is secondary
  }

  console.log('Terms acceptance recorded:', { userId, version: CURRENT_TERMS_VERSION });
}

/**
 * Record session consent (per-session audit trail).
 */
export async function recordSessionConsent(
  sessionId: string,
  userId: string
): Promise<void> {
  const ipHash = await hashIP();

  const { error } = await supabase
    .from('session_consents')
    .insert({
      session_id: sessionId,
      user_id: userId,
      terms_version: CURRENT_TERMS_VERSION,
      ip_hash: ipHash,
      user_agent: navigator.userAgent,
    });

  if (error) {
    console.error('Failed to record session consent:', error);
    throw new Error('Failed to record consent');
  }

  console.log('Session consent recorded:', { sessionId, userId });
}

/**
 * Verify consent exists for a session before uploading recordings.
 */
export async function verifySessionConsent(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('session_consents')
    .select('id')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    console.error('Consent verification failed:', error);
    return false;
  }

  return true;
}

/**
 * Create or get user from email (for guest soft-registration).
 * Creates unverified user record immediately — no email confirmation needed to join.
 * User becomes verified when they click the post-session email magic link.
 *
 * EDGE CASES:
 * - If email belongs to existing verified user → requiresLogin: true
 * - If email belongs to existing unverified user → requiresVerification: true (SECURITY)
 */
export async function getOrCreateGuestUser(
  email: string,
  name: string
): Promise<{
  userId: string;
  isNew: boolean;
  requiresLogin: boolean;
  requiresVerification: boolean;
}> {
  // Check if user already exists in profiles
  const { data: existingUser } = await supabase
    .from('profiles')
    .select('id, is_verified')
    .eq('email', email)
    .single();

  if (existingUser) {
    if (existingUser.is_verified) {
      // EDGE CASE: Email belongs to verified user
      // They need to log in — we can't create consent record without auth
      console.log('Existing verified user, requires login:', email);
      return {
        userId: existingUser.id,
        isNew: false,
        requiresLogin: true,
        requiresVerification: false,
      };
    }

    // SECURITY: Existing unverified user — need email verification first
    // Otherwise anyone could hijack an unverified user's profile
    console.log('Existing unverified user, requires verification:', email);
    return {
      userId: existingUser.id,
      isNew: false,
      requiresLogin: false,
      requiresVerification: true,
    };
  }

  // Create new unverified user
  // Strategy: Create profile record directly without auth.users entry
  // When they click post-session magic link:
  // 1. auth.users entry is created
  // 2. AuthCallback matches by email and links to existing profile
  // 3. Profile becomes verified

  const userId = crypto.randomUUID();

  const { error } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      email: email,
      name: name,
      slug: await generateUniqueSlug(name),
      is_verified: false,
      signed_at: new Date().toISOString(),
    });

  if (error) {
    console.error('Failed to create guest user:', error);
    throw new Error('Failed to create user record');
  }

  console.log('Guest user created:', { userId, email, name });
  return { userId, isNew: true, requiresLogin: false, requiresVerification: false };
}

/**
 * Generate unique slug from name (e.g., "john-doe", "john-doe-2").
 */
async function generateUniqueSlug(name: string): Promise<string> {
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  let slug = baseSlug;
  let attempt = 1;

  while (attempt <= 3) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('slug', slug)
      .single();

    if (!data) {
      return slug; // Slug is available
    }

    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }

  // Fallback to timestamp
  return `${baseSlug}-${Date.now()}`;
}

/**
 * Hash IP address for audit trail.
 */
async function hashIP(): Promise<string> {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const { ip } = await response.json();

    const encoder = new TextEncoder();
    const data = encoder.encode(ip);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `browser_${crypto.randomUUID()}`;
  }
}
```

---

## Flow Integration

### For Guests (Not Logged In)

```
1. User clicks join link → JoinSessionDialog appears
2. User enters name + email
3. User clicks "Join Session" (NO email confirmation needed)
4. System:
   a. Creates unverified user record (is_verified = false)
   b. Records terms acceptance (linked to new user ID)
   c. Records session consent
   d. Requests microphone permission (P40)
   e. Starts session immediately
5. Post-session: Email sent with transcript + AI coaching
6. User clicks email link → email verified → is_verified = true → full user
```

**Why no email confirmation to join:**
- Lower friction = higher conversion
- User gets value first (the session)
- Post-session email naturally converts them to verified user
- GDPR compliance maintained (we have email for deletion requests)

**Post-session email (MVP):**
- Simple "View your session" magic link
- Clicking link verifies email → user becomes verified
- AI coaching summary added later (separate feature)
- Until post-session email feature built: guests remain unverified but functional

### For Registered Users

```
1. User clicks join → Check needsTermsAcceptance()
2. If needs acceptance → TermsUpdateDialog
3. User clicks "Continue"
4. System:
   a. Records terms acceptance (updates version)
   b. Records session consent
   c. Requests microphone permission (P40)
   d. Starts session
```

---

## Edge Cases

### Summary Table

| Edge Case | User Type | Outcome | Consent Count |
|-----------|-----------|---------|---------------|
| First session, new guest | Guest | Create profile + join | 1 per session |
| First session, registered | Verified | Join (skip dialog if terms current) | 1 per session |
| Second session, same guest | Guest | Verify email → join | 1 per session |
| Second session, verified user | Verified | Join immediately | 1 per session |
| Email = verified user | Guest | Prompt login | 1 per session |
| Email = unverified user | Guest | Verify email first (security) | 1 per session |
| Terms changed | Any | Show terms update dialog | 1 per session |
| Host creates session | Must be verified | Block guests from creating | N/A |

**Consent per session (not per user):** Each session gets its own consent record. This is GDPR best practice because:
- User can decline recording for specific sessions
- Consent is contextual (different sessions may have different participants)
- Matches Zoom/Google Meet pattern

---

### Guest enters email of existing verified user

**Problem:** RLS requires `auth.uid()` to match user_id for consent insert. Guest isn't logged in.

**Solution:** `getOrCreateGuestUser()` returns `requiresLogin: true`. UI shows:

```
┌─────────────────────────────────────────────────────┐
│  This email has an account                          │
│                                                     │
│  To join this session, please log in first.         │
│                                                     │
│  [Send Login Link]        [Use Different Email]    │
└─────────────────────────────────────────────────────┘
```

### Guest enters email of existing unverified user

**SECURITY ISSUE IDENTIFIED:** Simply reusing an unverified profile allows impersonation.

**Attack scenario:**
1. Alice joins session with alice@example.com (unverified profile created)
2. Mallory joins with alice@example.com (would hijack Alice's profile!)

**Solution:** Require email confirmation before reusing unverified profile.

**UI Flow:**
```
┌─────────────────────────────────────────────────────┐
│  Verify Your Email                                  │
│                                                     │
│  We found an existing account for:                  │
│  alice@example.com                                  │
│                                                     │
│  We'll send a verification link to confirm          │
│  this is your email.                                │
│                                                     │
│  [Send Verification Link]   [Use Different Email]  │
└─────────────────────────────────────────────────────┘
```

**Implementation:** Update `getOrCreateGuestUser()` to return `requiresVerification: true` for existing unverified users.

```typescript
if (existingUser && !existingUser.is_verified) {
  // Existing unverified user — need to verify email first
  return {
    userId: existingUser.id,
    isNew: false,
    requiresLogin: false,
    requiresVerification: true, // NEW FIELD
    email: email,
  };
}
```

After user clicks the email verification link, they return to the session and join automatically.

### Same person joins multiple sessions as guest

**Handling:** Same email = same profile. Multiple session_consents linked to same user_id.

### Guest with same name as existing user

**Handling:** Slug generation adds suffix (john-doe-2, john-doe-3). No conflict.

### Invalid/typo email

**Handling:** Frontend validation. Can't recover easily if typo — acceptable for MVP.

### Host is not registered

**Decision:** Hosts MUST be registered users. Creating a session requires authentication.
Guests can join sessions, but not create them.

### Guest joins, then registers with same email later

**Handling:** When they click magic link (from signup or post-session email):
1. `auth.users` entry created
2. `AuthCallback` checks for existing profile by email
3. Links new auth.users.id to existing profile
4. Profile becomes verified (`is_verified = true`)

### Browser closes during session

**Handling:**
- Local recording continues until browser closes
- If connection drops, partial recording may exist locally
- User can rejoin same session code (same consent applies)
- If session ended by partner, user returns to dashboard

### Network drops during session

**Handling:**
- Recording continues locally
- WebRTC reconnection attempts
- If reconnection fails after 30 seconds, session ends
- Local recording preserved, can be uploaded when back online

### User grants microphone then revokes mid-session

**Handling:**
- Recording stops immediately (no audio capture possible)
- Session can continue (text-only mode or end)
- Consent record remains valid (consent to record doesn't mean recording is mandatory)

### Two people join with same name

**Handling:**
- Different emails = different profiles
- Slugs will be different (john-doe, john-doe-2)
- No conflict

### Disposable/fake email

**Handling:**
- Accepted for MVP (low risk - session data attached to fake profile)
- Post-session email will bounce → user never verifies
- Future: Consider email validation service

### Session host leaves mid-session

**Handling:**
- Session continues if guest remains
- Recording continues for remaining participant
- Session ends when all participants leave

### Consent dialog dismissed (escape key, click outside)

**Handling:**
- Same as clicking "Cancel"
- No consent logged, return to previous screen

---

## Acceptance Criteria

- [ ] Guests must provide name + email to join
- [ ] Single dialog combines join + consent (no separate consent step)
- [ ] No checkbox — "Join Session" click = consent
- [ ] Terms/Privacy links visible and working
- [ ] Registered users skip dialog if terms unchanged
- [ ] Terms update dialog shown when policy version changes
- [ ] Consent logged to `session_consents` before recording starts
- [ ] Terms acceptance logged to `terms_acceptances` for audit
- [ ] `verifySessionConsent()` blocks uploads if consent missing
- [ ] Canceling returns user without consent logged

---

## Testing Checklist

- [ ] Guest join → dialog appears, requires name + email
- [ ] Guest clicks "Join Session" → consent logged, session starts
- [ ] Guest cancels → no consent logged, no session
- [ ] Registered user (current terms) → no dialog, straight to session
- [ ] Registered user (outdated terms) → update dialog appears
- [ ] Update CURRENT_TERMS_VERSION → existing users see update dialog
- [ ] Verify `session_consents` table has entry after join
- [ ] Verify `terms_acceptances` table has entry after acceptance

---

## Privacy Policy Requirements

Ensure Privacy Policy includes:

- [ ] Sessions are recorded
- [ ] Recordings used for: transcript, AI coaching, ML training (anonymized)
- [ ] Data stored securely (Google Cloud, encrypted)
- [ ] User can request deletion anytime
- [ ] Data retention policy

---

## Related Documents

**Implementation Chain:**
- [P40: Microphone Permission](./p40_microphone_permission.md) - Utility included in P37.2a
- [P41: Clarity Coach](./p41_clarity_coach.md) - Post-session email (depends on this)

**Deferred GDPR Features:**
- [P42: Data Rights](./p42_data_rights.md) - Export/deletion (at 10-20 users)
- [P43: Advanced Compliance](./p43_advanced_compliance.md) - ML opt-out, etc. (at 100+ users)

**Legal Documents:**
- [Privacy Policy](../src/app/pages/privacy-policy-page.tsx)
- [Terms of Service](../src/app/pages/terms-of-service-page.tsx)
