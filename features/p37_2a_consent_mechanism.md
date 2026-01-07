# P37.2a: Recording Consent Mechanism (CRITICAL)

**Status:** Ready for Implementation
**Priority:** CRITICAL (Blocks Public Launch)
**Est. Effort:** 4-5 hours
**Created:** 2026-01-06
**Updated:** 2026-01-07 (Architect review: fixed RLS, auth, and integration gaps)
**Depends On:** None (P40 is included in this implementation)
**Blocks:** P41 (Post-Session Email + Coaching)
**Supersedes:** P26 (Lightweight Signup), P34.1, P34.2

> **⚠️ AI Agent Implementation Notes (Added 2026-01-07)**
> This spec has been reviewed for autonomous implementation. Key decisions:
> - Guest profiles use "anon auth" pattern (see Auth Strategy section)
> - Uses existing `ensureUniqueSlug()` from api.ts (no new slug function)
> - Single consolidated migration file
> - P40 microphone handling is a separate step AFTER consent

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
- [ ] No email confirmation needed for guests — join instantly after entering name + email
- [ ] Returning unverified guests rejoin with same profile (MVP simplification — see note below)
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
- [ ] Handle edge case: guest enters email of existing unverified user → rejoin with same profile (MVP)

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

## Auth Strategy for Guest Users (CRITICAL)

**Problem:** The existing RLS policy for profiles requires `auth.uid() = id`, meaning only authenticated users can insert profiles. Guests are not authenticated.

**Solution: Anonymous Auth Pattern**

Supabase supports anonymous authentication. When a guest joins:
1. Call `supabase.auth.signInAnonymously()` — creates a temporary auth.users entry
2. Create profile with this anonymous user's ID
3. RLS is satisfied because `auth.uid()` now matches
4. Later (P41): When guest clicks magic link, anonymous account is "upgraded" to real account

```typescript
// Guest join flow
const { data: anonAuth, error: anonError } = await supabase.auth.signInAnonymously();
if (anonError) throw new Error('Failed to create guest session');

const userId = anonAuth.user.id;
// Now create profile with this userId — RLS will pass
```

**Why this works:**
- No Supabase Edge Functions needed
- No service_role key exposed to client
- Guest gets a real user ID that satisfies all RLS policies
- Profile is upgradeable when guest verifies email later

**Supabase Dashboard Requirement:**
- Enable "Anonymous sign-ins" in Authentication → Settings → Auth Providers
- This is OFF by default — must be enabled before implementation

---

## Terms Version Management (KISS)

**How it works:**
1. `CURRENT_TERMS_VERSION` is a constant in code (`'v1.0'`)
2. When you update Terms or Privacy Policy content:
   - Edit the legal page content
   - Bump `CURRENT_TERMS_VERSION` to `'v1.1'` (or `'v2.0'` for major changes)
   - Commit and deploy
3. All users with older `accepted_terms_version` see the update dialog

**No admin UI needed.** Version is managed in code.

**When to bump version:**
- Material changes to data collection/usage → Bump version
- Typo fixes or clarifications → No bump needed
- New features that change what's recorded → Bump version

---

## Database Schema

### Single Consolidated Migration

**Migration file:** `supabase/migrations/20260107_p37_consent_mechanism.sql`

```sql
-- P37.2a: Recording Consent Mechanism
-- Provides: terms_acceptances, session_consents tables + profiles column

-- ============================================================================
-- 1. Add accepted_terms_version to profiles (for quick lookup)
-- ============================================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS
  accepted_terms_version TEXT DEFAULT NULL;

-- ============================================================================
-- 2. Terms Acceptances Table (audit trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS terms_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User identification (works for both verified and anonymous users)
  user_id UUID NOT NULL,

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
CREATE INDEX IF NOT EXISTS idx_terms_acceptances_user_id ON terms_acceptances(user_id);

-- RLS Policies
ALTER TABLE terms_acceptances ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert (includes anonymous auth users)
CREATE POLICY "Authenticated users can record acceptance"
  ON terms_acceptances FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Users can view their own (authenticated users)
CREATE POLICY "Users can view own acceptances"
  ON terms_acceptances FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================================
-- 3. Session Consents Table (per-session audit trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS session_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Session identification
  session_id TEXT NOT NULL,  -- Live Meeting session code

  -- User identification (works for both verified and anonymous users)
  user_id UUID NOT NULL,

  -- Consent record
  consent_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  terms_version TEXT NOT NULL,  -- Version of terms at time of consent

  -- Audit trail
  ip_hash TEXT,
  user_agent TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_session_consents_session_id ON session_consents(session_id);
CREATE INDEX IF NOT EXISTS idx_session_consents_user_id ON session_consents(user_id);

-- RLS Policies
ALTER TABLE session_consents ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert (includes anonymous auth users)
CREATE POLICY "Authenticated users can record consent"
  ON session_consents FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Users can view their own
CREATE POLICY "Users can view own consents"
  ON session_consents FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================================
-- 4. Enable realtime for consent tables (optional, for future features)
-- ============================================================================
-- Not needed for MVP, but useful for admin dashboards later
-- ALTER PUBLICATION supabase_realtime ADD TABLE terms_acceptances;
-- ALTER PUBLICATION supabase_realtime ADD TABLE session_consents;
```

