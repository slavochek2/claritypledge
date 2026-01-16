# P50: Profile & Pledge Separation

**Status:** Complete
**Priority:** High (Required before P61 Events MVP)
**Created:** 2026-01-09
**Phase 1 Complete:** 2026-01-16 (Profile/pledge separation, routes, flows)
**Phase 2 Complete:** 2026-01-16 (Navigation consistency, shared component)
**Depends On:** None

---

## Source of Truth Convention

- **Tests** define correct behavior (what the code should do)
- **This document** explains decisions and rationale (why we chose this approach)
- **Code** implements what tests specify

When conflicts arise: Tests win for behavior, this doc wins for intent.

Test files for this feature:
- `src/tests/navigation-acceptance-full.test.tsx` (32 KISS tests - primary)
- `src/tests/live-session-banner.test.tsx` (LiveSessionBanner tests)

---

## Problem Statement

The app conflated **profiles** and **pledge certificates**:
1. `/p/:slug` showed the pledge certificate (not a profile page)
2. Users who joined via `/live` had no public identity (no slug, no profile page)
3. Event RSVPs (P61) need profile pages for attendee lists
4. Navigation menus were inconsistent across pages (e.g., /live showed "Log Out" but landing showed "Log In" for same user)

**Root cause:** Designed for "pledge-only" users. Now we need profiles for everyone.

---

## Terminology (Critical Definitions)

| Term | Definition |
|------|------------|
| **Profile (database)** | A row in `profiles` table. Exists for ALL users including unverified /live users. |
| **Profile page** | Public URL at `/p/:slug`. Requires `slug` to exist. Only verified users have this. |
| **Verified user** | User who clicked magic link. Has `is_verified=true` AND `slug` generated. |
| **Unverified user** | User with session but `is_verified=false`. Has profile record but NO profile page (no slug). |
| **Anonymous user** | No session at all. Not logged in. |
| **Slug** | URL-friendly identifier (e.g., `john-doe`). Generated on email verification. |

**Key insight:** "Profile" (database record) ≠ "Profile page" (public URL). Unverified users have the former, not the latter.

---

## User States

| State | session | profile record | is_verified | slug | has profile page |
|-------|---------|----------------|-------------|------|------------------|
| **Anonymous** | null | no | - | - | no |
| **Unverified** (/live) | yes | yes | false | null | no |
| **Verified Non-Pledger** | yes | yes | true | "slug" | yes |
| **Verified Pledger** | yes | yes | true | "slug" | yes |

---

## Key Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| **Route structure** | `/p/:slug` → Profile, `/p/:slug/pledge` → Certificate | Separate concepts, separate URLs |
| **Who gets slug?** | Users with verified emails | Slug = public identity |
| **Who gets profile page?** | Users with verified emails | No public page without verification |
| **Who gets profile record?** | All users including /live | Track users before verification |
| **Who gets certificate?** | Only `has_pledged: true` | Certificate = proof of pledge |
| **`is_verified` field** | Keep (meaningful) | Explicit email verification status |
| **Unverified menu** | Same as anonymous (Log In only) | KISS - eliminates race conditions |
| **Navigation architecture** | Shared `<NavigationMenuItems />` component | Guarantees consistency across all pages |
| **Email template** | KISS: One generic magic link email | Auth callback handles routing |

---

## Navigation Menu (Phase 2 - KISS Simplification)

### Design Principles

1. **KISS:** Two states only - Verified user OR everyone else
2. **Consistency:** Same user state = same menu items everywhere
3. **Shared component:** Not duplicated logic

### KISS Decision (2026-01-16)

**Problem:** 4 user states (anonymous, unverified, verified non-pledger, verified pledger) caused:
- Race conditions when profile hadn't loaded yet
- Edge cases where menu showed wrong items
- Complexity that was hard to maintain and test

**Solution:** Collapse to 2 states:
1. **Verified user** (profile exists + isVerified=true) → Full menu
2. **Everyone else** (anonymous OR unverified OR loading) → Public menu (Log In)

