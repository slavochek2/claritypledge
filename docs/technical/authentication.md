# Authentication Architecture

> **Last verified against code: 2026-09-01** (P742). Every statement below was checked against
> `src/auth/`, `src/app/data/api.ts`, `src/App.tsx`, `src/app/pages/clarity-live-page.tsx` and
> `supabase/migrations/` on that date. Sections marked *(infra — not code-verifiable)* describe
> dashboard/SMTP configuration that cannot be confirmed from the repo.

## Overview

The Clarity Pledge uses magic link authentication and Google OAuth via Supabase Auth. Email delivery is handled by Brevo SMTP (configured in the Supabase dashboard).

**Key principle:** The auth system uses a **Reader-Writer pattern** to prevent race conditions that plagued earlier implementations.

**Two user states, not three (P396, 2026-02-19):** a person is either a **verified account** (Supabase auth session + `profiles` row, `is_verified = true`) or an **anonymous guest** (no auth session, no `profiles` row). The former "unverified profile" middle state is no longer reachable — see [Guests](#guests-live-participants-without-an-account).

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
| **Reader** | `AuthContext.tsx` (`AuthProvider` + `useAuth`) | Observe auth state, fetch profiles. NEVER writes to `profiles`. |
| **Writer** | `AuthCallbackPage.tsx` | Handle magic link / OAuth callback, create profiles, run post-auth actions, manage redirects. |

`useAuth.ts` is a one-line re-export of `useAuth` from `AuthContext.tsx`, kept for backward compatibility.

---

## Components

### Reader: AuthProvider / useAuth

Location: [src/auth/AuthContext.tsx](../../src/auth/AuthContext.tsx) (re-exported by [src/auth/useAuth.ts](../../src/auth/useAuth.ts))

```typescript
import { useAuth } from '@/auth';

const { user, session, isLoading, sessionChecked, signOut, refreshProfile } = useAuth();
```

**Responsibilities:**
- `initSession()` calls `supabase.auth.getSession()` once, sets `session` and `sessionChecked = true`
- `onAuthStateChange` only updates `session` (and clears `user` on sign-out) — it never fetches
- A second effect keyed on `session.user.id` (a primitive, so repeated `SIGNED_IN` events don't refetch) fetches the profile
- Provides `isLoading` / `sessionChecked` to route guards

**Rules:**
- Read-only — never writes to the `profiles` table (`signOut` does write live-session cleanup, see below)
- Never handles redirects (that's the Writer's job)
- Import via `@/auth`, never from internal files

**Resilience:** `fetchProfileForUser` uses `getProfileResult()` (discriminated union) to distinguish `not_found` from `server_error`. On `server_error` it retries — `MAX_RETRIES = 2`, `RETRY_DELAY_MS = 1000`, i.e. up to **3 attempts** with 1 s between them. On `not_found` it returns `null` immediately (no retry). The `previousUserRef` guard keeps the cached `user` on transient failures for warm sessions (profile loaded once). Cold-start failures (no cached profile) show the loading state for up to ~2 s of retry delay before falling through to `null`. See `decisions.md` 2026-03-13 for full context.

`getProfileResult` reads through the `get_profile_by_id` SECURITY DEFINER RPC (P877) — `profiles.email` / `linkedin_url` / `reason` are revoked from the `anon`/`authenticated` roles, so a direct column select would fail.

### Writer: AuthCallbackPage

Location: [src/auth/AuthCallbackPage.tsx](../../src/auth/AuthCallbackPage.tsx)

This is the **critical transaction handler** that runs after both magic link verification and Google OAuth. Route: `/auth/callback` (`src/App.tsx`).

**Flow:**
1. User authenticates (magic link click or Google OAuth) → redirected to `/auth/callback?...`
2. Wait for `sessionChecked && !isLoading`. If there is still no session, the page discriminates the failure (P1011): a bare `access_denied` / `otp_expired` is the expected expired-link case; anything else is reported to Sentry (`Auth callback: no session, unexplained`) with the callback URL. Either way `auth_callback_failed` is tracked and the error UI is shown.
3. Read `source` param from URL to determine context
4. Fetch existing profile by auth user ID via `getProfile()` (the context `user` may still be null on a transient failure — P895)
5. **Magic link login (`source=login`) + no profile:** pre-guarded in `LoginForm` via `checkEmailExists`, so it does not reach here
6. **Google OAuth (`source=login`) + no profile:** create account (Option B — Google = sign in or sign up)
7. **New user:** generate a romanized slug (P985), then upsert the profile through the `upsert_my_profile` RPC
8. **Existing user:** same RPC; preserves existing slug, `pledge_version` and `accepted_terms_version` (P832)
9. **Trust columns are set server-side, not in the upsert (P880):** `markSelfVerified()` → `mark_self_verified()` RPC (flips `is_verified` only when `auth.users.email_confirmed_at` is set), then `setMyPledge(hasPledged)` → `set_my_pledge()` RPC (pledging requires the caller to already be verified). Both are non-fatal; a later login re-runs them.
10. `replayLetterPositions()` → `replay_letter_positions()` RPC lifts any letter positions staged while unverified (P1093). Non-fatal.
11. `refreshProfile()`, analytics identify/track, clear `pendingVerificationEmail` from `sessionStorage`
12. **Post-auth actions**, in this order: `action=rsvp` (P61) · `action=join-org` (P1076/P1193) · batch-restore anonymous positions from `localStorage` (P502) · link anonymous letter completions from `sessionStorage` (P581) · `action=set-position` (P458) · `action=start-story` / `open-chat` (P458)
13. Redirect to `redirect` param if it passes the allowlist, otherwise **`/feed`**

**Step 2 depends on how the link was minted (P1086).** The Supabase client is
`flowType: 'pkce'` (`src/lib/supabase.ts:15`). A link from `signInWithEmail`/`signInWithOtp` (real self-service
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
| `pledge` | `/sign-pledge` (`createProfile()` in `use-pledge-form.ts`) | `true` — overrides an existing `false` |
| `signup` | `/signup` | `false` |
| `login` | `/login` (Google or magic link) | `false` — Google creates the account (Option B) |
| `live` | **No caller sends this.** `signInWithEmail`/`signInWithGoogle` type `source` as `'signup' \| 'pledge' \| 'login'`. The branch (and the by-email profile migration it gates) is retained for any historical pre-P396 guest profile only. | `false` |
| _(none)_ | Legacy / returning (`/me` re-send, `pledge-confirmation-page` resend) | preserves existing, or `false` for new |

**Profile Creation:**
- Generates a unique slug from the (romanized) name at creation time — never before verification, so two simultaneous signups with the same name cannot collide
- Writes through the `upsert_my_profile(p_data jsonb)` SECURITY DEFINER RPC (P877) — the server forces `id = auth.uid()`; the RPC does **not** accept `is_verified` / `has_pledged` (P880) and rejects reserved agent names / `machine-` slugs (P1104)
- Retries up to `MAX_SLUG_RETRIES = 3` on a `23505` slug conflict (querying `slug LIKE base-%` to pick the next number), then falls back to `${base}-${Date.now()}`

---

## Authentication Flows

### Magic link (pledge / signup)
```
1. User fills pledge/signup form
   ↓
2. createProfile() (pledge) or signInWithEmail(email, 'signup') sends magic link
   via supabase.auth.signInWithOtp — NO database write yet; name/role/etc ride in user_metadata
   ↓
3. User clicks email link (?code=... PKCE)
   ↓
4. /auth/callback?source=pledge|signup
   ↓
5. AuthCallbackPage: profile exists? → upsert_my_profile, redirect
                     no profile?    → slug + upsert_my_profile + mark_self_verified + set_my_pledge, redirect
```

### Google OAuth
```
1. User clicks "Continue with Google" (google-auth-button.tsx) on /login or /signup
   ↓
2. signInWithGoogle(source) → redirect to Google
   ↓
3. Google redirects to /auth/callback?source=login|signup
   ↓
4. AuthCallbackPage: profile exists? → upsert (login)
                     no profile?    → create account (Option B), redirect
```
Google avatar (`user_metadata.picture`) is captured as `avatar_url` with `avatar_provider = 'google'` on every Google login (P63).

### Magic link login guard (login page only)
```
LoginForm: checkEmailExists(email)          ← email_exists() RPC (boolean only, P877)
   ├── EXISTS → signInWithEmail(email, 'login', { redirect, action, extraParams })
   └── NOT FOUND → "No account found with this email. Sign up instead." (never reaches /auth/callback)
```

---

## Guests: `/live` participants without an account

Since P396 (2026-02-19) there is **no unverified-profile state**. `getOrCreateGuestUser()` no longer exists (`grep -rn getOrCreateGuestUser src/` → 0 hits).

### Two user types

| Type | Supabase auth session | `profiles` row | `is_verified` | `slug` | Created by |
|------|----------------------|----------------|---------------|--------|-----------|
| Verified account | yes | yes | `true` | non-null (`NOT NULL` since P736) | `/sign-pledge`, `/signup`, `/login` (Google) → `AuthCallbackPage` |
| Anonymous guest | **no** | **no** | — | — | `/live/:code` join form — display name only |

`has_pledged` distinguishes pledger from non-pledger *within* the verified type; it is not a separate auth state.

### Guest join flow (`handleJoin` in `clarity-live-page.tsx`)

1. Guest opens an invite link (`/live/:code`) or enters a 6-character code on `/live`
2. **Not logged in:** `validateName(name)` then `completeJoin(code, name)` — no email field, no `signInAnonymously`, no `profiles` write. The name is written to `clarity_sessions.joiner_name` only.
3. **Logged in:** terms check (`needsTermsAcceptance`), `recordSessionConsent`, then `completeJoin(code, user.name)`. Authenticated users arriving via an invite link are auto-joined without clicking (P396, relaxed to any authenticated user by P406).
4. Consent for guests is a UI-only checkbox — `session_consents` / `terms_acceptances` require `auth.uid()`, which a guest does not have (P396 Decision 1).

### Host gate

`handleCreate` (`clarity-live-page.tsx`): `if (!user) navigate('/signup')` — only an authenticated (therefore verified) user can create/host a session. The same rule is enforced server-side by `20260223_p396_host_rls_and_session_constraints.sql` (`is_verified = true` on session insert). A guest who lands on `/live` with no code and no stored session is also redirected to `/signup`.

### What guests can and cannot do

**Can:**
- Join and participate in a `/live` session; positions taken during the session live in the `clarity_live_turns.point_positions` JSONB column (P275), not in `point_positions`
- Rejoin after a refresh (per-tab `sessionStorage`) or after closing the tab (`localStorage` active-session record, which also pre-fills the last guest display name)
- See public pages

**Cannot:**
- Write to `point_positions`, `stories`, `points`, `session_consents` — all require an authenticated, verified caller (RLS)
- Host a session
- Have a profile URL or appear in the user nav

### Legacy remnants (harmless, but don't build on them)

- `AuthCallbackPage` still contains the `source=live` by-email migration branch (delete old anonymous-ID profile → recreate under the new auth ID). Nothing sends `source=live` anymore; it exists for any pre-P396 guest profile.
- `clarity-live-page.tsx` comments around `handlePositionSelectInLive` still say "Unverified guests (is_verified=false) skip DB sync" — post-P396 the skipped case is simply `!user`.
- `/me` (`me-page.tsx`) still renders a "Verify Your Email" prompt for a user **with no slug**. Since P736 made `profiles.slug NOT NULL`, this branch is unreachable for new accounts; logged-in users are redirected to `/p/{slug}`, logged-out users to `/login`.
- `src/app/hooks/useVerificationGate.ts` still exists and is imported by `doc-detail-page.tsx`.

### Session persistence (guests)

- Per-tab: `sessionStorage` keys `clarity_live_session_code`, `clarity_live_session_id`, `clarity_live_user_name`, `clarity_live_is_creator`
- Cross-tab on the same device: `localStorage` active-session record (`src/app/contexts/live-session-context.tsx`) drives the rejoin prompt and the name pre-fill
- No email is collected or stored; no cross-device persistence

---

## Live Session Cleanup on Sign-Out

`AuthContext.signOut()` cleans up an active live session before calling `supabase.auth.signOut()`.

**How it works:**
- Reads `clarity_live_session_id` and `clarity_live_is_creator` from `sessionStorage`
- If session ID present: calls `patchClaritySessionLiveState(id, { sessionEnded, sessionEndedAt })` (creator) or `clearSessionJoiner(id)` (joiner)
- Failure is caught and swallowed — sign-out proceeds regardless
- After sign-out: `clearActiveSessionFromStorage()` (localStorage rejoin record) and `analytics.reset()`, then `user`/`session` state is cleared

**Why single-call RPC (`patchClaritySessionLiveState`) not `endClaritySession`:**
`endClaritySession` does SELECT + UPDATE (2 round-trips). `patchClaritySessionLiveState` uses the `patch_live_state` Supabase RPC which merges atomically server-side (1 round-trip). Preferred for latency-sensitive paths like logout.

**Session ID persistence:**
`clarity_live_session_id` is written to `sessionStorage` whenever `session.id` changes (inside the ref-sync `useEffect` in `clarity-live-page.tsx`). It is cleared by `clearStoredSession()` on normal session exit. This ensures `AuthContext` can always read the current session ID independently of React state.

---

## Post-Auth Action Handlers

`AuthCallbackPage` supports `action=` params to auto-execute an action after signup:

| `action` value | Required params | What it does |
|----------------|-----------------|--------------|
| `rsvp` | `redirect=/events/{slug}` | Auto-RSVPs user to the event, lands on `/events/{slug}/confirm` (P61) |
| `join-org` | `redirect=/groups/{slug}/join` or legacy `/org/{slug}/join` (optional `?from={uuid}`) | Auto-joins the group, lands on `/groups/{slug}` (P1076, P1193) |
| `set-position` | `pointId` (UUID), `position=agree\|disagree\|neutral`, `redirect` | Auto-saves position on the point (P458) |
| `start-story` | `pointId` | Redirects to `/chat?from=position&pointId={id}` (P458) |
| `open-chat` | `pointId` | Same as `start-story` (P458) |

`parseAuthGateIntent` also recognises `join-session` (`roomId`) and `create-story`, but `AuthCallbackPage` has no handler for them — they fall through to the generic redirect.

Two param-less handlers also run on every callback: P502 restores all anonymous positions held in `localStorage`, and P581 links `letterCompletion_*` entries in `sessionStorage` to the new profile.

**Pattern:** Redirect target + action intent are encoded in the auth callback URL. Both `signInWithEmail` and `signInWithGoogle` accept `extraParams: Record<string, string>` to forward action-specific params (pointId, position, pointTitle) through the auth round-trip. After auth completes, `AuthCallbackPage` reads `action` param, executes it, then redirects to `redirect` target.

**Security:**
- `ALLOWED_REDIRECT_PREFIXES` in `AuthCallbackPage.tsx` validates all redirect destinations — including `intent.redirect` from `parseAuthGateIntent`. A redirect must start with `/`, not `//`, and match a prefix exactly or as `prefix/…` / `prefix?…`.
- `pointId` must pass `isValidPointId()` (UUID format) before any DB call or URL interpolation.
- Current allowlist: `/events`, `/settings`, `/me`, `/p/`, `/about`, `/pledgers`, `/manifesto`, `/live`, `/agreements`, `/create`, `/point/`, `/chat`, `/letter`, `/org`, `/groups`. `/org` is kept deliberately alongside `/groups` — already-shared invite links still arrive on the old path (P1193).
- Fallback when the redirect fails the allowlist: `/feed`.

**Utility module:** `src/lib/auth-gate-utils.ts` — `buildAuthGateUrl`, `parseAuthGateIntent`, `isValidPosition`, `isValidPointId`, `isValidUUID` (alias), `toAuthGatePosition`, `fromAuthGatePosition`, `getPositionVerb`.

---

## Critical Warnings

### DO NOT move profile creation to hooks or context

The profile creation logic MUST stay in `AuthCallbackPage.tsx`. Moving it elsewhere causes:
- Race conditions with auth state observers
- Duplicate profile creation attempts
- "Profile Not Found" errors

### Profile creation happens ONLY after email verification

- `createProfile()` in api.ts sends the magic link only (`signInWithOtp` with `emailRedirectTo=/auth/callback?source=pledge`)
- It does NOT write to the database
- The database write happens in AuthCallbackPage AFTER the user verifies their email

### Trust columns are server-controlled (P880)

`profiles.is_verified` and `profiles.has_pledged` cannot be written by the client role. The `guard_profile_trust_columns` BEFORE INSERT/UPDATE trigger neutralises any client-role write to them, and `upsert_my_profile` ignores them in `p_data`. The only writers are `mark_self_verified()` and `set_my_pledge()`, and `mark_self_verified()` checks `auth.users.email_confirmed_at` itself — a client cannot self-promote. Agent accounts (P1104) can never become verified.

### No database trigger for profile creation

The old `handle_new_user()` trigger was removed (2025-12-04) because it created profiles with NULL slugs. `grep -rn handle_new_user supabase/` returns nothing. Profile creation is now handled entirely in AuthCallbackPage.tsx. (The P880 guard trigger above is a *write guard*, not a creation trigger.)

---

## Slug Generation

Slugs are URL-friendly identifiers generated from user names:
- `John Doe` → `john-doe`
- Non-ASCII names are romanized first (`slugifyName`, P985): `李明` → `li-ming`; a name with no romanizable characters gets `user-{timestamp}`
- Must be unique in the database; `NOT NULL` since P736

**Conflict resolution:**
1. Try `john-doe`
2. If taken, query existing `john-doe-%` slugs and try the next number (`john-doe-2`, `john-doe-3`)
3. After `MAX_SLUG_RETRIES = 3`, fall back to timestamp: `john-doe-1733270400000`

This logic runs client-side in AuthCallbackPage.tsx. See [database.md](database.md) for the trade-off explanation.

---

## Module Structure

The auth module is self-contained:

```
src/auth/
├── index.ts               # Public API - import from here
├── AuthContext.tsx        # AuthProvider + useAuth (Reader, single source of truth)
├── useAuth.ts             # Re-export of useAuth (backward compatibility)
└── AuthCallbackPage.tsx   # Writer component
```

**Always import from `@/auth`:**
```typescript
// Good
import { useAuth, AuthProvider } from '@/auth';

// Bad - importing internal file
import { useAuth } from '@/auth/useAuth';
```

---

## Email Provider: Brevo *(infra — not code-verifiable)*

Magic link emails are sent via Brevo SMTP (`smtp-relay.brevo.com:587`), configured in Supabase Auth settings.

**DNS authentication:** Brevo domain `claritypledge.com` is fully authenticated — Brevo code TXT verified, two DKIM CNAMEs (`brevo1._domainkey`, `brevo2._domainkey`) resolving correctly, DMARC in place. SPF include is NOT needed — Brevo uses its own Envelope From domain on shared IPs, so SPF checks happen against Brevo's domain, not ours.

**Known issue — silent SMTP failures:** Supabase GoTrue sends emails via a background goroutine and sets `confirmation_sent_at` before confirming SMTP delivery. If the SMTP handoff fails, the error is logged server-side but not propagated to the API or database ([supabase/supabase#39691](https://github.com/supabase/supabase/issues/39691)). Brevo logs will show zero records for the recipient. P608 (done 2026-03-30) added the mitigation (PKCE + resend + monitoring).

**Known issue — Microsoft ATP token consumption:** Corporate email systems (Microsoft 365, Google Workspace) pre-fetch magic link URLs for malware scanning, consuming single-use OTP tokens before the user clicks ([supabase/auth#713](https://github.com/supabase/auth/issues/713)). P608 enabled the PKCE flow (`src/lib/supabase.ts:15`) to prevent this.

If emails aren't arriving:
1. Check Brevo transactional logs (Transactional → Email → Logs) — if zero records, the email never reached Brevo (GoTrue SMTP failure)
2. If Brevo shows "Sent" but user didn't receive — check bounce/block status and recipient's email provider
3. Verify Brevo SMTP credentials in Supabase dashboard (Auth → Email → SMTP Settings)
4. Check Supabase Auth logs for `apitask: error running "mailer.signup"` entries

---

## Redirect URLs *(infra — dashboard side not code-verifiable)*

Magic links need correct redirect URLs configured in Supabase dashboard:
- Development: `http://localhost:5001/auth/callback` (main checkout; worktrees w1–w7 use 5100–5700 — `vite.config.ts`)
- Production: `https://claritypledge.com/auth/callback`

If magic links redirect to the wrong place, check these settings.

---

## `sessionChecked` vs hash token timing

`AuthContext.initSession()` calls `getSession()` (reads localStorage) and sets `sessionChecked=true` immediately. When a page loads via magic link redirect with `#access_token=...` in the URL, `sessionChecked` can become `true` with `session=null` before the hash is processed.

**Important: PKCE `flowType` does NOT auto-process hash tokens.**

`supabase.ts` uses `flowType: 'pkce'`. This means `detectSessionInUrl` only handles PKCE code-exchange params (`?code=...`) — it ignores `#access_token=...` hash tokens entirely. Pages that receive a user via a Supabase admin magic link (which produces implicit-flow hash tokens) must call `supabase.auth.setSession()` manually.

**Pattern A — `onAuthStateChange` with a hash guard (RETIRED).** Under the old implicit flow, pages checked `window.location.hash.includes('access_token')` and kept showing a spinner until `onAuthStateChange` fired. No page in `src/` uses this any more (`grep -rn "hash.includes('access_token')" src/` → 0 hits). `letter-response-confirm-page.tsx` now arrives with `?token_hash=...` and exchanges it via `verifyOtp` (same as create-and-sign, P527/P684), precisely to avoid the implicit-grant hash race.

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

The Supabase JS client persists the session in **`localStorage`** (`sb-<ref>-auth-token`), not in cookies — `src/lib/supabase.ts` passes no custom `storage`, so the supabase-js default applies. No Set-Cookie is involved in client-side auth — `confirm-letter-response` and similar edge functions return JSON; the session lives in localStorage from the `verifyOtp`/`setSession` call.

Mobile in-app browsers (Gmail, Twitter, Instagram, LinkedIn) typically spawn a **fresh WebView instance per link tap** with an **isolated/ephemeral storage partition**. The localStorage written during one link tap is **not readable** from the WebView spawned by the next link tap — even on the same device, same session, same email client.

Symptom: user signs up via email link 1, lands authenticated inside the WebView. Taps email link 2 minutes later → lands **anonymous** on the same origin. `currentUser` is null. There is no broken code; the storage simply isn't there.

**Diagnostic:** long-press the link in the email client → "Open in Safari/Chrome." The system browser shares its own localStorage with prior visits to the origin. If the user is authenticated in the system browser but not in the in-app WebView, this gotcha is the cause.

**Implications:**
- Public-share routes that rely on `currentUser` being populated will run the anon branch for every email-referred mobile user.
- Magic-link returns work *within* a single WebView spawn (one tap → one session) but not *across* spawns.
- Cookie-based fallback is not available without re-architecting the auth flow.

Mitigations are product-level, not bug fixes: encode identity in the share URL (delivery_id, server-resolved), surface a re-auth banner when the URL was email-referred, or nudge PWA install to escape the WebView entirely.