**Note on RLS:** The INSERT policies use `WITH CHECK (auth.uid() IS NOT NULL)` because:
1. Anonymous auth users have a valid `auth.uid()` from `signInAnonymously()`
2. This prevents completely unauthenticated requests from inserting records
3. Profile creation happens BEFORE the profile row exists, so we can't check `auth.uid() = user_id`
4. SELECT still requires `auth.uid() = user_id` for privacy

**Note on Foreign Keys:** The `user_id` columns intentionally have no FK to `auth.users` because:
1. Anonymous users may be cleaned up by Supabase before consent records
2. Consent records should persist for legal audit even if user is deleted
3. When deleting a user, consider archiving consent records first (P42 data rights feature)

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

### 3. Terms Update Dialog

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

### 4. Requires Login Dialog (Edge Case)

**File:** `src/app/components/live-meeting/requires-login-dialog.tsx`

When a guest enters an email that belongs to a verified user, show this dialog:

```typescript
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface RequiresLoginDialogProps {
  open: boolean;
  email: string;
  onSendLoginLink: () => void;
  onUseDifferentEmail: () => void;
  isLoading?: boolean;
}

export function RequiresLoginDialog({
  open,
  email,
  onSendLoginLink,
  onUseDifferentEmail,
  isLoading = false,
}: RequiresLoginDialogProps) {
  return (
    <Dialog open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>This email has an account</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-muted-foreground">
            <strong>{email}</strong> is already registered.
            To join this session, please log in first.
          </p>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onUseDifferentEmail} disabled={isLoading}>
            Use Different Email
          </Button>
          <Button onClick={onSendLoginLink} disabled={isLoading}>
            {isLoading ? 'Sending...' : 'Send Login Link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 5. API Functions

**File:** `src/app/data/api.ts` (add to existing file)

**IMPORTANT:** Use the existing `ensureUniqueSlug()` function (line 537) — do NOT create a new one.

```typescript
import { CURRENT_TERMS_VERSION } from '@/lib/constants';

// ============================================================================
// P37.2a: Consent Mechanism API Functions
// ============================================================================

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
 * Create or get guest user with anonymous auth.
 * Uses Supabase anonymous auth to satisfy RLS policies.
 *
 * Flow:
 * 1. Check if email exists in profiles
 * 2. If verified user → requiresLogin: true
 * 3. If unverified user → sign in anonymously and reuse profile
 * 4. If new user → sign in anonymously and create profile
 *
 * EDGE CASES:
 * - Verified user email → requiresLogin: true (must log in)
 * - Unverified user email → Reuse profile (MVP simplification)
 */
