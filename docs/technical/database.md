# Database Schema & Data Layer

## Overview

The Clarity Pledge uses Supabase (PostgreSQL) with Row Level Security (RLS). All database interactions go through the data layer at `src/app/data/api.ts`.

---

## Tables

### profiles

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (matches auth.users.id) |
| slug | text | Unique URL-friendly identifier (e.g., `john-doe`) |
| email | text | User's email |
| name | text | User's full name |
| role | text | Job title/role (optional) |
| linkedin_url | text | LinkedIn profile (optional) |
| reason | text | Why they signed the pledge |
| avatar_color | text | Profile color theme |
| is_verified | boolean | Email verified status |
| created_at | timestamp | Signup timestamp |
| updated_at | timestamp | Last update timestamp |

### witnesses

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| profile_id | uuid | Foreign key to profiles |
| witness_name | text | Endorser's name |
| witness_linkedin_url | text | Endorser's LinkedIn (optional) |
| witness_profile_id | uuid | FK if witness is also a user (optional) |
| is_verified | boolean | Endorsement verified status |
| created_at | timestamp | Endorsement timestamp |

---

## Row Level Security (RLS)

### profiles policies

| Policy | Who | What |
|--------|-----|------|
| Select | Anyone | Read all profiles (public) |
| Insert | Authenticated | Create own profile only (`auth.uid() = id`) |
| Update | Authenticated | Update own profile only (`auth.uid() = id`) |
| Delete | Authenticated | Delete own profile only (`auth.uid() = id`) |

### witnesses policies

| Policy | Who | What |
|--------|-----|------|
| Select | Anyone | Read all witnesses (public) |
| Insert | Authenticated | **Any user can add witness to any profile** |
| Update | Authenticated | Update own witness records |
| Delete | Authenticated | Delete own witness records |

**Design Decision:** The witnesses insert policy intentionally allows ANY authenticated user to add witnesses to ANY profile. This enables users to endorse someone's pledge without requiring the endorsee to have an account. This is a feature, not a security gap.

---

## Data Layer (api.ts)

Location: [src/app/data/api.ts](../../src/app/data/api.ts)

All Supabase interactions go through this file.

### Key Functions

| Function | Purpose |
|----------|---------|
| `createProfile()` | Sends magic link only. Does NOT write to database. |
| `getProfile(id)` | Fetch profile by UUID |
| `getProfileBySlug(slug)` | Fetch profile by URL slug |
| `updateProfile()` | Update profile data |
| `getWitnesses(profileId)` | Fetch witnesses for a profile |
| `addWitness()` | Add endorsement to a profile |

### Critical Pattern: Separate Fetching

Always fetch profiles and witnesses separately:

```typescript
// Good - separate queries
const profile = await getProfileBySlug(slug);
const witnesses = await getWitnesses(profile.id);

// Bad - nested select (unreliable with Supabase PostgREST)
const { data } = await supabase
  .from('profiles')
  .select('*, witnesses(*)');  // Don't do this
```

---

## Type Definitions

Location: [src/app/types/index.ts](../../src/app/types/index.ts)

### Profile

```typescript
interface Profile {
  id: string;           // UUID from auth.users
  slug: string;         // URL-friendly identifier (used in routes)
  name: string;
  email: string;
  role?: string;
  linkedinUrl?: string;
  reason?: string;
  signedAt: string;
  isVerified: boolean;
  witnesses: Witness[];
  reciprocations: number;
  avatarColor?: string;
}
```

### Witness

```typescript
interface Witness {
  id: string;
  name: string;
  linkedinUrl?: string;
  timestamp: string;
  isVerified: boolean;
}
```

### Database ↔ Frontend Mapping

Database uses snake_case, frontend uses camelCase. The `mapProfileFromDb()` function handles conversion:

| Database | Frontend |
|----------|----------|
| `linkedin_url` | `linkedinUrl` |
| `created_at` | `signedAt` |
| `avatar_color` | `avatarColor` |
| `is_verified` | `isVerified` |

---

## Slug Generation

Slugs are URL-friendly identifiers generated from names:
- `John Doe` → `john-doe`
- Must be unique in the database

### Conflict Resolution

The `generateSlug()` function in api.ts creates slugs. Conflict handling happens in AuthCallbackPage.tsx:

1. Try `john-doe`
2. If taken, try `john-doe-2`, `john-doe-3`
3. After 3 retries, fall back to timestamp: `john-doe-1733270400000`

### Client-Side Trade-off

The slug conflict resolution runs in the browser, not in a database function. This is deliberate:

**Why not server-side:**
- Supabase doesn't support custom server functions without Edge Functions
- Edge Functions add deployment complexity for a simple operation

**Safety guarantees:**
- Retry loop (up to 3 attempts) ensures eventual success
- Timestamp fallback guarantees uniqueness
- Worst case: user gets `john-doe-1733270400000` instead of `john-doe-2`

**Risk accepted:**
- If browser closes mid-transaction, user can re-verify via magic link
- No data corruption possible (profile just won't exist)

---

## No Database Trigger

**Important:** There is NO database trigger for profile creation.

The old `handle_new_user()` trigger was removed (2025-12-04) because it created profiles with NULL slugs. Profile creation now happens ONLY in AuthCallbackPage.tsx after email verification.

This means:
- You cannot rely on a trigger to create profiles
- Profile creation is explicit and controlled
- Slug is always set correctly

---

## Common Queries

### Profile by slug (for routes)

```typescript
import { getProfileBySlug } from '@/app/data/api';

// Routes use slug: /p/john-doe
const profile = await getProfileBySlug('john-doe');
```

### Profile by UUID (when you have the ID)

```typescript
import { getProfile } from '@/app/data/api';

const profile = await getProfile(userId);
```

### Witnesses for a profile

```typescript
import { getWitnesses } from '@/app/data/api';

const witnesses = await getWitnesses(profile.id);
```

---

## Schema File

The canonical schema is at [supabase/schema.sql](../../supabase/schema.sql). This file contains:
- Table definitions
- RLS policies
- Indexes
- Any migrations applied

When making schema changes, update this file and apply via Supabase dashboard or migrations.
