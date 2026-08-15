# B50: P37.2a UI Correction (Worktree 1 Fix)

**Status:** Ready for Implementation
**Priority:** HIGH (Blocks P41)
**Est. Effort:** 2-3 hours
**Created:** 2026-01-09
**Worktree:** claritypledge-1 (continue existing work)

---

## Context

P37.2a consent mechanism was partially implemented in worktree 1, but the UI diverged from the spec. The database work is complete and correct — only UI fixes needed.

**What went wrong:**
1. Join flow has redundant dialog (user enters name on page, then name+email in dialog)
2. Create flow missing email field entirely (hosts can create sessions without email)
3. Result: Can't send P41 post-session emails, GDPR consent not properly captured

**What's correct (keep it):**
- Database tables: `terms_acceptances`, `session_consents`
- `profiles.accepted_terms_version` column
- RLS policies
- API functions in `api.ts` (if added)

---

## Source of Truth

**Read [P37.2a spec](./p353_2a_consent_mechanism.md) for full requirements.** This task only describes the delta/fixes.

---

## Fixes Required

### Fix 1: Join Flow — Single Screen (Remove Dialog)

**Current (wrong):**
```
Join Page → Enter name → Click "Join" → Dialog asks name+email again
```

**Correct:**
```
Join Page → Enter name + email + see terms notice → Click "Join Meeting"
```

**File to modify:** `src/app/pages/clarity-live-page.tsx` (or wherever join UI lives)

**Changes:**
1. Remove `JoinSessionDialog` component usage (or repurpose as inline form)
2. Add email field directly to the join page/view
3. Add terms notice text: "This session will be recorded. By joining, you agree to our Terms and Privacy Policy."
4. "Join Meeting" button triggers: create unverified user → log consent → request mic → join

**UI spec:**
```
┌─────────────────────────────────────────┐
│  Join [Host]'s Meeting                  │
│                                         │
│  Your Name                              │
│  [________________________]             │
│                                         │
│  Your Email                             │
│  [________________________]             │
│                                         │
│  This session will be recorded.         │
│  By joining, you agree to our           │
│  Terms and Privacy Policy.              │
│        ↑ links open in new tab          │
│                                         │
│  [Join Meeting]  ← primary button       │
│                                         │
│  Back            ← text link            │
└─────────────────────────────────────────┘
```

### Fix 2: Create Flow — Add Email Field

**Current (wrong):**
```
Create session with just name → No email captured → Can't send P41 email
```

**Correct:**
```
Create session requires name + email → Unverified profile created → P41 can email
```

**File to modify:** Same as Fix 1 (the create/start session UI)

**Changes:**
1. Add email field to session creation form
2. Add same terms notice as join flow
3. On "Start Session": create unverified user (if not logged in) → log consent → request mic → create session

**UI spec:**
```
┌─────────────────────────────────────────┐
│  Start a Clarity Meeting                │
│                                         │
│  Your Name                              │
│  [________________________]             │
│                                         │
│  Your Email                             │
│  [________________________]             │
│                                         │
│  This session will be recorded.         │
│  By joining, you agree to our           │
│  Terms and Privacy Policy.              │
│                                         │
│  [Start Meeting]  ← primary button      │
│                                         │
│  Back                                   │
└─────────────────────────────────────────┘
```

### Fix 3: Handle Edge Cases

Implement these flows (documented in P37.2a):

| User enters email of... | Action |
|-------------------------|--------|
| New email | Create unverified profile, proceed |
| Existing unverified user | Reuse profile, proceed (MVP) |
| Existing verified user | Show "This email has an account" → offer login link |

**For verified user edge case**, show inline message (not dialog):
```
┌─────────────────────────────────────────┐
│  This email has an account              │
│                                         │
│  [email@example.com] is registered.     │
│  Log in to continue.                    │
│                                         │
│  [Send Login Link]   [Use Different Email]
└─────────────────────────────────────────┘
```

---

## Implementation Checklist

### Pre-flight
- [ ] Read P37.2a spec fully (it has all the API functions, edge cases, etc.)
- [ ] Check what's already implemented in worktree 1
- [ ] Identify which components exist vs need modification

### UI Changes
- [ ] Remove redundant join dialog (or convert to inline form)
- [ ] Add email field to JOIN flow
- [ ] Add email field to CREATE flow
- [ ] Add terms notice text with links to both flows
- [ ] Implement "verified user" edge case UI

### Integration
- [ ] Wire up `getOrCreateGuestUser()` for both create + join
- [ ] Wire up `recordTermsAcceptance()`
- [ ] Wire up `recordSessionConsent()`
- [ ] Ensure mic permission request happens AFTER consent logged

### Testing
- [ ] New guest can JOIN with name + email
- [ ] New guest can CREATE with name + email
- [ ] Returning unverified guest reuses profile
- [ ] Verified user email shows login prompt
- [ ] Consent records appear in `session_consents` table
- [ ] Terms acceptance appears in `terms_acceptances` table
- [ ] Mic permission requested after form submit

---

## Files to Touch

| File | Action |
|------|--------|
| `src/app/pages/clarity-live-page.tsx` | Modify join + create UI |
| `src/app/components/live-meeting/join-session-dialog.tsx` | Remove or repurpose |
| `src/app/components/live-meeting/*.tsx` | Check for other dialogs to remove |
| `src/app/data/api.ts` | Verify consent functions exist (from P37.2a) |

---

## What NOT to Change

- Database schema (already correct)
- RLS policies (already correct)
- `CURRENT_TERMS_VERSION` constant (already exists)
- P41 spec (unchanged, will work once this is fixed)

---

## Acceptance Criteria

- [ ] Single screen for JOIN (no dialog popup)
- [ ] Single screen for CREATE (no dialog popup)
- [ ] Both flows require name + email
- [ ] Both flows show terms notice with links
- [ ] Both flows create unverified user if not logged in
- [ ] Both flows log consent to database
- [ ] Verified user email triggers login flow (not duplicate account)
- [ ] P41 will be unblocked (emails have addresses to send to)

---

## Related Documents

- [P37.2a: Recording Consent Mechanism](./p353_2a_consent_mechanism.md) — Full spec (source of truth)
- [P41: Clarity Coach](./p41_clarity_coach.md) — Depends on this fix
- [P40: Microphone Permission](./p40_microphone_permission.md) — Already implemented, wire up after consent