export async function getOrCreateGuestUser(
  email: string,
  name: string
): Promise<{
  userId: string;
  isNew: boolean;
  requiresLogin: boolean;
}> {
  // Check if user already exists in profiles
  const { data: existingUser } = await supabase
    .from('profiles')
    .select('id, is_verified')
    .eq('email', email)
    .single();

  if (existingUser) {
    if (existingUser.is_verified) {
      // Verified user must log in — don't create anonymous session
      console.log('Existing verified user, requires login:', email);
      return {
        userId: existingUser.id,
        isNew: false,
        requiresLogin: true,
      };
    }

    // MVP: Unverified user can rejoin without verification
    // Sign in anonymously to satisfy RLS for consent recording
    const { data: anonAuth, error: anonError } = await supabase.auth.signInAnonymously();
    if (anonError) {
      console.error('Failed to create anonymous session:', anonError);
      throw new Error('Failed to create guest session');
    }

    console.log('Returning unverified guest, reusing profile:', email);
    return {
      userId: existingUser.id,
      isNew: false,
      requiresLogin: false,
    };
  }

  // Create new guest user with anonymous auth
  const { data: anonAuth, error: anonError } = await supabase.auth.signInAnonymously();
  if (anonError) {
    console.error('Failed to create anonymous session:', anonError);
    throw new Error('Failed to create guest session');
  }

  const userId = anonAuth.user.id;

  // Create profile with anonymous user ID (RLS will pass)
  const slug = await ensureUniqueSlug(name); // Use existing function!

  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      email: email,
      name: name,
      slug: slug,
      is_verified: false,
    });

  if (profileError) {
    console.error('Failed to create guest profile:', profileError);
    throw new Error('Failed to create user record');
  }

  console.log('Guest user created:', { userId, email, name, slug });
  return { userId, isNew: true, requiresLogin: false };
}

/**
 * Hash IP address for audit trail (with timeout).
 * Falls back gracefully if IP lookup fails or times out.
 */