**Why this works:** Unverified users can still verify via:
- `/me` page (navigate there directly)
- Email sent after meeting ends (P51)
- Taking the pledge (magic link verifies them)

### Menu Items by User State (KISS)

| Menu Item | Everyone Else | Verified Non-Pledger | Verified Pledger |
|-----------|---------------|----------------------|------------------|
| Home | yes | yes | yes |
| Log In | **yes** | no | no |
| Log Out | no | yes | yes |
| View My Profile | no | yes | yes |
| Take the Pledge | yes (CTA) | yes | no |
| View My Pledge | no | no | yes |
| Settings | no | yes | yes |

**"Everyone else" includes:** Anonymous, unverified /live users, loading states.

**Why no "Verify Email" in menu?** Eliminated to prevent race conditions. Users verify through other paths.

### Menu Link Destinations

| Menu Item | Destination |
|-----------|-------------|
| Home | `/` |
| Log In | `/login` |
| View My Profile | `/me` (redirects to `/p/:slug`) |
| Take the Pledge | `/sign-pledge` or `/sign-pledge?prefill=true` (if verified) |
| View My Pledge | `/p/:slug/pledge` |
| Settings | `/settings` |

### Architecture: Shared Component

Both `SimpleNavigation` and `LiveSessionBanner` use:
1. `useNavAuthState()` hook - shared auth state logic
2. `<NavigationMenuItems />` component - shared menu items

LiveSessionBanner adds /live-specific items (Sound toggle, Leave Meeting) but auth menu is identical.

---

## User Flows

### Flow 1: New User Takes Pledge (Magic Link)

```
1. User visits /sign-pledge
2. Enters name + email + reason + optional fields
3. Clicks "Sign the Pledge" → Magic link sent
4. Clicks magic link → AuthCallbackPage
   - Creates profile: has_pledged=true, slug generated, is_verified=true
   - Redirects to /p/:slug/pledge (certificate)
```

### Flow 2: Verified User Upgrades to Pledger (No Magic Link)

```
1. Verified non-pledger clicks "Take the Pledge" (menu or profile CTA)
2. Redirects to /sign-pledge?prefill=true
3. Form prefilled:
   - Name: Read-only (from profile)
   - Email: Hidden (already verified)
   - Role, LinkedIn, reason: Editable
4. Clicks "Sign the Pledge" → NO magic link (already authenticated)
5. Updates profile: has_pledged=true
6. Redirects to /p/:slug/pledge (certificate)
```

### Flow 3: /live User Verifies Email

```
1. User enters name + email on /live
2. Instant meeting access (anonymous auth, profile created with slug=null)
3. User clicks "Verify Email" in menu → goes to /me
4. /me page shows "Complete Your Registration" with email displayed
5. User clicks "Verify My Email" → Magic link sent directly (no form)
6. Clicks magic link → AuthCallbackPage
   - Finds old profile by email, migrates to new auth ID
   - Generates slug from name
   - Sets is_verified=true, has_pledged=false
   - Redirects to /p/:slug (profile page)
```

### Flow 4: Unverified /live User Wants to Pledge

```
1. Unverified user clicks "Take the Pledge" in menu
2. Goes to /sign-pledge (NOT prefilled - they're unverified)
3. Fills form, clicks submit → Magic link sent
4. Clicks magic link → AuthCallbackPage
   - Migrates profile, generates slug
   - Sets is_verified=true, has_pledged=true
   - Redirects to /p/:slug/pledge (certificate)
```

### Flow 5: Post-Meeting Verification Prompt

```
1. Unverified user's meeting ends
2. Instead of generic "Session ended" screen
3. Show: "Meeting ended. Verify email to keep your profile."
4. [Verify Now] button → /me
```

---

## Routes

### `/p/:slug` - Profile Page

