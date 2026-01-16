# P52: Unified Navigation Architecture

**Status:** Implemented ✅
**Priority:** High (UX bug causing confusion)
**Est. Effort:** 2-3 hours
**Created:** 2026-01-16
**Implemented:** 2026-01-16
**Depends On:** P50 (auth state definitions)

---

## Problem

Two separate navigation components with inconsistent auth logic:

| Component | Location | Auth Check | Unverified User Sees |
|-----------|----------|------------|---------------------|
| `SimpleNavigation` | Landing, profile, etc. | `isVerified` required | "Log In" (public menu) |
| `LiveSessionBanner` | /live pages | Only `session + currentUser` | "Sign Out" (logged-in menu) |

**User confusion:** Same user appears logged in on /live but logged out on landing.

---

## Goal

Unify navigation auth logic so users see consistent menu state across all pages.

---

## Key Decisions

| Question | Decision |
|----------|----------|
| **One component or two?** | Keep two components (different layouts), share auth logic |
| **Shared logic approach** | Extract `useNavAuthState()` hook |
| **Menu items alignment** | Both navs show same user-specific items |
| **Live-specific items** | Keep Sound toggle, Leave Meeting in LiveSessionBanner only |

---

## Architecture

### New Hook: `useNavAuthState()`

```typescript
// src/hooks/use-nav-auth-state.ts

interface NavAuthState {
  // What to show
  showUserMenu: boolean;      // User is verified, show profile/settings
  showPublicCTAs: boolean;    // Show Take Pledge, Try Meeting, Log In
  showLogoutOnly: boolean;    // Session but no profile (edge case)

  // User data (when showUserMenu=true)
  user: Profile | null;
  hasPledged: boolean;
  slug: string | null;

  // Session state
  hasSession: boolean;        // For /live: unverified users still need Log Out

  // Loading states
  isLoading: boolean;
  sessionChecked: boolean;
}

export function useNavAuthState(): NavAuthState {
  const { session, user, isLoading, sessionChecked, signOut } = useAuth();

  // P50: Unverified users see public menu
  const isVerifiedUser = !!user?.isVerified;

  const showUserMenu = sessionChecked && !isLoading && !!session && !!user && isVerifiedUser;
  const showLogoutOnly = sessionChecked && !isLoading && !!session && !user;
  const isUnverifiedUser = sessionChecked && !isLoading && !!session && !!user && !isVerifiedUser;
  const showPublicCTAs = (sessionChecked && !session) || isUnverifiedUser;

  return {
    showUserMenu,
    showPublicCTAs,
    showLogoutOnly,
    user: showUserMenu ? user : null,
    hasPledged: user?.hasPledged ?? false,
    slug: user?.slug ?? null,
    hasSession: !!session, // For /live: unverified users still need Log Out
    isLoading,
    sessionChecked,
    signOut,
  };
}
```

### Updated Components

**SimpleNavigation** - Use `useNavAuthState()` instead of inline logic

**LiveSessionBanner** - Use `useNavAuthState()` + add missing menu items:
- View My Profile → `/me`
- Take the Pledge (if `!hasPledged`) → `/sign-pledge?prefill=true`
- Settings → `/settings`

---

## Menu Item Alignment

### For Unverified Users with Session (e.g., /live users)

```
[Sound: On/Off]        ← LiveSessionBanner only
[Leave Meeting]        ← LiveSessionBanner only (if in meeting)
---
Home
---
Take the Pledge        ← CTA button (SimpleNav) or menu item (Live)
Try a Clarity Meeting  ← CTA button (SimpleNav only)
Log Out                ← Users WITH a session can log out
```

### For Anonymous Users (no session)

```
Home
---
Take the Pledge        ← CTA button
Try a Clarity Meeting  ← CTA button
Log In                 ← Only when NO session exists
```

### For Verified Non-Pledgers (both navs)

```
[Sound: On/Off]        ← LiveSessionBanner only
[Leave Meeting]        ← LiveSessionBanner only
---
Home
View My Profile → /me
Take the Pledge → /sign-pledge?prefill=true
Settings
---
Log Out
```

### For Verified Pledgers (both navs)

```
[Sound: On/Off]        ← LiveSessionBanner only
[Leave Meeting]        ← LiveSessionBanner only
---
Home
View My Profile → /me
View My Pledge → /p/:slug/pledge
Settings
---
Log Out
```

---

## Implementation Steps

1. Create `src/hooks/use-nav-auth-state.ts`
2. Update `SimpleNavigation` to use new hook
3. Update `LiveSessionBanner` to use new hook + add missing items
4. Test all user states on both /live and landing
5. Verify menu consistency

---

## Testing Checklist

- [x] Unverified /live user sees consistent menu (public CTAs + Log Out)
- [x] Verified non-pledger sees "Take the Pledge" in both navs
- [x] Verified pledger sees "View My Pledge" in both navs
- [x] /live-specific items (Sound, Leave) only appear on /live
- [x] No regression in existing navigation behavior (256 tests pass)

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/use-nav-auth-state.ts` | NEW - shared auth state hook |
| `src/app/components/layout/simple-navigation.tsx` | Use new hook |
| `src/app/components/partners/live-session-banner.tsx` | Use new hook, add menu items |

---

## Success Criteria

User sees consistent logged-in/logged-out state across ALL pages.