async function hashIP(): Promise<string> {
  try {
    // 3 second timeout to prevent blocking join flow
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch('https://api.ipify.org?format=json', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const { ip } = await response.json();

    const encoder = new TextEncoder();
    const data = encoder.encode(ip);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fallback: use random identifier (still unique per request)
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
| Second session, same guest | Guest | **Rejoin with same profile (MVP)** | 1 per session |
| Second session, verified user | Verified | Join immediately | 1 per session |
| Email = verified user | Guest | Prompt login | 1 per session |
| Email = unverified user | Guest | **Rejoin with same profile (MVP)** | 1 per session |
| Terms changed | Any | Show terms update dialog | 1 per session |
| Host creates session | Must be verified | Block guests from creating | N/A |

**Consent per session (not per user):** Each session gets its own consent record. This is GDPR best practice because:
- User can decline recording for specific sessions
- Consent is contextual (different sessions may have different participants)
- Matches Zoom/Google Meet pattern

> **MVP Note:** Returning unverified guests rejoin without email verification. Security risk is low (unverified profiles have minimal value). Natural verification happens when P41 ships — coaching email contains magic link that verifies on click.

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

**MVP Decision:** Returning unverified guests simply rejoin with their existing profile.

**Trade-off accepted:**
- **Risk:** Theoretical impersonation (Mallory could enter alice@example.com)
- **Mitigation:** Unverified profiles have minimal value — no verified badge, limited data
- **Natural resolution:** P41 coaching email contains magic link → clicking verifies the real owner

**Implementation:**
```typescript
if (existingUser && !existingUser.is_verified) {
  // MVP: Allow rejoin without verification
  // P41 handles verification naturally via coaching email
  return {
    userId: existingUser.id,
    isNew: false,
    requiresLogin: false,
  };
}
```

**TODO when P41 ships:** Coaching email magic link will verify the email, converting unverified → verified. At that point, the profile is protected by verified user login requirement.

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

---

## MVP Simplifications

### Unverified Guest Verification (Deferred to P41)

**Current behavior:** Returning unverified guests rejoin with their existing profile without email verification.

**Security trade-off accepted:**
- Low risk — unverified profiles have minimal value to attackers
- No verified badge, limited profile data
- Natural verification happens when P41 ships (coaching email contains magic link)

**What P41 adds:**
- Post-session email sent to all participants
- Email contains magic link to view coaching feedback
- Clicking link verifies email → `is_verified = true`
- After verification, profile is protected (verified users must log in)

**Components NOT needed for P37.2a MVP:**
- ~~`EmailVerificationDialog`~~ — removed
- ~~`requiresVerification` return value~~ — removed
- ~~Verification email sending logic~~ — deferred to P41

**TODO when P41 ships:**
- [ ] Coaching email magic link verifies guest email automatically
- [ ] Consider adding stricter verification for sensitive actions (not session join)

---

## Implementation Integration Points

**This section tells the agent WHERE to wire up the new code.**

### 1. Create Constants File

**File:** `src/lib/constants.ts` (NEW FILE)

```typescript
// Current terms version - bump when Terms or Privacy Policy changes
export const CURRENT_TERMS_VERSION = 'v1.0';
```

### 2. Integration into clarity-live-page.tsx

The existing file has a join flow around line 1364. Here's how to integrate:

**Add imports at top of file:**
```typescript
import { JoinSessionDialog } from '@/app/components/live-meeting/join-session-dialog';
import { TermsUpdateDialog } from '@/app/components/live-meeting/terms-update-dialog';
import { RequiresLoginDialog } from '@/app/components/live-meeting/requires-login-dialog';
import { MicrophonePermissionDialog } from '@/app/components/live-meeting/microphone-permission-dialog';
import { useMicrophonePermission } from '@/hooks/useMicrophonePermission';
import {
  getOrCreateGuestUser,
  recordTermsAcceptance,
  recordSessionConsent,
  needsTermsAcceptance,
  sendMagicLink,
} from '@/app/data/api';
import { CURRENT_TERMS_VERSION } from '@/lib/constants';
```

**Add state variables:**
```typescript
// Consent flow state
const [showJoinDialog, setShowJoinDialog] = useState(false);
const [showTermsUpdateDialog, setShowTermsUpdateDialog] = useState(false);
const [showRequiresLoginDialog, setShowRequiresLoginDialog] = useState(false);
const [pendingJoinEmail, setPendingJoinEmail] = useState('');
const [consentLoading, setConsentLoading] = useState(false);

// Microphone permission (P40)
const {
  status: micStatus,
  error: micError,
  attemptCount: micAttemptCount,
  requestPermission,
  reset: resetMic,
} = useMicrophonePermission();
const [showMicDialog, setShowMicDialog] = useState(false);
```

**Replace the existing join handler with consent flow:**
```typescript
// Called when user clicks "Join" button (before entering session)
const handleJoinClick = async () => {
  const { user } = useAuth(); // or however you get current user

  if (user) {
    // Logged in user: check if terms acceptance needed
    const needsAcceptance = await needsTermsAcceptance(user.id);
    if (needsAcceptance) {
      setShowTermsUpdateDialog(true);
    } else {
      // Terms current, proceed to mic check
      await handleMicrophoneCheck(user.id);
    }
  } else {
    // Guest: show join dialog to collect name + email
    setShowJoinDialog(true);
  }
};

// Guest submits join dialog
const handleGuestJoin = async (name: string, email: string) => {
  setConsentLoading(true);
  try {
    const result = await getOrCreateGuestUser(email, name);

    if (result.requiresLogin) {
      setPendingJoinEmail(email);
      setShowJoinDialog(false);
      setShowRequiresLoginDialog(true);
      return;
    }

    // Record consent and proceed
    await recordTermsAcceptance(result.userId);
    await recordSessionConsent(session.code, result.userId);

    // Proceed to microphone check
    setShowJoinDialog(false);
    await handleMicrophoneCheck(result.userId);

  } catch (error) {
    console.error('Guest join failed:', error);
    toast({ title: 'Error', description: 'Failed to join. Please try again.' });
  } finally {
    setConsentLoading(false);
  }
};

// Logged in user accepts updated terms
const handleTermsAccept = async () => {
  const { user } = useAuth();
  if (!user) return;

  setConsentLoading(true);
  try {
    await recordTermsAcceptance(user.id);
    await recordSessionConsent(session.code, user.id);

    setShowTermsUpdateDialog(false);
    await handleMicrophoneCheck(user.id);
  } catch (error) {
    console.error('Terms acceptance failed:', error);
    toast({ title: 'Error', description: 'Failed to record consent.' });
  } finally {
    setConsentLoading(false);
  }
};

// Microphone permission check (P40)
const handleMicrophoneCheck = async (userId: string) => {
  const hasPermission = await requestPermission();

  if (!hasPermission) {
    setShowMicDialog(true);
    return;
  }

  // Permission granted, proceed to session
  proceedWithJoin(userId);
};

const handleMicRetry = async () => {
  const hasPermission = await requestPermission();
  if (hasPermission) {
    setShowMicDialog(false);
    resetMic();
    // Need to track userId from earlier flow
    proceedWithJoin(/* userId */);
  }
};

const handleMicCancel = () => {
  setShowMicDialog(false);
  resetMic();
  toast({
    title: 'Microphone required',
    description: 'Microphone access is required to join Clarity Meetings',
  });
};

// Requires login handlers
const handleSendLoginLink = async () => {
  setConsentLoading(true);
  try {
    await sendMagicLink(pendingJoinEmail);
    toast({ title: 'Check your email', description: 'Login link sent!' });
    setShowRequiresLoginDialog(false);
  } catch (error) {
    toast({ title: 'Error', description: 'Failed to send login link.' });
  } finally {
    setConsentLoading(false);
  }
};

const handleUseDifferentEmail = () => {
  setShowRequiresLoginDialog(false);
  setShowJoinDialog(true); // Go back to join dialog
};
```

**Add dialog components to JSX:**
```tsx
return (
  <>
    {/* Consent dialogs */}
    <JoinSessionDialog
      open={showJoinDialog}
      onJoin={handleGuestJoin}
      onCancel={() => setShowJoinDialog(false)}
      isLoading={consentLoading}
    />

    <TermsUpdateDialog
      open={showTermsUpdateDialog}
      onAccept={handleTermsAccept}
      onCancel={() => setShowTermsUpdateDialog(false)}
      isLoading={consentLoading}
    />

    <RequiresLoginDialog
      open={showRequiresLoginDialog}
      email={pendingJoinEmail}
      onSendLoginLink={handleSendLoginLink}
      onUseDifferentEmail={handleUseDifferentEmail}
      isLoading={consentLoading}
    />

    {/* Microphone permission dialog (P40) */}
    <MicrophonePermissionDialog
      open={showMicDialog}
      error={micError}
      attemptCount={micAttemptCount}
      onRetry={handleMicRetry}
      onCancel={handleMicCancel}
    />

    {/* Rest of existing UI... */}
  </>
);
```

### 3. Run Migration

After creating the migration file, apply it:

```bash
# Via Supabase CLI (local)
npx supabase db push

# Or via Supabase Dashboard
# 1. Go to SQL Editor
# 2. Paste contents of supabase/migrations/20260107_p37_consent_mechanism.sql
# 3. Run
```

### 4. Enable Anonymous Auth in Supabase

**CRITICAL MANUAL STEP:**
1. Go to Supabase Dashboard → Authentication → Settings
2. Under "Auth Providers", find "Anonymous sign-ins"
3. Enable it
4. Save

Without this, `signInAnonymously()` will fail.

### 5. Files to Create (Summary)

| File | Type | Description |
|------|------|-------------|
| `src/lib/constants.ts` | NEW | Terms version constant |
| `src/app/components/live-meeting/join-session-dialog.tsx` | NEW | Guest join form |
| `src/app/components/live-meeting/terms-update-dialog.tsx` | NEW | Terms update for verified users |
| `src/app/components/live-meeting/requires-login-dialog.tsx` | NEW | Verified email edge case |
| `src/hooks/useMicrophonePermission.ts` | NEW | P40 mic permission hook |
| `src/app/components/live-meeting/microphone-permission-dialog.tsx` | NEW | P40 mic denied UI |
| `supabase/migrations/20260107_p37_consent_mechanism.sql` | NEW | Database migration |
| `src/app/data/api.ts` | MODIFY | Add consent API functions |
| `src/app/pages/clarity-live-page.tsx` | MODIFY | Wire up consent flow |

### 6. Verification Before Recording

**Existing code that uploads recordings should call `verifySessionConsent()` first:**

Find the recording upload code (likely in `use-audio-recorder.ts` or similar) and add:

```typescript
// Before uploading recording
const hasConsent = await verifySessionConsent(sessionCode, userId);
if (!hasConsent) {
  console.error('BLOCKING UPLOAD: No consent record found');
  throw new Error('Recording upload blocked: consent not recorded');
}
// Proceed with upload
```

---

## P40 Integration Note

P40 (Microphone Permission) is implemented as part of this feature. The files are:
- `src/hooks/useMicrophonePermission.ts` — Permission check hook
- `src/app/components/live-meeting/microphone-permission-dialog.tsx` — Denied state UI

See [P40 spec](./p40_microphone_permission.md) for full implementation details.

**Flow order:**
1. Consent (P37.2a) — Legal gate, records to DB
2. Microphone (P40) — Technical gate, browser permission
3. Session starts

Microphone check happens AFTER consent is recorded. If mic is denied, user can cancel and return — consent record remains (they agreed to terms, just didn't join).
