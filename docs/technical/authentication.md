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

### Writer: AuthCallbackPage

Location: [src/auth/AuthCallbackPage.tsx](../../src/auth/AuthCallbackPage.tsx)

This is the **critical transaction handler** that runs after magic link verification.

**Flow:**
1. User clicks magic link → redirected to `/auth/callback`
2. Extract hash from URL, exchange for session
3. Check if profile exists for this user
4. **New user (signup):** Create profile with form data from URL params
5. **Existing user (login):** Redirect to their profile
6. Handle errors gracefully

**Profile Creation (signup only):**
- Reads form data from URL params (name, email, role, etc.)
- Generates unique slug from name (e.g., `john-doe`)
- Creates profile via `upsert()` to handle edge cases
- Redirects to new profile page

---

## Authentication Flow

```
1. User fills pledge form
   ↓
2. createProfile() sends magic link (NO database write yet)
   ↓
3. User clicks email link
   ↓
4. /auth/callback receives the request
   ↓
5. AuthCallbackPage exchanges hash for session
   ↓
6. Check: Does profile exist?
   ├── YES → Redirect to /p/{slug} (login)
   └── NO  → Create profile, then redirect (signup)
```

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

Magic link emails are sent via Brevo SMTP, configured in Supabase Auth settings. If emails aren't arriving:
1. Check Supabase Auth → Email Templates
2. Verify Brevo SMTP credentials in Supabase settings
3. Check Brevo dashboard for delivery issues

---

## Redirect URLs

Magic links need correct redirect URLs configured in Supabase dashboard:
- Development: `http://localhost:5001/auth/callback`
- Production: `https://claritypledge.com/auth/callback`

If magic links redirect to the wrong place, check these settings.
