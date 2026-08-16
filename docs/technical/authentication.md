# Authentication Architecture

## Overview

The Clarity Pledge uses magic link authentication via Supabase Auth. Email delivery is handled by Brevo SMTP (configured in Supabase dashboard).

**Key principle:** The auth system uses a **Reader-Writer pattern** to prevent race conditions that plagued earlier implementations.

---

## Reader-Writer Pattern (CRITICAL)

### The Problem

Early implementations had race conditions where:
- Multiple components tried to create profiles simultaneously
- Auth state observers triggered database writes
- "Profile Not Found" errors appeared during signup

### The Solution

Strict separation between reading and writing auth state:

| Role | Component | Responsibilities |
|------|-----------|------------------|
| **Reader** | `useAuth.ts` | Observe auth state, fetch profiles. NEVER writes to database. |
| **Writer** | `AuthCallbackPage.tsx` | Handle magic link verification, create profiles, manage redirects. |

---

## Components

### Reader: useAuth Hook

Location: [src/auth/useAuth.ts](../../src/auth/useAuth.ts)

```typescript
import { useAuth } from '@/auth';

const { user, profile, loading } = useAuth();
```

**Responsibilities:**
- Subscribe to Supabase auth state changes
- Fetch user profile when authenticated
- Provide loading states to components

**Rules:**
- Read-only - never writes to database
- Never handles redirects (that's the Writer's job)
- Import via `@/auth`, never from internal files

**Resilience:** `fetchProfileForUser` uses `getProfileResult()` (discriminated union) to distinguish "not found" from "server error". On server errors, it retries up to 3 times with 1s delay. On "not found", it returns `null` immediately (no retry). The `previousUserRef` guard preserves cached user data on transient failures for warm sessions (profile loaded once). Cold start failures (no cached profile) will show loading state for up to 2s before falling through to null. See decisions.md entry 2026-03-13 for full context.

### Writer: AuthCallbackPage

Location: [src/auth/AuthCallbackPage.tsx](../../src/auth/AuthCallbackPage.tsx)

This is the **critical transaction handler** that runs after both magic link verification and Google OAuth.

**Flow:**
1. User authenticates (magic link click or Google OAuth) → redirected to `/auth/callback`
2. Wait for session to resolve
3. Read `source` param from URL to determine context
4. Fetch existing profile by auth user ID (and by email for `/live` migration)
5. **Magic link login (`source=login`) + no profile:** error — but this path is pre-guarded in `LoginForm` via `checkEmailExists`, so it shouldn't reach here
6. **Google OAuth (`source=login`) + no profile:** create account (Option B — Google = sign in or sign up)
7. **New user (signup/pledge/Google):** generate slug, upsert profile
8. **Existing user:** upsert with `is_verified=true`, preserve existing slug and pledge status
9. Auto-RSVP if `action=rsvp` + `redirect=/events/X` params present
10. Auto-stake position if `action=set-position` + `redirect=/point/X` + `value={agree|disagree|neutral}` params present (P458)
11. Redirect to `redirect` param (validated) or `/events`

**Step 2 depends on how the link was minted (P1086).** The Supabase client is
`flowType: 'pkce'`. A link from `signInWithEmail`/`signInWithOtp` (real self-service
signup, login, pledge) produces a `?code=...` PKCE link, which `detectSessionInUrl`
resolves automatically — step 2 "just works." A link from `supabaseAdmin.auth.admin
.generateLink()` (server-side, no browser `code_verifier` available) can only produce
an implicit-flow `#access_token=...` hash link, which the PKCE client does **not**
auto-detect — session never resolves, step 2 hangs. `letter-reading-page.tsx`
implements "Pattern B" for this (explicit `setSession()` from the hash, see
2026-04-15 [technical] entry in `decisions.md`); `AuthCallbackPage` does not, because
no real production flow routes an admin-generated link here today. If one ever does
(or if an E2E test simulates "click the email link" via `generateLink()` instead of
the real client-side send), it needs Pattern B too — see `e2e/helpers/test-user.ts`
`generateMagicLinkUrl()` and `features/p1086_*.md`.

**`source` parameter routing:**

| `source` | Entry point | `has_pledged` for new users |
|----------|------------|----------------------------|
| `pledge` | `/sign-pledge` | `true` |
| `signup` | `/signup` | `false` |
| `login` | `/login` (Google) | `false` — creates account (Option B) |
| `live` | `/live` | `false` |
| _(none)_ | Legacy / returning | preserves existing, or `false` for new |

**Profile Creation:**
- Generates unique slug from name at creation time (prevents race conditions)
- Upserts via `onConflict: 'id'` — handles both new and returning users safely
- Retries up to 3 times on slug conflict, then falls back to timestamp suffix

