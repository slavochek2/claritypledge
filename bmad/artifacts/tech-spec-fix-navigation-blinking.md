# Tech-Spec: Fix Navigation Blinking & Clean Up Dead Code

**Created:** 2025-12-01
**Status:** Ready for Development

## Overview

### Problem Statement

1. **Auth Loading Race Condition**: Logged-in users see "Log In" button flash before their avatar appears. Root cause: `useAuth.ts` sets `isLoading: false` before the profile fetch completes, creating a window where `session` exists but `user` is null.

2. **Dead Code**: `src/app/components/navigation/guest-menu.tsx` references a non-existent `pledge-modal-context` and is never imported anywhere. It's legacy code that causes confusion.

3. **Consumer Workarounds**: `profile-page.tsx` already has a band-aid (`loading || isUserLoading`) for this same issue. The fix should be at the source, not scattered across consumers.

### Solution

Fix the race condition at the source (`useAuth.ts`) so `isLoading` accurately reflects "auth state fully resolved including profile". Then delete dead code.

### Scope

**In Scope:**
- Fix `useAuth.ts` to only set `isLoading: false` after profile is loaded (or confirmed absent)
- Delete dead `guest-menu.tsx`
- Verify navigation no longer blinks

**Out of Scope:**
- Refactoring navigation component structure (not needed - current structure is fine once bug is fixed)
- Mobile menu changes (same logic applies, will be fixed by source fix)
- Creating new components (not needed)

## Context for Development

### Codebase Patterns

- **Reader-Writer Pattern**: Auth system uses strict separation. `useAuth.ts` is read-only, `AuthCallbackPage.tsx` handles writes. DO NOT add write operations to `useAuth.ts`.
- **Profile vs Session**: `session` comes from Supabase auth, `user` (Profile) comes from our `profiles` table via `getProfile()`.
- **Critical Files**: Both auth files have `CRITICAL - DO NOT MODIFY WITHOUT E2E TEST APPROVAL` warnings. Run E2E tests after changes.

### Files to Modify

| File | Action | Risk |
|------|--------|------|
| `src/auth/useAuth.ts` | Fix loading state logic | Medium - core auth |
| `src/app/components/navigation/guest-menu.tsx` | Delete | None - unused |

### Files to Verify (No Changes Expected)

| File | Why |
|------|-----|
| `src/app/components/simple-navigation.tsx` | Should work without changes after fix |
| `src/app/pages/profile-page.tsx` | Existing workaround becomes redundant (leave it, harmless) |

### Technical Decisions

**Decision 1: Where to set isLoading false**

Current (broken):
```typescript
supabase.auth.onAuthStateChange((_event, session) => {
  setSession(session);
  if (session?.user) {
    getProfile(session.user.id).then(profile => setUser(profile));
  } else {
    setUser(null);
  }
  setIsLoading(false); // ← Too early! Profile not loaded yet
});
```

Fixed:
```typescript
supabase.auth.onAuthStateChange((_event, session) => {
  setSession(session);
  if (session?.user) {
    getProfile(session.user.id).then(profile => {
      setUser(profile);
      setIsLoading(false); // ← Only after profile loaded
    });
  } else {
    setUser(null);
    setIsLoading(false); // ← No session = no profile to wait for
  }
});
```

**Decision 2: Handle profile fetch errors**

If `getProfile()` fails, we should still set `isLoading: false` to avoid infinite loading state. Add `.catch()` or `.finally()`.

## Implementation Plan

### Tasks

- [ ] Task 1: Update `useAuth.ts` - move `setIsLoading(false)` inside the profile fetch callbacks
- [ ] Task 2: Add error handling for profile fetch failure
- [ ] Task 3: Delete `src/app/components/navigation/guest-menu.tsx`
- [ ] Task 4: Run E2E tests to verify auth flow still works
- [ ] Task 5: Manual test - login and verify no blink

### Acceptance Criteria

- [ ] AC1: Given a logged-in user, when they load any page, then the navigation shows loading state until profile is ready (no "Log In" flash)
- [ ] AC2: Given a logged-out user, when they load any page, then the guest menu appears promptly (no regression)
- [ ] AC3: Given the codebase, when searching for `pledge-modal-context`, then zero results are found (dead code removed)
- [ ] AC4: All existing E2E tests pass

## Additional Context

### Dependencies

- None. This is a self-contained fix.

### Testing Strategy

1. **E2E Tests**: Run `npm run test:e2e` - critical auth flow tests must pass
2. **Manual Testing**:
   - Clear browser session
   - Login via magic link
   - Watch navigation during auth callback - should show loading, then user menu (no guest menu flash)
   - Refresh page while logged in - same behavior
   - Log out - guest menu should appear immediately

### Notes

- The `profile-page.tsx` workaround (`loading || isUserLoading`) can stay - it's harmless and provides defense in depth
- No changes needed to `SimpleNavigation` - it already checks `isLoading` correctly, the bug is that `isLoading` lies
- Mobile menu uses same logic, will be fixed automatically