**Access:** Public
**Who has it:** All users with verified emails (have slug)
**Shows:**
- Name, role, avatar
- Blue circle around avatar if `has_pledged: true`
- **Owner view:**
  - `has_pledged: true` → "View My Pledge" button
  - `has_pledged: false` → "Take the Pledge" CTA
- **Visitor view:**
  - `has_pledged: true` → "View their pledge" link
  - `has_pledged: false` → No pledge link

### `/p/:slug/pledge` - Certificate Page

**Access:** Public
**Who has it:** Only users with `has_pledged: true`
**Shows:**
- Pledge certificate (full-page design)
- Pledge text, signed date, version
- Witnesses list
- QR code (links to `/p/:slug/pledge`)
- Name/avatar (links to `/p/:slug`)

**Edge case:** If `has_pledged: false`, show 404.

### `/me` - Smart Profile Redirect / Verification Page

**Access:** Authenticated only
**Behavior:**
- User has slug → redirect to `/p/:slug`
- User has no slug (unverified) → show "Complete Your Registration" prompt
- Not logged in → redirect to `/login`

**"Verify My Email" button:** Sends magic link directly using `signInWithOtp()`.

---

## Database

### Schema

```sql
-- profiles table
has_pledged BOOLEAN NOT NULL DEFAULT true  -- Existing users are pledgers
slug TEXT UNIQUE                            -- URL-friendly identifier (null until verified)
is_verified BOOLEAN NOT NULL DEFAULT false  -- Email verified via magic link
```

### Field Purposes

| Field | Purpose | When Set |
|-------|---------|----------|
| `is_verified` | Email verification status | Set to `true` on magic link click |
| `slug` | Public URL identifier | Generated on email verification |
| `has_pledged` | Pledge completion status | Set to `true` when pledge signed |

**Note:** `is_verified` and `slug` are set together, but kept separate for clarity. `is_verified` is explicit about email status; `slug` is about public identity.

### Key Insight: Null Slugs for /live Users

`mapProfileFromDb()` preserves `null` slugs - does NOT generate fake slugs from names. This allows code to detect unverified users correctly.

```typescript
interface Profile {
  slug: string | null;  // null for unverified /live users
  isVerified: boolean;  // false for unverified /live users
  // ...
}
```

---

## Sign Pledge Form Logic

### Detection

```typescript
const { user: currentUser } = useAuth();
const isPrefill = searchParams.get('prefill') === 'true';
const shouldPrefill = isPrefill && !!currentUser;
const isUpgrading = shouldPrefill && currentUser?.isVerified;
```

### Form Behavior

| Condition | Name | Email | Submit Action |
|-----------|------|-------|---------------|
| `shouldPrefill` | Read-only | Hidden | Depends on `isUpgrading` |
| `isUpgrading` (verified) | Read-only | Hidden | Direct update, no magic link |
| `!isUpgrading` (unverified prefill) | Read-only | Hidden | Send magic link |
| New user (no prefill) | Editable | Editable | Send magic link |

---

## Auth Callback Logic

### Profile Migration for /live Users

When magic link clicked, AuthCallbackPage:

1. Check for existing profile by auth ID
2. If not found, check by email (handles /live user migration)
3. If found by email with different ID:
   - Delete old anonymous profile
   - Preserve all profile data (name, email, role, etc.)
4. Generate slug if missing
5. Upsert profile with `is_verified: true`
6. Redirect based on `has_pledged`:
   - `true` → `/p/:slug/pledge`
   - `false` → `/p/:slug`

### Slug Conflict Resolution

1. Try base slug (e.g., `john-doe`)
2. On conflict, query similar slugs and increment (`john-doe-2`, `john-doe-3`)
3. Max 3 retries, then timestamp fallback (`john-doe-1733270400000`)

---

## Implementation Files

### Phase 1 (Complete)