---

## Authentication Flows

### Magic link (pledge / signup)
```
1. User fills pledge/signup form
   ↓
2. signInWithEmail() sends magic link (NO database write yet)
   ↓
3. User clicks email link
   ↓
4. /auth/callback?source=pledge|signup
   ↓
5. AuthCallbackPage: profile exists? → upsert, redirect
                     no profile? → create + upsert, redirect
```

### Google OAuth
```
1. User clicks "Continue with Google" on /login or /signup
   ↓
2. signInWithGoogle(source) → redirect to Google
   ↓
3. Google redirects to /auth/callback?source=login|signup
   ↓
4. AuthCallbackPage: profile exists? → upsert (login)
                     no profile? → create account (Option B), redirect
```

### Magic link login guard (login page only)
```
LoginForm: checkEmailExists(email)
   ├── EXISTS → send magic link with source=login
   └── NOT FOUND → show "No account found" error (never reaches /auth/callback)
```

---

## Guest / Unverified Users

A third user type exists alongside verified pledgers and verified non-pledgers: **unverified guests** who join `/live` sessions via invite.

### Three user types

| Type | `is_verified` | `slug` | Created by |
|------|--------------|--------|-----------|
| Verified pledger | `true` | ✅ | `/sign-pledge` → magic link → `AuthCallbackPage` |
| Verified non-pledger | `true` | ✅ | `/signup` → magic link → `AuthCallbackPage` |
| **Unverified guest** | `false` | `null` | `/live` join → `getOrCreateGuestUser()` → anonymous Supabase auth |

### Guest join flow (`getOrCreateGuestUser()`)

Location: `src/app/data/api.ts`

1. User enters name + email in `/live` join form
2. Lookup: does a profile with this email already exist?
   - **Returning unverified (same email):** reuse existing profile + anonymous session
   - **Verified user (is_verified: true):** block join, return `requiresLogin: true` — user must log in properly
   - **New email:** create anonymous Supabase session + new profile (`is_verified: false`, `slug: null`)
3. For `isNew: true`: fire `supabase.auth.signInWithOtp({ email })` as a side effect — sends the standard magic link email to the guest so they can verify at their leisure (P274)

### What unverified guests can and cannot do

**Can:**
- Join and participate in `/live` sessions
- View other users' profiles (read-only)
- See event pages and public content
- Take the pledge (converts them to a verified pledger via magic link)

**Cannot (RLS-enforced):**
- Create stories or points (`point_positions`, `stories`, `points` all require `is_verified: true`)
- Set persistent positions on points
- Get a public profile URL (`slug: null`)
- See the user nav menu (shown same public CTAs as anonymous users)

**Own profile:** redirects to `/me` which shows a "Verify Your Email" prompt — no content, no Create Story button.

### Verification path for guests

Guest clicks the magic link in their email → `/auth/callback` → `AuthCallbackPage` detects existing unverified profile by email → deletes old profile, creates new verified profile with slug generated → user is now `is_verified: true`.

### Session persistence

- Supabase anonymous auth session persists within the same browser (tab/session storage)
- Email is NOT stored between sessions — guests re-enter it each time they join a new `/live` link
- Same email → same profile reused. Different email → new profile created (old one orphaned — **accepted known debt**, low volume at current scale, no cleanup job exists yet)
- No cross-device persistence

---

## Live Session Cleanup on Sign-Out

`AuthContext.signOut()` cleans up an active live session before calling `supabase.auth.signOut()`.

**How it works:**
- Reads `clarity_live_session_id` and `clarity_live_is_creator` from `sessionStorage`
- If session ID present: calls `patchClaritySessionLiveState(id, { sessionEnded, sessionEndedAt })` (creator) or `clearSessionJoiner(id)` (joiner)
- Failure is caught and swallowed — sign-out proceeds regardless

**Why single-call RPC (`patchClaritySessionLiveState`) not `endClaritySession`:**
`endClaritySession` does SELECT + UPDATE (2 round-trips). `patchClaritySessionLiveState` uses the `patch_live_state` Supabase RPC which merges atomically server-side (1 round-trip). Preferred for latency-sensitive paths like logout.

**Session ID persistence:**
`clarity_live_session_id` is written to sessionStorage whenever `session.id` changes (inside the ref-sync useEffect in `clarity-live-page.tsx`). It is cleared by `clearStoredSession()` on normal session exit. This ensures AuthContext can always read the current session ID independently of React state.

---

## Post-Auth Action Handlers

`AuthCallbackPage` supports `action=` params to auto-execute an action after signup:

| `action` value | Required params | What it does |
|----------------|-----------------|--------------|
| `rsvp` | `redirect=/events/{id}` | Auto-RSVPs user to the event |
| `set-position` | `pointId`, `position=agree\|disagree\|neutral`, `redirect=/point/{id}` | Auto-saves position on the point (P458) |
| `start-story` | `pointId` | Redirects to `/chat?from=position&pointId={id}` (P458) |
| `open-chat` | `pointId` | Same as `start-story` (P458) |

**Pattern:** Redirect target + action intent are encoded in the auth callback URL. Both `signInWithEmail` and `signInWithGoogle` accept `extraParams: Record<string, string>` to forward action-specific params (pointId, position, pointTitle) through the auth round-trip. After auth completes, `AuthCallbackPage` reads `action` param, executes it, then redirects to `redirect` target.

**Security:**
- `ALLOWED_REDIRECT_PREFIXES` whitelist in `AuthCallbackPage.tsx` validates all redirect destinations — including `intent.redirect` from `parseAuthGateIntent`.
- `pointId` must pass `isValidPointId()` (UUID v4 format) before any DB call or URL interpolation.
- Current whitelist: `/events`, `/settings`, `/me`, `/p/`, `/about`, `/pledgers`, `/manifesto`, `/live`, `/agreements`, `/create`, `/point/`, `/chat`.

**Utility module:** `src/lib/auth-gate-utils.ts` — `buildAuthGateUrl`, `parseAuthGateIntent`, `isValidPosition`, `isValidPointId`, `toAuthGatePosition`, `fromAuthGatePosition`, `getPositionVerb`.

---

## Critical Warnings

### DO NOT move profile creation to hooks or context

The profile creation logic MUST stay in `AuthCallbackPage.tsx`. Moving it elsewhere causes:
- Race conditions with auth state observers
- Duplicate profile creation attempts
- "Profile Not Found" errors

### Profile creation happens ONLY after email verification

- `createProfile()` in api.ts sends the magic link only
- It does NOT write to the database
- The database write happens in AuthCallbackPage AFTER the user verifies their email

### No database trigger for profile creation

The old `handle_new_user()` trigger was removed (2025-12-04) because it created profiles with NULL slugs. Profile creation is now handled entirely in AuthCallbackPage.tsx.

---

## Slug Generation

Slugs are URL-friendly identifiers generated from user names:
- `John Doe` → `john-doe`
- Must be unique in the database

**Conflict resolution:**
1. Try `john-doe`
2. If taken, try `john-doe-2`, `john-doe-3`
3. After 3 retries, fall back to timestamp: `john-doe-1733270400000`

This logic runs client-side in AuthCallbackPage.tsx. See [database.md](database.md) for the trade-off explanation.

---

## Module Structure

The auth module is self-contained:

```
src/auth/
├── index.ts           # Public API - import from here
├── useAuth.ts         # Reader hook
├── AuthCallbackPage.tsx   # Writer component
└── (internal files)   # Don't import directly
```

**Always import from `@/auth`:**
```typescript
// Good
import { useAuth } from '@/auth';

// Bad - importing internal file
import { useAuth } from '@/auth/useAuth';
```

---

## Email Provider: Brevo

Magic link emails are sent via Brevo SMTP (`smtp-relay.brevo.com:587`), configured in Supabase Auth settings.

**DNS authentication:** Brevo domain `claritypledge.com` is fully authenticated — Brevo code TXT verified, two DKIM CNAMEs (`brevo1._domainkey`, `brevo2._domainkey`) resolving correctly, DMARC in place. SPF include is NOT needed — Brevo uses its own Envelope From domain on shared IPs, so SPF checks happen against Brevo's domain, not ours.