| File | Changes |
|------|---------|
| `src/app/pages/me-page.tsx` | Smart redirect + verification prompt |
| `src/app/pages/profile-page.tsx` | Profile view |
| `src/app/pages/pledge-page.tsx` | Certificate view |
| `src/app/components/pledge/sign-pledge-form.tsx` | Prefill logic, upgrade flow |
| `src/auth/AuthCallbackPage.tsx` | /live migration, slug generation |
| `src/app/data/api.ts` | `mapProfileFromDb` preserves null slugs |
| `src/app/types/index.ts` | `slug: string | null` |

### Phase 2 (Complete - KISS Simplification)

| File | Changes |
|------|---------|
| `src/hooks/use-nav-auth-state.ts` | KISS: Two states only (`showUserMenu`, `showPublicCTAs`) |
| `src/app/components/layout/navigation-menu-items.tsx` | NEW - Shared menu items component |
| `src/app/components/layout/simple-navigation.tsx` | Use shared component, updated mobile menu |
| `src/app/components/partners/live-session-banner.tsx` | Use shared component with testIds |
| `src/tests/navigation-acceptance-full.test.tsx` | KISS tests (32 tests) |
| `src/tests/live-session-banner.test.tsx` | Updated for KISS logic |

---

## Phase 2: KISS Simplification (Complete)

### Goal

Eliminate race conditions by simplifying navigation to two states.

### What We Did

1. **KISS decision:** Unverified users see same menu as anonymous (Log In only)
2. **Removed complexity:** Deleted `showVerifyEmail`, `showLoggedInMenu`, `showLogoutOnly` flags
3. **Two states only:** `showUserMenu` (verified) OR `showPublicCTAs` (everyone else)
4. **Shared component:** `<NavigationMenuItems />` used by both navs

### Why Original Approach Failed

The 4-state model (anonymous, unverified, verified non-pledger, verified pledger) caused:
- Race condition: `signInAnonymously()` fires `onAuthStateChange` before profile exists
- Profile fetch returns null → menu shows wrong items
- Complexity made bugs hard to track down

### KISS Solution

```typescript
// use-nav-auth-state.ts - Two states only
const isVerifiedUser = !!user && user.isVerified === true;
const showUserMenu = sessionChecked && !isLoading && isVerifiedUser;
const showPublicCTAs = !showUserMenu;  // Everyone else
```

### Success Criteria

- [x] All 290 tests pass
- [x] Same menu items on /live and landing for same user state
- [x] No race conditions (unverified = anonymous for menu)
- [x] Shared `<NavigationMenuItems />` component works
- [x] Pre-commit checks pass

---

## Testing Checklist

### Phase 1 (Complete)

- [x] New pledge signup → Magic link → Profile with `has_pledged: true`
- [x] Verified non-pledger upgrades → Prefilled form → No magic link → `has_pledged: true`
- [x] /live user → /me → "Verify My Email" → Magic link → Profile with slug
- [x] Prefilled form: name read-only, email hidden for ALL prefilled users
- [x] `/p/:slug/pledge` shows 404 for non-pledgers
- [x] Profile migration works for /live users (finds by email, deletes old)
- [x] Slug conflict resolution works (sequential numbers, timestamp fallback)
- [x] Build passes

### Phase 2 (Complete - KISS)

- [x] Unverified user sees "Log In" in menu (same as anonymous)
- [x] Verified user sees full menu (View My Profile, Settings, Log Out)
- [x] Menu is identical on /live and landing for same user state
- [x] Shared `<NavigationMenuItems />` component works
- [x] All tests pass (290 tests)

---

## Related Documents

- [P51: Post-/live Email & AI Coaching](./p51_pledge_upgrade.md) - Auto-email after meeting ends
- [P61: Events MVP](./p61_events_mvp.md) - Requires profiles for attendee lists

---

## Archived Documents

The following documents have been superseded by this unified spec:

| Document | Status | Notes |
|----------|--------|-------|
| `features/done/p50_1_implementation_gaps.md` | Archived | Gaps resolved in Phase 1 |

**Note:** This document (`p50_non_pledger_experience.md`) is the single source of truth for navigation behavior. Tests define correct behavior; this doc explains rationale.