**Known issue — silent SMTP failures:** Supabase GoTrue sends emails via a background goroutine and sets `confirmation_sent_at` before confirming SMTP delivery. If the SMTP handoff fails, the error is logged server-side but not propagated to the API or database ([supabase/supabase#39691](https://github.com/supabase/supabase/issues/39691)). Brevo logs will show zero records for the recipient. See P608 for mitigation (PKCE + resend + monitoring).

**Known issue — Microsoft ATP token consumption:** Corporate email systems (Microsoft 365, Google Workspace) pre-fetch magic link URLs for malware scanning, consuming single-use OTP tokens before the user clicks ([supabase/auth#713](https://github.com/supabase/auth/issues/713)). P608 enables PKCE flow to prevent this.

If emails aren't arriving:
1. Check Brevo transactional logs (Transactional → Email → Logs) — if zero records, the email never reached Brevo (GoTrue SMTP failure)
2. If Brevo shows "Sent" but user didn't receive — check bounce/block status and recipient's email provider
3. Verify Brevo SMTP credentials in Supabase dashboard (Auth → Email → SMTP Settings)
4. Check Supabase Auth logs for `apitask: error running "mailer.signup"` entries

---

## Redirect URLs

Magic links need correct redirect URLs configured in Supabase dashboard:
- Development: `http://localhost:5001/auth/callback`
- Production: `https://claritypledge.com/auth/callback`

If magic links redirect to the wrong place, check these settings.

---

## `sessionChecked` vs hash token timing

`AuthContext.initSession()` calls `getSession()` (reads localStorage) and sets `sessionChecked=true` immediately. When a page loads via magic link redirect with `#access_token=...` in the URL, `sessionChecked` can become `true` with `session=null` before the hash is processed.

**Important: PKCE `flowType` does NOT auto-process hash tokens.**

`supabase.ts` uses `flowType: 'pkce'`. This means `detectSessionInUrl` only handles PKCE code-exchange params (`?code=...`) — it ignores `#access_token=...` hash tokens entirely. Pages that receive a user via a Supabase admin magic link (which produces implicit-flow hash tokens) must call `supabase.auth.setSession()` manually.

**Pattern A — pages that rely on `onAuthStateChange` (implicit flow only):**

Used when `detectSessionFromUrl` was active (implicit flow). Still applies to pages where the auth state is secondary (not a hard gate on page load):

```typescript
if (!session) {
  if (window.location.hash.includes('access_token')) return; // keep showing spinner
  setPageState('unauthenticated');
  return;
}
```

When `onAuthStateChange` fires, the hash is cleared and `session` updates — the effect re-runs and the guard no longer blocks. See `letter-response-confirm-page.tsx`.

**Pattern B — pages that must be auth-gated before loading data (PKCE + admin magic links):**

When a page's load effect requires an authenticated user (e.g., letter reading page with RLS-gated fetch), use a `magicLinkProcessing` state gate to block the load until `setSession()` propagates:

```typescript
// Synchronously detect hash in useState initializer so the load effect is blocked immediately.
const [magicLinkProcessing, setMagicLinkProcessing] = useState(() => {
  const hash = window.location.hash;
  return hash.includes('access_token=') && hash.includes('type=magiclink');
});

// Extract tokens from hash and call setSession — clears hash on completion.
useEffect(() => {
  if (!magicLinkProcessing) return;
  const params = new URLSearchParams(window.location.hash.substring(1));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const cleanup = () => {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setMagicLinkProcessing(false);
  };
  if (accessToken && refreshToken) {
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(cleanup).catch(cleanup);
  } else {
    cleanup();
  }
}, []); // eslint-disable-line react-hooks/exhaustive-deps

// Load effect: gate on magicLinkProcessing so it doesn't run as anon during hash processing.
useEffect(() => {
  if (!sessionChecked || authLoading || magicLinkProcessing) return;
  // ... fetch data ...
}, [sessionChecked, authLoading, magicLinkProcessing, ...]);
```

After `setSession()`, `onAuthStateChange` fires → profile fetch → `currentUser` populated → `authLoading = false` → load effect runs as authenticated user. See `letter-reading-page.tsx` (P710).

---

## Mobile in-app WebView — localStorage is not shared across spawns

The Supabase JS client persists the session in **`localStorage`** (`sb-<ref>-auth-token`), not in cookies. No Set-Cookie is involved in client-side auth — `confirm-letter-response` and similar edge functions return JSON; the session lives in localStorage from the `verifyOtp`/`setSession` call.

Mobile in-app browsers (Gmail, Twitter, Instagram, LinkedIn) typically spawn a **fresh WebView instance per link tap** with an **isolated/ephemeral storage partition**. The localStorage written during one link tap is **not readable** from the WebView spawned by the next link tap — even on the same device, same session, same email client.

Symptom: user signs up via email link 1, lands authenticated inside the WebView. Taps email link 2 minutes later → lands **anonymous** on the same origin. `currentUser` is null. There is no broken code; the storage simply isn't there.

**Diagnostic:** long-press the link in the email client → "Open in Safari/Chrome." The system browser shares its own localStorage with prior visits to the origin. If the user is authenticated in the system browser but not in the in-app WebView, this gotcha is the cause.

**Implications:**
- Public-share routes that rely on `currentUser` being populated will run the anon branch for every email-referred mobile user.
- Magic-link returns work *within* a single WebView spawn (one tap → one session) but not *across* spawns.
- Cookie-based fallback is not available without re-architecting the auth flow.

Mitigations are product-level, not bug fixes: encode identity in the share URL (delivery_id, server-resolved), surface a re-auth banner when the URL was email-referred, or nudge PWA install to escape the WebView entirely.
